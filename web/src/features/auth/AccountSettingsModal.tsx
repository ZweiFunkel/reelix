import { useState } from 'react'
import { useUpdateEmail } from './hooks'
import type { User } from '../../lib/types'

export function AccountSettingsModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [email, setEmail] = useState(user.email ?? '')
  const updateEmail = useUpdateEmail()
  const [saved, setSaved] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    await updateEmail.mutateAsync(email)
    setSaved(true)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <form onSubmit={submit} className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 w-full max-w-sm flex flex-col gap-4">
        <h2 className="text-lg font-medium">Account settings</h2>

        <label className="flex flex-col gap-1 text-sm text-neutral-400">
          Email (used for password-reset codes)
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="bg-neutral-800 rounded px-3 py-2 text-neutral-100 outline-none focus:ring-1 focus:ring-red-500"
          />
        </label>

        {saved && <p className="text-sm text-emerald-400">Saved.</p>}
        {updateEmail.isError && <p className="text-sm text-red-400">{(updateEmail.error as Error).message}</p>}

        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded text-neutral-300 hover:bg-neutral-800">
            Close
          </button>
          <button
            type="submit"
            disabled={updateEmail.isPending}
            className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 font-medium"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
