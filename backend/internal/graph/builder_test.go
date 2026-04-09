package graph

import (
	"testing"

	"github.com/memviz/backend/internal/debugger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuilder_SimpleVariables(t *testing.T) {
	builder := NewBuilder(3)

	vars := []*debugger.Variable{
		{
			Name:    "x",
			Type:    "int",
			Kind:    "int",
			Value:   "42",
			Address: 0xc000012000,
			Size:    8,
		},
		{
			Name:    "y",
			Type:    "string",
			Kind:    "string",
			Value:   "hello",
			Address: 0xc000012008,
			Size:    16,
		},
	}

	stopState := &debugger.StopState{
		File:     "main.go",
		Line:     10,
		Function: "main.main",
	}

	graph := builder.BuildFromVariables(vars, stopState, 1)

	require.NotNil(t, graph)
	assert.Len(t, graph.StackBlocks, 2)
	assert.Empty(t, graph.HeapBlocks)
	assert.Equal(t, 1, graph.StepNumber)

	// Check first block
	assert.Equal(t, "x", graph.StackBlocks[0].Name)
	assert.Equal(t, "int", graph.StackBlocks[0].Type)
	assert.Equal(t, uint64(0xc000012000), graph.StackBlocks[0].Address)
	assert.True(t, graph.StackBlocks[0].IsStack)
}

func TestBuilder_PointerVariable(t *testing.T) {
	builder := NewBuilder(3)

	vars := []*debugger.Variable{
		{
			Name:          "ptr",
			Type:          "*int",
			Kind:          "ptr",
			Value:         "0xc000100000",
			Address:       0xc000012000,
			Size:          8,
			PointerTarget: 0xc000100000,
		},
	}

	graph := builder.BuildFromVariables(vars, nil, 1)

	require.NotNil(t, graph)
	assert.Len(t, graph.StackBlocks, 1)
	assert.Len(t, graph.Pointers, 1)

	ptr := graph.Pointers[0]
	assert.Equal(t, uint64(0xc000012000), ptr.SourceAddr)
	assert.Equal(t, uint64(0xc000100000), ptr.TargetAddr)
	assert.Equal(t, "ptr", ptr.FieldName)
}

func TestBuilder_NestedStruct(t *testing.T) {
	builder := NewBuilder(3)

	vars := []*debugger.Variable{
		{
			Name:    "person",
			Type:    "Person",
			Kind:    "struct",
			Address: 0xc000012000,
			Size:    32,
			Children: []*debugger.Variable{
				{
					Name:    "Name",
					Type:    "string",
					Kind:    "string",
					Value:   "Alice",
					Address: 0xc000012008, // Different address for child
					Size:    16,
				},
				{
					Name:    "Age",
					Type:    "int",
					Kind:    "int",
					Value:   "30",
					Address: 0xc000012018, // Different address for child
					Size:    8,
				},
			},
		},
	}

	graph := builder.BuildFromVariables(vars, nil, 1)

	require.NotNil(t, graph)
	// Parent struct + 2 children
	assert.Len(t, graph.StackBlocks, 3)
}

func TestBuilder_CycleDetection(t *testing.T) {
	builder := NewBuilder(10) // High depth to test cycle detection

	// Simulate a self-referencing structure
	selfRef := &debugger.Variable{
		Name:          "node",
		Type:          "*Node",
		Kind:          "ptr",
		Address:       0xc000012000,
		Size:          8,
		PointerTarget: 0xc000012000, // Points to itself
	}

	vars := []*debugger.Variable{selfRef}

	graph := builder.BuildFromVariables(vars, nil, 1)

	require.NotNil(t, graph)
	// Should only have one block despite the cycle
	assert.Len(t, graph.StackBlocks, 1)
}

func TestBuilder_MaxDepthLimit(t *testing.T) {
	builder := NewBuilder(1) // Only depth 1

	// Create deeply nested structure
	deeplyNested := &debugger.Variable{
		Name:    "level0",
		Type:    "Level",
		Kind:    "struct",
		Address: 0xc000012000,
		Size:    8,
		Children: []*debugger.Variable{
			{
				Name:    "level1",
				Type:    "Level",
				Kind:    "struct",
				Address: 0xc000012008,
				Size:    8,
				Children: []*debugger.Variable{
					{
						Name:    "level2",
						Type:    "Level",
						Kind:    "struct",
						Address: 0xc000012010,
						Size:    8,
					},
				},
			},
		},
	}

	vars := []*debugger.Variable{deeplyNested}

	graph := builder.BuildFromVariables(vars, nil, 1)

	require.NotNil(t, graph)
	// With maxDepth=1, should only get level0 and level1, not level2
	assert.LessOrEqual(t, len(graph.StackBlocks), 2)
}

func TestBuilder_generateBlockID(t *testing.T) {
	assert.Equal(t, "stack-1", generateBlockID(1, true))
	assert.Equal(t, "heap-1", generateBlockID(1, false))
	assert.Equal(t, "stack-42", generateBlockID(42, true))
}

func TestBuilder_generatePointerID(t *testing.T) {
	assert.Equal(t, "ptr-1", generatePointerID(1))
	assert.Equal(t, "ptr-100", generatePointerID(100))
}

func TestItoa(t *testing.T) {
	assert.Equal(t, "0", itoa(0))
	assert.Equal(t, "1", itoa(1))
	assert.Equal(t, "42", itoa(42))
	assert.Equal(t, "12345", itoa(12345))
}
