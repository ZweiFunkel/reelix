package library

import (
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"os"
	"path/filepath"
	"time"

	"github.com/rwcarlsen/goexif/exif"
	"golang.org/x/image/draw"

	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/tiff"
	_ "golang.org/x/image/webp"
)

const thumbnailMaxDim = 480

type photoMetadata struct {
	TakenAt      *time.Time `json:"takenAt,omitempty"`
	CameraModel  string     `json:"cameraModel,omitempty"`
	GPSLatitude  *float64   `json:"gpsLatitude,omitempty"`
	GPSLongitude *float64   `json:"gpsLongitude,omitempty"`
}

// extractPhotoMetadata reads whatever EXIF is present; a missing or
// unparseable EXIF block just yields an empty metadata JSON blob rather
// than failing the scan for that file.
func extractPhotoMetadata(path string) string {
	meta := photoMetadata{}

	f, err := os.Open(path)
	if err == nil {
		defer f.Close()
		if x, err := exif.Decode(f); err == nil {
			if t, err := x.DateTime(); err == nil {
				meta.TakenAt = &t
			}
			if model, err := x.Get(exif.Model); err == nil {
				if s, err := model.StringVal(); err == nil {
					meta.CameraModel = s
				}
			}
			if lat, lng, err := x.LatLong(); err == nil {
				meta.GPSLatitude = &lat
				meta.GPSLongitude = &lng
			}
		}
	}

	b, err := json.Marshal(meta)
	if err != nil {
		return "{}"
	}
	return string(b)
}

// generateThumbnail decodes srcPath and writes a resized JPEG to
// destPath. Formats without a registered pure-Go decoder (HEIC/HEIF, some
// WebP variants) simply fail here — the caller treats that as "no
// thumbnail available", not a scan error.
func generateThumbnail(srcPath, destPath string) error {
	f, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer f.Close()

	src, _, err := image.Decode(f)
	if err != nil {
		return fmt.Errorf("decode: %w", err)
	}

	bounds := src.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	if w == 0 || h == 0 {
		return fmt.Errorf("empty image")
	}
	scale := float64(thumbnailMaxDim) / float64(max(w, h))
	if scale > 1 {
		scale = 1
	}
	dstW, dstH := int(float64(w)*scale), int(float64(h)*scale)
	if dstW < 1 {
		dstW = 1
	}
	if dstH < 1 {
		dstH = 1
	}

	dst := image.NewRGBA(image.Rect(0, 0, dstW, dstH))
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, bounds, draw.Over, nil)

	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return err
	}
	out, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer out.Close()

	return jpeg.Encode(out, dst, &jpeg.Options{Quality: 85})
}
