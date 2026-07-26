import { isTauri } from './platform'

// The HTML5 Fullscreen API only makes an element fill its current
// viewport — inside a Tauri window that's still whatever size the OS
// window happens to be, so clicking "fullscreen" visibly did nothing.
// Actually maximizing the window needs Tauri's own window API instead.
export async function toggleAppFullscreen(el: HTMLElement | null): Promise<void> {
  if (isTauri()) {
    try {
      const tauriWindow = (window as any).__TAURI__?.window
      if (!tauriWindow) throw new Error('window.__TAURI__.window is not available')
      const win = tauriWindow.getCurrentWindow()
      const isFullscreen = await win.isFullscreen()
      await win.setFullscreen(!isFullscreen)
    } catch (err) {
      console.error('reelix: toggleAppFullscreen (Tauri) failed', err)
    }
    return
  }
  if (document.fullscreenElement) await document.exitFullscreen()
  else await el?.requestFullscreen()
}
