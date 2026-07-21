package db

import (
	"context"
	"database/sql"
)

type CategoryStore struct {
	db *sql.DB
}

func NewCategoryStore(dbConn *sql.DB) *CategoryStore {
	return &CategoryStore{db: dbConn}
}

// Upsert creates or updates the category at (libraryID, path), stamping it
// with the current scan generation so untouched categories can be detected
// as stale once the walk finishes.
func (s *CategoryStore) Upsert(ctx context.Context, libraryID int64, parentCategoryID *int64, name, path string, generation int64) (*Category, error) {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO category (library_id, parent_category_id, name, path, last_seen_generation)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (library_id, path) DO UPDATE SET
			parent_category_id = excluded.parent_category_id,
			name = excluded.name,
			last_seen_generation = excluded.last_seen_generation
	`, libraryID, parentCategoryID, name, path, generation)
	if err != nil {
		return nil, err
	}
	return s.GetByPath(ctx, libraryID, path)
}

func (s *CategoryStore) GetByPath(ctx context.Context, libraryID int64, path string) (*Category, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, library_id, parent_category_id, name, path, sort_order, last_seen_generation
		FROM category WHERE library_id = ? AND path = ?`, libraryID, path)
	return scanCategory(row)
}

func (s *CategoryStore) Get(ctx context.Context, id int64) (*Category, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, library_id, parent_category_id, name, path, sort_order, last_seen_generation
		FROM category WHERE id = ?`, id)
	return scanCategory(row)
}

// Children returns the direct subcategories of parentCategoryID, or the
// root categories of a library when parentCategoryID is nil.
func (s *CategoryStore) Children(ctx context.Context, libraryID int64, parentCategoryID *int64) ([]Category, error) {
	var rows *sql.Rows
	var err error
	if parentCategoryID == nil {
		rows, err = s.db.QueryContext(ctx, `
			SELECT id, library_id, parent_category_id, name, path, sort_order, last_seen_generation
			FROM category WHERE library_id = ? AND parent_category_id IS NULL
			ORDER BY sort_order, name`, libraryID)
	} else {
		rows, err = s.db.QueryContext(ctx, `
			SELECT id, library_id, parent_category_id, name, path, sort_order, last_seen_generation
			FROM category WHERE parent_category_id = ?
			ORDER BY sort_order, name`, *parentCategoryID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Category
	for rows.Next() {
		c, err := scanCategory(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

// DeleteStale removes categories not touched by the current scan
// generation. ON DELETE CASCADE/SET NULL on child rows is defined in the
// schema, so this is safe even if items still reference them.
func (s *CategoryStore) DeleteStale(ctx context.Context, libraryID, currentGeneration int64) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM category WHERE library_id = ? AND last_seen_generation < ?`,
		libraryID, currentGeneration)
	return err
}

func scanCategory(row rowScanner) (*Category, error) {
	var c Category
	var parentID sql.NullInt64
	if err := row.Scan(&c.ID, &c.LibraryID, &parentID, &c.Name, &c.Path, &c.SortOrder, &c.LastSeenGeneration); err != nil {
		return nil, err
	}
	if parentID.Valid {
		v := parentID.Int64
		c.ParentCategoryID = &v
	}
	return &c, nil
}
