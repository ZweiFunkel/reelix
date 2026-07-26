import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listLocalRoots,
  listLocalRootContents,
  listLocalCategoryContents,
  pickAndAddLocalFolder,
  rescanLocalRoot,
  removeLocalRoot,
  localFileSrc,
  listLocalPlaylists,
  listPlaylistChannels,
  pickAndAddLocalPlaylist,
  removeLocalPlaylist,
  type LocalItem,
} from '../../lib/nativeLocal'
import { LocalPlayer } from './LocalPlayer'
import { FilmIcon } from '../../components/icons'

type LocalPath = { rootId: number; categoryId: number | null; label: string }[]

function VideosSection() {
  const qc = useQueryClient()
  const [path, setPath] = useState<LocalPath>([])
  const [playing, setPlaying] = useState<LocalItem | null>(null)
  const current = path[path.length - 1]

  const roots = useQuery({ queryKey: ['local-roots'], queryFn: listLocalRoots })
  const contents = useQuery({
    queryKey: ['local-contents', current?.rootId, current?.categoryId],
    queryFn: () => (current ? (current.categoryId == null ? listLocalRootContents(current.rootId) : listLocalCategoryContents(current.rootId, current.categoryId)) : null),
    enabled: !!current,
  })

  const addFolder = useMutation({
    mutationFn: pickAndAddLocalFolder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['local-roots'] }),
  })
  const rescan = useMutation({
    mutationFn: rescanLocalRoot,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['local-contents'] }),
  })
  const remove = useMutation({
    mutationFn: removeLocalRoot,
    onSuccess: () => {
      setPath([])
      qc.invalidateQueries({ queryKey: ['local-roots'] })
    },
  })

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Videos &amp; photos on this device</h2>
        <button
          onClick={() => addFolder.mutate()}
          disabled={addFolder.isPending}
          className="px-3 py-2 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-medium"
        >
          {addFolder.isPending ? 'Adding…' : '+ Add folder / files'}
        </button>
      </div>
      {addFolder.isError && <p className="text-sm text-red-400">{(addFolder.error as Error).message}</p>}

      {current && (
        <div className="flex items-center gap-2 text-sm text-neutral-400 flex-wrap">
          <button onClick={() => setPath([])} className="hover:text-white">
            All
          </button>
          {path.map((entry, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="text-neutral-600">/</span>
              <button onClick={() => setPath(path.slice(0, i + 1))} className="hover:text-white">
                {entry.label}
              </button>
            </span>
          ))}
          <div className="flex-1" />
          <button onClick={() => rescan.mutate(current.rootId)} disabled={rescan.isPending} className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">
            {rescan.isPending ? 'Rescanning…' : 'Rescan'}
          </button>
          {path.length === 1 && (
            <button
              onClick={() => {
                if (window.confirm(`Remove "${current.label}"? Files on disk are untouched.`)) remove.mutate(current.rootId)
              }}
              className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-red-900/60 text-red-400"
            >
              Remove
            </button>
          )}
        </div>
      )}

      {!current && (
        <>
          {roots.isLoading && <p className="text-neutral-500 text-sm">Loading…</p>}
          {roots.data && roots.data.length === 0 && (
            <p className="text-neutral-500 text-sm">No local folders yet. Add one to watch files stored on this device — works with no internet and no Reelix server.</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {roots.data?.map((root) => (
              <button
                key={root.id}
                onClick={() => setPath([{ rootId: root.id, categoryId: null, label: root.path }])}
                className="flex flex-col items-center gap-2 p-4 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-center"
              >
                <FilmIcon className="w-8 h-8 text-neutral-500" />
                <span className="text-xs text-neutral-300 truncate w-full">{root.path}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {current && (
        <>
          {contents.isLoading && <p className="text-neutral-500 text-sm">Loading…</p>}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {contents.data?.subcategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setPath([...path, { rootId: current.rootId, categoryId: cat.id, label: cat.name }])}
                className="flex flex-col items-center gap-2 p-4 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-center"
              >
                <FilmIcon className="w-8 h-8 text-neutral-500" />
                <span className="text-xs text-neutral-300 truncate w-full">{cat.name}</span>
              </button>
            ))}
            {contents.data?.items.map((item) => (
              <button
                key={item.id}
                onClick={() => setPlaying(item)}
                className="flex flex-col items-center gap-2 p-3 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-center"
              >
                {item.mediaType === 'photo' ? (
                  <img src={localFileSrc(item.path)} className="w-full aspect-square object-cover rounded" />
                ) : (
                  <FilmIcon className="w-8 h-8 text-neutral-500" />
                )}
                <span className="text-xs text-neutral-300 truncate w-full">{item.title}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {playing && <LocalPlayer src={localFileSrc(playing.path)} title={playing.title} onClose={() => setPlaying(null)} />}
    </section>
  )
}

function PlaylistsSection() {
  const qc = useQueryClient()
  const [openPlaylistId, setOpenPlaylistId] = useState<number | null>(null)
  const [playing, setPlaying] = useState<{ title: string; src: string } | null>(null)

  const playlists = useQuery({ queryKey: ['local-playlists'], queryFn: listLocalPlaylists })
  const channels = useQuery({
    queryKey: ['local-playlist-channels', openPlaylistId],
    queryFn: () => listPlaylistChannels(openPlaylistId!),
    enabled: openPlaylistId != null,
  })

  const addPlaylist = useMutation({
    mutationFn: pickAndAddLocalPlaylist,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['local-playlists'] }),
  })
  const remove = useMutation({
    mutationFn: removeLocalPlaylist,
    onSuccess: () => {
      setOpenPlaylistId(null)
      qc.invalidateQueries({ queryKey: ['local-playlists'] })
    },
  })

  const openPlaylist = playlists.data?.find((p) => p.id === openPlaylistId)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Local M3U playlists</h2>
        <button
          onClick={() => addPlaylist.mutate()}
          disabled={addPlaylist.isPending}
          className="px-3 py-2 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-medium"
        >
          {addPlaylist.isPending ? 'Adding…' : '+ Add .m3u playlist'}
        </button>
      </div>
      {addPlaylist.isError && <p className="text-sm text-red-400">{(addPlaylist.error as Error).message}</p>}
      <p className="text-xs text-neutral-500">
        Parsed and browsable fully offline, no Reelix server involved. Playing a channel still needs a network connection to reach that channel's own stream.
      </p>

      {!openPlaylist && (
        <>
          {playlists.data && playlists.data.length === 0 && <p className="text-neutral-500 text-sm">No local playlists yet.</p>}
          <div className="flex flex-col gap-2">
            {playlists.data?.map((p) => (
              <button
                key={p.id}
                onClick={() => setOpenPlaylistId(p.id)}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-left"
              >
                <span className="text-sm text-neutral-200">{p.name}</span>
                <span className="text-xs text-neutral-500 truncate max-w-[40%]">{p.sourcePath}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {openPlaylist && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <button onClick={() => setOpenPlaylistId(null)} className="hover:text-white">
              All playlists
            </button>
            <span className="text-neutral-600">/</span>
            <span className="text-neutral-200">{openPlaylist.name}</span>
            <div className="flex-1" />
            <button
              onClick={() => {
                if (window.confirm(`Remove playlist "${openPlaylist.name}"?`)) remove.mutate(openPlaylist.id)
              }}
              className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-red-900/60 text-red-400"
            >
              Remove
            </button>
          </div>
          {channels.isLoading && <p className="text-neutral-500 text-sm">Loading…</p>}
          <div className="flex flex-col gap-1">
            {channels.data?.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setPlaying({ title: ch.name, src: ch.streamUrl })}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-left"
              >
                {ch.tvgLogo ? <img src={ch.tvgLogo} className="w-8 h-8 rounded object-contain bg-neutral-800" /> : <FilmIcon className="w-8 h-8 text-neutral-500" />}
                <span className="text-sm text-neutral-200 flex-1 truncate">{ch.name}</span>
                {ch.groupTitle && <span className="text-xs text-neutral-500">{ch.groupTitle}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {playing && <LocalPlayer src={playing.src} title={playing.title} onClose={() => setPlaying(null)} />}
    </section>
  )
}

export function LocalLibraryPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">On this device</h1>
        <p className="text-sm text-neutral-500 mt-1">Local files and playlists — always available, even with no internet or a Reelix server that's down.</p>
      </div>
      <VideosSection />
      <PlaylistsSection />
    </div>
  )
}
