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

export type Enigma2Target = { host: string; serviceRef: string }

// A service ref is a run of colon-separated hex/decimal tokens, at
// least 5 of them (real refs have 10-11) — distinguishing it from a
// normal HLS/VOD path.
const SERVICE_REF_PATTERN = /^[0-9a-fA-F]+(:[0-9a-fA-F]*){4,}$/

export function parseEnigma2StreamUrl(streamUrl: string): Enigma2Target | null {
  let url: URL
  try {
    url = new URL(streamUrl)
  } catch {
    return null
  }
  const serviceRef = url.pathname.replace(/^\//, '')
  if (!SERVICE_REF_PATTERN.test(serviceRef)) return null
  return { host: url.hostname, serviceRef }
}

// Best-effort — the receiver is on the local network and typically has
// no CORS headers, so the response can't be read; `no-cors` avoids that
// turning into a thrown error since firing the request is all that's
// needed (Enigma2 doesn't require reading a response to act on it).
export async function zapEnigma2Channel(target: Enigma2Target): Promise<void> {
  const zapUrl = `http://${target.host}/web/zap?sRef=${encodeURIComponent(target.serviceRef)}`
  await fetch(zapUrl, { mode: 'no-cors' })
}
