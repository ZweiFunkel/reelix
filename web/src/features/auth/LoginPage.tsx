import { useState } from 'react'
import { AuthForm } from './AuthForm'
import { ForgotPasswordFlow } from './ForgotPasswordFlow'
import { useLogin } from './hooks'

export function LoginPage() {
  const login = useLogin()
  const [showForgot, setShowForgot] = useState(false)

  if (showForgot) {
    return <ForgotPasswordFlow onDone={() => setShowForgot(false)} />
  }

  return (
    <AuthForm
      title="Sign in"
      subtitle="Your self-hosted media, your rules."
      submitLabel="Sign in"
      pending={login.isPending}
      error={login.isError ? (login.error as Error).message : null}
      onSubmit={(username, password) => login.mutate({ username, password })}
      footer={
        <button
          type="button"
          onClick={() => setShowForgot(true)}
          className="text-sm text-neutral-500 hover:text-neutral-300 text-center"
        >
          Forgot password?
        </button>
      }
    />
  )
}
