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

func (s *UserStore) List(ctx context.Context) ([]User, error) {
	rows, err := s.db.QueryContext(ctx, selectUserSQL+` ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *u)
	}
	return out, rows.Err()
}

func (s *UserStore) UpdatePassword(ctx context.Context, id int64, passwordHash string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE user SET password_hash = ? WHERE id = ?`, passwordHash, id)
	return err
}

// UpdateEmail resets email_verified to false — a changed address always
// needs re-verifying, even if the old one was already verified.
func (s *UserStore) UpdateEmail(ctx context.Context, id int64, email string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE user SET email = ?, email_verified = 0 WHERE id = ?`, email, id)
	return err
}

func (s *UserStore) MarkEmailVerified(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `UPDATE user SET email_verified = 1 WHERE id = ?`, id)
	return err
}

// UpdateUsername renames an account. Usernames are UNIQUE at the schema
// level (see migration 0001); callers should check GetByUsername first
// to return a friendly "already taken" error instead of a raw
// constraint-violation error from this.
func (s *UserStore) UpdateUsername(ctx context.Context, id int64, username string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE user SET username = ? WHERE id = ?`, username, id)
	return err
}

// UpdateRole promotes/demotes an account between "admin" and "user".
func (s *UserStore) UpdateRole(ctx context.Context, id int64, role string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE user SET role = ? WHERE id = ?`, role, id)
	return err
}

// Delete removes an account; profiles/sessions cascade via foreign keys.
func (s *UserStore) Delete(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM user WHERE id = ?`, id)
	return err
}

const selectUserSQL = `SELECT id, username, password_hash, role, email, email_verified, created_at FROM user`

func scanUser(row rowScanner) (*User, error) {
	var u User
	var createdAt string
	var email sql.NullString
	var emailVerified int
	if err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &email, &emailVerified, &createdAt); err != nil {
		return nil, err
	}
	if email.Valid {
		u.Email = &email.String
	}
	u.EmailVerified = emailVerified != 0
	if t, err := time.Parse("2006-01-02 15:04:05", createdAt); err == nil {
		u.CreatedAt = t
	}
	return &u, nil
}
