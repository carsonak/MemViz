package debugger

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// MockClient is a mock implementation of Client for use in tests.
// All behaviour is configurable through its exported fields.
type MockClient struct {
	mu          sync.Mutex
	connected   bool
	breakpoints map[int]*Breakpoint
	nextBpID    int
	stepNumber  int

	// MockVariables is returned by GetLocalVariables when set.
	MockVariables []*Variable
	// MockStopState is returned by step/continue methods when set.
	MockStopState *StopState
	// MockMemoryGraph is returned by GetMemoryGraph when set.
	MockMemoryGraph *MemoryGraph

	// ConnectError, when non-nil, is returned by Connect.
	ConnectError error
	// LaunchError, when non-nil, is returned by LaunchProgram.
	LaunchError error
	// SetBreakpointError, when non-nil, is returned by SetBreakpoint.
	SetBreakpointError error
	// ContinueError, when non-nil, is returned by Continue.
	ContinueError error
	// GetVariablesError, when non-nil, is returned by GetLocalVariables.
	GetVariablesError error
}

// NewMockClient creates a new mock debugger client
func NewMockClient() *MockClient {
	return &MockClient{
		breakpoints: make(map[int]*Breakpoint),
		nextBpID:    1,
	}
}

// Connect simulates establishing a connection. If ConnectError is set it is returned.
func (m *MockClient) Connect(_ context.Context, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.ConnectError != nil {
		return m.ConnectError
	}

	m.connected = true
	return nil
}

// Disconnect marks the client as disconnected.
func (m *MockClient) Disconnect() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.connected = false
	return nil
}

// SetOutputCallback is a no-op for the mock client.
func (m *MockClient) SetOutputCallback(_ func(string)) {}

// LaunchProgram marks the client as connected. If LaunchError is set it is returned.
func (m *MockClient) LaunchProgram(_ context.Context, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.LaunchError != nil {
		return m.LaunchError
	}

	m.connected = true
	return nil
}

// SetBreakpoint creates a breakpoint and records it in the internal map.
func (m *MockClient) SetBreakpoint(_ context.Context, file string, line int) (*Breakpoint, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.connected {
		return nil, ErrNotConnected
	}

	if m.SetBreakpointError != nil {
		return nil, m.SetBreakpointError
	}

	bp := &Breakpoint{
		ID:      m.nextBpID,
		File:    file,
		Line:    line,
		Enabled: true,
	}
	m.breakpoints[bp.ID] = bp
	m.nextBpID++

	return bp, nil
}

// SetFunctionBreakpoint creates a breakpoint for the named function.
func (m *MockClient) SetFunctionBreakpoint(_ context.Context, functionName string) (*Breakpoint, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.connected {
		return nil, ErrNotConnected
	}

	bp := &Breakpoint{
		ID:       m.nextBpID,
		File:     "main.go",
		Line:     1,
		Function: functionName,
		Enabled:  true,
	}
	m.breakpoints[bp.ID] = bp
	m.nextBpID++

	return bp, nil
}

// ClearBreakpoint removes the breakpoint with the given ID.
func (m *MockClient) ClearBreakpoint(_ context.Context, id int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.connected {
		return ErrNotConnected
	}

	delete(m.breakpoints, id)
	return nil
}

// Continue advances the step counter and returns a "breakpoint" StopState.
func (m *MockClient) Continue(_ context.Context) (*StopState, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.connected {
		return nil, ErrNotConnected
	}

	if m.ContinueError != nil {
		return nil, m.ContinueError
	}

	m.stepNumber++

	if m.MockStopState != nil {
		return m.MockStopState, nil
	}

	return &StopState{
		Reason:      StopReasonBreakpoint,
		File:        "main.go",
		Line:        10,
		Function:    "main.main",
		GoroutineID: 1,
	}, nil
}

// StepOver advances the step counter via a "step" reason.
func (m *MockClient) StepOver(_ context.Context) (*StopState, error) {
	return m.step(StopReasonStep)
}

// StepInto advances the step counter via a "step" reason.
func (m *MockClient) StepInto(_ context.Context) (*StopState, error) {
	return m.step(StopReasonStep)
}

// StepOut advances the step counter via a "step" reason.
func (m *MockClient) StepOut(_ context.Context) (*StopState, error) {
	return m.step(StopReasonStep)
}

// Halt returns a StopState as if the program was interrupted.
func (m *MockClient) Halt(_ context.Context) (*StopState, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.connected {
		return nil, ErrNotConnected
	}

	return &StopState{
		Reason:      StopReasonBreakpoint,
		File:        "main.go",
		Line:        1,
		Function:    "main.main",
		GoroutineID: 1,
	}, nil
}

// step advances the step counter and returns a StopState with the given reason.
func (m *MockClient) step(reason StopReason) (*StopState, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.connected {
		return nil, ErrNotConnected
	}

	m.stepNumber++

	if m.MockStopState != nil {
		state := *m.MockStopState
		state.Reason = reason
		return &state, nil
	}

	return &StopState{
		Reason:      reason,
		File:        "main.go",
		Line:        11,
		Function:    "main.main",
		GoroutineID: 1,
	}, nil
}

// GetLocalVariables returns MockVariables if set, otherwise a default variable set.
func (m *MockClient) GetLocalVariables(_ context.Context) ([]*Variable, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.connected {
		return nil, ErrNotConnected
	}

	if m.GetVariablesError != nil {
		return nil, m.GetVariablesError
	}

	if m.MockVariables != nil {
		return m.MockVariables, nil
	}

	return []*Variable{
		{
			Name:    "x",
			Type:    "int",
			Kind:    "int",
			Value:   "42",
			Address: 0xc000012000,
			Size:    8,
		},
		{
			Name:    "msg",
			Type:    "string",
			Kind:    "string",
			Value:   "hello",
			Address: 0xc000012008,
			Size:    16,
		},
	}, nil
}

// EvaluateExpression returns a placeholder Variable named after the expression.
func (m *MockClient) EvaluateExpression(_ context.Context, expr string) (*Variable, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.connected {
		return nil, ErrNotConnected
	}

	return &Variable{
		Name:    expr,
		Type:    "interface{}",
		Kind:    "interface",
		Value:   "<evaluated>",
		Address: 0xc000014000,
		Size:    16,
	}, nil
}

// GetMemoryGraph returns MockMemoryGraph if set, otherwise a realistic hardcoded graph.
func (m *MockClient) GetMemoryGraph(_ context.Context, _ int) (*MemoryGraph, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.connected {
		return nil, ErrNotConnected
	}

	if m.MockMemoryGraph != nil {
		return m.MockMemoryGraph, nil
	}

	return m.buildRealisticGraph(), nil
}

// buildRealisticGraph returns a MemoryGraph simulating a Go program with a
// stack-allocated string header pointing to heap byte data, plus a heap struct.
// The count value and stop line advance with each step to simulate live debugging.
func (m *MockClient) buildRealisticGraph() *MemoryGraph {
	step := m.stepNumber
	line := 10 + step

	return &MemoryGraph{
		Timestamp:  time.Now().UnixNano(),
		StepNumber: step,
		StopState: &StopState{
			Reason:      StopReasonStep,
			File:        "main.go",
			Line:        line,
			Function:    "main.main",
			GoroutineID: 1,
		},
		StackBlocks: []*MemoryBlock{
			{
				ID:        "stack-1",
				Address:   0xc000000100,
				Size:      16,
				Type:      "string",
				Kind:      "string",
				Name:      "greeting",
				Value:     "hello",
				IsStack:   true,
				Variables: []string{"greeting"},
			},
			{
				ID:        "stack-2",
				Address:   0xc000000110,
				Size:      8,
				Type:      "int",
				Kind:      "int",
				Name:      "count",
				Value:     fmt.Sprintf("%d", step*10),
				IsStack:   true,
				Variables: []string{"count"},
			},
		},
		HeapBlocks: []*MemoryBlock{
			{
				ID:        "heap-1",
				Address:   0x1400000000,
				Size:      5,
				Type:      "[]byte",
				Kind:      "slice",
				Name:      "[5]byte",
				Value:     "hello",
				IsStack:   false,
				Variables: []string{"greeting.data"},
			},
			{
				ID:        "heap-2",
				Address:   0x1400000040,
				Size:      32,
				Type:      "Config",
				Kind:      "struct",
				Name:      "cfg",
				IsStack:   false,
				Variables: []string{"cfg"},
			},
		},
		Pointers: []*Pointer{
			{
				ID:         "ptr-1",
				SourceID:   "stack-1",
				TargetID:   "heap-1",
				SourceAddr: 0xc000000100,
				TargetAddr: 0x1400000000,
				FieldName:  "greeting",
			},
		},
	}
}

// Helper methods for testing

// SetMockVariables sets the variables returned by GetLocalVariables.
func (m *MockClient) SetMockVariables(vars []*Variable) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.MockVariables = vars
}

// SetMockMemoryGraph sets the graph returned by GetMemoryGraph.
func (m *MockClient) SetMockMemoryGraph(graph *MemoryGraph) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.MockMemoryGraph = graph
}

// GetBreakpoints returns a snapshot of all currently set breakpoints.
func (m *MockClient) GetBreakpoints() []*Breakpoint {
	m.mu.Lock()
	defer m.mu.Unlock()

	bps := make([]*Breakpoint, 0, len(m.breakpoints))
	for _, bp := range m.breakpoints {
		bps = append(bps, bp)
	}
	return bps
}

// IsConnected reports whether the client is connected.
func (m *MockClient) IsConnected() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.connected
}

// GetStepNumber returns the number of execution steps taken since connection.
func (m *MockClient) GetStepNumber() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.stepNumber
}
