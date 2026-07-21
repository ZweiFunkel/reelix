package db

import (
	"context"
	"database/sql"
	"time"
)

type MediaItemStore struct {
	db *sql.DB
}

func NewMediaItemStore(dbConn *sql.DB) *MediaItemStore {
	return &MediaItemStore{db: dbConn}
}

func (s *MediaItemStore) GetByPath(ctx context.Context, libraryID int64, filePath string) (*MediaItem, error) {
	row := s.db.QueryRowContext(ctx, selectMediaItemSQL+` WHERE library_id = ? AND file_path = ?`, libraryID, filePath)
	item, err := scanMediaItem(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return item, err
}

func (s *MediaItemStore) Get(ctx context.Context, id int64) (*MediaItem, error) {
	row := s.db.QueryRowContext(ctx, selectMediaItemSQL+` WHERE id = ?`, id)
	return scanMediaItem(row)
}

// FindMoveCandidate looks for a media item in this library that hasn't
// been touched by the current scan yet and matches on file size — the
// signal that a still-undiscovered file on disk may just be this row's
// old path, moved rather than deleted. Move detection here is size-only
// for v1; the partial-hash check from the design doc is deferred.
func (s *MediaItemStore) FindMoveCandidate(ctx context.Context, libraryID, currentGeneration, fileSize int64) (*MediaItem, error) {
	row := s.db.QueryRowContext(ctx, selectMediaItemSQL+`
		WHERE library_id = ? AND file_size = ? AND last_seen_generation < ? AND deleted_at IS NULL
		LIMIT 1`, libraryID, fileSize, currentGeneration)
	item, err := scanMediaItem(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return item, err
}

type UpsertMediaItemParams struct {
	LibraryID       int64
	CategoryID      *int64
	FilePath        string
	FileSize        int64
	FileMTime       time.Time
	MediaType       string
	DurationSeconds *float64
	CodecInfo       *string
	Metadata        string
	Generation      int64
}

func (s *MediaItemStore) Upsert(ctx context.Context, p UpsertMediaItemParams) (*MediaItem, error) {
	if p.Metadata == "" {
		p.Metadata = "{}"
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO media_item (
			library_id, category_id, file_path, file_size, file_mtime,
			media_type, duration_seconds, codec_info, metadata, last_seen_generation, deleted_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
		ON CONFLICT (library_id, file_path) DO UPDATE SET
			category_id = excluded.category_id,
			file_size = excluded.file_size,
			file_mtime = excluded.file_mtime,
			media_type = excluded.media_type,
			duration_seconds = excluded.duration_seconds,
			codec_info = excluded.codec_info,
			metadata = excluded.metadata,
			last_seen_generation = excluded.last_seen_generation,
			deleted_at = NULL
	`,
		p.LibraryID, p.CategoryID, p.FilePath, p.FileSize, p.FileMTime.UTC().Format(time.RFC3339),
		p.MediaType, p.DurationSeconds, p.CodecInfo, p.Metadata, p.Generation,
	)
	if err != nil {
		return nil, err
	}
	return s.GetByPath(ctx, p.LibraryID, p.FilePath)
}

// MoveTo relocates an existing row (found via FindMoveCandidate) to its
// new path/category, preserving its id and therefore any watch history.
func (s *MediaItemStore) MoveTo(ctx context.Context, id int64, newPath string, newCategoryID *int64, fileMTime time.Time, generation int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE media_item SET file_path = ?, category_id = ?, file_mtime = ?, last_seen_generation = ?, deleted_at = NULL
		WHERE id = ?`,
		newPath, newCategoryID, fileMTime.UTC().Format(time.RFC3339), generation, id)
	return err
}

func (s *MediaItemStore) ListByCategory(ctx context.Context, categoryID int64) ([]MediaItem, error) {
	rows, err := s.db.QueryContext(ctx, selectMediaItemSQL+` WHERE category_id = ? AND deleted_at IS NULL ORDER BY file_path`, categoryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMediaItemRows(rows)
}

// ListRootItems returns files that live directly in a library's root
// (not inside any subfolder), which therefore have no Category.
func (s *MediaItemStore) ListRootItems(ctx context.Context, libraryID int64) ([]MediaItem, error) {
	rows, err := s.db.QueryContext(ctx, selectMediaItemSQL+` WHERE library_id = ? AND category_id IS NULL AND deleted_at IS NULL ORDER BY file_path`, libraryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMediaItemRows(rows)
}

func scanMediaItemRows(rows *sql.Rows) ([]MediaItem, error) {
	var out []MediaItem
	for rows.Next() {
		item, err := scanMediaItem(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}

func (s *MediaItemStore) DeleteStale(ctx context.Context, libraryID, currentGeneration int64, deletedAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE media_item SET deleted_at = ?
		WHERE library_id = ? AND last_seen_generation < ? AND deleted_at IS NULL`,
		deletedAt.UTC().Format(time.RFC3339), libraryID, currentGeneration)
	return err
}

const selectMediaItemSQL = `
	SELECT id, library_id, category_id, file_path, file_size, file_mtime,
	       media_type, duration_seconds, codec_info, metadata, last_seen_generation, deleted_at, created_at
	FROM media_item`

func scanMediaItem(row rowScanner) (*MediaItem, error) {
	var m MediaItem
	var categoryID sql.NullInt64
	var fileMTime, createdAt string
	var deletedAt sql.NullString
	if err := row.Scan(
		&m.ID, &m.LibraryID, &categoryID, &m.FilePath, &m.FileSize, &fileMTime,
		&m.MediaType, &m.DurationSeconds, &m.CodecInfo, &m.Metadata, &m.LastSeenGeneration, &deletedAt, &createdAt,
	); err != nil {
		return nil, err
	}
	if categoryID.Valid {
		v := categoryID.Int64
		m.CategoryID = &v
	}
	if t, err := time.Parse(time.RFC3339, fileMTime); err == nil {
		m.FileMTime = t
	}
	if t, err := time.Parse("2006-01-02 15:04:05", createdAt); err == nil {
		m.CreatedAt = t
	}
	if deletedAt.Valid {
		if t, err := time.Parse(time.RFC3339, deletedAt.String); err == nil {
			m.DeletedAt = &t
		}
	}
	return &m, nil
}
