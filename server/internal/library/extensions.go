package library

import (
	"path/filepath"
	"strings"
)

var videoExtensions = map[string]bool{
	".mp4": true, ".mkv": true, ".avi": true, ".mov": true, ".webm": true,
	".m4v": true, ".ts": true, ".wmv": true, ".flv": true, ".mpg": true, ".mpeg": true,
}

// photoExtensions is intentionally broader than what generateThumbnail can
// actually decode (e.g. HEIC has no pure-Go decoder) — undecodable photos
// still get indexed and playable via direct file serving, just without a
// thumbnail, rather than being invisible to the library.
var photoExtensions = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true,
	".bmp": true, ".tif": true, ".tiff": true, ".heic": true, ".heif": true,
}

// isAllowedExtension gates the scanner to files it knows how to handle
// for a given library type. M3U libraries don't walk a filesystem at all.
func isAllowedExtension(libraryType, path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	switch libraryType {
	case "FOLDER":
		return videoExtensions[ext]
	case "PHOTO":
		return photoExtensions[ext]
	default:
		return false
	}
}
