// Package server implements the MemViz WebSocket server.
// It upgrades HTTP connections to WebSocket and dispatches incoming debugger
// control messages to the active debugger.Client session.
package server

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/memviz/backend/internal/debugger"
	"github.com/memviz/backend/internal/graph"
)

// WSMessage represents a WebSocket message exchanged with the frontend
type WSMessage struct {
	Type      string          `json:"type"`
	Payload   json.RawMessage `json:"payload"`
	RequestID string          `json:"request_id,omitempty"`
}

// LaunchPayload is the payload for "launch" messages
type LaunchPayload struct {
	ProgramPath string `json:"program_path"`
}

// MemoryUpdatePayload wraps a MemoryGraph for "memory_update" messages
type MemoryUpdatePayload struct {
	Graph *debugger.MemoryGraph `json:"graph"`
}

// StatusPayload is the payload for "status" messages
type StatusPayload struct {
	Connected bool   `json:"connected"`
	Debugging bool   `json:"debugging"`
	Program   string `json:"program,omitempty"`
}

// ErrorPayload is the payload for "error" messages
type ErrorPayload struct {
	Message string `json:"message"`
	Code    string `json:"code,omitempty"`
}

// Server represents the MemViz WebSocket server
type Server struct {
	port     string
	upgrader websocket.Upgrader
	srv      *http.Server
}

// New creates a Server listening on the given port.
//
// All WebSocket origins are accepted (permissive CORS) to support the Vite dev server.
func New(port string) *Server {
	return &Server{
		port: port,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(_ *http.Request) bool {
				return true
			},
		},
	}
}

// Start registers HTTP routes and starts listening.
//
// /ws handles WebSocket debug sessions; /health returns a plain-text liveness probe.
// Blocks until the server exits; returns http.ErrServerClosed on graceful shutdown.
func (s *Server) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/health", s.handleHealth)

	s.srv = &http.Server{
		Addr:    ":" + s.port,
		Handler: mux,
	}

	return s.srv.ListenAndServe()
}

// Shutdown gracefully drains active connections and stops the server.
// It waits up to five seconds before forcibly closing.
func (s *Server) Shutdown() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := s.srv.Shutdown(ctx); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}
}

// handleHealth writes a plain-text "OK" liveness response.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	log.Printf("Health check from %s", r.RemoteAddr)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("OK"))
}

// handleWebSocket upgrades the connection and drives the debug session message loop.
// Each connection owns one debugger.Client that persists across messages until disconnect.
func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error from %s: %v", r.RemoteAddr, err)
		return
	}
	defer func() { _ = conn.Close() }()

	log.Printf("Client connected: %s", r.RemoteAddr)

	var client debugger.Client

	defer func() {
		log.Printf("Client disconnected: %s", r.RemoteAddr)
		if client != nil {
			_ = client.Disconnect()
		}
	}()

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error from %s: %v", r.RemoteAddr, err)
			}
			break
		}

		var msg WSMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Parse error from %s: %v", r.RemoteAddr, err)
			sendError(conn, "", "invalid message format", "parse_error")
			continue
		}

		log.Printf("Request  [%s] type=%q id=%q from %s", r.RemoteAddr, msg.Type, msg.RequestID, r.RemoteAddr)

		switch msg.Type {
		case "launch":
			var payload LaunchPayload
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				log.Printf("Error [%s] id=%q parse launch payload: %v", r.RemoteAddr, msg.RequestID, err)
				sendError(conn, msg.RequestID, "invalid payload for launch", "parse_error")
				continue
			}

			if payload.ProgramPath == "" {
				log.Printf("Error [%s] id=%q launch: program path empty", r.RemoteAddr, msg.RequestID)
				sendError(conn, msg.RequestID, "program path cannot be empty", "invalid_input")
				continue
			}

			// Instantiate the real Delve Client
			delveClient := debugger.NewDelveClient()

			// Inject the graph builder to resolve the cyclic dependency
			delveClient.BuildGraphFunc = func(vars []*debugger.Variable, ss *debugger.StopState, step int) *debugger.MemoryGraph {
				// We set a max pointer depth of 5 to prevent runaway traversal
				return graph.NewBuilder(5).BuildFromVariables(vars, ss, step)
			}

			client = delveClient

			log.Printf("Launching program %q for %s (id=%q)", payload.ProgramPath, r.RemoteAddr, msg.RequestID)
			if err := client.LaunchProgram(context.Background(), payload.ProgramPath); err != nil {
				log.Printf("Error [%s] id=%q launch %q: %v", r.RemoteAddr, msg.RequestID, payload.ProgramPath, err)
				sendError(conn, msg.RequestID, err.Error(), "launch_error")
				continue
			}
			log.Printf("Response [%s] id=%q type=status program=%q", r.RemoteAddr, msg.RequestID, payload.ProgramPath)
			sendJSON(conn, WSMessage{
				Type:      "status",
				RequestID: msg.RequestID,
				Payload:   marshalPayload(StatusPayload{Connected: true, Debugging: true, Program: payload.ProgramPath}),
			})

		case "step_over", "step_into", "step_out", "continue":
			if client == nil {
				log.Printf("Error [%s] id=%q %s: no active debug session", r.RemoteAddr, msg.RequestID, msg.Type)
				sendError(conn, msg.RequestID, "no active debug session", "no_session")
				continue
			}
			log.Printf("Executing %s for %s (id=%q)", msg.Type, r.RemoteAddr, msg.RequestID)
			if err := execDebugAction(client, msg.Type); err != nil {
				log.Printf("Error [%s] id=%q %s: %v", r.RemoteAddr, msg.RequestID, msg.Type, err)
				sendError(conn, msg.RequestID, err.Error(), "debug_error")
				continue
			}
			// Extract the real memory graph
			graph, err := client.GetMemoryGraph(context.Background(), 5)
			if err != nil {
				log.Printf("Error [%s] id=%q get memory graph: %v", r.RemoteAddr, msg.RequestID, err)
				sendError(conn, msg.RequestID, err.Error(), "graph_error")
				continue
			}
			log.Printf("Response [%s] id=%q type=memory_update", r.RemoteAddr, msg.RequestID)
			sendJSON(conn, WSMessage{
				Type:      "memory_update",
				RequestID: msg.RequestID,
				Payload:   marshalPayload(MemoryUpdatePayload{Graph: graph}),
			})

		default:
			log.Printf("Error [%s] id=%q unknown message type %q", r.RemoteAddr, msg.RequestID, msg.Type)
			sendError(conn, msg.RequestID, "unknown message type: "+msg.Type, "unknown_type")
		}
	}
}

// execDebugAction dispatches a step/continue action to the active debugger client.
func execDebugAction(client debugger.Client, action string) error {
	ctx := context.Background()
	var err error
	switch action {
	case "step_over":
		_, err = client.StepOver(ctx)
	case "step_into":
		_, err = client.StepInto(ctx)
	case "step_out":
		_, err = client.StepOut(ctx)
	case "continue":
		_, err = client.Continue(ctx)
	}
	return err
}

// sendJSON marshals msg and writes it as a WebSocket text frame.
func sendJSON(conn *websocket.Conn, msg WSMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("JSON marshal error: %v", err)
		return
	}
	if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
		log.Printf("Write error: %v", err)
	}
}

// sendError sends an error message with the given request ID, human-readable message, and error code.
func sendError(conn *websocket.Conn, requestID, message, code string) {
	sendJSON(conn, WSMessage{
		Type:      "error",
		RequestID: requestID,
		Payload:   marshalPayload(ErrorPayload{Message: message, Code: code}),
	})
}

// marshalPayload JSON-encodes v for use as a WSMessage payload, falling back to {} on error.
func marshalPayload(v interface{}) json.RawMessage {
	data, err := json.Marshal(v)
	if err != nil {
		log.Printf("Payload marshal error: %v", err)
		return json.RawMessage(`{}`)
	}
	return data
}
