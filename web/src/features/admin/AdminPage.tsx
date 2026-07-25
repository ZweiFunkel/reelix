import { useAdminSessions } from './hooks'

function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'never'
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return new Date(iso!).toLocaleString()
}

function formatPosition(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function AdminPage() {
  const { data: sessions, isLoading } = useAdminSessions()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="text-sm text-neutral-500">Who's logged in and what they're watching right now. Refreshes every 10s.</p>

      {isLoading && <p className="text-neutral-500 text-sm">Loading…</p>}
      {!isLoading && (!sessions || sessions.length === 0) && <p className="text-neutral-500 text-sm">No active sessions.</p>}

      {sessions && sessions.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/60 text-neutral-400 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Profile</th>
                <th className="px-4 py-2 font-medium">Logged in</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
                <th className="px-4 py-2 font-medium">Now playing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {sessions.map((sess) => (
                <tr key={sess.sessionId} className="hover:bg-neutral-900/40">
                  <td className="px-4 py-3 font-medium text-neutral-200">{sess.username}</td>
                  <td className="px-4 py-3 text-neutral-400">
                    {sess.profileName ?? '—'}
                    {sess.isKid && <span className="ml-1.5 text-[10px] text-amber-400">KID</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{timeAgo(sess.loginAt)}</td>
                  <td className="px-4 py-3 text-neutral-500">{timeAgo(sess.lastSeenAt)}</td>
                  <td className="px-4 py-3">
                    {sess.nowPlaying ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${sess.nowPlaying.isLive ? 'bg-red-500' : 'bg-emerald-400'} animate-pulse`} />
                        <span className="text-neutral-200">{sess.nowPlaying.title}</span>
                        {sess.nowPlaying.isLive ? (
                          <span className="text-[10px] font-semibold text-red-400">LIVE</span>
                        ) : (
                          <span className="text-xs text-neutral-500">{formatPosition(sess.nowPlaying.positionSeconds ?? 0)}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-neutral-600">idle</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
