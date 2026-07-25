package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/novex-labs/reelix/server/internal/api"
	"github.com/novex-labs/reelix/server/internal/auth"
	"github.com/novex-labs/reelix/server/internal/config"
	"github.com/novex-labs/reelix/server/internal/db"
)

func main() {
	cfg := config.Load()

	thumbnailsDir := filepath.Join(cfg.DataDir, "thumbnails")

	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		log.Fatalf("create data dir: %v", err)
	}

	// Admin-recovery CLI, run via `docker exec <container> reelix-server
	// reset-password <username> <newpassword>` — for when there's no
	// working session/email flow to reset a password any other way.
	if len(os.Args) > 1 && os.Args[1] == "reset-password" {
		runResetPassword(cfg)
		return
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

	router := api.NewRouter(dbConn, cfg, thumbnailsDir, cfg.TranscodeDir, cfg.MaxConcurrentTranscodes)

	log.Printf("reelix-server listening on %s (data dir: %s)", cfg.HTTPAddr, cfg.DataDir)
	if err := http.ListenAndServe(cfg.HTTPAddr, router); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func runResetPassword(cfg config.Config) {
	if len(os.Args) != 4 {
		fmt.Println("usage: reelix-server reset-password <username> <new-password>")
		os.Exit(1)
	}
	username, newPassword := os.Args[2], os.Args[3]
	if len(newPassword) < 8 {
		fmt.Println("password must be at least 8 characters")
		os.Exit(1)
	}

	dbConn, err := db.Open(cfg.DataDir)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer dbConn.Close()

	users := db.NewUserStore(dbConn)
	ctx := context.Background()

	user, err := users.GetByUsername(ctx, username)
	if err != nil {
		fmt.Printf("user %q not found\n", username)
		os.Exit(1)
	}

	hash, err := auth.HashPassword(newPassword)
	if err != nil {
		log.Fatalf("hash password: %v", err)
	}
	if err := users.UpdatePassword(ctx, user.ID, hash); err != nil {
		log.Fatalf("update password: %v", err)
	}

	fmt.Printf("password reset for %q\n", username)
}
