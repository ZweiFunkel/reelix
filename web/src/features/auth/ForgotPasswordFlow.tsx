import { useState } from 'react'
import { useForgotPassword, useResetPassword } from './hooks'

export function ForgotPasswordFlow({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<'request' | 'reset' | 'success'>('request')
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const forgotPassword = useForgotPassword()
  const resetPassword = useResetPassword()

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    await forgotPassword.mutateAsync(username)
    setStep('reset')
  }

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault()
    await resetPassword.mutateAsync({ username, code, newPassword })
    setStep('success')
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-lg p-6 flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            Reel<span className="text-red-500">ix</span>
          </h1>
          <p className="text-neutral-400 text-sm mt-1">Reset your password</p>
        </div>

        {step === 'request' && (
          <form onSubmit={requestCode} className="flex flex-col gap-4">
            <input
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-red-500"
            />
            <p className="text-xs text-neutral-500">
              If this account has an email on file, we'll send a reset code to it.
            </p>
            <button
              type="submit"
              disabled={forgotPassword.isPending}
              className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 font-medium"
            >
              {forgotPassword.isPending ? '…' : 'Send reset code'}
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={submitReset} className="flex flex-col gap-4">
            <input
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
              inputMode="numeric"
              maxLength={6}
              className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-red-500 text-center tracking-widest text-xl"
            />
            <input
              required
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-red-500"
            />
            {resetPassword.isError && (
              <p className="text-sm text-red-400">{(resetPassword.error as Error).message}</p>
            )}
            <button
              type="submit"
              disabled={resetPassword.isPending}
              className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 font-medium"
            >
              {resetPassword.isPending ? '…' : 'Reset password'}
            </button>
          </form>
        )}

        {step === 'success' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-emerald-400">Password changed. Sign in with your new password.</p>
            <button onClick={onDone} className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 font-medium">
              Back to sign in
            </button>
          </div>
        )}

        {step !== 'success' && (
          <button onClick={onDone} type="button" className="text-sm text-neutral-500 hover:text-neutral-300 text-left">
            ← Back to sign in
          </button>
        )}
      </div>
    </div>
  )
}
