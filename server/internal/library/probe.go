package library

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
	"time"
)

type ffprobeOutput struct {
	Format struct {
		Duration string `json:"duration"`
	} `json:"format"`
	Streams []struct {
		CodecType string `json:"codec_type"`
		CodecName string `json:"codec_name"`
		Width     int    `json:"width"`
		Height    int    `json:"height"`
	} `json:"streams"`
}

// probe extracts duration and a short codec/resolution summary via
// ffprobe. A missing ffprobe binary or a probe failure degrades
// gracefully — the file still gets indexed, just without this metadata.
func probe(path string) (duration *float64, codecInfo *string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return nil, nil
	}

	var parsed ffprobeOutput
	if err := json.Unmarshal(out.Bytes(), &parsed); err != nil {
		return nil, nil
	}

	if d, err := strconv.ParseFloat(parsed.Format.Duration, 64); err == nil {
		duration = &d
	}

	for _, stream := range parsed.Streams {
		if stream.CodecType == "video" {
			info := fmt.Sprintf("%s %dx%d", stream.CodecName, stream.Width, stream.Height)
			codecInfo = &info
			break
		}
	}
	return duration, codecInfo
}

// generateVideoThumbnail grabs a single frame via ffmpeg and writes it as
// a JPEG to destPath — unlike photo thumbnails (decoded in pure Go),
// videos have no metadata-derived poster unless TMDb matched, so this is
// the fallback that makes every video tile show *something* in the
// browse grid. A missing ffmpeg binary or a grab failure degrades
// gracefully, same as probe() above.
func generateVideoThumbnail(srcPath, destPath string, duration *float64) error {
	seekAt := 5.0
	if duration != nil && *duration > 2 {
		if at := *duration * 0.1; at < *duration-1 {
			seekAt = at
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "ffmpeg",
		"-y", "-ss", strconv.FormatFloat(seekAt, 'f', 2, 64), "-i", srcPath,
		"-vframes", "1", "-vf", "scale=320:-1", "-q:v", "4", destPath,
	)
	return cmd.Run()
}
