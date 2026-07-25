import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './lib/api'
import { useLibraries, useTriggerScan, useUploadToLibrary, useDeleteLibrary } from './features/library/hooks'
import { AddLibraryDialog } from './features/library/AddLibraryDialog'
import { useLibraryRoot, useCategoryChildren } from './features/browse/hooks'
import { BrowseGrid } from './features/browse/BrowseGrid'
import { PhotoLightbox } from './features/browse/PhotoLightbox'
import { HomePage } from './features/home/HomePage'
import { AdminPage } from './features/admin/AdminPage'
import { DetailPage } from './features/detail/DetailPage'
import { ShowPage } from './features/show/ShowPage'
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

function LibraryHeader({
  isAdmin,
  libraryId,
  onAdd,
  onDeleted,
}: {
  isAdmin: boolean
  libraryId: number
  onAdd: () => void
  onDeleted: () => void
}) {
  const { data: libraries } = useLibraries()
  const triggerScan = useTriggerScan()
  const uploadToLibrary = useUploadToLibrary()
  const deleteLibrary = useDeleteLibrary()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lib = libraries?.find((l) => l.id === libraryId)
  if (!lib) return null

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await uploadToLibrary.mutateAsync({ libraryId: lib.id!, file })
  }

  const onDelete = async () => {
    if (!window.confirm(`Remove library "${lib.name}"? This unregisters it from Reelix but does not delete any files.`)) return
    await deleteLibrary.mutateAsync(lib.id!)
    onDeleted()
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold">{lib.name}</h1>
        <span className="text-xs text-neutral-500">
          {lib.lastScannedAt ? `Scanned ${new Date(lib.lastScannedAt).toLocaleString()}` : 'Never scanned'}
        </span>
        {uploadToLibrary.isError && (
          <p className="text-xs text-red-400 mt-1">{(uploadToLibrary.error as Error).message}</p>
        )}
      </div>
      {isAdmin && (
        <div className="flex gap-2">
          {lib.type !== 'M3U' && (
            <>
              <input ref={fileInputRef} type="file" onChange={onFileChosen} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadToLibrary.isPending}
                className="text-xs px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
              >
                {uploadToLibrary.isPending ? 'Uploading…' : '↑ Upload'}
              </button>
            </>
          )}
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
          <button
            onClick={onDelete}
            disabled={deleteLibrary.isPending}
            className="text-xs px-3 py-2 rounded bg-neutral-800 hover:bg-red-900/60 text-red-400 disabled:opacity-50"
          >
            Delete
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
  onOpenDetail,
  onOpenShow,
  onOpenPhoto,
}: {
  entry: PathEntry
  onOpenCategory: (categoryId: number, label: string) => void
  onPlay: (id: number, itemType: 'media_item' | 'channel') => void
  onOpenDetail: (id: number) => void
  onOpenShow: (anchorId: number) => void
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
      onOpenDetail={onOpenDetail}
      onOpenShow={onOpenShow}
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
  const openDetail = (id: number) => setPage({ kind: 'detail', mediaItemId: id })
  const openShow = (anchorId: number) => setPage({ kind: 'show', anchorMediaItemId: anchorId })

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
                <LibraryHeader
                  isAdmin={isAdmin}
                  libraryId={current.libraryId}
                  onAdd={() => setShowAddLibrary(true)}
                  onDeleted={() => setPage({ kind: 'home' })}
                />
              )}
              <BrowseView
                entry={current}
                onOpenCategory={(categoryId, label) =>
                  setPage({ kind: 'browse', path: [...page.path, { libraryId: current.libraryId, categoryId, label }] })
                }
                onPlay={(id, itemType) => setPlaying({ id, itemType })}
                onOpenDetail={openDetail}
                onOpenShow={openShow}
                onOpenPhoto={(id) => setPhotoId(id)}
              />
            </>
          )}

          {page.kind === 'home' && (
            <HomePage
              libraries={libraries}
              isAdmin={isAdmin}
              onPlay={(id, itemType) => setPlaying({ id, itemType })}
              onOpenDetail={openDetail}
              onOpenPhoto={(id) => setPhotoId(id)}
              onNavigate={setPage}
              onAddLibrary={() => setShowAddLibrary(true)}
            />
          )}

          {page.kind === 'admin' && isAdmin && <AdminPage />}

          {page.kind === 'detail' && (
            <DetailPage
              mediaItemId={page.mediaItemId}
              isAdmin={isAdmin}
              onBack={() => setPage({ kind: 'home' })}
              onPlay={(id, itemType) => setPlaying({ id, itemType })}
              onOpenDetail={openDetail}
              onOpenPhoto={(id) => setPhotoId(id)}
              onDeleted={() => setPage({ kind: 'home' })}
            />
          )}

          {page.kind === 'show' && (
            <ShowPage
              anchorMediaItemId={page.anchorMediaItemId}
              onBack={() => setPage({ kind: 'home' })}
              onPlay={(id, itemType) => setPlaying({ id, itemType })}
              onOpenDetail={openDetail}
              onOpenPhoto={(id) => setPhotoId(id)}
            />
          )}
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
        <Player
          key={playing.id}
          mediaItemId={playing.id}
          itemType={playing.itemType}
          onClose={() => setPlaying(null)}
          onNext={(id) => setPlaying({ id, itemType: 'media_item' })}
        />
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
