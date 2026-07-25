package db

import (
	"context"
	"database/sql"
	"time"
)

type PasswordResetTokenStore struct {
	db *sql.DB
}

func NewPasswordResetTokenStore(dbConn *sql.DB) *PasswordResetTokenStore {
	return &PasswordResetTokenStore{db: dbConn}
}

func (s *PasswordResetTokenStore) Create(ctx context.Context, userID int64, code string, expiresAt time.Time) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO password_reset_token (user_id, code, expires_at) VALUES (?, ?, ?)`,
		userID, code, expiresAt.UTC().Format(time.RFC3339))
	return err
}

// FindValid returns the matching, unused, unexpired token for a user, or
// nil if the code is wrong/expired/already used — callers should treat
// all three the same way (generic "invalid or expired code" error).
func (s *PasswordResetTokenStore) FindValid(ctx context.Context, userID int64, code string) (*PasswordResetToken, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, code, expires_at, used FROM password_reset_token
		WHERE user_id = ? AND code = ? AND used = 0
		ORDER BY id DESC LIMIT 1`, userID, code)

	var t PasswordResetToken
	var expiresAt string
	var used int
	if err := row.Scan(&t.ID, &t.UserID, &t.Code, &expiresAt, &used); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	t.Used = used != 0
	parsed, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil {
		return nil, err
	}
	t.ExpiresAt = parsed
	if time.Now().After(t.ExpiresAt) {
		return nil, nil
	}
	return &t, nil
}

func (s *PasswordResetTokenStore) MarkUsed(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `UPDATE password_reset_token SET used = 1 WHERE id = ?`, id)
	return err
}
