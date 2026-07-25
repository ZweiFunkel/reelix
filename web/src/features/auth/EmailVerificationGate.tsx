import { useState } from 'react'
import { useUpdateEmail, useSendVerification, useVerifyEmail } from './hooks'
import type { User } from '../../lib/types'

// Blocks the app until the account has a verified email — required on
// first login (and on any later login of an account that still hasn't
// verified), mirroring the "verify your email" onboarding step common
// in consumer apps. Two steps: set the email if there isn't one yet,
// then enter the code that gets sent to it.
export function EmailVerificationGate({ user }: { user: User }) {
  const hasEmail = !!user.email
  const [email, setEmail] = useState(user.email ?? '')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)

  const updateEmail = useUpdateEmail()
  const sendVerification = useSendVerification()
  const verifyEmail = useVerifyEmail()

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    await updateEmail.mutateAsync(email)
    await sendVerification.mutateAsync()
    setCodeSent(true)
  }

  const resend = async () => {
    await sendVerification.mutateAsync()
    setCodeSent(true)
  }

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault()
    await verifyEmail.mutateAsync(code)
  }

  const showCodeStep = codeSent || (hasEmail && !user.emailVerified)

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-lg p-6 flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            Reel<span className="text-red-500">ix</span>
          </h1>
          <p className="text-neutral-400 text-sm mt-1">Verify your email to continue</p>
        </div>

        {!showCodeStep ? (
          <form onSubmit={submitEmail} className="flex flex-col gap-4">
            <p className="text-sm text-neutral-400">
              We need an email on file so you can recover your account if you ever lose access.
            </p>
            <input
              required
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-neutral-800 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-red-500"
            />
            <button
              type="submit"
              disabled={updateEmail.isPending || sendVerification.isPending}
              className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 font-medium"
            >
              Send verification code
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="flex flex-col gap-4">
            <p className="text-sm text-neutral-400">Enter the code we sent to {user.email ?? email}.</p>
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
            {verifyEmail.isError && <p className="text-sm text-red-400">{(verifyEmail.error as Error).message}</p>}
            <button
              type="submit"
              disabled={verifyEmail.isPending}
              className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 font-medium"
            >
              Verify
            </button>
            <button type="button" onClick={resend} className="text-sm text-neutral-500 hover:text-neutral-300">
              Resend code
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
