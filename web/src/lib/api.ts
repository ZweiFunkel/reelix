import createClient from "openapi-fetch";
import type { paths } from "./api-types";
import { getServerUrl, isNativeShell } from "./platform";

// In a browser hitting the server directly, the frontend and API share
// an origin, so relative paths (baseUrl "") just work. In Tauri/Capacitor
// the bundled frontend loads from a local asset origin instead, so it
// needs the user-configured remote server's absolute URL, and cookies
// must be explicitly requested since they're no longer same-origin.
export const api = createClient<paths>({
  baseUrl: isNativeShell() ? getServerUrl() ?? "" : "",
  credentials: isNativeShell() ? "include" : "same-origin",
});

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
