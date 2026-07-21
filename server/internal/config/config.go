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
}

func Load() Config {
	return Config{
		HTTPAddr:                envOr("REELIX_HTTP_ADDR", ":8096"),
		DataDir:                 envOr("REELIX_DATA_DIR", "/config"),
		TranscodeDir:            envOr("REELIX_TRANSCODE_DIR", "/transcode"),
		MaxConcurrentTranscodes: envIntOr("REELIX_MAX_CONCURRENT_TRANSCODES", 2),
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
