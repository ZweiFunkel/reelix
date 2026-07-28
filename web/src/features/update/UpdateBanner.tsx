import { useEffect, useState } from 'react'
import { isCapacitorNative, isTauri } from '../../lib/platform'
import { checkAndroidUpdate, currentAppVersion, openAndroidUpdate, type AndroidUpdate } from '../../lib/androidUpdate'
import type { Update } from '@tauri-apps/plugin-updater'

// Checks for a new release once on startup. Desktop uses Tauri's
// updater (download + install + relaunch in place); Android can't —
// the plugin is desktop-only and this APK is sideloaded, so it checks
// GitHub directly and hands the APK to the system browser to install.
// No-ops in a plain browser, where the served frontend is always
// whatever the server is running.
export function UpdateBanner() {
  const [desktopUpdate, setDesktopUpdate] = useState<Update | null>(null)
  const [androidUpdate, setAndroidUpdate] = useState<AndroidUpdate | null>(null)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        if (isTauri()) {
          const { check } = await import('@tauri-apps/plugin-updater')
          const result = await check()
          if (result) setDesktopUpdate(result)
        } else if (isCapacitorNative()) {
          setAndroidUpdate(await checkAndroidUpdate())
        }
      } catch (err) {
        console.warn('reelix: update check failed', err)
      }
    })()
  }, [])

  if (dismissed || (!desktopUpdate && !androidUpdate)) return null

  const newVersion = desktopUpdate?.version ?? androidUpdate?.version
  const installedVersion = desktopUpdate?.currentVersion ?? currentAppVersion()

  const doUpdate = async () => {
    setUpdating(true)
    setError(null)
    try {
      if (desktopUpdate) {
        await desktopUpdate.downloadAndInstall()
        const { relaunch } = await import('@tauri-apps/plugin-process')
        await relaunch()
      } else if (androidUpdate) {
        await openAndroidUpdate(androidUpdate)
        // The install happens outside the app (browser download, then
        // the system installer), so there's nothing left to wait on.
        setUpdating(false)
      }
    } catch (err) {
      setUpdating(false)
      setError((err as Error).message)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-2.5 bg-emerald-950/60 border-b border-emerald-900/60 text-sm text-emerald-300">
      <span className="min-w-0">
        Update available: v{newVersion} <span className="hidden sm:inline">(you're on v{installedVersion})</span>
      </span>
      <div className="flex items-center gap-3 shrink-0">
        {error && <span className="text-red-400 text-xs">{error}</span>}
        <button
          onClick={doUpdate}
          disabled={updating}
          className="text-xs px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 font-medium"
        >
          {updating ? 'Updating…' : androidUpdate ? 'Download' : 'Update now'}
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
