package server

import (
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
	defer conn.Close()

	assert.Equal(t, http.StatusSwitchingProtocols, resp.StatusCode)
}

func TestServer_WebSocketEcho(t *testing.T) {
	srv := New("0")

	server := httptest.NewServer(http.HandlerFunc(srv.handleWebSocket))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	dialer := websocket.Dialer{
		HandshakeTimeout: 5 * time.Second,
	}

	conn, _, err := dialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer conn.Close()

	// Send a test message
	testMsg := []byte(`{"type":"test","payload":{}}`)
	err = conn.WriteMessage(websocket.TextMessage, testMsg)
	require.NoError(t, err)

	// Read the echo response
	_, msg, err := conn.ReadMessage()
	require.NoError(t, err)
	assert.Equal(t, testMsg, msg)
}

func TestServer_New(t *testing.T) {
	srv := New("8080")
	assert.NotNil(t, srv)
	assert.Equal(t, "8080", srv.port)
}
