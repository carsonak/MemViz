package debugger

import (
	"context"
	"sync"
	"time"
)

// MockClient is a mock implementation of the Client interface for testing
type MockClient struct {
	mu          sync.Mutex
	connected   bool
	breakpoints map[int]*Breakpoint
	nextBpID    int
	stepNumber  int

	// Mock configuration
	MockVariables   []*Variable
	MockStopState   *StopState
	MockMemoryGraph *MemoryGraph

	// Error injection for testing error handling
	ConnectError       error
	LaunchError        error
	SetBreakpointError error
	ContinueError      error
	GetVariablesError  error
}

// NewMockClient creates a new mock debugger client
func NewMockClient() *MockClient {
	return &MockClient{
		breakpoints: make(map[int]*Breakpoint),
		nextBpID:    1,
	}
}

func (m *MockClient) Connect(ctx context.Context, addr string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.ConnectError != nil {
		return m.ConnectError
	}

	m.connected = true
	return nil
}

func (m *MockClient) Disconnect() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.connected = false
	return nil
}

func (m *MockClient) LaunchProgram(ctx context.Context, programPath string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.LaunchError != nil {
		return m.LaunchError
	}

	m.connected = true
	return nil
}

func (m *MockClient) SetBreakpoint(ctx context.Context, file string, line int) (*Breakpoint, error) {
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

func (m *MockClient) ClearBreakpoint(ctx context.Context, id int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.connected {
		return ErrNotConnected
	}

	delete(m.breakpoints, id)
	return nil
}

func (m *MockClient) Continue(ctx context.Context) (*StopState, error) {
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

func (m *MockClient) StepOver(ctx context.Context) (*StopState, error) {
	return m.step(StopReasonStep)
}

func (m *MockClient) StepInto(ctx context.Context) (*StopState, error) {
	return m.step(StopReasonStep)
}

func (m *MockClient) StepOut(ctx context.Context) (*StopState, error) {
	return m.step(StopReasonStep)
}

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

func (m *MockClient) GetLocalVariables(ctx context.Context) ([]*Variable, error) {
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

	// Return sample variables for testing
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

func (m *MockClient) EvaluateExpression(ctx context.Context, expr string) (*Variable, error) {
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

func (m *MockClient) GetMemoryGraph(ctx context.Context, maxDepth int) (*MemoryGraph, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.connected {
		return nil, ErrNotConnected
	}

	if m.MockMemoryGraph != nil {
		return m.MockMemoryGraph, nil
	}

	// Return a sample memory graph for testing
	return &MemoryGraph{
		Timestamp:  time.Now().UnixNano(),
		StepNumber: m.stepNumber,
		StopState: &StopState{
			Reason:      StopReasonStep,
			File:        "main.go",
			Line:        10,
			Function:    "main.main",
			GoroutineID: 1,
		},
		StackBlocks: []*MemoryBlock{
			{
				ID:        "stack-1",
				Address:   0xc000012000,
				Size:      8,
				Type:      "int",
				Kind:      "int",
				Name:      "x",
				Value:     "42",
				IsStack:   true,
				Variables: []string{"x"},
			},
			{
				ID:        "stack-2",
				Address:   0xc000012008,
				Size:      16,
				Type:      "string",
				Kind:      "string",
				Name:      "msg",
				Value:     "hello",
				IsStack:   true,
				Variables: []string{"msg"},
			},
		},
		HeapBlocks: []*MemoryBlock{
			{
				ID:        "heap-1",
				Address:   0xc000100000,
				Size:      24,
				Type:      "*MyStruct",
				Kind:      "ptr",
				Name:      "ptr",
				IsStack:   false,
				Variables: []string{"ptr"},
			},
		},
		Pointers: []*Pointer{
			{
				ID:         "ptr-1",
				SourceID:   "stack-3",
				TargetID:   "heap-1",
				SourceAddr: 0xc000012018,
				TargetAddr: 0xc000100000,
				FieldName:  "ptr",
			},
		},
	}, nil
}

// Helper methods for testing

// SetMockVariables sets the variables that will be returned by GetLocalVariables
func (m *MockClient) SetMockVariables(vars []*Variable) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.MockVariables = vars
}

// SetMockMemoryGraph sets the memory graph that will be returned by GetMemoryGraph
func (m *MockClient) SetMockMemoryGraph(graph *MemoryGraph) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.MockMemoryGraph = graph
}

// GetBreakpoints returns all currently set breakpoints
func (m *MockClient) GetBreakpoints() []*Breakpoint {
	m.mu.Lock()
	defer m.mu.Unlock()

	bps := make([]*Breakpoint, 0, len(m.breakpoints))
	for _, bp := range m.breakpoints {
		bps = append(bps, bp)
	}
	return bps
}

// IsConnected returns the connection state
func (m *MockClient) IsConnected() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.connected
}

// GetStepNumber returns the current step count
func (m *MockClient) GetStepNumber() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.stepNumber
}
