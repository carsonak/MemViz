import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useMemoryStore } from "../store/memoryStore";
import type { MemoryGraph, Breakpoint } from "../types";

// --- Mock WebSocket for testing ---
class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readyState = 0; // CONNECTING
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  sentMessages: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }

  // Test helpers
  simulateOpen() {
    this.readyState = 1;
    this.onopen?.({} as Event);
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  simulateClose() {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
}

let originalWebSocket: typeof WebSocket;

describe("memoryStore", () => {
  beforeEach(() => {
    // Reset store before each test
    useMemoryStore.getState().reset();
    // Set up MockWebSocket
    MockWebSocket.instances = [];
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
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

  describe("websocket integration", () => {
    it("connects to websocket server", () => {
      useMemoryStore.getState().connect("ws://localhost:8080/ws");

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(MockWebSocket.instances[0].url).toBe("ws://localhost:8080/ws");

      // Simulate connection open
      MockWebSocket.instances[0].simulateOpen();
      expect(useMemoryStore.getState().isConnected).toBe(true);
    });

    it("handles memory_update messages", () => {
      useMemoryStore.getState().connect("ws://localhost:8080/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.simulateOpen();

      const mockGraph: MemoryGraph = {
        timestamp: Date.now(),
        step_number: 1,
        stop_state: {
          reason: "step",
          file: "main.go",
          line: 11,
          function: "main.main",
          goroutine_id: 1,
        },
        stack_blocks: [
          {
            id: "stack-1",
            address: 0xc000000100,
            size: 16,
            type: "string",
            kind: "string",
            name: "greeting",
            value: "hello",
            is_stack: true,
          },
        ],
        heap_blocks: [],
        pointers: [],
      };

      mockWs.simulateMessage({
        type: "memory_update",
        payload: { graph: mockGraph },
      });

      const state = useMemoryStore.getState();
      expect(state.currentStepNumber).toBe(1);
      expect(state.stackBlocks).toHaveLength(1);
      expect(state.stackBlocks[0].name).toBe("greeting");
      expect(state.history).toHaveLength(1);
    });

    it("handles status messages", () => {
      useMemoryStore.getState().connect("ws://localhost:8080/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.simulateOpen();

      mockWs.simulateMessage({
        type: "status",
        payload: { connected: true, debugging: true },
      });

      expect(useMemoryStore.getState().isConnected).toBe(true);
      expect(useMemoryStore.getState().isDebugging).toBe(true);
    });

    it("sends messages via websocket", () => {
      useMemoryStore.getState().connect("ws://localhost:8080/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.simulateOpen();

      useMemoryStore.getState().sendMessage("step_over");

      expect(mockWs.sentMessages).toHaveLength(1);
      const sent = JSON.parse(mockWs.sentMessages[0]);
      expect(sent.type).toBe("step_over");
      expect(sent.payload).toEqual({});
    });

    it("handles disconnect", () => {
      useMemoryStore.getState().connect("ws://localhost:8080/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.simulateOpen();
      expect(useMemoryStore.getState().isConnected).toBe(true);

      useMemoryStore.getState().disconnect();

      expect(useMemoryStore.getState().isConnected).toBe(false);
      expect(useMemoryStore.getState().isDebugging).toBe(false);
    });

    it("handles server-initiated close", () => {
      useMemoryStore.getState().connect("ws://localhost:8080/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.simulateOpen();
      expect(useMemoryStore.getState().isConnected).toBe(true);

      mockWs.simulateClose();

      expect(useMemoryStore.getState().isConnected).toBe(false);
      expect(useMemoryStore.getState().isDebugging).toBe(false);
    });

    it("does not send when not connected", () => {
      // No connection established
      useMemoryStore.getState().sendMessage("step_over");
      // Should not throw, just warn
      expect(MockWebSocket.instances).toHaveLength(0);
    });
  });

  describe("sendCommand", () => {
    it("sends a command with action only", () => {
      useMemoryStore.getState().connect("ws://localhost:8080/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.simulateOpen();

      useMemoryStore.getState().sendCommand("start");

      expect(mockWs.sentMessages).toHaveLength(1);
      const sent = JSON.parse(mockWs.sentMessages[0]);
      expect(sent.action).toBe("start");
      expect(sent.payload).toBeUndefined();
    });

    it("sends a command with payload", () => {
      useMemoryStore.getState().connect("ws://localhost:8080/ws");
      const mockWs = MockWebSocket.instances[0];
      mockWs.simulateOpen();

      useMemoryStore
        .getState()
        .sendCommand("add_breakpoint", { file: "main.go", line: 42 });

      expect(mockWs.sentMessages).toHaveLength(1);
      const sent = JSON.parse(mockWs.sentMessages[0]);
      expect(sent.action).toBe("add_breakpoint");
      expect(sent.payload).toEqual({ file: "main.go", line: 42 });
    });

    it("does not send command when not connected", () => {
      useMemoryStore.getState().sendCommand("step");
      expect(MockWebSocket.instances).toHaveLength(0);
    });

    it("does not send command when socket is not open", () => {
      useMemoryStore.getState().connect("ws://localhost:8080/ws");
      const mockWs = MockWebSocket.instances[0];
      // readyState is still CONNECTING (0), not OPEN

      useMemoryStore.getState().sendCommand("step");
      expect(mockWs.sentMessages).toHaveLength(0);
    });
  });
});
