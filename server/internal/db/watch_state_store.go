package db

import (
	"context"
	"database/sql"
	"time"
)

type WatchStateStore struct {
	db *sql.DB
}

func NewWatchStateStore(dbConn *sql.DB) *WatchStateStore {
	return &WatchStateStore{db: dbConn}
}

func (s *WatchStateStore) Upsert(ctx context.Context, profileID, itemID int64, itemType string, position float64, duration *float64, watched bool) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO watch_state (profile_id, playable_item_id, playable_item_type, position_seconds, duration_seconds, watched, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (profile_id, playable_item_id, playable_item_type) DO UPDATE SET
			position_seconds = excluded.position_seconds,
			duration_seconds = excluded.duration_seconds,
			watched = excluded.watched,
			updated_at = excluded.updated_at
	`, profileID, itemID, itemType, position, duration, watched, time.Now().UTC().Format(time.RFC3339))
	return err
}

func (s *WatchStateStore) Get(ctx context.Context, profileID, itemID int64, itemType string) (*WatchState, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT profile_id, playable_item_id, playable_item_type, position_seconds, duration_seconds, watched, updated_at
		FROM watch_state WHERE profile_id = ? AND playable_item_id = ? AND playable_item_type = ?`,
		profileID, itemID, itemType)

	var w WatchState
	var watched int
	var updatedAt string
	if err := row.Scan(&w.ProfileID, &w.PlayableItemID, &w.PlayableItemType, &w.PositionSeconds, &w.DurationSeconds, &watched, &updatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	w.Watched = watched != 0
	if t, err := time.Parse(time.RFC3339, updatedAt); err == nil {
		w.UpdatedAt = t
	}
	return &w, nil
}
