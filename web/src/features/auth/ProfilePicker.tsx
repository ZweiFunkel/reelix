import { useState } from 'react'
import type { Profile } from '../../lib/types'
import { useCreateProfile, useSelectProfile } from './hooks'

function PinPrompt({ profile, onCancel, onSubmit, error }: { profile: Profile; onCancel: () => void; onSubmit: (pin: string) => void; error?: string | null }) {
  const [pin, setPin] = useState('')
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(pin)
        }}
        className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 w-full max-w-xs flex flex-col gap-3"
      >
        <h2 className="text-lg font-medium">Enter PIN for {profile.displayName}</h2>
        <input
          autoFocus
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="bg-neutral-800 rounded px-3 py-2 text-center text-2xl tracking-widest outline-none focus:ring-1 focus:ring-red-500"
          maxLength={8}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-2 rounded text-neutral-300 hover:bg-neutral-800">
            Cancel
          </button>
          <button type="submit" className="px-3 py-2 rounded bg-red-600 hover:bg-red-500 font-medium">
            Continue
          </button>
        </div>
      </form>
    </div>
  )
}

function AddProfileForm({ onClose }: { onClose: () => void }) {
  const [displayName, setDisplayName] = useState('')
  const [isKid, setIsKid] = useState(false)
  const [pin, setPin] = useState('')
  const createProfile = useCreateProfile()

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          await createProfile.mutateAsync({ displayName, isKid, pin: isKid ? pin : undefined })
          onClose()
        }}
        className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 w-full max-w-sm flex flex-col gap-3"
      >
        <h2 className="text-lg font-medium">Add profile</h2>
        <input
          required
          autoFocus
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Name"
          className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-red-500"
        />
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={isKid} onChange={(e) => setIsKid(e.target.checked)} />
          Kid profile (PIN-protected)
        </label>
        {isKid && (
          <input
            required
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN (4+ digits)"
            className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-red-500"
          />
        )}
        {createProfile.isError && <p className="text-sm text-red-400">{(createProfile.error as Error).message}</p>}
        <div className="flex justify-end gap-2 mt-1">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded text-neutral-300 hover:bg-neutral-800">
            Cancel
          </button>
          <button type="submit" disabled={createProfile.isPending} className="px-3 py-2 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 font-medium">
            Add
          </button>
        </div>
      </form>
    </div>
  )
}

export function ProfilePicker({ profiles }: { profiles: Profile[] }) {
  const selectProfile = useSelectProfile()
  const [pinTarget, setPinTarget] = useState<Profile | null>(null)
  const [pinError, setPinError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const choose = async (profile: Profile, pin?: string) => {
    try {
      await selectProfile.mutateAsync({ profileId: profile.id!, pin })
      setPinTarget(null)
      setPinError(null)
    } catch (e) {
      if (profile.isKid) setPinError((e as Error).message)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center gap-8 px-4">
      <h1 className="text-3xl font-semibold">Who's watching?</h1>
      <div className="flex flex-wrap justify-center gap-6">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            onClick={() => (profile.isKid ? setPinTarget(profile) : choose(profile))}
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-24 h-24 rounded-lg bg-neutral-800 group-hover:bg-red-700 transition-colors flex items-center justify-center text-3xl font-semibold">
              {profile.displayName?.[0]?.toUpperCase()}
            </div>
            <span className="text-neutral-300 group-hover:text-white text-sm">{profile.displayName}</span>
          </button>
        ))}
        <button onClick={() => setShowAdd(true)} className="flex flex-col items-center gap-2 group">
          <div className="w-24 h-24 rounded-lg border-2 border-dashed border-neutral-700 group-hover:border-neutral-500 flex items-center justify-center text-3xl text-neutral-600 group-hover:text-neutral-400">
            +
          </div>
          <span className="text-neutral-500 text-sm">Add profile</span>
        </button>
      </div>

      {pinTarget && (
        <PinPrompt
          profile={pinTarget}
          error={pinError}
          onCancel={() => {
            setPinTarget(null)
            setPinError(null)
          }}
          onSubmit={(pin) => choose(pinTarget, pin)}
        />
      )}
      {showAdd && <AddProfileForm onClose={() => setShowAdd(false)} />}
    </div>
  )
}
