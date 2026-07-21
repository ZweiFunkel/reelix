//go:build windows

package stream

import "os/exec"

// setProcAttrs is a no-op on Windows (dev-only target for this project —
// production runs in the Linux container); canceling the command's
// context is sufficient to terminate ffmpeg here.
func setProcAttrs(cmd *exec.Cmd) {}
