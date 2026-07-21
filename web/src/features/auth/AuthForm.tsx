import { useState } from 'react'

export function AuthForm({
  title,
  subtitle,
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  title: string
  subtitle: string
  submitLabel: string
  pending: boolean
  error?: string | null
  onSubmit: (username: string, password: string) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(username, password)
        }}
        className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-lg p-6 flex flex-col gap-4"
      >
        <div>
          <h1 className="text-2xl font-semibold">
            Reel<span className="text-red-500">ix</span>
          </h1>
          <p className="text-neutral-400 text-sm mt-1">{subtitle}</p>
        </div>

        <h2 className="text-lg font-medium">{title}</h2>

        <input
          required
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-red-500"
        />
        <input
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-red-500"
        />

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 font-medium"
        >
          {pending ? '…' : submitLabel}
        </button>
      </form>
    </div>
  )
}
