import { AuthForm } from './AuthForm'
import { useSetupAdmin } from './hooks'

export function SetupPage() {
  const setupAdmin = useSetupAdmin()

  return (
    <AuthForm
      title="Create the admin account"
      subtitle="Welcome — let's set up your Reelix server."
      submitLabel="Create account & continue"
      pending={setupAdmin.isPending}
      error={setupAdmin.isError ? (setupAdmin.error as Error).message : null}
      onSubmit={(username, password) => setupAdmin.mutate({ username, password })}
    />
  )
}
