// Enigma2/Dreambox-style receivers (OpenWebIF) expose their live stream
// on a fixed port (usually 8001) at a URL that's just the tuned
// channel's service reference — e.g.
// http://192.168.1.50:8001/1:0:19:283D:3FB:1:C00000:0:0:0:
// The receiver only streams whatever it's currently tuned to, so
// opening that URL directly does nothing until the box is told to
// "zap" to that channel first, via OpenWebIF's own HTTP API
// (http://<host>/web/zap?sRef=<serviceRef>, default port 80). This
// detects that URL shape and fires the zap call before playback starts
// — see LocalPlayer's playback effect.
//
// Neither request can be read directly from the webview: the receiver
// sends no CORS headers, so a cross-origin fetch/XHR to it gets its
// response body blocked by the browser even though the request itself
// reaches the box fine. Desktop routes both through the local proxy
// started in stream_proxy.rs (PROXY_PORT there must match here), which
// adds an Access-Control-Allow-Origin header we actually control.

import { isTauri } from './platform'

const PROXY_PORT = 47821

function viaLocalProxy(url: string): string {
  return `http://127.0.0.1:${PROXY_PORT}/proxy?url=${encodeURIComponent(url)}`
}

export type Enigma2Target = { host: string; serviceRef: string }

// A service ref is a run of colon-separated hex/decimal tokens — real
// refs have 10-11 fields, always ending in an empty field (i.e. a
// trailing colon), which a single regex kept tripping over: some
// receivers append the channel's display name as one more field after
// that trailing colon (e.g. "...:0:0:0:" + ":Sky Sports 1", which
// visually runs together as "...:0::Sky Sports 1"). Walking tokens by
// hand instead of trying to special-case "::" in a regex keeps the
// ref's own legitimate trailing colon intact while still dropping the
// name suffix.
const MIN_SERVICE_REF_FIELDS = 5

function isHexOrEmpty(token: string): boolean {
  return /^[0-9a-fA-F]*$/.test(token)
}

export function parseEnigma2StreamUrl(streamUrl: string): Enigma2Target | null {
  let url: URL
  try {
    url = new URL(streamUrl)
  } catch {
    return null
  }
  const rawPath = url.pathname.replace(/^\//, '')
  const tokens = rawPath.split(':')

  let fieldCount = 0
  while (fieldCount < tokens.length && isHexOrEmpty(tokens[fieldCount])) fieldCount++
  if (fieldCount < MIN_SERVICE_REF_FIELDS) return null

  return { host: url.hostname, serviceRef: tokens.slice(0, fieldCount).join(':') }
}

// Rewrites a receiver URL (stream or zap) to go through the local
// desktop proxy so its response is actually readable — on platforms
// without that proxy (Android, for now) this is a no-op and the
// request stays best-effort/unreadable (see zapEnigma2Channel below).
export function enigma2StreamSrc(streamUrl: string): string {
  return isTauri() ? viaLocalProxy(streamUrl) : streamUrl
}

export async function zapEnigma2Channel(target: Enigma2Target): Promise<void> {
  const zapUrl = `http://${target.host}/web/zap?sRef=${encodeURIComponent(target.serviceRef)}`
  if (isTauri()) {
    const res = await fetch(viaLocalProxy(zapUrl))
    if (!res.ok) throw new Error(`zap request failed: HTTP ${res.status}`)
    return
  }
  // Best-effort outside Tauri — no proxy to make the response
  // readable, so `no-cors` at least avoids the fetch itself throwing.
  await fetch(zapUrl, { mode: 'no-cors' })
}
