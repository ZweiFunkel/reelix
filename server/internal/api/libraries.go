package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
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
}

var validLibraryTypes = map[string]bool{"FOLDER": true, "PHOTO": true, "M3U": true}

func (s *Server) handleCreateLibrary(w http.ResponseWriter, r *http.Request) {
	var req createLibraryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if req.Name == "" || req.RootPath == "" || !validLibraryTypes[req.Type] {
		writeError(w, http.StatusBadRequest, errors.New("name, rootPath and a valid type (FOLDER, PHOTO, M3U) are required"))
		return
	}

	lib, err := s.libraries.Create(r.Context(), req.Name, req.RootPath, req.Type)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, toLibraryDTO(*lib))
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
