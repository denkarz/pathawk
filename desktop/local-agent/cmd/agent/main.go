package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"postman/local-agent/internal/api"
	"postman/local-agent/internal/storage"
)

func main() {
	port := os.Getenv("LOCAL_AGENT_PORT")
	if port == "" {
		port = "38471"
	}
	dataDir := os.Getenv("LOCAL_AGENT_DATA_DIR")
	if dataDir == "" {
		dataDir = filepath.Join(".", "local-agent-data")
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		log.Fatal(err)
	}
	dbPath := filepath.Join(dataDir, "store.bolt")

	store, err := storage.Open(dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer store.Close()

	h := &api.Handler{Store: store}
	mux := http.NewServeMux()
	h.Register(mux)

	addr := ":" + port
	log.Printf("local-agent listening on http://127.0.0.1%s (data %s)", addr, dbPath)
	if err := http.ListenAndServe(addr, api.LogRequests(mux)); err != nil {
		log.Fatal(err)
	}
}
