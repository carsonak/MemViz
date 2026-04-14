package server

import "encoding/json"

// ClientCommand represents an incoming command from the frontend client.
type ClientCommand struct {
	Action  string          `json:"action"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// BreakpointPayload is the payload for the "add_breakpoint" action.
type BreakpointPayload struct {
	File string `json:"file"`
	Line int    `json:"line"`
}

// BuildPayload is the payload for the "build_and_start" action.
type BuildPayload struct {
	Code string `json:"code"`
}
