/**
 * Memory Graph Types – shared data contracts between the Go backend and the React frontend.
 * These interfaces mirror the JSON-serialised forms of the Go structs in
 * backend/internal/debugger/debugger.go.
 */

/** Represents why the debugger stopped */
export type StopReason = "breakpoint" | "step" | "panic" | "exit";

/** State when the debugger stops */
export interface StopState {
  reason: StopReason;
  file: string;
  line: number;
  function: string;
  goroutine_id: number;
}

/** A variable in memory.
 *
 * pointer_target – the address the variable points to, set only for pointer kinds.
 */
export interface Variable {
  name: string;
  type: string;
  kind: string;
  value: string;
  address: number;
  size: number;
  children?: Variable[];
  pointer_target?: number;
}

/** A contiguous block of memory.
 *
 * variables – names of the source-level variables contained within this block.
 */
export interface MemoryBlock {
  id: string;
  address: number;
  size: number;
  type: string;
  kind: string;
  name: string;
  value?: string;
  is_stack: boolean;
  variables?: string[];
}

/** A pointer relationship between memory blocks */
export interface Pointer {
  id: string;
  source_id: string;
  target_id: string;
  source_addr: number;
  target_addr: number;
  field_name?: string;
}

/** The complete memory state at a point in time */
export interface MemoryGraph {
  timestamp: number;
  step_number: number;
  stop_state: StopState;
  stack_blocks: MemoryBlock[];
  heap_blocks: MemoryBlock[];
  pointers: Pointer[];
}

/** Breakpoint information */
export interface Breakpoint {
  id: number;
  file: string;
  line: number;
  function?: string;
  enabled: boolean;
}

/**
 * All action and event names used in the WebSocket message protocol.
 * Client-to-server actions: launch, set_breakpoint, clear_breakpoint, continue, step_*.
 * Server-to-client events: memory_update, error, status.
 */
export type WSMessageType =
  | "connect"
  | "launch"
  | "set_breakpoint"
  | "clear_breakpoint"
  | "continue"
  | "step_over"
  | "step_into"
  | "step_out"
  | "get_memory_graph"
  | "memory_update"
  | "error"
  | "status";

/** A WebSocket protocol envelope.
 *
 * request_id – optional correlation token echoed in the server's reply.
 */
export interface WSMessage<T = unknown> {
  type: WSMessageType;
  payload: T;
  request_id?: string;
}

export interface LaunchPayload {
  program_path: string;
}

export interface SetBreakpointPayload {
  file: string;
  line: number;
}

export interface ClearBreakpointPayload {
  id: number;
}

export interface GetMemoryGraphPayload {
  max_depth?: number;
}

export interface MemoryUpdatePayload {
  graph: MemoryGraph;
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

export interface StatusPayload {
  connected: boolean;
  debugging: boolean;
  program?: string;
}
