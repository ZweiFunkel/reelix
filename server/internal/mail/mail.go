// Package mail sends transactional email (currently just password-reset
// and email-verification codes) via SMTP. Self-hosted installs without
// SMTP configured get the code logged to the server console instead —
// account recovery must stay possible even with zero external
// dependencies configured.
package mail

import (
	"context"
	"fmt"
	"log"
	"net/smtp"

	"github.com/novex-labs/reelix/server/internal/config"
	"github.com/novex-labs/reelix/server/internal/db"
)

type Sender struct {
	cfg      config.Config
	settings *db.SMTPSettingsStore
}

func NewSender(cfg config.Config, settings *db.SMTPSettingsStore) *Sender {
	return &Sender{cfg: cfg, settings: settings}
}

// resolve prefers SMTP settings saved via the admin UI over the
// REELIX_SMTP_* env vars, so an admin who'd rather not touch the
// server's environment/compose file at all can configure mail entirely
// from the browser. The env vars remain the default/fallback so
// existing docker-compose-only setups keep working unchanged.
func (s *Sender) resolve(ctx context.Context) (host string, port int, username, password, from string) {
	if stored, err := s.settings.Get(ctx); err == nil && stored != nil && stored.Host != "" {
		return stored.Host, stored.Port, stored.Username, stored.Password, stored.FromAddress
	}
	return s.cfg.SMTPHost, s.cfg.SMTPPort, s.cfg.SMTPUsername, s.cfg.SMTPPassword, s.cfg.SMTPFrom
}

func (s *Sender) Send(ctx context.Context, to, subject, body string) error {
	host, port, username, password, from := s.resolve(ctx)
	if host == "" {
		log.Printf("reelix: SMTP not configured, logging email instead — to=%s subject=%q body=%q", to, subject, body)
		return nil
	}

	addr := fmt.Sprintf("%s:%d", host, port)
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s\r\n", from, to, subject, body)

	var auth smtp.Auth
	if username != "" {
		auth = smtp.PlainAuth("", username, password, host)
	}

	return smtp.SendMail(addr, auth, from, []string{to}, []byte(msg))
}
