package db

import (
	"context"
	"database/sql"
	"time"
)

type SessionStore struct {
	db *sql.DB
}

func NewSessionStore(dbConn *sql.DB) *SessionStore {
	return &SessionStore{db: dbConn}
}

func (s *SessionStore) Create(ctx context.Context, id string, userID int64, expiresAt time.Time) (*Session, error) {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO session (id, user_id, expires_at) VALUES (?, ?, ?)`,
		id, userID, expiresAt.UTC().Format(time.RFC3339))
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

// Get returns nil (no error) if the session doesn't exist or has expired —
// both cases mean "treat the caller as unauthenticated".
func (s *SessionStore) Get(ctx context.Context, id string) (*Session, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, user_id, profile_id, expires_at FROM session WHERE id = ?`, id)

	var sess Session
	var profileID sql.NullInt64
	var expiresAt string
	if err := row.Scan(&sess.ID, &sess.UserID, &profileID, &expiresAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if profileID.Valid {
		v := profileID.Int64
		sess.ProfileID = &v
	}
	t, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil {
		return nil, err
	}
	sess.ExpiresAt = t
	if time.Now().After(sess.ExpiresAt) {
		return nil, nil
	}
	return &sess, nil
}

func (s *SessionStore) SetProfile(ctx context.Context, sessionID string, profileID int64) error {
	_, err := s.db.ExecContext(ctx, `UPDATE session SET profile_id = ? WHERE id = ?`, profileID, sessionID)
	return err
}

func (s *SessionStore) Delete(ctx context.Context, sessionID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM session WHERE id = ?`, sessionID)
	return err
}
