package server

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/memviz/backend/internal/debugger"
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

// New creates a new MemViz server instance
func New(port string) *Server {
	return &Server{
		port: port,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				// Allow connections from the frontend dev server
				return true
			},
		},
	}
}

// Start begins listening for WebSocket connections
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

// Shutdown gracefully stops the server
func (s *Server) Shutdown() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := s.srv.Shutdown(ctx); err != nil {
		log.Printf("Server shutdown error: %v", err)
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	log.Println("Client connected")

	var client debugger.Client

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		log.Printf("Received: %s", message)

		var msg WSMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			sendError(conn, "", "invalid message format", "parse_error")
			continue
		}

		switch msg.Type {
		case "launch":
			client = debugger.NewMockClient()
			if err := client.LaunchProgram(context.Background(), ""); err != nil {
				sendError(conn, msg.RequestID, err.Error(), "launch_error")
				continue
			}
			sendJSON(conn, WSMessage{
				Type:      "status",
				RequestID: msg.RequestID,
				Payload:   marshalPayload(StatusPayload{Connected: true, Debugging: true}),
			})

		case "step_over", "step_into", "step_out", "continue":
			if client == nil {
				sendError(conn, msg.RequestID, "no active debug session", "no_session")
				continue
			}
			if err := execDebugAction(client, msg.Type); err != nil {
				sendError(conn, msg.RequestID, err.Error(), "debug_error")
				continue
			}
			graph, err := client.GetMemoryGraph(context.Background(), 3)
			if err != nil {
				sendError(conn, msg.RequestID, err.Error(), "graph_error")
				continue
			}
			sendJSON(conn, WSMessage{
				Type:      "memory_update",
				RequestID: msg.RequestID,
				Payload:   marshalPayload(MemoryUpdatePayload{Graph: graph}),
			})

		default:
			sendError(conn, msg.RequestID, "unknown message type: "+msg.Type, "unknown_type")
		}
	}
}

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

func sendError(conn *websocket.Conn, requestID, message, code string) {
	sendJSON(conn, WSMessage{
		Type:      "error",
		RequestID: requestID,
		Payload:   marshalPayload(ErrorPayload{Message: message, Code: code}),
	})
}

func marshalPayload(v interface{}) json.RawMessage {
	data, err := json.Marshal(v)
	if err != nil {
		log.Printf("Payload marshal error: %v", err)
		return json.RawMessage(`{}`)
	}
	return data
}
