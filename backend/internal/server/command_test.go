package server

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClientCommand_Unmarshal(t *testing.T) {
	raw := `{"action":"step","payload":{"key":"value"}}`

	var cmd ClientCommand
	err := json.Unmarshal([]byte(raw), &cmd)
	require.NoError(t, err)
	assert.Equal(t, "step", cmd.Action)
	assert.JSONEq(t, `{"key":"value"}`, string(cmd.Payload))
}

func TestClientCommand_UnmarshalNoPayload(t *testing.T) {
	raw := `{"action":"stop"}`

	var cmd ClientCommand
	err := json.Unmarshal([]byte(raw), &cmd)
	require.NoError(t, err)
	assert.Equal(t, "stop", cmd.Action)
	assert.Nil(t, cmd.Payload)
}

func TestBreakpointPayload_Unmarshal(t *testing.T) {
	raw := `{"action":"add_breakpoint","payload":{"file":"main.go","line":42}}`

	var cmd ClientCommand
	err := json.Unmarshal([]byte(raw), &cmd)
	require.NoError(t, err)
	assert.Equal(t, "add_breakpoint", cmd.Action)

	var bp BreakpointPayload
	err = json.Unmarshal(cmd.Payload, &bp)
	require.NoError(t, err)
	assert.Equal(t, "main.go", bp.File)
	assert.Equal(t, 42, bp.Line)
}
