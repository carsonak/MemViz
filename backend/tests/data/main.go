package main

import "fmt"

type Node struct {
	Value int
	Next  *Node
}

type Stack struct {
	Top  *Node
	Size int
}

func (s *Stack) Push(val int) {
	newNode := &Node{Value: val, Next: s.Top} // Allocates on heap
	s.Top = newNode
	s.Size++
}

func (s *Stack) Pop() int {
	if s.Top == nil {
		return -1
	}
	val := s.Top.Value
	s.Top = s.Top.Next // Pointer manipulation!
	s.Size--
	return val
}

func sortStacks(stackA *Stack) *Stack {
	stackB := &Stack{}

	for stackA.Size > 0 {
		tmp := stackA.Pop()

		for stackB.Size > 0 && stackB.Top.Value > tmp {
			stackA.Push(stackB.Pop())
		}
		stackB.Push(tmp)
	}

	return stackB
}

func main() {
	// Initialize stack with unsorted data
	a := &Stack{}
	numbers := []int{34, 3, 31, 98, 92, 23}

	for _, n := range numbers {
		a.Push(n)
	}

	// Step into this function to watch the pointers fly back and forth
	sorted := sortStacks(a)

	fmt.Printf("Top of sorted stack: %d\n", sorted.Top.Value)
}
