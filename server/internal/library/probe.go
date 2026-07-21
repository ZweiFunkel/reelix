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
