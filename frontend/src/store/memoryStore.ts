import { create } from "zustand";
import type {
  MemoryGraph,
  MemoryBlock,
  Pointer,
  Breakpoint,
  StopState,
} from "../types";

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

export const useMemoryStore = create<MemoryState>((set) => ({
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

  reset: () => set(initialState),
}));
