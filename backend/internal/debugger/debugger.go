// Package debugger defines the Client interface and shared types for interacting
// with a Go debugger (Delve). Concrete implementations live in separate files:
// MockClient for testing and DelveClient for production use.
package debugger

import (
	"context"
	"fmt"
)

// Client defines the interface for interacting with a debugger (Delve)
type Client interface {
	// Connect establishes a connection to a running debugger instance
	Connect(ctx context.Context, addr string) error

	// Disconnect closes the debugger connection
	Disconnect() error

	// LaunchProgram compiles and starts debugging a Go program
	// The program is compiled with -gcflags="all=-N -l" to disable optimizations
	LaunchProgram(ctx context.Context, programPath string) error

	// SetBreakpoint sets a breakpoint at the specified file:line
	SetBreakpoint(ctx context.Context, file string, line int) (*Breakpoint, error)

	// ClearBreakpoint removes a breakpoint by ID
	ClearBreakpoint(ctx context.Context, id int) error

	// Continue resumes execution until the next breakpoint
	Continue(ctx context.Context) (*StopState, error)

	// StepOver executes the next line without entering function calls
	StepOver(ctx context.Context) (*StopState, error)

	// StepInto executes the next line, entering function calls
	StepInto(ctx context.Context) (*StopState, error)

	// StepOut continues until the current function returns
	StepOut(ctx context.Context) (*StopState, error)

	// GetLocalVariables retrieves all local variables in the current scope
	GetLocalVariables(ctx context.Context) ([]*Variable, error)

	// EvaluateExpression evaluates an expression in the current context
	EvaluateExpression(ctx context.Context, expr string) (*Variable, error)

	// GetMemoryGraph traverses the object graph starting from local variables
	// maxDepth limits how deep to traverse pointer references
	GetMemoryGraph(ctx context.Context, maxDepth int) (*MemoryGraph, error)
}

// Breakpoint represents a debugger breakpoint
type Breakpoint struct {
	ID       int    `json:"id"`
	File     string `json:"file"`
	Line     int    `json:"line"`
	Function string `json:"function,omitempty"`
	Enabled  bool   `json:"enabled"`
}

// StopState represents the state when the debugger stops
type StopState struct {
	Reason      StopReason `json:"reason"`
	File        string     `json:"file"`
	Line        int        `json:"line"`
	Function    string     `json:"function"`
	GoroutineID int64      `json:"goroutine_id"`
}

// StopReason indicates why the debugger stopped
type StopReason string

const (
	StopReasonBreakpoint StopReason = "breakpoint"
	StopReasonStep       StopReason = "step"
	StopReasonPanic      StopReason = "panic"
	StopReasonExit       StopReason = "exit"
)

// Variable represents a variable in memory
type Variable struct {
	Name     string      `json:"name"`
	Type     string      `json:"type"`
	Kind     string      `json:"kind"`
	Value    string      `json:"value"`
	Address  uint64      `json:"address"`
	Size     int64       `json:"size"`
	Children []*Variable `json:"children,omitempty"`
	// For pointers, this is the address being pointed to
	PointerTarget uint64 `json:"pointer_target,omitempty"`
}

// MemoryGraph represents the complete memory state at a point in time
type MemoryGraph struct {
	Timestamp   int64          `json:"timestamp"`
	StepNumber  int            `json:"step_number"`
	StopState   *StopState     `json:"stop_state"`
	StackBlocks []*MemoryBlock `json:"stack_blocks"`
	HeapBlocks  []*MemoryBlock `json:"heap_blocks"`
	Pointers    []*Pointer     `json:"pointers"`
}

// MemoryBlock represents a contiguous block of memory
type MemoryBlock struct {
	ID        string   `json:"id"`
	Address   uint64   `json:"address"`
	Size      int64    `json:"size"`
	Type      string   `json:"type"`
	Kind      string   `json:"kind"`
	Name      string   `json:"name"`
	Value     string   `json:"value,omitempty"`
	IsStack   bool     `json:"is_stack"`
	Variables []string `json:"variables,omitempty"` // Variable names contained in this block
}

// Pointer represents a pointer relationship between memory blocks
type Pointer struct {
	ID         string `json:"id"`
	SourceID   string `json:"source_id"`
	TargetID   string `json:"target_id"`
	SourceAddr uint64 `json:"source_addr"`
	TargetAddr uint64 `json:"target_addr"`
	FieldName  string `json:"field_name,omitempty"`
}

// ErrNotConnected indicates the debugger is not connected
var ErrNotConnected = fmt.Errorf("debugger not connected")

// ErrProcessExited indicates the debugged process has exited
var ErrProcessExited = fmt.Errorf("process has exited")
