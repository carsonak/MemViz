import { useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useMemoryStore } from '../store/memoryStore';

export const DEFAULT_CODE = `package main

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

/** Tracks which lines have breakpoint decorations (line → true). */
type BreakpointLines = Set<number>;

let nextLocalBpId = 1;

export function CodeEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const breakpointLinesRef = useRef<BreakpointLines>(new Set());
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    decorationsRef.current = editor.createDecorationsCollection([]);

    editor.onMouseDown((e) => {
      const target = e.target;
      if (
        target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN &&
        target.type !== monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS
      ) {
        return;
      }

      const lineNumber = target.position?.lineNumber;
      if (lineNumber == null) return;

      const lines = breakpointLinesRef.current;

      if (lines.has(lineNumber)) {
        lines.delete(lineNumber);
      } else {
        lines.add(lineNumber);
        const id = nextLocalBpId++;
        useMemoryStore.getState().addBreakpoint({
          id,
          file: 'main.go',
          line: lineNumber,
          enabled: true,
        });
        useMemoryStore.getState().sendCommand('add_breakpoint', {
          file: 'main.go',
          line: lineNumber,
        });
      }

      // Rebuild decorations from current set.
      const newDecorations: Monaco.editor.IModelDeltaDecoration[] = [];
      for (const ln of lines) {
        newDecorations.push({
          range: new monaco.Range(ln, 1, ln, 1),
          options: {
            isWholeLine: true,
            glyphMarginClassName: 'breakpoint-glyph',
            glyphMarginHoverMessage: { value: `Breakpoint — line ${ln}` },
          },
        });
      }
      decorationsRef.current?.set(newDecorations);
    });
  }, []);

  return (
    <Editor
      height="100%"
      language="go"
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={handleMount}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        glyphMargin: true,
      }}
    />
  );
}
