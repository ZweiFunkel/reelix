// Client-side M3U/M3U8 parser shared by both native shells' local-only
// playlist feature (see nativeLocal.ts) — mirrors the parsing rules of
// server/internal/m3u/parser.go so a playlist behaves the same whether
// it's added to a Reelix library or imported locally with no server at
// all. Malformed/unrecognized lines are skipped rather than treated as
// errors, since real-world IPTV playlists are rarely well-formed.

export type M3UEntry = {
  name: string
  groupTitle: string
  streamUrl: string
  tvgId: string
  tvgLogo: string
}

const ATTR_PATTERN = /([\w-]+)="([^"]*)"/g

function parseExtinf(line: string): M3UEntry {
  const commaIndex = line.lastIndexOf(',')
  const attrsPart = commaIndex >= 0 ? line.slice(0, commaIndex) : line
  const name = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : ''

  const attrs: Record<string, string> = {}
  for (const match of attrsPart.matchAll(ATTR_PATTERN)) {
    attrs[match[1].toLowerCase()] = match[2]
  }

  return {
    name: name || 'Unnamed channel',
    groupTitle: attrs['group-title'] ?? '',
    tvgId: attrs['tvg-id'] ?? '',
    tvgLogo: attrs['tvg-logo'] ?? '',
    streamUrl: '',
  }
}

export function parseM3U(text: string): M3UEntry[] {
  const entries: M3UEntry[] = []
  let pending: M3UEntry | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.startsWith('#EXTINF:')) {
      pending = parseExtinf(line.slice('#EXTINF:'.length))
      continue
    }

    if (line.startsWith('#')) continue

    if (pending) {
      pending.streamUrl = line
      entries.push(pending)
      pending = null
    }
  }

  return entries
}
