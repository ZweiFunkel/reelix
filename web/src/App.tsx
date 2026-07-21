import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './lib/api'
import { useLibraries, useTriggerScan } from './features/library/hooks'
import { AddLibraryDialog } from './features/library/AddLibraryDialog'
import { useLibraryRoot, useCategoryChildren } from './features/browse/hooks'
import { BrowseGrid } from './features/browse/BrowseGrid'
import { PhotoLightbox } from './features/browse/PhotoLightbox'
import { Player } from './features/player/Player'
import { useSetupStatus, useMe, useLogout } from './features/auth/hooks'
import { SetupPage } from './features/auth/SetupPage'
import { LoginPage } from './features/auth/LoginPage'
import { ProfilePicker } from './features/auth/ProfilePicker'
import { ServerConnectPage } from './features/auth/ServerConnectPage'
import { isNativeShell, getServerUrl } from './lib/platform'
import type { MeResponse } from './lib/types'

type PathEntry = { libraryId: number; categoryId: number | null; label: string }

function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/health')
      if (error) throw error
      return data
    },
  })
}

function StatusPill() {
  const health = useHealth()
  const connected = health.data?.status === 'ok'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${connected ? 'text-emerald-400' : 'text-amber-400'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      {health.isLoading ? 'checking…' : connected ? 'connected' : 'unreachable'}
    </span>
  )
}

function LibraryList({ isAdmin, onOpen, onAdd }: { isAdmin: boolean; onOpen: (entry: PathEntry) => void; onAdd: () => void }) {
  const { data: libraries, isLoading } = useLibraries()
  const triggerScan = useTriggerScan()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Libraries</h1>
        {isAdmin && (
          <button onClick={onAdd} className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 font-medium text-sm">
            + Add library
          </button>
        )}
      </div>

      {isLoading && <p className="text-neutral-500 text-sm">Loading…</p>}
      {!isLoading && (!libraries || libraries.length === 0) && (
        <p className="text-neutral-500 text-sm">{isAdmin ? 'No libraries yet — add one to get started.' : 'No libraries yet.'}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {libraries?.map((lib) => (
          <div
            key={lib.id}
            className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 flex flex-col gap-2"
          >
            <button
              onClick={() => onOpen({ libraryId: lib.id!, categoryId: null, label: lib.name! })}
              className="text-left font-medium hover:text-red-400"
            >
              {lib.name}
            </button>
            <span className="text-xs text-neutral-500 font-mono truncate">{lib.rootPath}</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-neutral-500">
                {lib.lastScannedAt ? `Scanned ${new Date(lib.lastScannedAt).toLocaleString()}` : 'Never scanned'}
              </span>
              {isAdmin && (
                <button
                  onClick={() => triggerScan.mutate(lib.id!)}
                  disabled={triggerScan.isPending}
                  className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
                >
                  {triggerScan.isPending ? 'Scanning…' : 'Rescan'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Breadcrumbs({ path, onNavigate, onHome }: { path: PathEntry[]; onNavigate: (index: number) => void; onHome: () => void }) {
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-400 flex-wrap">
      <button onClick={onHome} className="hover:text-white">
        Libraries
      </button>
      {path.map((entry, i) => (
        <span key={i} className="flex items-center gap-2">
          <span className="text-neutral-600">/</span>
          <button onClick={() => onNavigate(i)} className="hover:text-white">
            {entry.label}
          </button>
        </span>
      ))}
    </div>
  )
}

function BrowseView({
  entry,
  onOpenCategory,
  onPlay,
  onOpenPhoto,
}: {
  entry: PathEntry
  onOpenCategory: (categoryId: number, label: string) => void
  onPlay: (id: number, itemType: 'media_item' | 'channel') => void
  onOpenPhoto: (id: number) => void
}) {
  const root = useLibraryRoot(entry.categoryId === null ? entry.libraryId : null)
  const category = useCategoryChildren(entry.categoryId)
  const { data, isLoading } = entry.categoryId === null ? root : category

  if (isLoading) return <p className="text-neutral-500 text-sm">Loading…</p>
  if (!data) return null

  return (
    <BrowseGrid
      data={data}
      onOpenCategory={(id) => {
        const cat = data.subcategories?.find((c) => c.id === id)
        onOpenCategory(id, cat?.name ?? 'Category')
      }}
      onPlay={onPlay}
      onOpenPhoto={onOpenPhoto}
    />
  )
}

function MediaApp({ me }: { me: MeResponse }) {
  const [path, setPath] = useState<PathEntry[]>([])
  const [showAddLibrary, setShowAddLibrary] = useState(false)
  const [playing, setPlaying] = useState<{ id: number; itemType: 'media_item' | 'channel' } | null>(null)
  const [photoId, setPhotoId] = useState<number | null>(null)
  const logout = useLogout()
  const activeProfile = me.profiles?.find((p) => p.id === me.activeProfileId)
  // A kid profile never gets admin controls, even under an admin account —
  // the server enforces this too (RequireAdmin), this just keeps the UI honest.
  const isAdmin = me.user?.role === 'admin' && !activeProfile?.isKid

  const current = path[path.length - 1]

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-900">
        <span className="text-xl font-semibold">
          Reel<span className="text-red-500">ix</span>
        </span>
        <div className="flex items-center gap-4">
          <StatusPill />
          <span className="text-sm text-neutral-400">{activeProfile?.displayName}</span>
          <button onClick={() => logout.mutate()} className="text-sm text-neutral-400 hover:text-white">
            Sign out
          </button>
        </div>
      </header>

      <main className="px-6 py-6 max-w-6xl mx-auto flex flex-col gap-6">
        {current && (
          <Breadcrumbs
            path={path}
            onHome={() => setPath([])}
            onNavigate={(i) => setPath(path.slice(0, i + 1))}
          />
        )}

        {!current && (
          <LibraryList isAdmin={isAdmin} onOpen={(entry) => setPath([entry])} onAdd={() => setShowAddLibrary(true)} />
        )}

        {current && (
          <BrowseView
            entry={current}
            onOpenCategory={(categoryId, label) =>
              setPath([...path, { libraryId: current.libraryId, categoryId, label }])
            }
            onPlay={(id, itemType) => setPlaying({ id, itemType })}
            onOpenPhoto={(id) => setPhotoId(id)}
          />
        )}
      </main>

      {showAddLibrary && (
        <AddLibraryDialog
          onClose={() => setShowAddLibrary(false)}
          onCreated={(libraryId, name) => {
            setShowAddLibrary(false)
            setPath([{ libraryId, categoryId: null, label: name }])
          }}
        />
      )}

      {playing != null && (
        <Player mediaItemId={playing.id} itemType={playing.itemType} onClose={() => setPlaying(null)} />
      )}
      {photoId != null && <PhotoLightbox mediaItemId={photoId} onClose={() => setPhotoId(null)} />}
    </div>
  )
}

function App() {
  const [connected, setConnected] = useState(!isNativeShell() || !!getServerUrl())
  const setupStatus = useSetupStatus()
  const me = useMe()

  if (!connected) {
    return <ServerConnectPage onConnected={() => setConnected(true)} />
  }

  if (setupStatus.isLoading || (me.isLoading && !me.isError)) {
    return <div className="min-h-screen bg-neutral-950" />
  }

  if (setupStatus.data?.needsSetup) {
    return <SetupPage />
  }

  if (me.isError || !me.data) {
    return <LoginPage />
  }

  if (me.data.activeProfileId == null) {
    return <ProfilePicker profiles={me.data.profiles ?? []} />
  }

  return <MediaApp me={me.data} />
}

export default App
