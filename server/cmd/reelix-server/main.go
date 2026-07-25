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
	// <subcommand> ...` — for when there's no working session/email flow
	// to recover an account any other way.
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "list-users":
			runListUsers(cfg)
			return
		case "reset-password":
			runResetPassword(cfg)
			return
		case "rename-user":
			runRenameUser(cfg)
			return
		}
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

func openCLIDB(cfg config.Config) *db.UserStore {
	dbConn, err := db.Open(cfg.DataDir)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	return db.NewUserStore(dbConn)
}

func runListUsers(cfg config.Config) {
	users := openCLIDB(cfg)
	ctx := context.Background()

	all, err := users.List(ctx)
	if err != nil {
		log.Fatalf("list users: %v", err)
	}
	if len(all) == 0 {
		fmt.Println("no users yet")
		return
	}
	for _, u := range all {
		email := "(no email)"
		if u.Email != nil && *u.Email != "" {
			email = *u.Email
		}
		fmt.Printf("id=%d username=%q role=%s email=%s\n", u.ID, u.Username, u.Role, email)
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

	users := openCLIDB(cfg)
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

func runRenameUser(cfg config.Config) {
	if len(os.Args) != 4 {
		fmt.Println("usage: reelix-server rename-user <old-username> <new-username>")
		os.Exit(1)
	}
	oldUsername, newUsername := os.Args[2], os.Args[3]

	users := openCLIDB(cfg)
	ctx := context.Background()

	user, err := users.GetByUsername(ctx, oldUsername)
	if err != nil {
		fmt.Printf("user %q not found\n", oldUsername)
		os.Exit(1)
	}
	if existing, err := users.GetByUsername(ctx, newUsername); err == nil && existing != nil {
		fmt.Printf("username %q is already taken\n", newUsername)
		os.Exit(1)
	}

	if err := users.UpdateUsername(ctx, user.ID, newUsername); err != nil {
		log.Fatalf("rename user: %v", err)
	}

	fmt.Printf("renamed %q to %q\n", oldUsername, newUsername)
}
