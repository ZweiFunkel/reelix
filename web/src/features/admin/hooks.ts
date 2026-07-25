import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../../lib/api'

export function useAdminSessions() {
  return useQuery({
    queryKey: ['admin-sessions'],
    queryFn: () => api.GET('/api/admin/sessions').then(unwrap),
    refetchInterval: 10_000,
  })
}
