import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../../lib/api'

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
      api.POST('/api/setup/admin', { body }).then(unwrap),
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
      api.POST('/api/auth/login', { body }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.POST('/api/auth/logout').then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
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
