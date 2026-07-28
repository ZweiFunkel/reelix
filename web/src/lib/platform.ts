// The web build is shared across three shells: plain browser (served
// directly by the Reelix server, same-origin API calls), Tauri desktop,
// and Capacitor Android. The native shells load this bundle from a local
// asset origin, not from the user's Reelix server, so API calls need an
// explicit, user-configured server URL instead of a relative path.
//
// Native shells hold a *list* of servers rather than one, so someone can
// keep their own server and, say, a friend's side by side and switch
// between them. Each entry carries its own session token, since they're
// separate installs with separate accounts — logging into one must not
// disturb the other.

const SERVERS_KEY = 'reelix.servers'
const ACTIVE_SERVER_KEY = 'reelix.activeServerId'

// Pre-multi-server keys, read once for migration (see loadServers) so an
// existing install doesn't land on the connect screen after updating.
const LEGACY_SERVER_URL_KEY = 'reelix.serverUrl'
const LEGACY_SESSION_TOKEN_KEY = 'reelix.sessionToken'

export type ServerEntry = {
  id: string
  url: string
  label: string
  sessionToken: string | null
}

export function isNativeShell(): boolean {
  return typeof window !== 'undefined' && (!!(window as any).__TAURI__ || !!(window as any).Capacitor?.isNativePlatform?.())
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI__
}

export function isCapacitorNative(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
}

export function normalizeServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '')
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
}

// A readable default name so the switcher doesn't just list raw URLs —
// "192.168.1.50:8096" is more recognizable than the full address, and
// the user can rename it anyway.
export function defaultServerLabel(url: string): string {
  try {
    const parsed = new URL(normalizeServerUrl(url))
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname
  } catch {
    return url
  }
}

function persist(servers: ServerEntry[]) {
  localStorage.setItem(SERVERS_KEY, JSON.stringify(servers))
}

export function listServers(): ServerEntry[] {
  const raw = localStorage.getItem(SERVERS_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as ServerEntry[]
    } catch {
      // Corrupt entry — fall through and start over rather than
      // stranding the app on a parse error it can't recover from.
    }
  }

  // Migrate a pre-multi-server install: one URL, one token.
  const legacyUrl = localStorage.getItem(LEGACY_SERVER_URL_KEY)
  if (legacyUrl) {
    const migrated: ServerEntry = {
      id: crypto.randomUUID(),
      url: legacyUrl,
      label: defaultServerLabel(legacyUrl),
      sessionToken: localStorage.getItem(LEGACY_SESSION_TOKEN_KEY),
    }
    persist([migrated])
    localStorage.setItem(ACTIVE_SERVER_KEY, migrated.id)
    localStorage.removeItem(LEGACY_SERVER_URL_KEY)
    localStorage.removeItem(LEGACY_SESSION_TOKEN_KEY)
    return [migrated]
  }

  return []
}

export function getActiveServer(): ServerEntry | null {
  const servers = listServers()
  if (servers.length === 0) return null
  const activeId = localStorage.getItem(ACTIVE_SERVER_KEY)
  return servers.find((s) => s.id === activeId) ?? servers[0]
}

export function setActiveServer(id: string) {
  localStorage.setItem(ACTIVE_SERVER_KEY, id)
}

// Adds a server, or re-selects the existing entry if that URL is already
// known — reconnecting to a server you already have shouldn't silently
// create a duplicate with its own separate login.
export function addServer(url: string, label?: string): ServerEntry {
  const normalized = normalizeServerUrl(url)
  const servers = listServers()

  const existing = servers.find((s) => s.url === normalized)
  if (existing) {
    setActiveServer(existing.id)
    return existing
  }

  const entry: ServerEntry = {
    id: crypto.randomUUID(),
    url: normalized,
    label: label?.trim() || defaultServerLabel(normalized),
    sessionToken: null,
  }
  persist([...servers, entry])
  setActiveServer(entry.id)
  return entry
}

export function removeServer(id: string) {
  const remaining = listServers().filter((s) => s.id !== id)
  persist(remaining)
  if (localStorage.getItem(ACTIVE_SERVER_KEY) === id) {
    if (remaining.length > 0) setActiveServer(remaining[0].id)
    else localStorage.removeItem(ACTIVE_SERVER_KEY)
  }
}

export function renameServer(id: string, label: string) {
  persist(listServers().map((s) => (s.id === id ? { ...s, label: label.trim() || s.label } : s)))
}

export function getServerUrl(): string | null {
  return getActiveServer()?.url ?? null
}

// Drops the active server entirely — used by "change server", where the
// point is to stop using this one, not just forget its login.
export function clearServerUrl() {
  const active = getActiveServer()
  if (active) removeServer(active.id)
}

// Native shells authenticate with a bearer token instead of the session
// cookie: they call the server cross-site from their own origin, and a
// cross-site cookie requires SameSite=None + Secure (HTTPS), which a
// self-hosted server on a LAN IP usually can't offer. The server accepts
// either transport for the same session id — see SessionIDFromRequest.
// Browsers keep using the cookie and never store a token here.
//
// The token is per server entry, so switching servers switches identity
// with it and neither login invalidates the other.
export function getSessionToken(): string | null {
  return getActiveServer()?.sessionToken ?? null
}

export function setSessionToken(token: string) {
  const active = getActiveServer()
  if (!active) return
  persist(listServers().map((s) => (s.id === active.id ? { ...s, sessionToken: token } : s)))
}

export function clearSessionToken() {
  const active = getActiveServer()
  if (!active) return
  persist(listServers().map((s) => (s.id === active.id ? { ...s, sessionToken: null } : s)))
}
