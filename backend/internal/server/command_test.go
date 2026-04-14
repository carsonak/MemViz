package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
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

func TestHandleCommand_WebSocket(t *testing.T) {
	srv := New("0")

	server := httptest.NewServer(http.HandlerFunc(srv.handleWebSocket))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dialer := websocket.Dialer{HandshakeTimeout: 5 * time.Second}

	conn, _, err := dialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()

	// Send simple commands that should be processed without error.
	commands := []string{
		`{"action":"start"}`,
		`{"action":"step"}`,
		`{"action":"continue"}`,
		`{"action":"stop"}`,
		`{"action":"add_breakpoint","payload":{"file":"main.go","line":10}}`,
	}

	for _, cmd := range commands {
		err := conn.WriteMessage(websocket.TextMessage, []byte(cmd))
		require.NoError(t, err, "failed to send: %s", cmd)
	}

	// Send an unknown action — the server should reply with an error message.
	err = conn.WriteMessage(websocket.TextMessage, []byte(`{"action":"fly"}`))
	require.NoError(t, err)

	// Read back the error response for the unknown action.
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := conn.ReadMessage()
	require.NoError(t, err)

	var resp WSMessage
	err = json.Unmarshal(msg, &resp)
	require.NoError(t, err)
	assert.Equal(t, "error", resp.Type)

	var errPayload ErrorPayload
	err = json.Unmarshal(resp.Payload, &errPayload)
	require.NoError(t, err)
	assert.Equal(t, "unknown_action", errPayload.Code)
	assert.Contains(t, errPayload.Message, "fly")
}
