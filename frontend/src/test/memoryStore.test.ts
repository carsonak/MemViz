import { describe, it, expect, beforeEach } from "vitest";
import { useMemoryStore } from "../store/memoryStore";
import type { MemoryGraph, Breakpoint } from "../types";

describe("memoryStore", () => {
  beforeEach(() => {
    // Reset store before each test
    useMemoryStore.getState().reset();
  });

  describe("connection state", () => {
    it("initializes with disconnected state", () => {
      const state = useMemoryStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.isDebugging).toBe(false);
    });

    it("sets connected state", () => {
      useMemoryStore.getState().setConnected(true);
      expect(useMemoryStore.getState().isConnected).toBe(true);
    });

    it("sets debugging state", () => {
      useMemoryStore.getState().setDebugging(true);
      expect(useMemoryStore.getState().isDebugging).toBe(true);
    });

    it("sets program path", () => {
      useMemoryStore.getState().setProgramPath("/path/to/main.go");
      expect(useMemoryStore.getState().programPath).toBe("/path/to/main.go");
    });
  });

  describe("memory graph updates", () => {
    const mockGraph: MemoryGraph = {
      timestamp: Date.now(),
      step_number: 1,
      stop_state: {
        reason: "step",
        file: "main.go",
        line: 10,
        function: "main.main",
        goroutine_id: 1,
      },
      stack_blocks: [
        {
          id: "stack-1",
          address: 0xc000012000,
          size: 8,
          type: "int",
          kind: "int",
          name: "x",
          value: "42",
          is_stack: true,
        },
      ],
      heap_blocks: [],
      pointers: [],
    };

    it("updates memory graph correctly", () => {
      useMemoryStore.getState().updateMemoryGraph(mockGraph);

      const state = useMemoryStore.getState();
      expect(state.currentStepNumber).toBe(1);
      expect(state.stopState).toEqual(mockGraph.stop_state);
      expect(state.stackBlocks).toEqual(mockGraph.stack_blocks);
      expect(state.heapBlocks).toEqual(mockGraph.heap_blocks);
    });

    it("adds graph to history", () => {
      useMemoryStore.getState().updateMemoryGraph(mockGraph);
      expect(useMemoryStore.getState().history).toHaveLength(1);
      expect(useMemoryStore.getState().history[0]).toEqual(mockGraph);
    });

    it("maintains history limit", () => {
      // Add more than MAX_HISTORY_LENGTH items
      for (let i = 0; i < 110; i++) {
        useMemoryStore.getState().updateMemoryGraph({
          ...mockGraph,
          step_number: i,
        });
      }

      // Should be capped at 100
      expect(useMemoryStore.getState().history.length).toBeLessThanOrEqual(100);
    });
  });

  describe("breakpoint management", () => {
    const mockBreakpoint: Breakpoint = {
      id: 1,
      file: "main.go",
      line: 15,
      enabled: true,
    };

    it("adds breakpoints", () => {
      useMemoryStore.getState().addBreakpoint(mockBreakpoint);
      expect(useMemoryStore.getState().breakpoints).toHaveLength(1);
      expect(useMemoryStore.getState().breakpoints[0]).toEqual(mockBreakpoint);
    });

    it("removes breakpoints by id", () => {
      useMemoryStore.getState().addBreakpoint(mockBreakpoint);
      useMemoryStore.getState().addBreakpoint({ ...mockBreakpoint, id: 2 });

      useMemoryStore.getState().removeBreakpoint(1);

      const bps = useMemoryStore.getState().breakpoints;
      expect(bps).toHaveLength(1);
      expect(bps[0].id).toBe(2);
    });
  });

  describe("UI state", () => {
    it("sets selected block and auto-shows pointers", () => {
      useMemoryStore.getState().setSelectedBlock("block-1");

      const state = useMemoryStore.getState();
      expect(state.selectedBlockId).toBe("block-1");
      expect(state.showPointers).toBe(true);
    });

    it("clears selection and hides pointers", () => {
      useMemoryStore.getState().setSelectedBlock("block-1");
      useMemoryStore.getState().setSelectedBlock(null);

      const state = useMemoryStore.getState();
      expect(state.selectedBlockId).toBeNull();
      expect(state.showPointers).toBe(false);
    });

    it("sets hovered block", () => {
      useMemoryStore.getState().setHoveredBlock("block-2");
      expect(useMemoryStore.getState().hoveredBlockId).toBe("block-2");
    });

    it("sets zoom level", () => {
      useMemoryStore.getState().setZoomLevel(2.5);
      expect(useMemoryStore.getState().zoomLevel).toBe(2.5);
    });
  });

  describe("reset", () => {
    it("resets all state to initial values", () => {
      // Set various state
      useMemoryStore.getState().setConnected(true);
      useMemoryStore.getState().setDebugging(true);
      useMemoryStore.getState().setSelectedBlock("block-1");

      // Reset
      useMemoryStore.getState().reset();

      const state = useMemoryStore.getState();
      expect(state.isConnected).toBe(false);
      expect(state.isDebugging).toBe(false);
      expect(state.selectedBlockId).toBeNull();
      expect(state.history).toHaveLength(0);
    });
  });
});
