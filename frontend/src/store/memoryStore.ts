import { create } from "zustand";
import type {
  MemoryGraph,
  MemoryBlock,
  Pointer,
  Breakpoint,
  StopState,
  WSMessage,
  WSMessageType,
  MemoryUpdatePayload,
  StatusPayload,
  ErrorPayload,
} from "../types";

/** Module-level WebSocket reference (kept outside store for non-serializable state) */
let ws: WebSocket | null = null;

/** Maximum number of historical memory states to keep */
const MAX_HISTORY_LENGTH = 100;

interface MemoryState {
  // Connection state
  isConnected: boolean;
  isDebugging: boolean;
  programPath: string | null;

  // Current state
  currentStepNumber: number;
  stopState: StopState | null;
  stackBlocks: MemoryBlock[];
  heapBlocks: MemoryBlock[];
  pointers: Pointer[];
  breakpoints: Breakpoint[];

  // Historical states for time-travel visualization
  history: MemoryGraph[];

  // UI state
  selectedBlockId: string | null;
  hoveredBlockId: string | null;
  showPointers: boolean;
  zoomLevel: number;

  // Actions
  setConnected: (connected: boolean) => void;
  setDebugging: (debugging: boolean) => void;
  setProgramPath: (path: string | null) => void;
  updateMemoryGraph: (graph: MemoryGraph) => void;
  addBreakpoint: (bp: Breakpoint) => void;
  removeBreakpoint: (id: number) => void;
  setSelectedBlock: (id: string | null) => void;
  setHoveredBlock: (id: string | null) => void;
  setShowPointers: (show: boolean) => void;
  setZoomLevel: (level: number) => void;
  reset: () => void;

  // WebSocket actions
  connect: (url?: string) => void;
  disconnect: () => void;
  sendMessage: (type: WSMessageType, payload?: unknown) => void;
}

const initialState = {
  isConnected: false,
  isDebugging: false,
  programPath: null,
  currentStepNumber: 0,
  stopState: null,
  stackBlocks: [],
  heapBlocks: [],
  pointers: [],
  breakpoints: [],
  history: [],
  selectedBlockId: null,
  hoveredBlockId: null,
  showPointers: false,
  zoomLevel: 1,
};

export const useMemoryStore = create<MemoryState>((set, get) => ({
  ...initialState,

  setConnected: (connected) => set({ isConnected: connected }),

  setDebugging: (debugging) => set({ isDebugging: debugging }),

  setProgramPath: (path) => set({ programPath: path }),

  updateMemoryGraph: (graph) =>
    set((state) => {
      // Add to history, maintaining max length
      const newHistory = [...state.history, graph];
      if (newHistory.length > MAX_HISTORY_LENGTH) {
        newHistory.shift();
      }

      return {
        currentStepNumber: graph.step_number,
        stopState: graph.stop_state,
        stackBlocks: graph.stack_blocks,
        heapBlocks: graph.heap_blocks,
        pointers: graph.pointers,
        history: newHistory,
      };
    }),

  addBreakpoint: (bp) =>
    set((state) => ({
      breakpoints: [...state.breakpoints, bp],
    })),

  removeBreakpoint: (id) =>
    set((state) => ({
      breakpoints: state.breakpoints.filter((bp) => bp.id !== id),
    })),

  setSelectedBlock: (id) =>
    set({
      selectedBlockId: id,
      showPointers: id !== null, // Auto-show pointers when selecting a block
    }),

  setHoveredBlock: (id) => set({ hoveredBlockId: id }),

  setShowPointers: (show) => set({ showPointers: show }),

  setZoomLevel: (level) => set({ zoomLevel: level }),

  connect: (url = "ws://localhost:8080/ws") => {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    ws = new WebSocket(url);

    ws.onopen = () => {
      set({ isConnected: true });
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);

        switch (msg.type) {
          case "memory_update": {
            const payload = msg.payload as MemoryUpdatePayload;
            get().updateMemoryGraph(payload.graph);
            break;
          }
          case "status": {
            const payload = msg.payload as StatusPayload;
            set({
              isConnected: payload.connected,
              isDebugging: payload.debugging,
            });
            break;
          }
          case "error": {
            const payload = msg.payload as ErrorPayload;
            console.error(`[MemViz] ${payload.code}: ${payload.message}`);
            break;
          }
        }
      } catch (e) {
        console.error("[MemViz] Failed to parse message:", e);
      }
    };

    ws.onclose = () => {
      set({ isConnected: false, isDebugging: false });
      ws = null;
    };

    ws.onerror = (err) => {
      console.error("[MemViz] WebSocket error:", err);
    };
  },

  disconnect: () => {
    ws?.close();
    ws = null;
    set({ isConnected: false, isDebugging: false });
  },

  sendMessage: (type, payload = {}) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn("[MemViz] WebSocket not connected");
      return;
    }
    const msg: WSMessage = { type, payload };
    ws.send(JSON.stringify(msg));
  },

  reset: () => {
    ws?.close();
    ws = null;
    set(initialState);
  },
}));
