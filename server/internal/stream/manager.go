// Package stream manages on-demand ffmpeg transcode sessions for media
// that can't be direct-played. See plan §5.
package stream

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

type Session struct {
	ID           string
	OutputDir    string
	cmd          *exec.Cmd
	cancel       context.CancelFunc
	lastAccessed time.Time
}

type Manager struct {
	mu            sync.Mutex
	sessions      map[string]*Session
	scratchDir    string
	maxConcurrent int
	idleTimeout   time.Duration
}

func NewManager(scratchDir string, maxConcurrent int) *Manager {
	m := &Manager{
		sessions:      map[string]*Session{},
		scratchDir:    scratchDir,
		maxConcurrent: maxConcurrent,
		idleTimeout:   60 * time.Second,
	}
	go m.reapLoop()
	return m
}

// StartSession spawns ffmpeg transcoding sourcePath to HLS if a session
// with this ID isn't already running, otherwise returns the existing one.
func (m *Manager) StartSession(sessionID, sourcePath string) (*Session, error) {
	m.mu.Lock()
	if existing, ok := m.sessions[sessionID]; ok {
		existing.lastAccessed = time.Now()
		m.mu.Unlock()
		return existing, nil
	}
	if len(m.sessions) >= m.maxConcurrent {
		m.mu.Unlock()
		return nil, fmt.Errorf("server busy: max %d concurrent transcodes reached", m.maxConcurrent)
	}
	m.mu.Unlock()

	outputDir := filepath.Join(m.scratchDir, sessionID)
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return nil, fmt.Errorf("create scratch dir: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	playlistPath := filepath.Join(outputDir, "playlist.m3u8")
	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-y", "-i", sourcePath,
		"-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac",
		"-f", "hls", "-hls_time", "4", "-hls_flags", "delete_segments+append_list",
		playlistPath,
	)
	setProcAttrs(cmd)

	if err := cmd.Start(); err != nil {
		cancel()
		os.RemoveAll(outputDir)
		return nil, fmt.Errorf("start ffmpeg: %w", err)
	}

	sess := &Session{ID: sessionID, OutputDir: outputDir, cmd: cmd, cancel: cancel, lastAccessed: time.Now()}

	m.mu.Lock()
	m.sessions[sessionID] = sess
	m.mu.Unlock()

	go func() {
		_ = cmd.Wait()
	}()

	return sess, nil
}

func (m *Manager) Touch(sessionID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessions[sessionID]; ok {
		s.lastAccessed = time.Now()
	}
}

func (m *Manager) OutputDir(sessionID string) string {
	return filepath.Join(m.scratchDir, sessionID)
}

func (m *Manager) reapLoop() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		m.mu.Lock()
		for id, s := range m.sessions {
			if time.Since(s.lastAccessed) > m.idleTimeout {
				s.cancel()
				os.RemoveAll(s.OutputDir)
				delete(m.sessions, id)
			}
		}
		m.mu.Unlock()
	}
}
