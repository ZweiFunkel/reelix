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
		`SELECT id, user_id, profile_id, expires_at, created_at, last_seen_at FROM session WHERE id = ?`, id)
	sess, err := scanSession(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if time.Now().After(sess.ExpiresAt) {
		return nil, nil
	}
	return sess, nil
}

// Touch bumps a session's last-seen timestamp — called on every
// authenticated request so the admin dashboard can show who's actually
// active right now, not just who has a still-valid cookie.
func (s *SessionStore) Touch(ctx context.Context, sessionID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE session SET last_seen_at = ? WHERE id = ?`, time.Now().UTC().Format(time.RFC3339), sessionID)
	return err
}

// ListActive returns every non-expired session, most-recently-active
// first — the admin "who's logged in" dashboard.
func (s *SessionStore) ListActive(ctx context.Context) ([]Session, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, profile_id, expires_at, created_at, last_seen_at
		FROM session
		WHERE expires_at > ?
		ORDER BY COALESCE(last_seen_at, created_at) DESC`,
		time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Session
	for rows.Next() {
		sess, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *sess)
	}
	return out, rows.Err()
}

func scanSession(row rowScanner) (*Session, error) {
	var sess Session
	var profileID sql.NullInt64
	var expiresAt, createdAt string
	var lastSeenAt sql.NullString
	if err := row.Scan(&sess.ID, &sess.UserID, &profileID, &expiresAt, &createdAt, &lastSeenAt); err != nil {
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
	if t, err := time.Parse(time.RFC3339, createdAt); err == nil {
		sess.CreatedAt = t
	} else if t, err := time.Parse("2006-01-02 15:04:05", createdAt); err == nil {
		sess.CreatedAt = t
	}
	if lastSeenAt.Valid {
		if t, err := time.Parse(time.RFC3339, lastSeenAt.String); err == nil {
			sess.LastSeenAt = &t
		}
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

// DeleteAllForUser signs the account out everywhere — used after a
// password reset, since a code that could reset the password could also
// have been intercepted, and any existing sessions were authenticated
// with the now-replaced password.
func (s *SessionStore) DeleteAllForUser(ctx context.Context, userID int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM session WHERE user_id = ?`, userID)
	return err
}
