//go:build !windows

package stream

import (
	"os/exec"
	"syscall"
)

// setProcAttrs puts ffmpeg in its own process group so canceling the
// session can kill any child processes it spawns, not just the direct
// child. Not meaningful on Windows, see procattrs_windows.go.
func setProcAttrs(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}
