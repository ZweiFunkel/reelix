package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/novex-labs/reelix/server/internal/api"
	"github.com/novex-labs/reelix/server/internal/config"
	"github.com/novex-labs/reelix/server/internal/db"
)

func main() {
	cfg := config.Load()

	thumbnailsDir := filepath.Join(cfg.DataDir, "thumbnails")

	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		log.Fatalf("create data dir: %v", err)
	}
	if err := os.MkdirAll(cfg.TranscodeDir, 0o755); err != nil {
		log.Fatalf("create transcode dir: %v", err)
	}
	if err := os.MkdirAll(thumbnailsDir, 0o755); err != nil {
		log.Fatalf("create thumbnails dir: %v", err)
	}

	dbConn, err := db.Open(cfg.DataDir)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer dbConn.Close()

	router := api.NewRouter(dbConn, thumbnailsDir, cfg.TranscodeDir, cfg.MaxConcurrentTranscodes)

	log.Printf("reelix-server listening on %s (data dir: %s)", cfg.HTTPAddr, cfg.DataDir)
	if err := http.ListenAndServe(cfg.HTTPAddr, router); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
