// Package stream manages on-demand ffmpeg transcode sessions for media
// that can't be direct-played. See plan §5.
package stream

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

// tailWriter keeps only the last maxLen bytes written to it — enough to
// see ffmpeg's actual error when it dies partway through a transcode
// (previously silently swallowed), without holding a whole session's
// worth of ffmpeg log output in memory.
type tailWriter struct {
	mu     sync.Mutex
	buf    []byte
	maxLen int
}

func newTailWriter(maxLen int) *tailWriter {
	return &tailWriter{maxLen: maxLen}
}

func (w *tailWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.buf = append(w.buf, p...)
	if len(w.buf) > w.maxLen {
		w.buf = w.buf[len(w.buf)-w.maxLen:]
	}
	return len(p), nil
}

func (w *tailWriter) String() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return string(w.buf)
}

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

// browserCompatibleVideoCodecs are codecs a browser's <video> element can
// decode directly — for these, ffmpeg only needs to remux into HLS
// segments (-c:v copy), not re-encode. Re-encoding H.264 into H.264 was
// the actual cause of playback stalling partway through a file: a full
// x264 encode at "veryfast" is still far slower than realtime on modest
// hardware, so the player runs out of buffered segments and stalls
// waiting for ffmpeg to catch up — which looks like "the video just
// stops" a few minutes in, with no error anywhere. Stream-copying the
// (already-compatible) video is close to free, so this is the common
// case for typical h264-in-mkv scene releases.
var browserCompatibleVideoCodecs = map[string]bool{"h264": true, "vp8": true, "vp9": true, "av1": true}

// StartSession spawns ffmpeg transcoding sourcePath to HLS if a session
// with this ID isn't already running, otherwise returns the existing
// one. videoCodec (ffprobe's codec name, e.g. "h264") decides whether
// the video stream is copied as-is or re-encoded; audio is always
// transcoded to AAC since that's cheap regardless of the source codec.
func (m *Manager) StartSession(sessionID, sourcePath, videoCodec string) (*Session, error) {
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
	videoArgs := []string{"-c:v", "libx264", "-preset", "veryfast"}
	if browserCompatibleVideoCodecs[videoCodec] {
		videoArgs = []string{"-c:v", "copy"}
	}

	// hls_list_size 0 keeps every segment in the playlist and on disk —
	// this is on-demand VOD transcoding, not a live stream, so segments
	// must stick around for as long as the viewer might still seek back
	// to them. (An earlier version used delete_segments, a live-stream
	// setting: it silently deleted each segment once ffmpeg's default
	// 5-segment/20s rolling window passed it, which is why playback used
	// to cut out after ~20s regardless of the file's real length.)
	args := append([]string{"-y", "-i", sourcePath}, videoArgs...)
	args = append(args,
		"-c:a", "aac",
		"-f", "hls", "-hls_time", "4", "-hls_list_size", "0", "-hls_flags", "append_list",
		playlistPath,
	)
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	setProcAttrs(cmd)
	stderr := newTailWriter(8 << 10) // last 8KB — plenty for ffmpeg's actual error
	cmd.Stderr = stderr

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
		// A session the reaper already cleaned up (ctx canceled, e.g. the
		// viewer closed the player) exits with a context-canceled error
		// that's expected, not a real failure — only the unexpected case
		// is worth logging loudly.
		if err := cmd.Wait(); err != nil && ctx.Err() == nil {
			log.Printf("reelix: ffmpeg transcode %q exited unexpectedly: %v\n--- ffmpeg stderr (tail) ---\n%s", sessionID, err, stderr.String())
		}
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
