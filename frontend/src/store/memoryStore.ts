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

/**
 * Zustand store that holds all MemViz frontend state: the active memory graph,
 * historical snapshots for time-travel, WebSocket lifecycle, and UI selection state.
 */
/** Module-level WebSocket instance, kept outside Zustand to avoid serialisation issues. */
let ws: WebSocket | null = null;

/** Maximum number of historical memory states to keep in the time-travel buffer. */
const MAX_HISTORY_LENGTH = 100;

/**
 * Complete shape of the Zustand memory store, combining state slices and action methods.
 *
 * history – ring buffer of past MemoryGraph snapshots, capped at MAX_HISTORY_LENGTH.
 * selectedBlockId / hoveredBlockId – IDs of the user-selected and pointer-hovered blocks.
 * showPointers – whether pointer arrows are rendered; auto-enabled on block selection.
 * zoomLevel – semantic zoom factor used by the scene renderer.
 */
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
  history: MemoryGraph[];
  selectedBlockId: string | null;
  hoveredBlockId: string | null;
  showPointers: boolean;
  zoomLevel: number;
  setConnected: (connected: boolean) => void;
  setDebugging: (debugging: boolean) => void;
  setProgramPath: (path: string | null) => void;
  updateMemoryGraph: (graph: MemoryGraph) => void;
  addBreakpoint: (bp: Breakpoint) => void;
  removeBreakpoint: (id: number) => void;
  /** Selects a block; also enables pointer rendering when a block is selected. */
  setSelectedBlock: (id: string | null) => void;
  setHoveredBlock: (id: string | null) => void;
  setShowPointers: (show: boolean) => void;
  setZoomLevel: (level: number) => void;
  reset: () => void;
  /** Opens a WebSocket connection to the backend and begins processing messages. url defaults to the local dev server. */
  connect: (url?: string) => void;
  disconnect: () => void;
  sendMessage: (type: WSMessageType, payload?: unknown) => void;
}

/** Zero-value snapshot used by reset() to restore the store to its initial state. */
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
      showPointers: id !== null,
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
