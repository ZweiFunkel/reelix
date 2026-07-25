package api

import (
	"context"
	"net/http"
	"time"

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
