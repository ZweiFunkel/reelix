import { useEffect, useRef, useState } from 'react'
import type { Profile, User } from '../lib/types'
import { SwitchProfileIcon, SettingsIcon, LogoutIcon, ChevronDownIcon } from './icons'
import { useLogout } from '../features/auth/hooks'

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
        </div>
      )}
    </div>
  )
}
