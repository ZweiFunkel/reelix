import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../../lib/api'

export function useAdminSessions() {
  return useQuery({
    queryKey: ['admin-sessions'],
    queryFn: () => api.GET('/api/admin/sessions').then(unwrap),
    refetchInterval: 10_000,
  })
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.GET('/api/admin/users').then(unwrap),
  })
}

export function useCreateAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { username: string; password: string; role: 'admin' | 'user' }) =>
      api.POST('/api/admin/users', { body }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
}

export function useUpdateAdminUserRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: 'admin' | 'user' }) =>
      api.PATCH('/api/admin/users/{userId}/role', { params: { path: { userId } }, body: { role } }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
}
