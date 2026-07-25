import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './lib/api'
import { useLibraries, useTriggerScan } from './features/library/hooks'
import { AddLibraryDialog } from './features/library/AddLibraryDialog'
import { useLibraryRoot, useCategoryChildren } from './features/browse/hooks'
import { BrowseGrid } from './features/browse/BrowseGrid'
import { PhotoLightbox } from './features/browse/PhotoLightbox'
import { HomePage } from './features/home/HomePage'
import { AdminPage } from './features/admin/AdminPage'
import { Player } from './features/player/Player'
import { useSetupStatus, useMe } from './features/auth/hooks'
import { SetupPage } from './features/auth/SetupPage'
import { LoginPage } from './features/auth/LoginPage'
import { ProfilePicker } from './features/auth/ProfilePicker'
import { ServerConnectPage } from './features/auth/ServerConnectPage'
import { AccountSettingsModal } from './features/auth/AccountSettingsModal'
import { EmailVerificationGate } from './features/auth/EmailVerificationGate'
import { isNativeShell, getServerUrl } from './lib/platform'
import { Sidebar, type Page, type PathEntry } from './components/Sidebar'
import { UserMenu } from './components/UserMenu'
import type { MeResponse } from './lib/types'

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

function LibraryHeader({ isAdmin, libraryId, onAdd }: { isAdmin: boolean; libraryId: number; onAdd: () => void }) {
  const { data: libraries } = useLibraries()
  const triggerScan = useTriggerScan()
  const lib = libraries?.find((l) => l.id === libraryId)
  if (!lib) return null

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold">{lib.name}</h1>
        <span className="text-xs text-neutral-500">
          {lib.lastScannedAt ? `Scanned ${new Date(lib.lastScannedAt).toLocaleString()}` : 'Never scanned'}
        </span>
      </div>
      {isAdmin && (
        <div className="flex gap-2">
          <button
            onClick={() => triggerScan.mutate(lib.id!)}
            disabled={triggerScan.isPending}
            className="text-xs px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
          >
            {triggerScan.isPending ? 'Scanning…' : 'Rescan'}
          </button>
          <button onClick={onAdd} className="px-3 py-2 rounded bg-red-600 hover:bg-red-500 font-medium text-xs">
            + Add library
          </button>
        </div>
      )}
    </div>
  )
}

function Breadcrumbs({ path, onNavigate, onHome }: { path: PathEntry[]; onNavigate: (index: number) => void; onHome: () => void }) {
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-400 flex-wrap">
      <button onClick={onHome} className="hover:text-white">
        Home
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

function MediaApp({ me, onSwitchProfile }: { me: MeResponse; onSwitchProfile: () => void }) {
  const [page, setPage] = useState<Page>({ kind: 'home' })
  const [showAddLibrary, setShowAddLibrary] = useState(false)
  const [playing, setPlaying] = useState<{ id: number; itemType: 'media_item' | 'channel' } | null>(null)
  const [photoId, setPhotoId] = useState<number | null>(null)
  const [showAccountSettings, setShowAccountSettings] = useState(false)
  const { data: libraries } = useLibraries()
  const activeProfile = me.profiles?.find((p) => p.id === me.activeProfileId)
  // A kid profile never gets admin controls, even under an admin account —
  // the server enforces this too (RequireAdmin), this just keeps the UI honest.
  const isAdmin = me.user?.role === 'admin' && !activeProfile?.isKid

  const current = page.kind === 'browse' ? page.path[page.path.length - 1] : undefined

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex">
      <Sidebar libraries={libraries} page={page} isAdmin={isAdmin} onNavigate={setPage} />

      <div className="flex-1 flex flex-col">
        <header className="flex items-center justify-end gap-4 px-6 py-4 border-b border-neutral-900">
          <StatusPill />
          {me.user && (
            <UserMenu
              user={me.user}
              activeProfile={activeProfile}
              onOpenAccountSettings={() => setShowAccountSettings(true)}
              onSwitchProfile={onSwitchProfile}
            />
          )}
        </header>

        <main className="px-6 py-6 max-w-6xl w-full mx-auto flex flex-col gap-6">
          {page.kind === 'browse' && current && (
            <>
              <Breadcrumbs
                path={page.path}
                onHome={() => setPage({ kind: 'home' })}
                onNavigate={(i) => setPage({ kind: 'browse', path: page.path.slice(0, i + 1) })}
              />
              {current.categoryId === null && (
                <LibraryHeader isAdmin={isAdmin} libraryId={current.libraryId} onAdd={() => setShowAddLibrary(true)} />
              )}
              <BrowseView
                entry={current}
                onOpenCategory={(categoryId, label) =>
                  setPage({ kind: 'browse', path: [...page.path, { libraryId: current.libraryId, categoryId, label }] })
                }
                onPlay={(id, itemType) => setPlaying({ id, itemType })}
                onOpenPhoto={(id) => setPhotoId(id)}
              />
            </>
          )}

          {page.kind === 'home' && (
            <HomePage
              libraries={libraries}
              isAdmin={isAdmin}
              onPlay={(id, itemType) => setPlaying({ id, itemType })}
              onOpenPhoto={(id) => setPhotoId(id)}
              onNavigate={setPage}
              onAddLibrary={() => setShowAddLibrary(true)}
            />
          )}

          {page.kind === 'admin' && isAdmin && <AdminPage />}
        </main>
      </div>

      {showAccountSettings && me.user && (
        <AccountSettingsModal user={me.user} onClose={() => setShowAccountSettings(false)} />
      )}

      {showAddLibrary && (
        <AddLibraryDialog
          onClose={() => setShowAddLibrary(false)}
          onCreated={(libraryId, name) => {
            setShowAddLibrary(false)
            setPage({ kind: 'browse', path: [{ libraryId, categoryId: null, label: name }] })
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
  const [switchingProfile, setSwitchingProfile] = useState(false)
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

  if (me.data.user && !me.data.user.emailVerified) {
    return <EmailVerificationGate user={me.data.user} />
  }

  if (me.data.activeProfileId == null || switchingProfile) {
    return <ProfilePicker profiles={me.data.profiles ?? []} onSelected={() => setSwitchingProfile(false)} />
  }

  return <MediaApp me={me.data} onSwitchProfile={() => setSwitchingProfile(true)} />
}

export default App
