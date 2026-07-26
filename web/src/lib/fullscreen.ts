import { isTauri } from './platform'

// The HTML5 Fullscreen API only makes an element fill its current
// viewport — inside a Tauri window that's still whatever size the OS
// window happens to be, so clicking "fullscreen" visibly did nothing.
// Actually maximizing the window needs Tauri's own window API instead.
export async function toggleAppFullscreen(el: HTMLElement | null): Promise<void> {
  if (isTauri()) {
    const win = (window as any).__TAURI__.window.getCurrentWindow()
    const isFullscreen = await win.isFullscreen()
    await win.setFullscreen(!isFullscreen)
    return
  }
  if (document.fullscreenElement) await document.exitFullscreen()
  else await el?.requestFullscreen()
}
