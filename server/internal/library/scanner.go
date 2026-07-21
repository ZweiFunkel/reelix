package library

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"path/filepath"
	"time"

	"github.com/novex-labs/reelix/server/internal/db"
	"github.com/novex-labs/reelix/server/internal/m3u"
)

type Scanner struct {
	libraries     *db.LibraryStore
	categories    *db.CategoryStore
	items         *db.MediaItemStore
	channels      *db.ChannelStore
	thumbnailsDir string
}

func NewScanner(libraries *db.LibraryStore, categories *db.CategoryStore, items *db.MediaItemStore, channels *db.ChannelStore, thumbnailsDir string) *Scanner {
	return &Scanner{libraries: libraries, categories: categories, items: items, channels: channels, thumbnailsDir: thumbnailsDir}
}

// Scan walks a FOLDER library's root path depth-first, mirroring the
// on-disk tree into Category rows and every allowlisted file into a
// MediaItem, then removes anything left over from a previous scan that
// no longer exists. See plan §4.
func (s *Scanner) Scan(ctx context.Context, lib *db.Library) error {
	generation, err := s.libraries.BeginScan(ctx, lib.ID)
	if err != nil {
		return fmt.Errorf("begin scan: %w", err)
	}

	categoryIDs := map[string]int64{} // relative dir path -> category id

	walkErr := filepath.WalkDir(lib.RootPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			log.Printf("reelix: scan %s: %v", path, err)
			return nil // skip unreadable entries rather than aborting the whole scan
		}

		rel, err := filepath.Rel(lib.RootPath, path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)

		if d.IsDir() {
			if rel == "." {
				return nil // the library root itself is not a category
			}
			cat, err := s.categories.Upsert(ctx, lib.ID, parentIDOf(categoryIDs, rel), d.Name(), rel, generation)
			if err != nil {
				return fmt.Errorf("upsert category %s: %w", rel, err)
			}
			categoryIDs[rel] = cat.ID
			return nil
		}

		if !isAllowedExtension(lib.Type, path) {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			log.Printf("reelix: stat %s: %v", path, err)
			return nil
		}

		if err := s.upsertFile(ctx, lib, path, rel, info, parentIDOf(categoryIDs, rel), generation); err != nil {
			log.Printf("reelix: index %s: %v", path, err)
		}
		return nil
	})
	if walkErr != nil {
		return fmt.Errorf("walk %s: %w", lib.RootPath, walkErr)
	}

	if err := s.categories.DeleteStale(ctx, lib.ID, generation); err != nil {
		return fmt.Errorf("delete stale categories: %w", err)
	}
	if err := s.items.DeleteStale(ctx, lib.ID, generation, time.Now()); err != nil {
		return fmt.Errorf("delete stale media items: %w", err)
	}
	return s.libraries.FinishScan(ctx, lib.ID, time.Now())
}

func parentIDOf(categoryIDs map[string]int64, relPath string) *int64 {
	parentRel := filepath.ToSlash(filepath.Dir(relPath))
	if parentRel == "." {
		return nil
	}
	if id, ok := categoryIDs[parentRel]; ok {
		return &id
	}
	return nil
}

func (s *Scanner) upsertFile(ctx context.Context, lib *db.Library, absPath, relPath string, info fs.FileInfo, categoryID *int64, generation int64) error {
	existing, err := s.items.GetByPath(ctx, lib.ID, relPath)
	if err != nil {
		return err
	}

	if existing != nil && existing.FileSize == info.Size() && existing.FileMTime.Unix() == info.ModTime().Unix() {
		// Unchanged since the last scan — just touch the generation stamp.
		_, err := s.items.Upsert(ctx, db.UpsertMediaItemParams{
			LibraryID: lib.ID, CategoryID: categoryID, FilePath: relPath,
			FileSize: existing.FileSize, FileMTime: existing.FileMTime, MediaType: existing.MediaType,
			DurationSeconds: existing.DurationSeconds, CodecInfo: existing.CodecInfo, Metadata: existing.Metadata,
			Generation: generation,
		})
		return err
	}

	if existing == nil {
		if candidate, err := s.items.FindMoveCandidate(ctx, lib.ID, generation, info.Size()); err == nil && candidate != nil {
			return s.items.MoveTo(ctx, candidate.ID, relPath, categoryID, info.ModTime(), generation)
		}
	}

	if lib.Type == "PHOTO" {
		return s.upsertPhoto(ctx, lib, absPath, relPath, info, categoryID, generation)
	}
	return s.upsertVideo(ctx, lib, absPath, relPath, info, categoryID, generation)
}

func (s *Scanner) upsertVideo(ctx context.Context, lib *db.Library, absPath, relPath string, info fs.FileInfo, categoryID *int64, generation int64) error {
	duration, codec := probe(absPath)
	_, err := s.items.Upsert(ctx, db.UpsertMediaItemParams{
		LibraryID: lib.ID, CategoryID: categoryID, FilePath: relPath,
		FileSize: info.Size(), FileMTime: info.ModTime(), MediaType: "video",
		DurationSeconds: duration, CodecInfo: codec, Generation: generation,
	})
	return err
}

func (s *Scanner) upsertPhoto(ctx context.Context, lib *db.Library, absPath, relPath string, info fs.FileInfo, categoryID *int64, generation int64) error {
	item, err := s.items.Upsert(ctx, db.UpsertMediaItemParams{
		LibraryID: lib.ID, CategoryID: categoryID, FilePath: relPath,
		FileSize: info.Size(), FileMTime: info.ModTime(), MediaType: "photo",
		Metadata: extractPhotoMetadata(absPath), Generation: generation,
	})
	if err != nil {
		return err
	}

	if s.thumbnailsDir == "" {
		return nil
	}
	dest := filepath.Join(s.thumbnailsDir, fmt.Sprintf("%d.jpg", item.ID))
	if err := generateThumbnail(absPath, dest); err != nil {
		log.Printf("reelix: no thumbnail for %s: %v", relPath, err)
	}
	return nil
}

// ScanM3U fetches and parses an M3U/M3U8 playlist (local file or HTTP
// URL) and upserts one Channel per entry, grouping by group-title into
// synthetic Categories so the browse API doesn't need to distinguish
// file- from playlist-sourced content. See plan §4.
func (s *Scanner) ScanM3U(ctx context.Context, lib *db.Library) error {
	generation, err := s.libraries.BeginScan(ctx, lib.ID)
	if err != nil {
		return fmt.Errorf("begin scan: %w", err)
	}

	rc, err := m3u.Open(ctx, lib.RootPath)
	if err != nil {
		return fmt.Errorf("open playlist: %w", err)
	}
	defer rc.Close()

	entries, err := m3u.Parse(rc)
	if err != nil {
		return fmt.Errorf("parse playlist: %w", err)
	}

	categoryIDs := map[string]int64{}
	for i, e := range entries {
		var categoryID *int64
		if e.GroupTitle != "" {
			if id, ok := categoryIDs[e.GroupTitle]; ok {
				categoryID = &id
			} else {
				cat, err := s.categories.Upsert(ctx, lib.ID, nil, e.GroupTitle, e.GroupTitle, generation)
				if err != nil {
					return fmt.Errorf("upsert category %s: %w", e.GroupTitle, err)
				}
				categoryIDs[e.GroupTitle] = cat.ID
				categoryID = &cat.ID
			}
		}

		if _, err := s.channels.Upsert(ctx, db.UpsertChannelParams{
			LibraryID: lib.ID, CategoryID: categoryID, Name: e.Name, GroupTitle: e.GroupTitle,
			StreamURL: e.StreamURL, TVGID: e.TVGID, TVGLogo: e.TVGLogo, SortOrder: i, Generation: generation,
		}); err != nil {
			log.Printf("reelix: index channel %s: %v", e.Name, err)
		}
	}

	if err := s.categories.DeleteStale(ctx, lib.ID, generation); err != nil {
		return fmt.Errorf("delete stale categories: %w", err)
	}
	if err := s.channels.DeleteStale(ctx, lib.ID, generation, time.Now()); err != nil {
		return fmt.Errorf("delete stale channels: %w", err)
	}
	return s.libraries.FinishScan(ctx, lib.ID, time.Now())
}
