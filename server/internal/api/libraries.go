package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/novex-labs/reelix/server/internal/db"
)

type libraryDTO struct {
	ID            int64   `json:"id"`
	Name          string  `json:"name"`
	RootPath      string  `json:"rootPath"`
	Type          string  `json:"type"`
	LastScannedAt *string `json:"lastScannedAt"`
}

func toLibraryDTO(l db.Library) libraryDTO {
	dto := libraryDTO{ID: l.ID, Name: l.Name, RootPath: l.RootPath, Type: l.Type}
	if l.LastScannedAt != nil {
		s := l.LastScannedAt.Format(time.RFC3339)
		dto.LastScannedAt = &s
	}
	return dto
}

func (s *Server) handleListLibraries(w http.ResponseWriter, r *http.Request) {
	libs, err := s.libraries.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	dtos := make([]libraryDTO, len(libs))
	for i, l := range libs {
		dtos[i] = toLibraryDTO(l)
	}
	writeJSON(w, http.StatusOK, dtos)
}

type createLibraryRequest struct {
	Name     string `json:"name"`
	RootPath string `json:"rootPath"`
	Type     string `json:"type"`
	// Managed roots the library under the server's guaranteed-writable
	// uploads directory instead of a host-mounted path, so the admin can
	// upload files into it from the web UI — a typical host media mount
	// is bind-mounted read-only (see deploy/docker-compose.example.yml)
	// and can't be uploaded into. RootPath is ignored when set.
	Managed bool `json:"managed"`
}

var validLibraryTypes = map[string]bool{"FOLDER": true, "PHOTO": true, "M3U": true}

var unsafeNameChars = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func (s *Server) handleCreateLibrary(w http.ResponseWriter, r *http.Request) {
	var req createLibraryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if req.Name == "" || !validLibraryTypes[req.Type] {
		writeError(w, http.StatusBadRequest, errors.New("name and a valid type (FOLDER, PHOTO, M3U) are required"))
		return
	}

	rootPath := req.RootPath
	if req.Managed {
		if req.Type == "M3U" {
			writeError(w, http.StatusBadRequest, errors.New("M3U libraries can't be managed-uploads (they're a playlist URL/file, not a folder)"))
			return
		}
		slug := strings.Trim(unsafeNameChars.ReplaceAllString(req.Name, "-"), "-")
		if slug == "" {
			writeError(w, http.StatusBadRequest, errors.New("name must contain at least one letter or number"))
			return
		}
		rootPath = filepath.Join(s.uploadsDir, slug)
		if err := os.MkdirAll(rootPath, 0755); err != nil {
			writeError(w, http.StatusInternalServerError, fmt.Errorf("create managed library folder: %w", err))
			return
		}
	} else if rootPath == "" {
		writeError(w, http.StatusBadRequest, errors.New("rootPath is required unless managed is true"))
		return
	}

	lib, err := s.libraries.Create(r.Context(), req.Name, rootPath, req.Type)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, toLibraryDTO(*lib))
}

// handleDeleteLibrary unregisters a library and (via ON DELETE CASCADE)
// its categories/media items/channels. Never touches files on disk —
// rootPath is very often a real host media folder the admin still wants
// to keep, just not tracked by Reelix anymore.
func (s *Server) handleDeleteLibrary(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "libraryId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if _, err := s.libraries.Get(r.Context(), id); err != nil {
		writeError(w, http.StatusNotFound, errors.New("library not found"))
		return
	}
	if err := s.libraries.Delete(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleUploadToLibrary lets an admin add files straight into a library
// from the web UI, then rescans it. Requires the library's root to
// actually be writable — a host media mount following the example
// compose file's :ro convention will fail here with a clear error;
// managed-uploads libraries (see handleCreateLibrary) always work.
func (s *Server) handleUploadToLibrary(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "libraryId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	lib, err := s.libraries.Get(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, errors.New("library not found"))
		return
	}
	if lib.Type == "M3U" {
		writeError(w, http.StatusBadRequest, errors.New("can't upload files into an M3U library"))
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("missing file: %w", err))
		return
	}
	defer file.Close()

	name := filepath.Base(header.Filename)
	if name == "" || name == "." || name == string(filepath.Separator) {
		writeError(w, http.StatusBadRequest, errors.New("invalid filename"))
		return
	}
	destPath := filepath.Join(lib.RootPath, name)

	dest, err := os.Create(destPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Errorf("upload failed, is this library's path writable? (%w)", err))
		return
	}
	defer dest.Close()

	if _, err := io.Copy(dest, file); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Errorf("upload failed while writing file: %w", err))
		return
	}

	go func() {
		if err := s.scanner.Scan(context.Background(), lib); err != nil {
			log.Printf("reelix: post-upload scan of library %d failed: %v", lib.ID, err)
		}
	}()

	writeJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}

func (s *Server) handleTriggerScan(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "libraryId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	lib, err := s.libraries.Get(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, errors.New("library not found"))
		return
	}

	go func() {
		var err error
		if lib.Type == "M3U" {
			err = s.scanner.ScanM3U(context.Background(), lib)
		} else {
			err = s.scanner.Scan(context.Background(), lib)
		}
		if err != nil {
			log.Printf("reelix: scan library %d failed: %v", lib.ID, err)
		}
	}()

	w.WriteHeader(http.StatusAccepted)
}
