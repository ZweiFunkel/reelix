import { useState } from 'react'
import { LocalLibraryPage } from './LocalLibraryPage'
import { ServerConnectPage } from '../auth/ServerConnectPage'
import { DeviceIcon } from '../../components/icons'

// Rendered instead of the normal server-backed app whenever a native
// shell has no Reelix server configured yet, or one is configured but
// currently unreachable — local files/playlists must keep working in
// both cases, not just the first one, so this doubles as the offline
// fallback (see App.tsx's health.isError branch).
export function LocalOnlyShell({
  onConnected,
  offlineNotice,
  onRetry,
}: {
  onConnected: () => void
  offlineNotice?: boolean
  onRetry?: () => void
}) {
  const [connecting, setConnecting] = useState(false)

  if (connecting) {
    return (
      <ServerConnectPage
        onConnected={() => {
          // Reset this component's own state regardless of what the
          // parent's onConnected does — for the "offline, reconfigure"
          // case that's just a background setupStatus.refetch(), which
          // doesn't itself unmount this shell, so without this the
          // connect form was left sitting there with no next step
          // until (and unless) that refetch happened to resolve.
          setConnecting(false)
          onConnected()
        }}
        onSkip={() => setConnecting(false)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex">
      <nav className="w-56 shrink-0 border-r border-neutral-900 bg-neutral-950 flex flex-col gap-1 py-6 px-3">
        <span className="text-xl font-semibold px-3 mb-6">
          Reel<span className="text-red-500">ix</span>
        </span>
        <button className="flex items-center gap-3 px-3 py-2 rounded-md text-sm bg-red-600 text-white">
          <DeviceIcon className="w-5 h-5" />
          On This Device
        </button>
        <button
          onClick={() => setConnecting(true)}
          className="mt-auto flex items-center gap-3 px-3 py-2 rounded-md text-sm text-neutral-400 hover:bg-neutral-900 hover:text-white"
        >
          {offlineNotice ? 'Reconfigure server' : 'Connect a server'}
        </button>
      </nav>

      <div className="flex-1 flex flex-col">
        {offlineNotice && (
          <div className="flex items-center justify-between gap-4 px-6 py-2.5 bg-amber-950/60 border-b border-amber-900/60 text-sm text-amber-300">
            <span>Can't reach your Reelix server right now — showing files on this device instead.</span>
            {onRetry && (
              <button onClick={onRetry} className="text-xs px-2 py-1 rounded bg-amber-900/60 hover:bg-amber-800/60 shrink-0">
                Retry
              </button>
            )}
          </div>
        )}
        <main className="px-6 py-6 max-w-6xl w-full mx-auto flex-1">
          <LocalLibraryPage />
        </main>
      </div>
    </div>
  )
}
