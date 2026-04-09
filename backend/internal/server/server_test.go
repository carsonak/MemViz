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

func TestServer_Health(t *testing.T) {
	srv := New("0")

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	srv.handleHealth(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "OK", rec.Body.String())
}

func TestServer_WebSocketUpgrade(t *testing.T) {
	srv := New("0")

	// Create test server
	server := httptest.NewServer(http.HandlerFunc(srv.handleWebSocket))
	defer server.Close()

	// Convert http:// to ws://
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	// Connect WebSocket client
	dialer := websocket.Dialer{
		HandshakeTimeout: 5 * time.Second,
	}

	conn, resp, err := dialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()

	assert.Equal(t, http.StatusSwitchingProtocols, resp.StatusCode)
}

func TestServer_WebSocketLaunch(t *testing.T) {
	srv := New("0")

	server := httptest.NewServer(http.HandlerFunc(srv.handleWebSocket))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	dialer := websocket.Dialer{
		HandshakeTimeout: 5 * time.Second,
	}

	conn, _, err := dialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()

	// Send launch message
	launchMsg := `{"type":"launch","payload":{"program_path":"main.go"},"request_id":"req-1"}`
	err = conn.WriteMessage(websocket.TextMessage, []byte(launchMsg))
	require.NoError(t, err)

	// Read status response
	_, msg, err := conn.ReadMessage()
	require.NoError(t, err)

	var resp WSMessage
	err = json.Unmarshal(msg, &resp)
	require.NoError(t, err)
	assert.Equal(t, "status", resp.Type)
	assert.Equal(t, "req-1", resp.RequestID)

	var status StatusPayload
	err = json.Unmarshal(resp.Payload, &status)
	require.NoError(t, err)
	assert.True(t, status.Connected)
	assert.True(t, status.Debugging)
}

func TestServer_WebSocketStepOver(t *testing.T) {
	srv := New("0")

	server := httptest.NewServer(http.HandlerFunc(srv.handleWebSocket))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dialer := websocket.Dialer{HandshakeTimeout: 5 * time.Second}

	conn, _, err := dialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()

	// Launch first
	err = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"launch","payload":{}}`))
	require.NoError(t, err)
	_, _, _ = conn.ReadMessage() // consume status response

	// Step over
	err = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"step_over","payload":{},"request_id":"req-2"}`))
	require.NoError(t, err)

	_, msg, err := conn.ReadMessage()
	require.NoError(t, err)

	var resp WSMessage
	err = json.Unmarshal(msg, &resp)
	require.NoError(t, err)
	assert.Equal(t, "memory_update", resp.Type)
	assert.Equal(t, "req-2", resp.RequestID)

	var update MemoryUpdatePayload
	err = json.Unmarshal(resp.Payload, &update)
	require.NoError(t, err)
	assert.NotNil(t, update.Graph)
	assert.Len(t, update.Graph.StackBlocks, 2)
	assert.Len(t, update.Graph.HeapBlocks, 2)
	assert.Len(t, update.Graph.Pointers, 1)
	assert.Equal(t, 1, update.Graph.StepNumber)
}

func TestServer_WebSocketStepWithoutLaunch(t *testing.T) {
	srv := New("0")

	server := httptest.NewServer(http.HandlerFunc(srv.handleWebSocket))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dialer := websocket.Dialer{HandshakeTimeout: 5 * time.Second}

	conn, _, err := dialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()

	// Step without launching
	err = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"step_over","payload":{}}`))
	require.NoError(t, err)

	_, msg, err := conn.ReadMessage()
	require.NoError(t, err)

	var resp WSMessage
	err = json.Unmarshal(msg, &resp)
	require.NoError(t, err)
	assert.Equal(t, "error", resp.Type)

	var errPayload ErrorPayload
	err = json.Unmarshal(resp.Payload, &errPayload)
	require.NoError(t, err)
	assert.Equal(t, "no_session", errPayload.Code)
}

func TestServer_WebSocketUnknownType(t *testing.T) {
	srv := New("0")

	server := httptest.NewServer(http.HandlerFunc(srv.handleWebSocket))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dialer := websocket.Dialer{HandshakeTimeout: 5 * time.Second}

	conn, _, err := dialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()

	// Send unknown type
	err = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"bogus","payload":{}}`))
	require.NoError(t, err)

	_, msg, err := conn.ReadMessage()
	require.NoError(t, err)

	var resp WSMessage
	err = json.Unmarshal(msg, &resp)
	require.NoError(t, err)
	assert.Equal(t, "error", resp.Type)

	var errPayload ErrorPayload
	err = json.Unmarshal(resp.Payload, &errPayload)
	require.NoError(t, err)
	assert.Equal(t, "unknown_type", errPayload.Code)
	assert.Contains(t, errPayload.Message, "bogus")
}

func TestServer_New(t *testing.T) {
	srv := New("8080")
	assert.NotNil(t, srv)
	assert.Equal(t, "8080", srv.port)
}
