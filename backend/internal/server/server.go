package server

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

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

	// TODO: Integrate with debugger session handler
	for {
		messageType, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		log.Printf("Received: %s", message)

		// Echo for now - will be replaced with debugger commands
		if err := conn.WriteMessage(messageType, message); err != nil {
			log.Printf("Write error: %v", err)
			break
		}
	}
}
