import { useState } from 'react'
import { addServer, normalizeServerUrl } from '../../lib/platform'

// Shown once on Tauri/Capacitor before anything else — the native shells
// bundle this UI locally, so unlike the browser case there's no server
// to talk to until the user points the app at one.
export function ServerConnectPage({ onConnected, onSkip }: { onConnected: () => void; onSkip?: () => void }) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setChecking(true)
    const normalized = normalizeServerUrl(url)
    try {
      const res = await fetch(`${normalized}/api/health`)
      if (!res.ok) throw new Error(`Server responded with ${res.status}`)
      addServer(normalized, label)
      onConnected()
    } catch (err) {
      console.error('reelix: connecting to server failed', normalized, err)
      setError("Couldn't reach that server — check the address and that it's running.")
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-lg p-6 flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            Reel<span className="text-red-500">ix</span>
          </h1>
          <p className="text-neutral-400 text-sm mt-1">Connect to your Reelix server</p>
        </div>
        <input
          required
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://reelix.myserver.com"
          className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-red-500 font-mono text-sm"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Name (optional) — e.g. Home, Chris's server"
          className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-red-500 text-sm"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={checking}
          className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 font-medium"
        >
          {checking ? 'Connecting…' : 'Connect'}
        </button>
        {onSkip && (
          <button type="button" onClick={onSkip} className="text-sm text-neutral-500 hover:text-neutral-300">
            Use without a server — just files on this device
          </button>
        )}
      </form>
    </div>
  )
}
