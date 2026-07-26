import { useEffect, useState } from 'react'
import { isTauri } from '../../lib/platform'
import type { Update } from '@tauri-apps/plugin-updater'

// Checks GitHub Releases (via the endpoint configured in
// tauri.conf.json) once on startup — desktop only, since the updater
// plugin doesn't support mobile targets and Android ships through the
// Play Store's own update mechanism instead. No-ops entirely outside
// Tauri, so this is safe to always render.
export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!isTauri()) return
    ;(async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        const result = await check()
        if (result) setUpdate(result)
      } catch (err) {
        console.warn('reelix: update check failed', err)
      }
    })()
  }, [])

  if (!update || dismissed) return null

  const doUpdate = async () => {
    setUpdating(true)
    setError(null)
    try {
      await update.downloadAndInstall()
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (err) {
      setUpdating(false)
      setError((err as Error).message)
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-2.5 bg-emerald-950/60 border-b border-emerald-900/60 text-sm text-emerald-300">
      <span>
        Update available: v{update.version} (you're on v{update.currentVersion})
      </span>
      <div className="flex items-center gap-3 shrink-0">
        {error && <span className="text-red-400 text-xs">{error}</span>}
        <button
          onClick={doUpdate}
          disabled={updating}
          className="text-xs px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 font-medium"
        >
          {updating ? 'Updating…' : 'Update now'}
        </button>
        {!updating && (
          <button onClick={() => setDismissed(true)} className="text-xs text-emerald-400/70 hover:text-emerald-300">
            Later
          </button>
        )}
      </div>
    </div>
  )
}
