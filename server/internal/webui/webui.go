// Package webui embeds the built web frontend (web/dist, copied here at
// build time) so the Go binary can serve it directly with no separate
// frontend container or process — see plan §7.
package webui

import "embed"

//go:embed dist
var DistFS embed.FS
