import { useState } from 'react'
import { useAdminSessions, useAdminUsers, useCreateAdminUser, useUpdateAdminUserRole } from './hooks'

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

function CreateUserForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const createUser = useCreateAdminUser()
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setDone(false)
    await createUser.mutateAsync({ username, password, role })
    setUsername('')
    setPassword('')
    setRole('user')
    setDone(true)
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 p-4 rounded-lg border border-neutral-800 bg-neutral-900/40">
      <label className="flex flex-col gap-1 text-xs text-neutral-400">
        Username
        <input
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="bg-neutral-800 rounded px-3 py-2 text-sm text-neutral-100 outline-none focus:ring-1 focus:ring-red-500"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-neutral-400">
        Password
        <input
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-neutral-800 rounded px-3 py-2 text-sm text-neutral-100 outline-none focus:ring-1 focus:ring-red-500"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-neutral-400">
        Role
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'admin' | 'user')}
          className="bg-neutral-800 rounded px-3 py-2 text-sm text-neutral-100 outline-none focus:ring-1 focus:ring-red-500"
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={createUser.isPending}
        className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 font-medium text-sm"
      >
        {createUser.isPending ? 'Creating…' : '+ Add account'}
      </button>
      {done && <span className="text-sm text-emerald-400">Created.</span>}
      {createUser.isError && <span className="text-sm text-red-400">{(createUser.error as Error).message}</span>}
    </form>
  )
}

function UsersTable() {
  const { data: users, isLoading } = useAdminUsers()
  const updateRole = useUpdateAdminUserRole()

  return (
    <div className="flex flex-col gap-3">
      <CreateUserForm />

      {isLoading && <p className="text-neutral-500 text-sm">Loading…</p>}
      {users && users.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/60 text-neutral-400 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Username</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-neutral-900/40">
                  <td className="px-4 py-3 font-medium text-neutral-200">{u.username}</td>
                  <td className="px-4 py-3 text-neutral-400">{u.role}</td>
                  <td className="px-4 py-3 text-neutral-500">{u.email ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => updateRole.mutate({ userId: u.id!, role: u.role === 'admin' ? 'user' : 'admin' })}
                      disabled={updateRole.isPending}
                      className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
                    >
                      {u.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {updateRole.isError && <p className="text-sm text-red-400">{(updateRole.error as Error).message}</p>}
    </div>
  )
}

export function AdminPage() {
  const { data: sessions, isLoading } = useAdminSessions()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Admin</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Accounts</h2>
        <UsersTable />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Active sessions</h2>
        <p className="text-sm text-neutral-500">Who's logged in and what they're watching right now. Refreshes every 10s.</p>
      </section>

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
