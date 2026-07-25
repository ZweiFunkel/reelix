package config

import (
	"os"
	"strconv"
)

type Config struct {
	// HTTPAddr is the address the server listens on, e.g. ":8096".
	HTTPAddr string
	// DataDir holds the SQLite database file and other persisted state.
	DataDir string
	// TranscodeDir holds scratch HLS output for in-progress transcode sessions.
	TranscodeDir string
	// MaxConcurrentTranscodes caps simultaneous ffmpeg sessions.
	MaxConcurrentTranscodes int

	// SMTP settings for password-reset emails. SMTPHost empty means
	// email sending is disabled — reset codes are logged to the server
	// console instead, so self-hosters without SMTP configured aren't
	// silently locked out of the feature.
	SMTPHost     string
	SMTPPort     int
	SMTPUsername string
	SMTPPassword string
	SMTPFrom     string
}

func Load() Config {
	return Config{
		HTTPAddr:                envOr("REELIX_HTTP_ADDR", ":8096"),
		DataDir:                 envOr("REELIX_DATA_DIR", "/config"),
		TranscodeDir:            envOr("REELIX_TRANSCODE_DIR", "/transcode"),
		MaxConcurrentTranscodes: envIntOr("REELIX_MAX_CONCURRENT_TRANSCODES", 2),
		SMTPHost:                envOr("REELIX_SMTP_HOST", ""),
		SMTPPort:                envIntOr("REELIX_SMTP_PORT", 587),
		SMTPUsername:            envOr("REELIX_SMTP_USERNAME", ""),
		SMTPPassword:            envOr("REELIX_SMTP_PASSWORD", ""),
		// Self-hosters should override this to an address on their own
		// SMTP account's domain — most providers reject or spam-flag
		// mail whose From doesn't match the authenticated sender domain.
		SMTPFrom: envOr("REELIX_SMTP_FROM", "noreply@reelix.com"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envIntOr(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}
