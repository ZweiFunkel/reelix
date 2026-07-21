package db

import (
	"context"
	"database/sql"
	"time"
)

type ChannelStore struct {
	db *sql.DB
}

func NewChannelStore(dbConn *sql.DB) *ChannelStore {
	return &ChannelStore{db: dbConn}
}

type UpsertChannelParams struct {
	LibraryID  int64
	CategoryID *int64
	Name       string
	GroupTitle string
	StreamURL  string
	TVGID      string
	TVGLogo    string
	SortOrder  int
	Generation int64
}

func (s *ChannelStore) Upsert(ctx context.Context, p UpsertChannelParams) (*Channel, error) {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO channel (library_id, category_id, name, group_title, stream_url, tvg_id, tvg_logo, sort_order, last_seen_generation, deleted_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
		ON CONFLICT (library_id, stream_url) DO UPDATE SET
			category_id = excluded.category_id,
			name = excluded.name,
			group_title = excluded.group_title,
			tvg_id = excluded.tvg_id,
			tvg_logo = excluded.tvg_logo,
			sort_order = excluded.sort_order,
			last_seen_generation = excluded.last_seen_generation,
			deleted_at = NULL
	`, p.LibraryID, p.CategoryID, p.Name, p.GroupTitle, p.StreamURL, p.TVGID, p.TVGLogo, p.SortOrder, p.Generation)
	if err != nil {
		return nil, err
	}
	return s.GetByURL(ctx, p.LibraryID, p.StreamURL)
}

func (s *ChannelStore) Get(ctx context.Context, id int64) (*Channel, error) {
	return scanChannel(s.db.QueryRowContext(ctx, selectChannelSQL+` WHERE id = ?`, id))
}

func (s *ChannelStore) GetByURL(ctx context.Context, libraryID int64, streamURL string) (*Channel, error) {
	return scanChannel(s.db.QueryRowContext(ctx, selectChannelSQL+` WHERE library_id = ? AND stream_url = ?`, libraryID, streamURL))
}

func (s *ChannelStore) ListByCategory(ctx context.Context, categoryID int64) ([]Channel, error) {
	rows, err := s.db.QueryContext(ctx, selectChannelSQL+` WHERE category_id = ? AND deleted_at IS NULL ORDER BY sort_order, name`, categoryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanChannelRows(rows)
}

func (s *ChannelStore) ListRootChannels(ctx context.Context, libraryID int64) ([]Channel, error) {
	rows, err := s.db.QueryContext(ctx, selectChannelSQL+` WHERE library_id = ? AND category_id IS NULL AND deleted_at IS NULL ORDER BY sort_order, name`, libraryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanChannelRows(rows)
}

func (s *ChannelStore) DeleteStale(ctx context.Context, libraryID, currentGeneration int64, deletedAt time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE channel SET deleted_at = ?
		WHERE library_id = ? AND last_seen_generation < ? AND deleted_at IS NULL`,
		deletedAt.UTC().Format(time.RFC3339), libraryID, currentGeneration)
	return err
}

const selectChannelSQL = `
	SELECT id, library_id, category_id, name, group_title, stream_url, tvg_id, tvg_logo, sort_order, last_seen_generation, deleted_at
	FROM channel`

func scanChannel(row rowScanner) (*Channel, error) {
	var c Channel
	var categoryID sql.NullInt64
	var groupTitle, tvgID, tvgLogo sql.NullString
	var deletedAt sql.NullString
	if err := row.Scan(&c.ID, &c.LibraryID, &categoryID, &c.Name, &groupTitle, &c.StreamURL, &tvgID, &tvgLogo, &c.SortOrder, &c.LastSeenGeneration, &deletedAt); err != nil {
		return nil, err
	}
	if categoryID.Valid {
		v := categoryID.Int64
		c.CategoryID = &v
	}
	c.GroupTitle = groupTitle.String
	c.TVGID = tvgID.String
	c.TVGLogo = tvgLogo.String
	if deletedAt.Valid {
		if t, err := time.Parse(time.RFC3339, deletedAt.String); err == nil {
			c.DeletedAt = &t
		}
	}
	return &c, nil
}

func scanChannelRows(rows *sql.Rows) ([]Channel, error) {
	var out []Channel
	for rows.Next() {
		c, err := scanChannel(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}
