// Package graph constructs a MemoryGraph from raw debugger variables.
// It handles object graph traversal, cycle detection, and depth limiting.
package graph

import (
	"github.com/memviz/backend/internal/debugger"
)

// Builder constructs a MemoryGraph from debugger variables.
// It handles object graph traversal with depth limiting.
type Builder struct {
	maxDepth    int
	visited     map[uint64]bool
	blocks      map[string]*debugger.MemoryBlock
	pointers    []*debugger.Pointer
	nextBlockID int
	nextPtrID   int
}

// NewBuilder creates a new memory graph builder.
func NewBuilder(maxDepth int) *Builder {
	return &Builder{
		maxDepth: maxDepth,
		visited:  make(map[uint64]bool),
		blocks:   make(map[string]*debugger.MemoryBlock),
	}
}

// BuildFromVariables traverses the object graph starting from the given variables.
func (b *Builder) BuildFromVariables(vars []*debugger.Variable, stopState *debugger.StopState, stepNumber int) *debugger.MemoryGraph {
	for _, v := range vars {
		b.processVariable(v, true, 0)
	}

	stackBlocks := make([]*debugger.MemoryBlock, 0)
	heapBlocks := make([]*debugger.MemoryBlock, 0)

	for _, block := range b.blocks {
		if block.IsStack {
			stackBlocks = append(stackBlocks, block)
		} else {
			heapBlocks = append(heapBlocks, block)
		}
	}

	return &debugger.MemoryGraph{
		Timestamp:   0, // Will be set by caller
		StepNumber:  stepNumber,
		StopState:   stopState,
		StackBlocks: stackBlocks,
		HeapBlocks:  heapBlocks,
		Pointers:    b.pointers,
	}
}

func (b *Builder) processVariable(v *debugger.Variable, isStack bool, depth int) *debugger.MemoryBlock {
	if depth > b.maxDepth {
		return nil
	}

	// Skip if already visited (cycle detection)
	if b.visited[v.Address] {
		return nil
	}
	b.visited[v.Address] = true

	b.nextBlockID++
	blockID := generateBlockID(b.nextBlockID, isStack)

	block := &debugger.MemoryBlock{
		ID:        blockID,
		Address:   v.Address,
		Size:      v.Size,
		Type:      v.Type,
		Kind:      v.Kind,
		Name:      v.Name,
		Value:     v.Value,
		IsStack:   isStack,
		Variables: []string{v.Name},
	}

	b.blocks[blockID] = block

	// Process pointer targets
	if v.PointerTarget != 0 && !b.visited[v.PointerTarget] {
		b.nextPtrID++
		ptr := &debugger.Pointer{
			ID:         generatePointerID(b.nextPtrID),
			SourceID:   blockID,
			SourceAddr: v.Address,
			TargetAddr: v.PointerTarget,
			FieldName:  v.Name,
		}
		b.pointers = append(b.pointers, ptr)
	}

	// Recursively process children (struct fields, array elements, etc.)
	for _, child := range v.Children {
		// Children of stack variables that are pointers may reference heap
		childIsStack := isStack && child.PointerTarget == 0
		childBlock := b.processVariable(child, childIsStack, depth+1)

		if childBlock != nil {
			// Add pointer from parent to child if it's a reference
			if child.PointerTarget != 0 {
				b.nextPtrID++
				ptr := &debugger.Pointer{
					ID:         generatePointerID(b.nextPtrID),
					SourceID:   blockID,
					TargetID:   childBlock.ID,
					SourceAddr: v.Address,
					TargetAddr: child.Address,
					FieldName:  child.Name,
				}
				b.pointers = append(b.pointers, ptr)
			}
		}
	}

	return block
}

// generateBlockID returns the canonical ID for a memory block.
func generateBlockID(n int, isStack bool) string {
	if isStack {
		return "stack-" + itoa(n)
	}
	return "heap-" + itoa(n)
}

// generatePointerID returns the canonical ID for a pointer relationship.
func generatePointerID(n int) string {
	return "ptr-" + itoa(n)
}

// itoa converts a non-negative integer to its decimal string representation
// without importing the fmt or strconv packages.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}

	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}
