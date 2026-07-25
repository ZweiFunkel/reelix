// Package mail sends transactional email (currently just password-reset
// codes) via SMTP. Self-hosted installs without SMTP configured get the
// code logged to the server console instead — account recovery must
// stay possible even with zero external dependencies configured.
package mail

import (
	"fmt"
	"log"
	"net/smtp"

	"github.com/novex-labs/reelix/server/internal/config"
)

type Sender struct {
	cfg config.Config
}

func NewSender(cfg config.Config) *Sender {
	return &Sender{cfg: cfg}
}

func (s *Sender) Send(to, subject, body string) error {
	if s.cfg.SMTPHost == "" {
		log.Printf("reelix: SMTP not configured, logging email instead — to=%s subject=%q body=%q", to, subject, body)
		return nil
	}

	addr := fmt.Sprintf("%s:%d", s.cfg.SMTPHost, s.cfg.SMTPPort)
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s\r\n", s.cfg.SMTPFrom, to, subject, body)

	var auth smtp.Auth
	if s.cfg.SMTPUsername != "" {
		auth = smtp.PlainAuth("", s.cfg.SMTPUsername, s.cfg.SMTPPassword, s.cfg.SMTPHost)
	}

	return smtp.SendMail(addr, auth, s.cfg.SMTPFrom, []string{to}, []byte(msg))
}
