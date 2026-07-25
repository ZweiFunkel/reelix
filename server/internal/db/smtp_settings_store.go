package db

import (
	"context"
	"database/sql"
)

type SMTPSettingsStore struct {
	db *sql.DB
}

func NewSMTPSettingsStore(dbConn *sql.DB) *SMTPSettingsStore {
	return &SMTPSettingsStore{db: dbConn}
}

// Get returns nil (no error) if nothing has been configured via the
// admin UI yet — callers should fall back to the REELIX_SMTP_* env vars.
func (s *SMTPSettingsStore) Get(ctx context.Context) (*SMTPSettings, error) {
	row := s.db.QueryRowContext(ctx, `SELECT host, port, username, password, from_address FROM smtp_settings WHERE id = 1`)
	var cfg SMTPSettings
	if err := row.Scan(&cfg.Host, &cfg.Port, &cfg.Username, &cfg.Password, &cfg.FromAddress); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &cfg, nil
}

// Upsert replaces the stored config (single row). Passing an empty
// Password keeps whatever password is already stored — the admin UI
// never round-trips the real password back to the browser, so re-saving
// host/port/from without retyping the password must not blank it out.
func (s *SMTPSettingsStore) Upsert(ctx context.Context, cfg SMTPSettings) error {
	if cfg.Password == "" {
		if existing, err := s.Get(ctx); err == nil && existing != nil {
			cfg.Password = existing.Password
		}
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO smtp_settings (id, host, port, username, password, from_address)
		VALUES (1, ?, ?, ?, ?, ?)
		ON CONFLICT (id) DO UPDATE SET
			host = excluded.host,
			port = excluded.port,
			username = excluded.username,
			password = excluded.password,
			from_address = excluded.from_address
	`, cfg.Host, cfg.Port, cfg.Username, cfg.Password, cfg.FromAddress)
	return err
}
