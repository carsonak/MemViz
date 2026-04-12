package main

import "fmt"

type Node struct {
	Value int
	Next  *Node
}

func main() {
	a := 10
	b := &a

	head := &Node{Value: 1}
	head.Next = &Node{Value: 2}

	fmt.Println(a, b, head)
}
