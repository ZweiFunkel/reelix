package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/novex-labs/reelix/server/internal/auth"
	"github.com/novex-labs/reelix/server/internal/db"
	"github.com/novex-labs/reelix/server/internal/metadata"
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
	PosterURL       *string      `json:"posterUrl"`
	BackdropURL     *string      `json:"backdropUrl"`
	Overview        *string      `json:"overview"`
	Rating          *float64     `json:"rating"`
	// Set only for TV episodes (see metadata.Episode) — lets the frontend
	// show "S01E06 · Episode Title" and group/sort a show's episodes.
	ShowTitle     *string `json:"showTitle"`
	SeasonNumber  *int    `json:"seasonNumber"`
	EpisodeNumber *int    `json:"episodeNumber"`
}

func toMediaItemDTO(m db.MediaItem) mediaItemDTO {
	base := path.Base(m.FilePath)
	title := strings.TrimSuffix(base, path.Ext(base))
	dto := mediaItemDTO{ID: m.ID, ItemType: "media_item", Title: title, FilePath: m.FilePath, DurationSeconds: m.DurationSeconds, MediaType: m.MediaType}

	var kind struct {
		Kind string `json:"kind"`
	}
	if json.Unmarshal([]byte(m.Metadata), &kind) != nil {
		return dto
	}

	switch kind.Kind {
	case metadata.KindEpisode:
		var ep metadata.Episode
		if json.Unmarshal([]byte(m.Metadata), &ep) != nil {
			return dto
		}
		dto.Title = ep.Title
		dto.ShowTitle = &ep.ShowTitle
		dto.SeasonNumber = &ep.SeasonNumber
		dto.EpisodeNumber = &ep.EpisodeNumber
		if url := ep.PosterURL(); url != "" {
			dto.PosterURL = &url
		}
		if url := ep.BackdropURL(); url != "" {
			dto.BackdropURL = &url
		}
		if ep.Overview != "" {
			dto.Overview = &ep.Overview
		}
		if ep.VoteAverage > 0 {
			dto.Rating = &ep.VoteAverage
		}
	case metadata.KindMovie:
		var movie metadata.Movie
		if json.Unmarshal([]byte(m.Metadata), &movie) != nil {
			return dto
		}
		if movie.Title != "" {
			dto.Title = movie.Title
		}
		if url := movie.PosterURL(); url != "" {
			dto.PosterURL = &url
		}
		if url := movie.BackdropURL(); url != "" {
			dto.BackdropURL = &url
		}
		if movie.Overview != "" {
			dto.Overview = &movie.Overview
		}
		if movie.VoteAverage > 0 {
			dto.Rating = &movie.VoteAverage
		}
	}
	return dto
}

func toChannelDTO(c db.Channel) mediaItemDTO {
	return mediaItemDTO{ID: c.ID, ItemType: "channel", Title: c.Name, MediaType: "channel"}
}

// parseEpisodeMetadata returns the parsed Episode and true only for rows
// whose metadata is actually kind=episode — every other case (movie,
// unrecognized, parse failure) returns ok=false without erroring, since
// "not an episode" is the overwhelmingly common, entirely normal case.
func parseEpisodeMetadata(raw string) (metadata.Episode, bool) {
	var kind struct {
		Kind string `json:"kind"`
	}
	if json.Unmarshal([]byte(raw), &kind) != nil || kind.Kind != metadata.KindEpisode {
		return metadata.Episode{}, false
	}
	var ep metadata.Episode
	if json.Unmarshal([]byte(raw), &ep) != nil || ep.ShowTitle == "" {
		return metadata.Episode{}, false
	}
	return ep, true
}

func lessEpisode(a, b metadata.Episode) bool {
	if a.SeasonNumber != b.SeasonNumber {
		return a.SeasonNumber < b.SeasonNumber
	}
	return a.EpisodeNumber < b.EpisodeNumber
}

// toShowTileDTO builds the single grouped tile a show's episodes collapse
// into in a folder listing — id is one representative episode's real
// media_item id, used purely as an anchor for GET .../show to look up
// "every episode with this show's title" (see handleGetShow).
func toShowTileDTO(anchorID int64, rep metadata.Episode) mediaItemDTO {
	dto := mediaItemDTO{ID: anchorID, ItemType: "show", Title: rep.ShowTitle, MediaType: "video", ShowTitle: &rep.ShowTitle}
	if url := rep.PosterURL(); url != "" {
		dto.PosterURL = &url
	}
	if url := rep.BackdropURL(); url != "" {
		dto.BackdropURL = &url
	}
	overview := rep.ShowOverview
	if overview == "" {
		overview = rep.Overview
	}
	if overview != "" {
		dto.Overview = &overview
	}
	return dto
}

// groupItemsIntoShowTiles collapses every item recognized as a TV
// episode into one tile per distinct show title, so a folder full of
// individual episode files browses like Jellyfin/Netflix — one show,
// not N episode tiles. Movies and unrecognized video files pass through
// unchanged. Photos are handled by the caller, same as before.
func groupItemsIntoShowTiles(items []db.MediaItem) []mediaItemDTO {
	type group struct {
		anchorID int64
		rep      metadata.Episode
	}
	groups := map[string]*group{}
	var order []string
	out := make([]mediaItemDTO, 0, len(items))

	for _, m := range items {
		ep, ok := parseEpisodeMetadata(m.Metadata)
		if !ok {
			out = append(out, toMediaItemDTO(m))
			continue
		}
		g, exists := groups[ep.ShowTitle]
		if !exists {
			g = &group{anchorID: m.ID, rep: ep}
			groups[ep.ShowTitle] = g
			order = append(order, ep.ShowTitle)
			continue
		}
		if lessEpisode(ep, g.rep) {
			g.anchorID, g.rep = m.ID, ep
		}
	}

	for _, showTitle := range order {
		g := groups[showTitle]
		out = append(out, toShowTileDTO(g.anchorID, g.rep))
	}
	return out
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

// handleGetCategory returns a single category's own name/path — used to
// rebuild breadcrumb labels when a browse URL is opened directly (e.g.
// after a page reload), since the URL only carries category ids.
func (s *Server) handleGetCategory(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "categoryId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	cat, err := s.categories.Get(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, errors.New("category not found"))
		return
	}
	writeJSON(w, http.StatusOK, toCategoryDTO(*cat))
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
		Items:         groupItemsIntoShowTiles(items),
	}
	for i, c := range subcats {
		resp.Subcategories[i] = toCategoryDTO(c)
	}
	for _, c := range channels {
		resp.Items = append(resp.Items, toChannelDTO(c))
	}
	return resp
}

// handleLibraryRecent lists a library's most-recently-added items,
// flattened across all its categories — the per-library "Latest" row.
func (s *Server) handleLibraryRecent(w http.ResponseWriter, r *http.Request) {
	libraryID, err := strconv.ParseInt(chi.URLParam(r, "libraryId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	items, err := s.items.ListRecentByLibrary(r.Context(), libraryID, 20)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	dtos := make([]mediaItemDTO, len(items))
	for i, m := range items {
		dtos[i] = toMediaItemDTO(m)
	}
	dtos = s.attachProgress(r.Context(), dtos)
	writeJSON(w, http.StatusOK, dtos)
}

// handleContinueWatching lists items the active profile started but
// hasn't finished — the "Weiterschauen" row on the Netflix-style home.
func (s *Server) handleContinueWatching(w http.ResponseWriter, r *http.Request) {
	sess := auth.SessionFromContext(r.Context())
	if sess == nil || sess.ProfileID == nil {
		writeError(w, http.StatusForbidden, errors.New("no active profile"))
		return
	}

	items, err := s.items.ListInProgress(r.Context(), *sess.ProfileID, 20)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	dtos := make([]mediaItemDTO, len(items))
	for i, m := range items {
		dtos[i] = toMediaItemDTO(m)
	}
	dtos = s.attachProgress(r.Context(), dtos)
	writeJSON(w, http.StatusOK, dtos)
}

// handleMediaItemSiblings lists the other items in the same folder as a
// media item, ordered by episode number when available — the "More from
// Season X" row on the detail page, and how the player finds "what's
// next" (the first sibling after this one in the returned list).
func (s *Server) handleMediaItemSiblings(w http.ResponseWriter, r *http.Request) {
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

	var siblings []db.MediaItem
	if item.CategoryID != nil {
		siblings, err = s.items.ListByCategory(r.Context(), *item.CategoryID)
	} else {
		siblings, err = s.items.ListRootItems(r.Context(), item.LibraryID)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	dtos := make([]mediaItemDTO, 0, len(siblings))
	for _, m := range siblings {
		if m.MediaType == "photo" {
			continue
		}
		dtos = append(dtos, toMediaItemDTO(m))
	}
	sort.SliceStable(dtos, func(i, j int) bool {
		if dtos[i].SeasonNumber != nil && dtos[j].SeasonNumber != nil && *dtos[i].SeasonNumber != *dtos[j].SeasonNumber {
			return *dtos[i].SeasonNumber < *dtos[j].SeasonNumber
		}
		if dtos[i].EpisodeNumber != nil && dtos[j].EpisodeNumber != nil {
			return *dtos[i].EpisodeNumber < *dtos[j].EpisodeNumber
		}
		return false // preserve existing (filename) order otherwise
	})

	dtos = s.attachProgress(r.Context(), dtos)
	writeJSON(w, http.StatusOK, dtos)
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

type showSeasonDTO struct {
	SeasonNumber int            `json:"seasonNumber"`
	Episodes     []mediaItemDTO `json:"episodes"`
}

type castMemberDTO struct {
	Name      string  `json:"name"`
	Character string  `json:"character,omitempty"`
	PhotoURL  *string `json:"photoUrl"`
}

type showResponseDTO struct {
	Title       string          `json:"title"`
	Overview    *string         `json:"overview"`
	PosterURL   *string         `json:"posterUrl"`
	BackdropURL *string         `json:"backdropUrl"`
	Cast        []castMemberDTO `json:"cast"`
	Seasons     []showSeasonDTO `json:"seasons"`
}

// handleGetShow takes any one episode's id (typically a show tile's
// anchor id from groupItemsIntoShowTiles) and returns every episode of
// that show across the whole library — not just its folder, since a
// show's seasons are often split across subfolders — grouped by season.
func (s *Server) handleGetShow(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "mediaItemId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	anchor, err := s.items.Get(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, errors.New("media item not found"))
		return
	}
	anchorEp, ok := parseEpisodeMetadata(anchor.Metadata)
	if !ok {
		writeError(w, http.StatusBadRequest, errors.New("this item is not part of a TV show"))
		return
	}

	all, err := s.items.ListByLibrary(r.Context(), anchor.LibraryID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	bySeason := map[int][]mediaItemDTO{}
	var seasonNumbers []int
	resp := showResponseDTO{Title: anchorEp.ShowTitle}
	haveShowInfo := false

	for _, m := range all {
		ep, ok := parseEpisodeMetadata(m.Metadata)
		if !ok || ep.ShowTitle != anchorEp.ShowTitle {
			continue
		}
		if !haveShowInfo {
			if url := ep.PosterURL(); url != "" {
				resp.PosterURL = &url
			}
			if url := ep.BackdropURL(); url != "" {
				resp.BackdropURL = &url
			}
			overview := ep.ShowOverview
			if overview != "" {
				resp.Overview = &overview
				haveShowInfo = true
			}
		}
		if _, seen := bySeason[ep.SeasonNumber]; !seen {
			seasonNumbers = append(seasonNumbers, ep.SeasonNumber)
		}
		bySeason[ep.SeasonNumber] = append(bySeason[ep.SeasonNumber], toMediaItemDTO(m))
	}

	sort.Ints(seasonNumbers)
	for _, sn := range seasonNumbers {
		eps := bySeason[sn]
		sort.SliceStable(eps, func(i, j int) bool {
			if eps[i].EpisodeNumber == nil || eps[j].EpisodeNumber == nil {
				return false
			}
			return *eps[i].EpisodeNumber < *eps[j].EpisodeNumber
		})
		resp.Seasons = append(resp.Seasons, showSeasonDTO{SeasonNumber: sn, Episodes: s.attachProgress(r.Context(), eps)})
	}

	if s.tmdb != nil && anchorEp.ShowTMDbID != 0 {
		if cast, err := s.tmdb.GetShowCast(r.Context(), anchorEp.ShowTMDbID); err == nil {
			resp.Cast = make([]castMemberDTO, len(cast))
			for i, member := range cast {
				dto := castMemberDTO{Name: member.Name, Character: member.Character}
				if url := member.PhotoURL(); url != "" {
					dto.PhotoURL = &url
				}
				resp.Cast[i] = dto
			}
		} else {
			log.Printf("reelix: tmdb cast lookup for %q: %v", anchorEp.ShowTitle, err)
		}
	}

	writeJSON(w, http.StatusOK, resp)
}

// handleDeleteMediaItem permanently deletes a media item's row AND its
// underlying file — unlike deleting a library, "delete this episode" is
// a genuinely destructive per-file action, matching what an admin means
// by "remove this content" (a plain DB-only delete would just have the
// file reappear on the next scan).
func (s *Server) handleDeleteMediaItem(w http.ResponseWriter, r *http.Request) {
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
	lib, err := s.libraries.Get(r.Context(), item.LibraryID)
	if err != nil {
		writeError(w, http.StatusNotFound, errors.New("library not found"))
		return
	}

	absPath := filepath.Join(lib.RootPath, filepath.FromSlash(item.FilePath))
	// A file already missing on disk (removed outside Reelix) shouldn't
	// block cleaning up its now-stale database row.
	if err := os.Remove(absPath); err != nil && !os.IsNotExist(err) {
		writeError(w, http.StatusInternalServerError, fmt.Errorf("delete file: %w", err))
		return
	}
	if err := s.items.Delete(r.Context(), item.ID); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
