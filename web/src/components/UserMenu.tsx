import { useEffect, useRef, useState } from 'react'
import type { Profile, User } from '../lib/types'
import { SwitchProfileIcon, SettingsIcon, LogoutIcon, ChevronDownIcon } from './icons'
import { useLogout } from '../features/auth/hooks'
import { isNativeShell, isTauri, isCapacitorNative, getServerUrl, clearServerUrl } from '../lib/platform'
import { checkAndroidUpdate, openAndroidUpdate, type AndroidUpdate } from '../lib/androidUpdate'

function ServerAndUpdateSection() {
  const [checkState, setCheckState] = useState<'idle' | 'checking' | 'none' | 'found' | 'error'>('idle')
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [pendingAndroid, setPendingAndroid] = useState<AndroidUpdate | null>(null)

  const checkForUpdates = async () => {
    setCheckState('checking')
    try {
      if (isCapacitorNative()) {
        const result = await checkAndroidUpdate()
        setPendingAndroid(result)
        setUpdateVersion(result?.version ?? null)
        setCheckState(result ? 'found' : 'none')
        return
      }
      const { check } = await import('@tauri-apps/plugin-updater')
      const result = await check()
      if (result) {
        setUpdateVersion(result.version)
        setCheckState('found')
      } else {
        setCheckState('none')
      }
    } catch (err) {
      console.warn('reelix: manual update check failed', err)
      setCheckState('error')
    }
  }

  const doUpdate = async () => {
    try {
      if (pendingAndroid) {
        await openAndroidUpdate(pendingAndroid)
        return
      }
      const { check } = await import('@tauri-apps/plugin-updater')
      const result = await check()
      if (!result) return
      await result.downloadAndInstall()
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (err) {
      console.error('reelix: manual update install failed', err)
      setCheckState('error')
    }
  }

  if (!isNativeShell()) return null

  return (
    <div className="border-t border-neutral-800 px-4 py-2 flex flex-col gap-2">
      {getServerUrl() && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-neutral-500 truncate" title={getServerUrl() ?? undefined}>
            Server: {getServerUrl()}
          </span>
          <button
            onClick={() => {
              clearServerUrl()
              window.location.reload()
            }}
            className="text-xs text-neutral-400 hover:text-white shrink-0"
          >
            Change
          </button>
        </div>
      )}
      {(isTauri() || isCapacitorNative()) && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-neutral-500">
            {checkState === 'checking' && 'Checking for updates…'}
            {checkState === 'none' && "You're up to date"}
            {checkState === 'found' && `Update v${updateVersion} available`}
            {checkState === 'error' && "Couldn't check for updates"}
            {checkState === 'idle' && 'App updates'}
          </span>
          {checkState === 'found' ? (
            <button onClick={doUpdate} className="text-xs px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 shrink-0">
              {pendingAndroid ? 'Download' : 'Update now'}
            </button>
          ) : (
            <button onClick={checkForUpdates} disabled={checkState === 'checking'} className="text-xs text-neutral-400 hover:text-white shrink-0 disabled:opacity-50">
              Check now
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function UserMenu({
  user,
  activeProfile,
  onOpenAccountSettings,
  onSwitchProfile,
}: {
  user: User
  activeProfile: Profile | undefined
  onOpenAccountSettings: () => void
  onSwitchProfile: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const logout = useLogout()

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-sm text-neutral-300 hover:text-white">
        <span className="w-8 h-8 rounded-md bg-neutral-800 flex items-center justify-center font-semibold">
          {activeProfile?.displayName?.[0]?.toUpperCase()}
        </span>
        <span>{activeProfile?.displayName}</span>
        <ChevronDownIcon className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl py-1 z-50">
          <div className="px-4 py-2 border-b border-neutral-800">
            <p className="text-sm font-medium text-neutral-200">{activeProfile?.displayName}</p>
            <p className="text-xs text-neutral-500">{user.username}</p>
          </div>
          <button
            onClick={() => {
              setOpen(false)
              onSwitchProfile()
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            <SwitchProfileIcon className="w-4 h-4" />
            Switch profile
          </button>
          <button
            onClick={() => {
              setOpen(false)
              onOpenAccountSettings()
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            <SettingsIcon className="w-4 h-4" />
            Account settings
          </button>
          <button
            onClick={() => logout.mutate()}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            <LogoutIcon className="w-4 h-4" />
            Sign out
          </button>
          <ServerAndUpdateSection />
        </div>
      )}
    </div>
  )
}
