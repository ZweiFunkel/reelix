import { AuthForm } from './AuthForm'
import { useLogin } from './hooks'

export function LoginPage() {
  const login = useLogin()

  return (
    <AuthForm
      title="Sign in"
      subtitle="Your self-hosted media, your rules."
      submitLabel="Sign in"
      pending={login.isPending}
      error={login.isError ? (login.error as Error).message : null}
      onSubmit={(username, password) => login.mutate({ username, password })}
    />
  )
}
