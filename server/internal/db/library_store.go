package db

import (
	"context"
	"database/sql"
	"time"
)

type LibraryStore struct {
	db *sql.DB
}

func NewLibraryStore(dbConn *sql.DB) *LibraryStore {
	return &LibraryStore{db: dbConn}
}

func (s *LibraryStore) Create(ctx context.Context, name, rootPath, libType string) (*Library, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO library (name, root_path, type) VALUES (?, ?, ?)`,
		name, rootPath, libType,
	)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

func (s *LibraryStore) Get(ctx context.Context, id int64) (*Library, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, name, root_path, type, scan_settings, scan_generation, last_scanned_at, created_at
		 FROM library WHERE id = ?`, id)
	return scanLibrary(row)
}

func (s *LibraryStore) List(ctx context.Context) ([]Library, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, root_path, type, scan_settings, scan_generation, last_scanned_at, created_at
		 FROM library ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Library
	for rows.Next() {
		lib, err := scanLibrary(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *lib)
	}
	return out, rows.Err()
}

// BeginScan increments the library's scan generation and returns the new
// value; every row touched by this scan gets stamped with it, and rows
// left on the old generation afterwards are gone from disk.
func (s *LibraryStore) BeginScan(ctx context.Context, libraryID int64) (int64, error) {
	_, err := s.db.ExecContext(ctx,
		`UPDATE library SET scan_generation = scan_generation + 1 WHERE id = ?`, libraryID)
	if err != nil {
		return 0, err
	}
	var gen int64
	err = s.db.QueryRowContext(ctx, `SELECT scan_generation FROM library WHERE id = ?`, libraryID).Scan(&gen)
	return gen, err
}

func (s *LibraryStore) FinishScan(ctx context.Context, libraryID int64, finishedAt time.Time) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE library SET last_scanned_at = ? WHERE id = ?`, finishedAt.UTC().Format(time.RFC3339), libraryID)
	return err
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanLibrary(row rowScanner) (*Library, error) {
	var l Library
	var lastScannedAt sql.NullString
	var createdAt string
	if err := row.Scan(&l.ID, &l.Name, &l.RootPath, &l.Type, &l.ScanSettings, &l.ScanGeneration, &lastScannedAt, &createdAt); err != nil {
		return nil, err
	}
	if lastScannedAt.Valid {
		t, err := time.Parse(time.RFC3339, lastScannedAt.String)
		if err == nil {
			l.LastScannedAt = &t
		}
	}
	if t, err := time.Parse("2006-01-02 15:04:05", createdAt); err == nil {
		l.CreatedAt = t
	}
	return &l, nil
}
