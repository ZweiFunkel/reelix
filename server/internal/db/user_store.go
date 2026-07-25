package db

import (
	"context"
	"database/sql"
	"time"
)

type UserStore struct {
	db *sql.DB
}

func NewUserStore(dbConn *sql.DB) *UserStore {
	return &UserStore{db: dbConn}
}

func (s *UserStore) Count(ctx context.Context) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM user`).Scan(&n)
	return n, err
}

func (s *UserStore) Create(ctx context.Context, username, passwordHash, role string) (*User, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO user (username, password_hash, role) VALUES (?, ?, ?)`,
		username, passwordHash, role)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

func (s *UserStore) Get(ctx context.Context, id int64) (*User, error) {
	return scanUser(s.db.QueryRowContext(ctx, selectUserSQL+` WHERE id = ?`, id))
}

func (s *UserStore) GetByUsername(ctx context.Context, username string) (*User, error) {
	return scanUser(s.db.QueryRowContext(ctx, selectUserSQL+` WHERE username = ?`, username))
}

func (s *UserStore) UpdatePassword(ctx context.Context, id int64, passwordHash string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE user SET password_hash = ? WHERE id = ?`, passwordHash, id)
	return err
}

func (s *UserStore) UpdateEmail(ctx context.Context, id int64, email string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE user SET email = ? WHERE id = ?`, email, id)
	return err
}

const selectUserSQL = `SELECT id, username, password_hash, role, email, created_at FROM user`

func scanUser(row rowScanner) (*User, error) {
	var u User
	var createdAt string
	var email sql.NullString
	if err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &email, &createdAt); err != nil {
		return nil, err
	}
	if email.Valid {
		u.Email = &email.String
	}
	if t, err := time.Parse("2006-01-02 15:04:05", createdAt); err == nil {
		u.CreatedAt = t
	}
	return &u, nil
}
