package api

import (
	"context"
	"errors"
	"net/http"
	"path"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/novex-labs/reelix/server/internal/auth"
	"github.com/novex-labs/reelix/server/internal/db"
)

type categoryDTO struct {
	ID               int64  `json:"id"`
	Name             string `json:"name"`
	Path             string `json:"path"`
	ParentCategoryID *int64 `json:"parentCategoryId"`
}

func toCategoryDTO(c db.Category) categoryDTO {
	return categoryDTO{ID: c.ID, Name: c.Name, Path: c.Path, ParentCategoryID: c.ParentCategoryID}
}

type progressDTO struct {
	PositionSeconds float64 `json:"positionSeconds"`
	Watched         bool    `json:"watched"`
}

// mediaItemDTO is the shared shape for anything playable in a browse
// listing — a local video/photo (ItemType "media_item") or an M3U
// channel (ItemType "channel") — so the frontend has one code path
// regardless of source, matching the browse API on the server side.
type mediaItemDTO struct {
	ID              int64        `json:"id"`
	ItemType        string       `json:"itemType"`
	Title           string       `json:"title"`
	FilePath        string       `json:"filePath"`
	DurationSeconds *float64     `json:"durationSeconds"`
	MediaType       string       `json:"mediaType"`
	Progress        *progressDTO `json:"progress"`
}

func toMediaItemDTO(m db.MediaItem) mediaItemDTO {
	base := path.Base(m.FilePath)
	title := strings.TrimSuffix(base, path.Ext(base))
	return mediaItemDTO{ID: m.ID, ItemType: "media_item", Title: title, FilePath: m.FilePath, DurationSeconds: m.DurationSeconds, MediaType: m.MediaType}
}

func toChannelDTO(c db.Channel) mediaItemDTO {
	return mediaItemDTO{ID: c.ID, ItemType: "channel", Title: c.Name, MediaType: "channel"}
}

// attachProgress fills in each item's watch progress for the session's
// active profile. One query per item is acceptable at the scale a single
// folder listing reaches; revisit with a batched IN-query if that changes.
func (s *Server) attachProgress(ctx context.Context, dtos []mediaItemDTO) []mediaItemDTO {
	sess := auth.SessionFromContext(ctx)
	if sess == nil || sess.ProfileID == nil {
		return dtos
	}
	for i := range dtos {
		ws, err := s.watchStates.Get(ctx, *sess.ProfileID, dtos[i].ID, dtos[i].ItemType)
		if err == nil && ws != nil {
			dtos[i].Progress = &progressDTO{PositionSeconds: ws.PositionSeconds, Watched: ws.Watched}
		}
	}
	return dtos
}

type categoryChildrenResponse struct {
	Subcategories []categoryDTO  `json:"subcategories"`
	Items         []mediaItemDTO `json:"items"`
}

func (s *Server) handleCategoryChildren(w http.ResponseWriter, r *http.Request) {
	categoryID, err := strconv.ParseInt(chi.URLParam(r, "categoryId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	cat, err := s.categories.Get(r.Context(), categoryID)
	if err != nil {
		writeError(w, http.StatusNotFound, errors.New("category not found"))
		return
	}

	subcats, err := s.categories.Children(r.Context(), cat.LibraryID, &cat.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	items, err := s.items.ListByCategory(r.Context(), cat.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	channels, err := s.channels.ListByCategory(r.Context(), cat.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	resp := toChildrenResponse(subcats, items, channels)
	resp.Items = s.attachProgress(r.Context(), resp.Items)
	writeJSON(w, http.StatusOK, resp)
}

// handleLibraryRoot browses a library's top level, which has no Category
// row of its own — its "children" are the root categories plus any files
// placed directly in the library's root path.
func (s *Server) handleLibraryRoot(w http.ResponseWriter, r *http.Request) {
	libraryID, err := strconv.ParseInt(chi.URLParam(r, "libraryId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	if _, err := s.libraries.Get(r.Context(), libraryID); err != nil {
		writeError(w, http.StatusNotFound, errors.New("library not found"))
		return
	}

	subcats, err := s.categories.Children(r.Context(), libraryID, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	items, err := s.items.ListRootItems(r.Context(), libraryID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	channels, err := s.channels.ListRootChannels(r.Context(), libraryID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	resp := toChildrenResponse(subcats, items, channels)
	resp.Items = s.attachProgress(r.Context(), resp.Items)
	writeJSON(w, http.StatusOK, resp)
}

func toChildrenResponse(subcats []db.Category, items []db.MediaItem, channels []db.Channel) categoryChildrenResponse {
	resp := categoryChildrenResponse{
		Subcategories: make([]categoryDTO, len(subcats)),
		Items:         make([]mediaItemDTO, 0, len(items)+len(channels)),
	}
	for i, c := range subcats {
		resp.Subcategories[i] = toCategoryDTO(c)
	}
	for _, m := range items {
		resp.Items = append(resp.Items, toMediaItemDTO(m))
	}
	for _, c := range channels {
		resp.Items = append(resp.Items, toChannelDTO(c))
	}
	return resp
}

func (s *Server) handleGetMediaItem(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "mediaItemId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	item, err := s.items.Get(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, errors.New("media item not found"))
		return
	}

	dtos := s.attachProgress(r.Context(), []mediaItemDTO{toMediaItemDTO(*item)})
	writeJSON(w, http.StatusOK, dtos[0])
}
