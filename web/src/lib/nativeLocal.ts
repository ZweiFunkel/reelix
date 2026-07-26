// Local-only media on the native shells: video/photo files and M3U
// playlists a user adds directly on their device, browsable and
// playable with zero dependency on the Reelix server — this is what
// keeps "no internet" / "server is down" from being a dead end. See
// plan §6.
//
// Desktop (Tauri) delegates storage/scanning to Rust commands backed by
// a local SQLite DB (desktop/src-tauri/src/commands/local_files.rs).
// Android (Capacitor) has no Rust layer, so the same shape is
// reimplemented here in TS against a small localStorage-backed store —
// adequate for a personal handful of files/playlists, not a full media
// library. M3U parsing itself (m3u.ts) is shared by both paths so a
// playlist behaves identically either way.

import { isTauri, isCapacitorNative } from './platform'
import { parseM3U } from './m3u'

export type LocalRoot = { id: number; path: string }
export type LocalCategory = { id: number; name: string; parentCategoryId: number | null }
export type LocalItem = { id: number; title: string; mediaType: 'video' | 'photo'; path: string }
export type LocalChildren = { subcategories: LocalCategory[]; items: LocalItem[] }
export type LocalPlaylist = { id: number; name: string; sourcePath: string }
export type LocalChannel = { id: number; name: string; groupTitle: string; streamUrl: string; tvgLogo: string }

// withGlobalTauri (tauri.conf.json) exposes window.__TAURI__ directly —
// used here instead of importing @tauri-apps/api, keeping this shell's
// glue code dependency-free in the shared web bundle.
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return (window as any).__TAURI__.core.invoke(cmd, args)
}

function tauriAssetSrc(path: string): string {
  // convertFileSrc is what lets <video>/<img> load an arbitrary
  // on-disk path through Tauri's asset:// protocol (enabled + scoped to
  // "**" in tauri.conf.json, since the folders are user-picked and
  // unknowable ahead of time).
  return (window as any).__TAURI__.core.convertFileSrc(path)
}

// --- Capacitor (Android) local store ---
// Flat, no folder tree — the file picker returns individual files, not
// whole directories, so there's nothing to walk. Persisted as plain
// JSON; small scale is the explicit tradeoff for not pulling in a
// SQLite plugin for a feature this size.

type CapVideo = { id: number; title: string; path: string; mediaType: 'video' | 'photo' }
type CapPlaylist = { id: number; name: string; sourcePath: string; channels: LocalChannel[] }

const CAP_VIDEOS_KEY = 'reelix.local.videos'
const CAP_PLAYLISTS_KEY = 'reelix.local.playlists'

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

function nextId(items: { id: number }[]): number {
  return items.reduce((max, i) => Math.max(max, i.id), 0) + 1
}

async function capacitorPickAndCopyVideos(): Promise<CapVideo[]> {
  const { FilePicker } = await import('@capawesome/capacitor-file-picker')
  const { Filesystem, Directory } = await import('@capacitor/filesystem')

  const result = await FilePicker.pickFiles({ types: ['video/*'], limit: 0, readData: false })
  const videos = readJSON<CapVideo[]>(CAP_VIDEOS_KEY, [])
  const added: CapVideo[] = []

  for (const file of result.files) {
    if (!file.path) continue
    const destPath = `local-media/${Date.now()}-${file.name}`
    await Filesystem.copy({ from: file.path, to: destPath, toDirectory: Directory.Data })
    const { uri } = await Filesystem.getUri({ path: destPath, directory: Directory.Data })
    const item: CapVideo = { id: nextId(videos) + added.length, title: file.name, path: uri, mediaType: 'video' }
    added.push(item)
  }

  const merged = [...videos, ...added]
  writeJSON(CAP_VIDEOS_KEY, merged)
  return merged
}

async function capacitorPickAndAddPlaylist(): Promise<CapPlaylist[]> {
  const { FilePicker } = await import('@capawesome/capacitor-file-picker')
  const result = await FilePicker.pickFiles({ types: ['audio/x-mpegurl', 'application/x-mpegurl', '*/*'], limit: 1, readData: true })
  const file = result.files[0]
  if (!file?.data) throw new Error('No playlist file selected')

  const text = atob(file.data)
  const entries = parseM3U(text)
  const playlists = readJSON<CapPlaylist[]>(CAP_PLAYLISTS_KEY, [])
  const playlist: CapPlaylist = {
    id: nextId(playlists),
    name: file.name.replace(/\.(m3u8?|txt)$/i, ''),
    sourcePath: file.path ?? file.name,
    channels: entries.map((e, i) => ({ id: i + 1, name: e.name, groupTitle: e.groupTitle, streamUrl: e.streamUrl, tvgLogo: e.tvgLogo })),
  }
  const merged = [...playlists, playlist]
  writeJSON(CAP_PLAYLISTS_KEY, merged)
  return merged
}

// --- Public API ---

export function localLibrarySupported(): boolean {
  return isTauri() || isCapacitorNative()
}

export async function pickAndAddLocalFolder(): Promise<void> {
  if (isTauri()) {
    const paths = await tauriInvoke<string[]>('pick_local_folders')
    for (const path of paths) await tauriInvoke('add_local_root', { path })
    return
  }
  if (isCapacitorNative()) {
    await capacitorPickAndCopyVideos()
    return
  }
  throw new Error('Local files are only available in the desktop and mobile apps')
}

export async function listLocalRoots(): Promise<LocalRoot[]> {
  if (isTauri()) return tauriInvoke<LocalRoot[]>('list_local_roots')
  if (isCapacitorNative()) return readJSON<CapVideo[]>(CAP_VIDEOS_KEY, []).length > 0 ? [{ id: 1, path: 'On this device' }] : []
  return []
}

export async function listLocalRootContents(rootId: number): Promise<LocalChildren> {
  if (isTauri()) return tauriInvoke<LocalChildren>('list_local_root_contents', { rootId })
  if (isCapacitorNative()) {
    const videos = readJSON<CapVideo[]>(CAP_VIDEOS_KEY, [])
    return { subcategories: [], items: videos.map((v) => ({ id: v.id, title: v.title, mediaType: v.mediaType, path: v.path })) }
  }
  return { subcategories: [], items: [] }
}

export async function listLocalCategoryContents(rootId: number, categoryId: number): Promise<LocalChildren> {
  if (isTauri()) return tauriInvoke<LocalChildren>('list_local_category_contents', { rootId, categoryId })
  return { subcategories: [], items: [] }
}

export async function rescanLocalRoot(rootId: number): Promise<void> {
  if (isTauri()) await tauriInvoke('rescan_local_root', { rootId })
}

export async function removeLocalRoot(rootId: number): Promise<void> {
  if (isTauri()) {
    await tauriInvoke('remove_local_root', { rootId })
    return
  }
  if (isCapacitorNative()) {
    writeJSON(CAP_VIDEOS_KEY, [])
  }
}

// path is a direct filesystem path (Tauri) or an already-resolved
// capacitor:// URI (Android, since the file was copied into app
// storage at add-time) — either way it's playable as-is in a <video> src.
export function localFileSrc(path: string): string {
  if (isTauri()) return tauriAssetSrc(path)
  return path
}

export async function pickAndAddLocalPlaylist(): Promise<void> {
  if (isTauri()) {
    const path = await tauriInvoke<string | null>('pick_local_m3u_file')
    if (!path) return
    const text = await tauriInvoke<string>('read_local_text_file', { path })
    const entries = parseM3U(text)
    const name = path.split(/[\\/]/).pop()?.replace(/\.(m3u8?|txt)$/i, '') ?? 'Playlist'
    await tauriInvoke('add_local_playlist', {
      name,
      sourcePath: path,
      channels: entries.map((e) => ({ name: e.name, groupTitle: e.groupTitle, streamUrl: e.streamUrl, tvgLogo: e.tvgLogo })),
    })
    return
  }
  if (isCapacitorNative()) {
    await capacitorPickAndAddPlaylist()
    return
  }
  throw new Error('Local playlists are only available in the desktop and mobile apps')
}

export async function listLocalPlaylists(): Promise<LocalPlaylist[]> {
  if (isTauri()) return tauriInvoke<LocalPlaylist[]>('list_local_playlists')
  if (isCapacitorNative()) return readJSON<CapPlaylist[]>(CAP_PLAYLISTS_KEY, []).map(({ id, name, sourcePath }) => ({ id, name, sourcePath }))
  return []
}

export async function listPlaylistChannels(playlistId: number): Promise<LocalChannel[]> {
  if (isTauri()) return tauriInvoke<LocalChannel[]>('list_playlist_channels', { playlistId })
  if (isCapacitorNative()) {
    const playlists = readJSON<CapPlaylist[]>(CAP_PLAYLISTS_KEY, [])
    return playlists.find((p) => p.id === playlistId)?.channels ?? []
  }
  return []
}

export async function removeLocalPlaylist(playlistId: number): Promise<void> {
  if (isTauri()) {
    await tauriInvoke('remove_local_playlist', { playlistId })
    return
  }
  if (isCapacitorNative()) {
    const playlists = readJSON<CapPlaylist[]>(CAP_PLAYLISTS_KEY, [])
    writeJSON(CAP_PLAYLISTS_KEY, playlists.filter((p) => p.id !== playlistId))
  }
}
