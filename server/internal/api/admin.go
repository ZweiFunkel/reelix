package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/novex-labs/reelix/server/internal/auth"
	"github.com/novex-labs/reelix/server/internal/db"
)

// nowPlayingActiveWindow is how recently a watch-state row must have been
// touched to count as "still playing" — a little over 2x the player's
// 10s progress-report interval, so a brief pause/buffer doesn't flicker
// the dashboard between playing/idle.
const nowPlayingActiveWindow = 25 * time.Second

type nowPlayingDTO struct {
	Title           string  `json:"title"`
	ItemType        string  `json:"itemType"`
	IsLive          bool    `json:"isLive"`
	PositionSeconds float64 `json:"positionSeconds"`
}

type adminSessionDTO struct {
	SessionID   string         `json:"sessionId"`
	Username    string         `json:"username"`
	ProfileName *string        `json:"profileName"`
	IsKid       bool           `json:"isKid"`
	LoginAt     time.Time      `json:"loginAt"`
	LastSeenAt  *time.Time     `json:"lastSeenAt"`
	NowPlaying  *nowPlayingDTO `json:"nowPlaying"`
}

// handleAdminSessions lists every active login session with who's
// currently logged in (and when they were last seen) and what they're
// playing right now, if anything — the Jellyfin-style admin dashboard.
func (s *Server) handleAdminSessions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	sessions, err := s.sessions.ListActive(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	since := time.Now().Add(-nowPlayingActiveWindow)
	out := make([]adminSessionDTO, 0, len(sessions))
	for _, sess := range sessions {
		user, err := s.users.Get(ctx, sess.UserID)
		if err != nil || user == nil {
			continue
		}

		dto := adminSessionDTO{
			SessionID:  sess.ID,
			Username:   user.Username,
			LoginAt:    sess.CreatedAt,
			LastSeenAt: sess.LastSeenAt,
		}

		if sess.ProfileID != nil {
			if profile, err := s.profiles.Get(ctx, *sess.ProfileID); err == nil && profile != nil {
				dto.ProfileName = &profile.DisplayName
				dto.IsKid = profile.IsKid
			}

			if ws, err := s.watchStates.GetActiveForProfile(ctx, *sess.ProfileID, since); err == nil && ws != nil {
				dto.NowPlaying = s.toNowPlayingDTO(ctx, ws)
			}
		}

		out = append(out, dto)
	}

	writeJSON(w, http.StatusOK, out)
}

func (s *Server) toNowPlayingDTO(ctx context.Context, ws *db.WatchState) *nowPlayingDTO {
	if ws.PlayableItemType == "channel" {
		ch, err := s.channels.Get(ctx, ws.PlayableItemID)
		if err != nil || ch == nil {
			return nil
		}
		return &nowPlayingDTO{Title: ch.Name, ItemType: "channel", IsLive: true, PositionSeconds: ws.PositionSeconds}
	}

	item, err := s.items.Get(ctx, ws.PlayableItemID)
	if err != nil || item == nil {
		return nil
	}
	return &nowPlayingDTO{Title: toMediaItemDTO(*item).Title, ItemType: "media_item", PositionSeconds: ws.PositionSeconds}
}

// handleAdminListUsers lists every account — the admin "manage users" page.
func (s *Server) handleAdminListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.users.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	dtos := make([]userDTO, len(users))
	for i, u := range users {
		dtos[i] = toUserDTO(u)
	}
	writeJSON(w, http.StatusOK, dtos)
}

type createUserRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

// handleAdminCreateUser lets an admin add another account to share the
// server with — the only way to do this before was the one-time
// first-run setup wizard. Mirrors handleSetupAdmin's validation/shape,
// plus a role choice and a default profile so the new account can log
// straight in without a second setup step.
func (s *Server) handleAdminCreateUser(w http.ResponseWriter, r *http.Request) {
	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if len(req.Username) < 3 || len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, errors.New("username must be 3+ chars, password 8+ chars"))
		return
	}
	if req.Role != "admin" && req.Role != "user" {
		req.Role = "user"
	}

	if existing, err := s.users.GetByUsername(r.Context(), req.Username); err == nil && existing != nil {
		writeError(w, http.StatusConflict, errors.New("username already taken"))
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	user, err := s.users.Create(r.Context(), req.Username, hash, req.Role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if _, err := s.profiles.Create(r.Context(), user.ID, user.Username, false, nil); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusCreated, toUserDTO(*user))
}

type updateUserRoleRequest struct {
	Role string `json:"role"`
}

// handleAdminUpdateUserRole promotes/demotes an account. An admin can't
// demote their own account — the same "don't lock yourself out" guard as
// RequireAdmin's kid-profile check elsewhere in this package.
func (s *Server) handleAdminUpdateUserRole(w http.ResponseWriter, r *http.Request) {
	userID, err := strconv.ParseInt(chi.URLParam(r, "userId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	var req updateUserRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if req.Role != "admin" && req.Role != "user" {
		writeError(w, http.StatusBadRequest, errors.New("role must be admin or user"))
		return
	}

	if current := auth.UserFromContext(r.Context()); current != nil && current.ID == userID && req.Role != "admin" {
		writeError(w, http.StatusBadRequest, errors.New("cannot demote your own account"))
		return
	}

	if err := s.users.UpdateRole(r.Context(), userID, req.Role); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
