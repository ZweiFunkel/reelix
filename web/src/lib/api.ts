import createClient from "openapi-fetch";
import type { paths } from "./api-types";
import { getServerUrl, getSessionToken, isNativeShell } from "./platform";

// In a browser hitting the server directly, the frontend and API share
// an origin, so relative paths (baseUrl "") just work. In Tauri/Capacitor
// the bundled frontend loads from a local asset origin instead, so it
// needs the user-configured remote server's absolute URL, and cookies
// must be explicitly requested since they're no longer same-origin.
//
// getServerUrl() is read fresh on every call rather than cached once at
// module load — the very first time a native shell connects to a
// server, this module has already been evaluated (with nothing in
// localStorage yet) before ServerConnectPage calls setServerUrl(), so a
// one-time baseUrl would stay "" for the rest of that session and send
// every request to the app's own local asset origin instead.
function currentBaseUrl(): string {
  return isNativeShell() ? getServerUrl() ?? "" : "";
}

// Native shells send the session as a bearer token, since their
// cross-site cookie can't be stored without HTTPS — see getSessionToken.
// Read per request for the same reason baseUrl is: the token doesn't
// exist yet when this module is first evaluated.
function authHeaders(): Record<string, string> {
  if (!isNativeShell()) return {}
  const token = getSessionToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const api = new Proxy({} as ReturnType<typeof createClient<paths>>, {
  get(_target, prop, receiver) {
    const client = createClient<paths>({
      baseUrl: currentBaseUrl(),
      credentials: isNativeShell() ? "include" : "same-origin",
      headers: authHeaders(),
    })
    return Reflect.get(client, prop, receiver)
  },
})

// openapi-fetch doesn't model multipart/form-data well, so file uploads
// go through a plain fetch call using the same base URL/credentials
// logic as the generated client above.
export function apiFetch(path: string, init: RequestInit) {
  return fetch(currentBaseUrl() + path, {
    credentials: isNativeShell() ? "include" : "same-origin",
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  })
}

// For URLs handed to a plain <video>/<img> element rather than fetched
// through api.GET/apiFetch — those elements make their own request for
// their src with no way to attach a custom header, so the same fix that
// works for api.ts (an Authorization header) doesn't reach them. This
// makes the URL itself absolute and carries the token as a query param
// instead, which the server also accepts (see SessionIDFromRequest).
// Skipping this for thumbnail/stream/photo URLs was the actual cause of
// "stream loads in the browser but not the desktop app" even after the
// bearer-token login fix: the token existed, nothing was sending it.
export function mediaUrl(path: string): string {
  const base = currentBaseUrl()
  if (!isNativeShell()) return path
  const token = getSessionToken()
  if (!token) return base + path
  const separator = path.includes("?") ? "&" : "?"
  return `${base}${path}${separator}token=${encodeURIComponent(token)}`
}

// The server's error responses are always `{ error: string }` (see
// writeError in the Go handlers) — openapi-fetch surfaces that raw JSON
// body as `error`, not an actual Error instance, so `.message` on it is
// always undefined. Route every API error through this to get a real,
// displayable Error.
export function unwrap<T>({ data, error }: { data?: T; error?: unknown }): T {
  if (error) {
    const message = typeof error === "object" && error !== null && "error" in error ? String((error as { error: unknown }).error) : "Request failed"
    throw new Error(message)
  }
  return data as T
}
