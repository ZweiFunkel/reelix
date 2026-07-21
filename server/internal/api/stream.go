package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/novex-labs/reelix/server/internal/auth"
	"github.com/novex-labs/reelix/server/internal/db"
)

// directPlayExtensions are containers browsers can play natively — the
// direct-play path stays zero-CPU-cost via HTTP Range requests.
// Everything else falls through to on-demand HLS transcode.
var directPlayExtensions = map[string]bool{".mp4": true, ".webm": true, ".m4v": true}

func (s *Server) resolveMediaItemPath(r *http.Request, idParam string) (*db.MediaItem, string, error) {
	id, err := strconv.ParseInt(idParam, 10, 64)
	if err != nil {
		return nil, "", fmt.Errorf("bad media item id: %w", err)
	}
	item, err := s.items.Get(r.Context(), id)
	if err != nil {
		return nil, "", errors.New("media item not found")
	}
	lib, err := s.libraries.Get(r.Context(), item.LibraryID)
	if err != nil {
		return nil, "", errors.New("library not found")
	}
	absPath := filepath.Join(lib.RootPath, filepath.FromSlash(item.FilePath))
	if _, err := os.Stat(absPath); err != nil {
		return nil, "", errors.New("source file missing on disk")
	}
	return item, absPath, nil
}

func (s *Server) handleStreamMediaItem(w http.ResponseWriter, r *http.Request) {
	item, absPath, err := s.resolveMediaItemPath(r, chi.URLParam(r, "mediaItemId"))
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}

	// Photos never need transcoding — always Range-serve the original file.
	if item.MediaType == "photo" {
		http.ServeFile(w, r, absPath)
		return
	}

	ext := strings.ToLower(filepath.Ext(absPath))
	forceTranscode := r.URL.Query().Get("transcode") == "1"

	if !forceTranscode && directPlayExtensions[ext] {
		http.ServeFile(w, r, absPath)
		return
	}

	s.handleTranscodeStream(w, r, item, absPath)
}

func (s *Server) handleThumbnail(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "mediaItemId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	path := filepath.Join(s.thumbnailsDir, fmt.Sprintf("%d.jpg", id))
	if _, err := os.Stat(path); err != nil {
		writeError(w, http.StatusNotFound, errors.New("no thumbnail available"))
		return
	}
	http.ServeFile(w, r, path)
}

func (s *Server) handleTranscodeStream(w http.ResponseWriter, r *http.Request, item *db.MediaItem, absPath string) {
	sessionID := fmt.Sprintf("item-%d", item.ID)

	sess, err := s.transcoder.StartSession(sessionID, absPath)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err)
		return
	}

	playlistPath := filepath.Join(sess.OutputDir, "playlist.m3u8")
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if info, err := os.Stat(playlistPath); err == nil && info.Size() > 0 {
			break
		}
		time.Sleep(200 * time.Millisecond)
	}

	http.Redirect(w, r, fmt.Sprintf("/api/media-items/%d/stream/segments/playlist.m3u8", item.ID), http.StatusFound)
}

type updateProgressRequest struct {
	PositionSeconds float64  `json:"positionSeconds"`
	DurationSeconds *float64 `json:"durationSeconds"`
	Watched         bool     `json:"watched"`
}

func (s *Server) handleUpdateProgress(w http.ResponseWriter, r *http.Request) {
	itemID, err := strconv.ParseInt(chi.URLParam(r, "mediaItemId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	sess := auth.SessionFromContext(r.Context())
	if sess == nil || sess.ProfileID == nil {
		writeError(w, http.StatusForbidden, errors.New("select a profile first"))
		return
	}

	var req updateProgressRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	if err := s.watchStates.Upsert(r.Context(), *sess.ProfileID, itemID, "media_item", req.PositionSeconds, req.DurationSeconds, req.Watched); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleStreamSegment(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "mediaItemId")
	file := chi.URLParam(r, "*")
	if strings.Contains(file, "..") {
		writeError(w, http.StatusBadRequest, errors.New("invalid segment path"))
		return
	}

	sessionID := fmt.Sprintf("item-%s", id)
	s.transcoder.Touch(sessionID)

	http.ServeFile(w, r, filepath.Join(s.transcoder.OutputDir(sessionID), file))
}
