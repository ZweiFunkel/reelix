package api

import (
	"database/sql"
	"encoding/json"
	"io/fs"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/novex-labs/reelix/server/internal/auth"
	"github.com/novex-labs/reelix/server/internal/config"
	"github.com/novex-labs/reelix/server/internal/db"
	"github.com/novex-labs/reelix/server/internal/library"
	"github.com/novex-labs/reelix/server/internal/mail"
	"github.com/novex-labs/reelix/server/internal/metadata"
	"github.com/novex-labs/reelix/server/internal/stream"
	"github.com/novex-labs/reelix/server/internal/webui"
)

// Version is set at build time via -ldflags "-X .../api.Version=...".
var Version = "dev"

type Server struct {
	libraries      *db.LibraryStore
	categories     *db.CategoryStore
	items          *db.MediaItemStore
	channels       *db.ChannelStore
	users          *db.UserStore
	profiles       *db.ProfileStore
	sessions       *db.SessionStore
	watchStates    *db.WatchStateStore
	passwordResets *db.PasswordResetTokenStore
	mailer         *mail.Sender
	scanner        *library.Scanner
	transcoder     *stream.Manager
	thumbnailsDir  string
	uploadsDir     string
	tmdb           *metadata.Client
}

func NewRouter(dbConn *sql.DB, cfg config.Config, thumbnailsDir, transcodeDir string, maxConcurrentTranscodes int) http.Handler {
	libraries := db.NewLibraryStore(dbConn)
	categories := db.NewCategoryStore(dbConn)
	items := db.NewMediaItemStore(dbConn)
	channels := db.NewChannelStore(dbConn)
	users := db.NewUserStore(dbConn)
	profiles := db.NewProfileStore(dbConn)
	sessions := db.NewSessionStore(dbConn)
	watchStates := db.NewWatchStateStore(dbConn)
	passwordResets := db.NewPasswordResetTokenStore(dbConn)
	tmdb := metadata.NewClient(cfg.TMDbAPIKey)

	s := &Server{
		libraries:      libraries,
		categories:     categories,
		items:          items,
		channels:       channels,
		users:          users,
		profiles:       profiles,
		sessions:       sessions,
		watchStates:    watchStates,
		passwordResets: passwordResets,
		mailer:         mail.NewSender(cfg),
		scanner:        library.NewScanner(libraries, categories, items, channels, thumbnailsDir, tmdb),
		transcoder:     stream.NewManager(transcodeDir, maxConcurrentTranscodes),
		thumbnailsDir:  thumbnailsDir,
		uploadsDir:     cfg.UploadsDir,
		tmdb:           tmdb,
	}

	authMW := auth.NewMiddleware(sessions, users, profiles)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/api/health", s.handleHealth)

	r.Route("/api/admin/system", func(r chi.Router) {
		r.Use(authMW.RequireAdmin)
		r.Get("/version", s.handleSystemVersion)
	})

	r.With(authMW.RequireAdmin).Get("/api/admin/sessions", s.handleAdminSessions)

	r.Route("/api/admin/users", func(r chi.Router) {
		r.Use(authMW.RequireAdmin)
		r.Get("/", s.handleAdminListUsers)
		r.Post("/", s.handleAdminCreateUser)
		r.Patch("/{userId}/role", s.handleAdminUpdateUserRole)
	})

	r.Route("/api/setup", func(r chi.Router) {
		r.Get("/status", s.handleSetupStatus)
		r.Post("/admin", s.handleSetupAdmin)
	})

	r.Route("/api/auth", func(r chi.Router) {
		r.Post("/login", s.handleLogin)
		r.Post("/logout", s.handleLogout)
		r.With(authMW.RequireAuth).Get("/me", s.handleMe)
		r.With(authMW.RequireAuth).Patch("/me", s.handleUpdateMe)
		r.Post("/forgot-password", s.handleForgotPassword)
		r.Post("/reset-password", s.handleResetPassword)
		r.With(authMW.RequireAuth).Post("/send-verification", s.handleSendVerification)
		r.With(authMW.RequireAuth).Post("/verify-email", s.handleVerifyEmail)
	})

	r.Route("/api/profiles", func(r chi.Router) {
		r.Use(authMW.RequireAuth)
		r.Get("/", s.handleListProfiles)
		r.Post("/", s.handleCreateProfile)
		r.Post("/{profileId}/select", s.handleSelectProfile)
	})

	r.Route("/api/libraries", func(r chi.Router) {
		r.With(authMW.RequireProfile).Get("/", s.handleListLibraries)
		r.With(authMW.RequireAdmin).Post("/", s.handleCreateLibrary)
		r.With(authMW.RequireAdmin).Post("/{libraryId}/scan", s.handleTriggerScan)
		r.With(authMW.RequireAdmin).Post("/{libraryId}/upload", s.handleUploadToLibrary)
		r.With(authMW.RequireAdmin).Delete("/{libraryId}", s.handleDeleteLibrary)
	})
	r.With(authMW.RequireProfile).Get("/api/libraries/{libraryId}/root", s.handleLibraryRoot)
	r.With(authMW.RequireProfile).Get("/api/libraries/{libraryId}/recent", s.handleLibraryRecent)
	r.With(authMW.RequireProfile).Get("/api/continue-watching", s.handleContinueWatching)

	r.Route("/api/categories", func(r chi.Router) {
		r.Use(authMW.RequireProfile)
		r.Get("/{categoryId}", s.handleGetCategory)
		r.Get("/{categoryId}/children", s.handleCategoryChildren)
	})

	r.Route("/api/media-items", func(r chi.Router) {
		r.Use(authMW.RequireProfile)
		r.Get("/{mediaItemId}", s.handleGetMediaItem)
		r.Get("/{mediaItemId}/stream", s.handleStreamMediaItem)
		r.Head("/{mediaItemId}/stream", s.handleStreamMediaItem)
		r.Get("/{mediaItemId}/stream/segments/*", s.handleStreamSegment)
		r.Head("/{mediaItemId}/stream/segments/*", s.handleStreamSegment)
		r.Post("/{mediaItemId}/progress", s.handleUpdateProgress)
		r.Get("/{mediaItemId}/thumbnail", s.handleThumbnail)
		r.Get("/{mediaItemId}/siblings", s.handleMediaItemSiblings)
		r.Get("/{mediaItemId}/show", s.handleGetShow)
		r.With(authMW.RequireAdmin).Delete("/{mediaItemId}", s.handleDeleteMediaItem)
	})

	r.Route("/api/channels", func(r chi.Router) {
		r.Use(authMW.RequireProfile)
		r.Get("/{channelId}", s.handleGetChannel)
		r.Get("/{channelId}/stream", s.handleStreamChannel)
		r.Head("/{channelId}/stream", s.handleStreamChannel)
	})

	r.NotFound(spaHandler())

	return r
}

// spaHandler serves the embedded web/dist build, falling back to
// index.html for any path that isn't a real static asset so client-side
// routing works on a hard refresh/deep link.
func spaHandler() http.HandlerFunc {
	dist, err := fs.Sub(webui.DistFS, "dist")
	if err != nil {
		panic(err)
	}
	fileServer := http.FileServer(http.FS(dist))

	return func(w http.ResponseWriter, r *http.Request) {
		if _, err := fs.Stat(dist, r.URL.Path[1:]); err != nil {
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleSystemVersion is the stub half of the in-app update contract (plan §10):
// the update mechanism itself lands later, but the version-reporting shape is
// fixed now so the admin UI and client code can be built against it.
func (s *Server) handleSystemVersion(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"current":            Version,
		"latestAvailable":    nil,
		"updateMechanism":    "none",
		"updateCheckEnabled": false,
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
