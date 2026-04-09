package debugger

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMockClient_Connect(t *testing.T) {
	client := NewMockClient()

	err := client.Connect(context.Background(), "localhost:2345")
	require.NoError(t, err)
	assert.True(t, client.IsConnected())
}

func TestMockClient_ConnectError(t *testing.T) {
	client := NewMockClient()
	client.ConnectError = ErrNotConnected

	err := client.Connect(context.Background(), "localhost:2345")
	assert.Error(t, err)
	assert.False(t, client.IsConnected())
}

func TestMockClient_Disconnect(t *testing.T) {
	client := NewMockClient()
	_ = client.Connect(context.Background(), "localhost:2345")

	err := client.Disconnect()
	require.NoError(t, err)
	assert.False(t, client.IsConnected())
}

func TestMockClient_SetBreakpoint(t *testing.T) {
	client := NewMockClient()
	_ = client.Connect(context.Background(), "localhost:2345")

	bp, err := client.SetBreakpoint(context.Background(), "main.go", 10)
	require.NoError(t, err)
	assert.NotNil(t, bp)
	assert.Equal(t, "main.go", bp.File)
	assert.Equal(t, 10, bp.Line)
	assert.True(t, bp.Enabled)
}

func TestMockClient_SetBreakpointNotConnected(t *testing.T) {
	client := NewMockClient()

	_, err := client.SetBreakpoint(context.Background(), "main.go", 10)
	assert.ErrorIs(t, err, ErrNotConnected)
}

func TestMockClient_ClearBreakpoint(t *testing.T) {
	client := NewMockClient()
	_ = client.Connect(context.Background(), "localhost:2345")

	bp, _ := client.SetBreakpoint(context.Background(), "main.go", 10)
	err := client.ClearBreakpoint(context.Background(), bp.ID)

	require.NoError(t, err)
	assert.Empty(t, client.GetBreakpoints())
}

func TestMockClient_Continue(t *testing.T) {
	client := NewMockClient()
	_ = client.Connect(context.Background(), "localhost:2345")

	state, err := client.Continue(context.Background())
	require.NoError(t, err)
	assert.Equal(t, StopReasonBreakpoint, state.Reason)
	assert.Equal(t, 1, client.GetStepNumber())
}

func TestMockClient_StepOver(t *testing.T) {
	client := NewMockClient()
	_ = client.Connect(context.Background(), "localhost:2345")

	state, err := client.StepOver(context.Background())
	require.NoError(t, err)
	assert.Equal(t, StopReasonStep, state.Reason)
}

func TestMockClient_GetLocalVariables(t *testing.T) {
	client := NewMockClient()
	_ = client.Connect(context.Background(), "localhost:2345")

	vars, err := client.GetLocalVariables(context.Background())
	require.NoError(t, err)
	assert.Len(t, vars, 2)
	assert.Equal(t, "x", vars[0].Name)
	assert.Equal(t, "42", vars[0].Value)
}

func TestMockClient_GetLocalVariablesCustom(t *testing.T) {
	client := NewMockClient()
	_ = client.Connect(context.Background(), "localhost:2345")

	customVars := []*Variable{
		{Name: "custom", Type: "string", Value: "test"},
	}
	client.SetMockVariables(customVars)

	vars, err := client.GetLocalVariables(context.Background())
	require.NoError(t, err)
	assert.Len(t, vars, 1)
	assert.Equal(t, "custom", vars[0].Name)
}

func TestMockClient_GetMemoryGraph(t *testing.T) {
	client := NewMockClient()
	_ = client.Connect(context.Background(), "localhost:2345")

	graph, err := client.GetMemoryGraph(context.Background(), 3)
	require.NoError(t, err)
	assert.NotNil(t, graph)
	assert.NotEmpty(t, graph.StackBlocks)
	assert.NotNil(t, graph.StopState)
}

func TestMockClient_GetMemoryGraph_RealisticContent(t *testing.T) {
	client := NewMockClient()
	_ = client.Connect(context.Background(), "localhost:2345")

	// Step once so stepNumber=1
	_, _ = client.StepOver(context.Background())

	graph, err := client.GetMemoryGraph(context.Background(), 3)
	require.NoError(t, err)

	// 2 stack blocks with realistic addresses
	assert.Len(t, graph.StackBlocks, 2)
	assert.Equal(t, "greeting", graph.StackBlocks[0].Name)
	assert.Equal(t, uint64(0xc000000100), graph.StackBlocks[0].Address)
	assert.Equal(t, "count", graph.StackBlocks[1].Name)
	assert.Equal(t, uint64(0xc000000110), graph.StackBlocks[1].Address)
	assert.Equal(t, "10", graph.StackBlocks[1].Value) // step 1 * 10

	// 2 heap blocks with realistic addresses
	assert.Len(t, graph.HeapBlocks, 2)
	assert.Equal(t, uint64(0x1400000000), graph.HeapBlocks[0].Address)
	assert.Equal(t, "slice", graph.HeapBlocks[0].Kind)
	assert.Equal(t, uint64(0x1400000040), graph.HeapBlocks[1].Address)
	assert.Equal(t, "struct", graph.HeapBlocks[1].Kind)

	// 1 pointer: string header -> byte array
	assert.Len(t, graph.Pointers, 1)
	assert.Equal(t, "stack-1", graph.Pointers[0].SourceID)
	assert.Equal(t, "heap-1", graph.Pointers[0].TargetID)

	// Step-varying line number
	assert.Equal(t, 1, graph.StepNumber)
	assert.Equal(t, 11, graph.StopState.Line) // 10 + step
}

func TestMockClient_EvaluateExpression(t *testing.T) {
	client := NewMockClient()
	_ = client.Connect(context.Background(), "localhost:2345")

	variable, err := client.EvaluateExpression(context.Background(), "x + 1")
	require.NoError(t, err)
	assert.Equal(t, "x + 1", variable.Name)
}

func TestMockClient_StepSequence(t *testing.T) {
	client := NewMockClient()
	_ = client.Connect(context.Background(), "localhost:2345")

	// Simulate stepping through code
	_, _ = client.Continue(context.Background())
	assert.Equal(t, 1, client.GetStepNumber())

	_, _ = client.StepOver(context.Background())
	assert.Equal(t, 2, client.GetStepNumber())

	_, _ = client.StepInto(context.Background())
	assert.Equal(t, 3, client.GetStepNumber())

	_, _ = client.StepOut(context.Background())
	assert.Equal(t, 4, client.GetStepNumber())
}
