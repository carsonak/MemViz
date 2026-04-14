package debugger

import (
	"context"
	"fmt"
	"net"
	"net/rpc"
	"net/rpc/jsonrpc"
	"os"
	"os/exec"
	"reflect"
	"strings"
	"sync"
	"time"
)

// DelveClient implements the Client interface using a real Delve debugger process
// communicating over JSON-RPC (Delve API v2).
type DelveClient struct {
	mu         sync.Mutex
	rpcClient  *rpc.Client
	conn       net.Conn
	process    *exec.Cmd
	connected  bool
	listenAddr string
	stepNumber int

	// BuildGraphFunc is called by GetMemoryGraph to construct a MemoryGraph
	// from variables. Injected by the caller (e.g. server) to break the
	// import cycle between the debugger and graph packages.
	BuildGraphFunc func([]*Variable, *StopState, int) *MemoryGraph
}

// NewDelveClient creates a new Delve-backed debugger client.
func NewDelveClient() *DelveClient {
	return &DelveClient{}
}

// dlvDebuggerCommand is the argument sent to RPCServer.Command to control execution.
type dlvDebuggerCommand struct {
	Name        string `json:"name"`
	ThreadID    int    `json:"threadID,omitempty"`
	GoroutineID int64  `json:"goroutineID,omitempty"`
}

// dlvDebuggerState is the response from RPCServer.Command describing the new debugger state.
type dlvDebuggerState struct {
	CurrentThread     *dlvThread    `json:"currentThread"`
	SelectedGoroutine *dlvGoroutine `json:"selectedGoroutine"`
	Exited            bool          `json:"exited"`
	ExitStatus        int           `json:"exitStatus"`
}

// dlvThread represents a running OS thread in the debugged process.
type dlvThread struct {
	ID         int            `json:"id"`
	PC         uint64         `json:"pc"`
	File       string         `json:"file"`
	Line       int            `json:"line"`
	Function   *dlvFunction   `json:"function"`
	Breakpoint *dlvBreakpoint `json:"breakpoint"`
}

// dlvGoroutine represents a goroutine in the debugged process.
// UserCurrentLoc is the source-level location, skipping internal runtime frames.
type dlvGoroutine struct {
	ID             int64       `json:"id"`
	CurrentLoc     dlvLocation `json:"currentLoc"`
	UserCurrentLoc dlvLocation `json:"userCurrentLoc"`
}

// dlvLocation is a source-code location as reported by Delve.
type dlvLocation struct {
	PC       uint64       `json:"pc"`
	File     string       `json:"file"`
	Line     int          `json:"line"`
	Function *dlvFunction `json:"function"`
}

// dlvFunction describes a function symbol in the debugged program.
type dlvFunction struct {
	Name      string `json:"name"`
	Value     uint64 `json:"value"`
	Type      byte   `json:"type"`
	GoType    uint64 `json:"goType"`
	Optimized bool   `json:"optimized"`
}

// dlvBreakpoint is a breakpoint as accepted or returned by the Delve RPC API.
type dlvBreakpoint struct {
	ID           int    `json:"id"`
	Name         string `json:"name"`
	Addr         uint64 `json:"addr"`
	File         string `json:"file"`
	Line         int    `json:"line"`
	FunctionName string `json:"functionName"`
}

// dlvVariable is a variable in the debugged program's memory as returned by Delve.
// OnlyAddr is true when Delve returned only the address without expanding the value.
// Unreadable is non-empty when Delve could not read the variable's memory.
type dlvVariable struct {
	Name       string        `json:"name"`
	Addr       uint64        `json:"addr"`
	OnlyAddr   bool          `json:"onlyAddr"`
	Type       string        `json:"type"`
	RealType   string        `json:"realType"`
	Kind       reflect.Kind  `json:"kind"`
	Value      string        `json:"value"`
	Len        int64         `json:"len"`
	Cap        int64         `json:"cap"`
	Children   []dlvVariable `json:"children"`
	Base       uint64        `json:"base"`
	Unreadable string        `json:"unreadable"`
}

// dlvEvalScope identifies the goroutine and stack frame for variable evaluation.
type dlvEvalScope struct {
	GoroutineID  int64 `json:"GoroutineID"`
	Frame        int   `json:"Frame"`
	DeferredCall int   `json:"DeferredCall"`
}

// dlvLoadConfig controls how much data Delve loads when expanding variable values.
// MaxStructFields of -1 means all fields; MaxVariableRecurse limits pointer depth.
type dlvLoadConfig struct {
	FollowPointers     bool `json:"FollowPointers"`
	MaxVariableRecurse int  `json:"MaxVariableRecurse"`
	MaxStringLen       int  `json:"MaxStringLen"`
	MaxArrayValues     int  `json:"MaxArrayValues"`
	MaxStructFields    int  `json:"MaxStructFields"`
}

// commandOut is the reply from RPCServer.Command.
type commandOut struct {
	State dlvDebuggerState
}

// createBreakpointIn is the argument for RPCServer.CreateBreakpoint.
type createBreakpointIn struct {
	Breakpoint dlvBreakpoint
}

// createBreakpointOut is the reply from RPCServer.CreateBreakpoint.
type createBreakpointOut struct {
	Breakpoint dlvBreakpoint
}

// clearBreakpointIn is the argument for RPCServer.ClearBreakpoint.
type clearBreakpointIn struct {
	ID int `json:"id"`
}

// clearBreakpointOut is the reply from RPCServer.ClearBreakpoint.
type clearBreakpointOut struct {
	Breakpoint *dlvBreakpoint
}

// listLocalVarsIn is the argument for RPCServer.ListLocalVars.
type listLocalVarsIn struct {
	Scope dlvEvalScope
	Cfg   dlvLoadConfig
}

// listLocalVarsOut is the reply from RPCServer.ListLocalVars.
type listLocalVarsOut struct {
	Variables []dlvVariable
}

// evalIn is the argument for RPCServer.Eval.
type evalIn struct {
	Scope dlvEvalScope
	Expr  string
	Cfg   *dlvLoadConfig
}

// evalOut is the reply from RPCServer.Eval.
type evalOut struct {
	Variable *dlvVariable
}

// detachIn is the argument for RPCServer.Detach.
type detachIn struct {
	Kill bool
}

// detachOut is the (empty) reply from RPCServer.Detach.
type detachOut struct{}

const (
	// defaultMaxStringLen is the maximum bytes Delve loads for string values.
	defaultMaxStringLen = 256
	// defaultMaxArrayValues is the maximum elements Delve loads for slices and arrays.
	defaultMaxArrayValues = 64
	// defaultMaxStructFlds instructs Delve to load all struct fields (-1 = unlimited).
	defaultMaxStructFlds = -1
	// defaultMaxRecurse limits how many pointer levels Delve follows when loading a variable.
	defaultMaxRecurse = 2
	// delveStartupTimeout is the maximum time to wait for Delve's RPC listener to become ready.
	delveStartupTimeout = 5 * time.Second
	// rpcRetryDelay is the pause between connection attempts while Delve is starting.
	rpcRetryDelay = 200 * time.Millisecond
	// maxPointerResolveDepth limits recursive pointer expansion inside convertVariable.
	maxPointerResolveDepth = 5
)

// defaultLoadConfig returns the variable load configuration used for all Delve RPC queries.
func defaultLoadConfig() dlvLoadConfig {
	return dlvLoadConfig{
		FollowPointers:     true,
		MaxVariableRecurse: defaultMaxRecurse,
		MaxStringLen:       defaultMaxStringLen,
		MaxArrayValues:     defaultMaxArrayValues,
		MaxStructFields:    defaultMaxStructFlds,
	}
}

// ---------------------------------------------------------------------------
// Client interface – process management
// ---------------------------------------------------------------------------

// LaunchProgram spawns a headless Delve process for the given Go program and
// automatically connects to it once the RPC server is ready.
func (d *DelveClient) LaunchProgram(ctx context.Context, programPath string) error {
	d.mu.Lock()
	if d.process != nil {
		d.mu.Unlock()
		return fmt.Errorf("program already launched")
	}
	d.mu.Unlock()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("finding free port: %w", err)
	}
	addr := listener.Addr().String()
	_ = listener.Close()

	cmd := exec.CommandContext(ctx, "dlv", "exec", programPath,
		"--headless",
		"--listen="+addr,
		"--api-version=2",
		"--log=false",
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("starting delve: %w", err)
	}

	d.mu.Lock()
	d.process = cmd
	d.listenAddr = addr
	d.mu.Unlock()

	if err := d.Connect(ctx, addr); err != nil {
		d.mu.Lock()
		if d.process != nil {
			_ = d.process.Process.Kill()
			_ = d.process.Wait()
			d.process = nil
		}
		d.mu.Unlock()
		return fmt.Errorf("connecting to delve after launch: %w", err)
	}

	return nil
}

// Connect establishes a JSON-RPC connection to a running Delve instance.
// It retries up to 10 times with 100ms between attempts.
func (d *DelveClient) Connect(ctx context.Context, addr string) error {
	const maxRetries = 10
	const retryDelay = 100 * time.Millisecond

	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		select {
		case <-ctx.Done():
			if lastErr != nil {
				return fmt.Errorf("%w (last dial error: %v)", ctx.Err(), lastErr)
			}
			return ctx.Err()
		default:
		}

		conn, err := net.DialTimeout("tcp", addr, time.Second)
		if err != nil {
			lastErr = err
			time.Sleep(retryDelay)
			continue
		}

		rpcClient := jsonrpc.NewClient(conn)

		d.mu.Lock()
		d.conn = conn
		d.rpcClient = rpcClient
		d.connected = true
		d.listenAddr = addr
		d.mu.Unlock()
		return nil
	}

	return fmt.Errorf("connecting to delve at %s after %d attempts: %w", addr, maxRetries, lastErr)
}

// Disconnect gracefully detaches from Delve and kills the spawned process.
func (d *DelveClient) Disconnect() error {
	d.mu.Lock()
	defer d.mu.Unlock()

	var errs []string

	if d.rpcClient != nil {
		var out detachOut
		if err := d.rpcClient.Call("RPCServer.Detach", detachIn{Kill: true}, &out); err != nil {
			errs = append(errs, fmt.Sprintf("detach RPC: %v", err))
		}

		if err := d.rpcClient.Close(); err != nil {
			errs = append(errs, fmt.Sprintf("closing RPC client: %v", err))
		}
		d.rpcClient = nil
	}

	if d.conn != nil {
		_ = d.conn.Close()
		d.conn = nil
	}

	if d.process != nil {
		if err := d.process.Process.Kill(); err != nil {
			if !processAlreadyFinished(err) {
				errs = append(errs, fmt.Sprintf("killing delve process: %v", err))
			}
		}
		_ = d.process.Wait()
		d.process = nil
	}

	d.connected = false

	if len(errs) > 0 {
		return fmt.Errorf("disconnect: %s", strings.Join(errs, "; "))
	}
	return nil
}

// processAlreadyFinished reports whether err indicates the OS process has already exited,
// which can happen when RPCServer.Detach kills it before our explicit Kill call.
func processAlreadyFinished(err error) bool {
	return strings.Contains(err.Error(), "process already finished")
}

// ---------------------------------------------------------------------------
// Client interface – breakpoints
// ---------------------------------------------------------------------------

// SetBreakpoint registers a breakpoint at the given source file and line.
func (d *DelveClient) SetBreakpoint(_ context.Context, file string, line int) (*Breakpoint, error) {
	client, err := d.rpc()
	if err != nil {
		return nil, err
	}

	var out createBreakpointOut
	if err := client.Call("RPCServer.CreateBreakpoint", createBreakpointIn{
		Breakpoint: dlvBreakpoint{File: file, Line: line},
	}, &out); err != nil {
		return nil, fmt.Errorf("setting breakpoint at %s:%d: %w", file, line, err)
	}

	return &Breakpoint{
		ID:       out.Breakpoint.ID,
		File:     out.Breakpoint.File,
		Line:     out.Breakpoint.Line,
		Function: out.Breakpoint.FunctionName,
		Enabled:  true,
	}, nil
}

// ClearBreakpoint removes the breakpoint with the given Delve-assigned ID.
func (d *DelveClient) ClearBreakpoint(_ context.Context, id int) error {
	client, err := d.rpc()
	if err != nil {
		return err
	}

	var out clearBreakpointOut
	if err := client.Call("RPCServer.ClearBreakpoint", clearBreakpointIn{ID: id}, &out); err != nil {
		return fmt.Errorf("clearing breakpoint %d: %w", id, err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Client interface – execution control
// ---------------------------------------------------------------------------

// Continue resumes execution and stops at the next breakpoint.
func (d *DelveClient) Continue(_ context.Context) (*StopState, error) {
	return d.execCommand("continue")
}

// StepOver executes the next source line without entering function calls.
func (d *DelveClient) StepOver(_ context.Context) (*StopState, error) {
	return d.execCommand("next")
}

// StepInto executes the next source line, entering function calls.
func (d *DelveClient) StepInto(_ context.Context) (*StopState, error) {
	return d.execCommand("step")
}

// StepOut continues execution until the current function returns.
func (d *DelveClient) StepOut(_ context.Context) (*StopState, error) {
	return d.execCommand("stepOut")
}

// execCommand sends a debugger command via RPC and translates the response.
func (d *DelveClient) execCommand(name string) (*StopState, error) {
	client, err := d.rpc()
	if err != nil {
		return nil, err
	}

	var out commandOut
	if err := client.Call("RPCServer.Command", dlvDebuggerCommand{Name: name}, &out); err != nil {
		return nil, fmt.Errorf("delve command %q: %w", name, err)
	}

	if out.State.Exited {
		return nil, ErrProcessExited
	}

	d.mu.Lock()
	d.stepNumber++
	d.mu.Unlock()

	return stateToStopState(&out.State, name), nil
}

// stateToStopState converts a Delve debugger state into the internal StopState.
// It prefers SelectedGoroutine.UserCurrentLoc (source-level, skips runtime frames)
// over CurrentThread when available.
func stateToStopState(state *dlvDebuggerState, command string) *StopState {
	ss := &StopState{
		Reason: StopReasonStep,
	}

	if command == "continue" {
		ss.Reason = StopReasonBreakpoint
	}

	if g := state.SelectedGoroutine; g != nil {
		ss.GoroutineID = g.ID
		loc := g.UserCurrentLoc
		ss.File = loc.File
		ss.Line = loc.Line
		if loc.Function != nil {
			ss.Function = loc.Function.Name
		}
	} else if t := state.CurrentThread; t != nil {
		ss.File = t.File
		ss.Line = t.Line
		if t.Function != nil {
			ss.Function = t.Function.Name
		}
	}

	return ss
}

// ---------------------------------------------------------------------------
// Client interface – variable inspection
// ---------------------------------------------------------------------------

// GetLocalVariables retrieves all local variables in the current top frame.
func (d *DelveClient) GetLocalVariables(_ context.Context) ([]*Variable, error) {
	client, err := d.rpc()
	if err != nil {
		return nil, err
	}

	var out listLocalVarsOut
	if err := client.Call("RPCServer.ListLocalVars", listLocalVarsIn{
		Scope: dlvEvalScope{GoroutineID: -1, Frame: 0},
		Cfg:   defaultLoadConfig(),
	}, &out); err != nil {
		return nil, fmt.Errorf("listing local variables: %w", err)
	}

	vars := make([]*Variable, 0, len(out.Variables))
	for i := range out.Variables {
		v, err := d.convertVariable(client, &out.Variables[i], 0)
		if err != nil {
			return nil, err
		}
		if v != nil {
			vars = append(vars, v)
		}
	}

	return vars, nil
}

// EvaluateExpression evaluates an arbitrary expression using the Delve Eval RPC.
func (d *DelveClient) EvaluateExpression(_ context.Context, expr string) (*Variable, error) {
	client, err := d.rpc()
	if err != nil {
		return nil, err
	}

	resolved, err := d.evalExpr(client, expr)
	if err != nil {
		return nil, err
	}
	if resolved == nil {
		return nil, fmt.Errorf("nil result evaluating %q", expr)
	}

	return d.convertVariable(client, resolved, 0)
}

// GetMemoryGraph builds a full memory graph from the current local variables
// using the injected BuildGraphFunc. The caller must set BuildGraphFunc before
// calling this method (typically wired to graph.NewBuilder().BuildFromVariables).
func (d *DelveClient) GetMemoryGraph(ctx context.Context, _ int) (*MemoryGraph, error) {
	d.mu.Lock()
	buildFn := d.BuildGraphFunc
	d.mu.Unlock()

	if buildFn == nil {
		return nil, fmt.Errorf("BuildGraphFunc not set on DelveClient")
	}

	vars, err := d.GetLocalVariables(ctx)
	if err != nil {
		return nil, fmt.Errorf("getting variables for graph: %w", err)
	}

	d.mu.Lock()
	step := d.stepNumber
	d.mu.Unlock()

	mg := buildFn(vars, nil, step)
	mg.Timestamp = time.Now().UnixNano()

	return mg, nil
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// rpc returns the active RPC client, or ErrNotConnected.
func (d *DelveClient) rpc() (*rpc.Client, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if !d.connected || d.rpcClient == nil {
		return nil, ErrNotConnected
	}
	return d.rpcClient, nil
}

// convertVariable recursively translates a Delve variable into our Variable type.
// When a pointer child is only partially loaded (OnlyAddr), it is resolved via Eval.
func (d *DelveClient) convertVariable(client *rpc.Client, dv *dlvVariable, depth int) (*Variable, error) {
	if depth > maxPointerResolveDepth {
		return nil, nil
	}

	v := &Variable{
		Name:    dv.Name,
		Type:    dv.Type,
		Kind:    reflectKindString(dv.Kind),
		Value:   dv.Value,
		Address: dv.Addr,
		Size:    estimateSize(dv),
	}

	if dv.Unreadable != "" {
		v.Value = "<unreadable: " + dv.Unreadable + ">"
		return v, nil
	}

	if dv.Kind == reflect.Ptr && len(dv.Children) > 0 {
		child := &dv.Children[0]
		v.PointerTarget = child.Addr

		if child.OnlyAddr && child.Addr != 0 {
			resolved, err := d.evalExpr(client, fmt.Sprintf("*(%s)", dv.Name))
			if err == nil && resolved != nil {
				dv.Children[0] = *resolved
			}
		}
	}

	for i := range dv.Children {
		childVar, err := d.convertVariable(client, &dv.Children[i], depth+1)
		if err != nil {
			return nil, err
		}
		if childVar != nil {
			v.Children = append(v.Children, childVar)
		}
	}

	return v, nil
}

// evalExpr calls RPCServer.Eval for the given expression.
func (d *DelveClient) evalExpr(client *rpc.Client, expr string) (*dlvVariable, error) {
	cfg := defaultLoadConfig()
	var out evalOut
	if err := client.Call("RPCServer.Eval", evalIn{
		Scope: dlvEvalScope{GoroutineID: -1, Frame: 0},
		Expr:  expr,
		Cfg:   &cfg,
	}, &out); err != nil {
		return nil, fmt.Errorf("evaluating %q: %w", expr, err)
	}
	return out.Variable, nil
}

// reflectKindString maps a reflect.Kind to its lowercase name.
func reflectKindString(k reflect.Kind) string {
	return strings.ToLower(k.String())
}

// estimateSize returns a best-effort byte size for a Delve variable.
// Sizes follow the standard Go runtime layout for each kind.
func estimateSize(dv *dlvVariable) int64 {
	switch dv.Kind {
	case reflect.Bool:
		return 1
	case reflect.Int8, reflect.Uint8:
		return 1
	case reflect.Int16, reflect.Uint16:
		return 2
	case reflect.Int32, reflect.Uint32, reflect.Float32:
		return 4
	case reflect.Int, reflect.Int64, reflect.Uint, reflect.Uint64,
		reflect.Float64, reflect.Ptr, reflect.Uintptr:
		return 8
	case reflect.String:
		return 16
	case reflect.Slice:
		return 24
	case reflect.Interface:
		return 16
	case reflect.Map:
		return 8
	default:
		return 0
	}
}
