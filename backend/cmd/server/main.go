// Package main provides the MemViz server binary.
// It starts the WebSocket server and handles graceful shutdown on interrupt.
package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/memviz/backend/internal/server"
)

func main() {
	port := flag.String("port", "8080", "WebSocket server port")
	flag.Parse()

	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds)
	log.SetPrefix("[MemViz] ")

	srv := server.New(*port)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("MemViz server starting on :%s", *port)
		if err := srv.Start(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-stop
	log.Println("Shutting down server...")
	srv.Shutdown()
}
