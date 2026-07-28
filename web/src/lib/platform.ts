// The web build is shared across three shells: plain browser (served
// directly by the Reelix server, same-origin API calls), Tauri desktop,
// and Capacitor Android. The native shells load this bundle from a local
// asset origin, not from the user's Reelix server, so API calls need an
// explicit, user-configured server URL instead of a relative path.

const SERVER_URL_KEY = 'reelix.serverUrl'
const SESSION_TOKEN_KEY = 'reelix.sessionToken'

export function isNativeShell(): boolean {
  return typeof window !== 'undefined' && (!!(window as any).__TAURI__ || !!(window as any).Capacitor?.isNativePlatform?.())
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI__
}

export function isCapacitorNative(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
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

// Native shells authenticate with a bearer token instead of the session
// cookie: they call the server cross-site from their own origin, and a
// cross-site cookie requires SameSite=None + Secure (HTTPS), which a
// self-hosted server on a LAN IP usually can't offer. The server accepts
// either transport for the same session id — see SessionIDFromRequest.
// Browsers keep using the cookie and never store a token here.
export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY)
}

export function setSessionToken(token: string) {
  localStorage.setItem(SESSION_TOKEN_KEY, token)
}

export function clearSessionToken() {
  localStorage.removeItem(SESSION_TOKEN_KEY)
}
