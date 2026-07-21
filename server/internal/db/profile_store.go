package db

import (
	"context"
	"database/sql"
)

type ProfileStore struct {
	db *sql.DB
}

func NewProfileStore(dbConn *sql.DB) *ProfileStore {
	return &ProfileStore{db: dbConn}
}

func (s *ProfileStore) Create(ctx context.Context, userID int64, displayName string, isKid bool, pinHash *string) (*Profile, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO profile (user_id, display_name, is_kid, pin_hash) VALUES (?, ?, ?, ?)`,
		userID, displayName, isKid, pinHash)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

func (s *ProfileStore) Get(ctx context.Context, id int64) (*Profile, error) {
	return scanProfile(s.db.QueryRowContext(ctx, selectProfileSQL+` WHERE id = ?`, id))
}

func (s *ProfileStore) ListByUser(ctx context.Context, userID int64) ([]Profile, error) {
	rows, err := s.db.QueryContext(ctx, selectProfileSQL+` WHERE user_id = ? ORDER BY id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Profile
	for rows.Next() {
		p, err := scanProfile(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

const selectProfileSQL = `SELECT id, user_id, display_name, avatar, is_kid, pin_hash FROM profile`

func scanProfile(row rowScanner) (*Profile, error) {
	var p Profile
	var avatar, pinHash sql.NullString
	var isKid int
	if err := row.Scan(&p.ID, &p.UserID, &p.DisplayName, &avatar, &isKid, &pinHash); err != nil {
		return nil, err
	}
	p.IsKid = isKid != 0
	if avatar.Valid {
		p.Avatar = &avatar.String
	}
	if pinHash.Valid {
		p.PinHash = &pinHash.String
	}
	return &p, nil
}
