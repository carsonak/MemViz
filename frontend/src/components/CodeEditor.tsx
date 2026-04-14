import { useState } from 'react';
import Editor from '@monaco-editor/react';

const DEFAULT_CODE = `package main

import "fmt"

// Node represents a single element in a linked-list-based stack.
type Node struct {
	Value int
	Next  *Node
}

// Stack is a LIFO container backed by a singly linked list.
type Stack struct {
	Top  *Node
	Size int
}

// Push adds a value to the top of the stack.
func (s *Stack) Push(val int) {
	s.Top = &Node{Value: val, Next: s.Top}
	s.Size++
}

// Pop removes and returns the top value. Panics on empty stack.
func (s *Stack) Pop() int {
	if s.Top == nil {
		panic("pop from empty stack")
	}
	val := s.Top.Value
	s.Top = s.Top.Next
	s.Size--
	return val
}

// sortedInsert inserts val into the sorted stack (smallest on top)
// by temporarily moving larger items to a temp stack.
func sortedInsert(sorted *Stack, val int) {
	temp := &Stack{}
	for sorted.Size > 0 && sorted.Top.Value < val {
		temp.Push(sorted.Pop())
	}
	sorted.Push(val)
	for temp.Size > 0 {
		sorted.Push(temp.Pop())
	}
}

func main() {
	input := &Stack{}
	for _, v := range []int{5, 1, 4, 2, 8, 3} {
		input.Push(v)
	}

	sorted := &Stack{}
	for input.Size > 0 {
		sortedInsert(sorted, input.Pop())
	}

	fmt.Println("Sorted (smallest on top):")
	for sorted.Size > 0 {
		fmt.Println(sorted.Pop())
	}
}
`;

export function CodeEditor() {
  const [code, setCode] = useState(DEFAULT_CODE);

  return (
    <Editor
      height="100%"
      language="go"
      theme="vs-dark"
      value={code}
      onChange={(value) => setCode(value ?? '')}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        scrollBeyondLastLine: false,
        automaticLayout: true,
      }}
    />
  );
}
