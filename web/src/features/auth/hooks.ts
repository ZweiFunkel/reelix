import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../../lib/api'

export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup-status'],
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
