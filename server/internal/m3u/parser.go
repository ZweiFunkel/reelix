// Package m3u parses M3U/M3U8 IPTV playlists into channel entries.
package m3u

import (
	"bufio"
	"io"
	"regexp"
	"strings"
)

type Entry struct {
	Name       string
	GroupTitle string
	StreamURL  string
	TVGID      string
	TVGLogo    string
}

var attrPattern = regexp.MustCompile(`([\w-]+)="([^"]*)"`)

// Parse reads an M3U/M3U8 playlist and returns its channel entries. Lines
// it doesn't recognize (comments, directives other than #EXTINF, blank
// lines) are skipped rather than treated as errors — IPTV playlists in
// the wild are rarely perfectly well-formed.
func Parse(r io.Reader) ([]Entry, error) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var entries []Entry
	var pending *Entry

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "#EXTINF:") {
			pending = parseExtinf(line)
			continue
		}

		if strings.HasPrefix(line, "#") {
			continue
		}

		// A non-comment line following a pending #EXTINF is its stream URL.
		if pending != nil {
			pending.StreamURL = line
			entries = append(entries, *pending)
			pending = nil
		}
	}
	return entries, scanner.Err()
}

func parseExtinf(line string) *Entry {
	rest := strings.TrimPrefix(line, "#EXTINF:")

	name := rest
	if idx := strings.LastIndex(rest, ","); idx != -1 {
		name = strings.TrimSpace(rest[idx+1:])
		rest = rest[:idx]
	}

	e := &Entry{Name: name}
	for _, m := range attrPattern.FindAllStringSubmatch(rest, -1) {
		switch strings.ToLower(m[1]) {
		case "group-title":
			e.GroupTitle = m[2]
		case "tvg-id":
			e.TVGID = m[2]
		case "tvg-logo":
			e.TVGLogo = m[2]
		}
	}
	return e
}
