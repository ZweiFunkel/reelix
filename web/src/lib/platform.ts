// The web build is shared across three shells: plain browser (served
// directly by the Reelix server, same-origin API calls), Tauri desktop,
// and Capacitor Android. The native shells load this bundle from a local
// asset origin, not from the user's Reelix server, so API calls need an
// explicit, user-configured server URL instead of a relative path.

const SERVER_URL_KEY = 'reelix.serverUrl'

export function isNativeShell(): boolean {
  return typeof window !== 'undefined' && (!!(window as any).__TAURI__ || !!(window as any).Capacitor?.isNativePlatform?.())
}

export function getServerUrl(): string | null {
  return localStorage.getItem(SERVER_URL_KEY)
}

export function setServerUrl(url: string) {
  localStorage.setItem(SERVER_URL_KEY, url.replace(/\/+$/, ''))
}

export function clearServerUrl() {
  localStorage.removeItem(SERVER_URL_KEY)
}
