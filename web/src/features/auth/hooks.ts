import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../../lib/api'
import { clearSessionToken, isNativeShell, setSessionToken } from '../../lib/platform'

// Login and setup hand back the session id in their response body on top
// of setting the cookie; native shells persist it and send it as a
// bearer token from then on, because their cross-site cookie can't be
// stored over plain HTTP. Browsers get the same field and simply ignore
// it — the cookie already works there.
//
// A server too old to return the field leaves a native shell with no
// usable credential at all: login appears to succeed, then every
// request after it 401s. Fail loudly here instead, since the only fix
// is on the server and a bare 401 gives no hint of that.
// Runs inside the mutationFn rather than onSuccess so a throw here
// actually surfaces as the mutation's error (react-query ignores
// throws from onSuccess) and reaches the form the user is looking at.
function rememberSession<T>(result: T): T {
  const token = (result as { sessionToken?: string } | null)?.sessionToken
  if (token) {
    setSessionToken(token)
    return result
  }
  if (isNativeShell()) {
    throw new Error(
      "This server is running an older version of Reelix that the app can't stay signed in to. Update the server (run deploy/update.sh on it), then try again.",
    )
  }
  return result
}

export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup-status'],
    // This is what native shells key off of to decide the server's
    // unreachable and fall back to local-only — fail fast instead of
    // the default 3-retry exponential backoff so that decision (and
    // the loading screen before it) doesn't drag on for several
    // seconds every time there's no server configured or reachable.
    retry: 1,
    queryFn: () => api.GET('/api/setup/status').then(unwrap),
  })
}

export function useSetupAdmin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      api.POST('/api/setup/admin', { body }).then(unwrap).then(rememberSession),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['setup-status'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    retry: false,
    queryFn: () => api.GET('/api/auth/me').then(unwrap),
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      api.POST('/api/auth/login', { body }).then(unwrap).then(rememberSession),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.POST('/api/auth/logout').then(unwrap),
    onSuccess: () => {
      clearSessionToken()
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useCreateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { displayName: string; isKid: boolean; pin?: string }) =>
      api.POST('/api/profiles', { body }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })
}

export function useSelectProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ profileId, pin }: { profileId: number; pin?: string }) =>
      api
        .POST('/api/profiles/{profileId}/select', {
          params: { path: { profileId } },
          body: { pin },
        })
        .then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })
}

export function useUpdateEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (email: string) => api.PATCH('/api/auth/me', { body: { email } }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })
}

export function useUpdateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { email?: string; username?: string }) => api.PATCH('/api/auth/me', { body }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })
}

export function useSendVerification() {
  return useMutation({
    mutationFn: () => api.POST('/api/auth/send-verification').then(unwrap),
  })
}

export function useVerifyEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => api.POST('/api/auth/verify-email', { body: { code } }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (username: string) => api.POST('/api/auth/forgot-password', { body: { username } }).then(unwrap),
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: { username: string; code: string; newPassword: string }) =>
      api.POST('/api/auth/reset-password', { body }).then(unwrap),
  })
}
