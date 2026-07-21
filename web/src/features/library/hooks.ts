import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../../lib/api'
import type { LibraryType } from '../../lib/types'

export function useLibraries() {
  return useQuery({
    queryKey: ['libraries'],
    queryFn: () => api.GET('/api/libraries').then(unwrap),
  })
}

export function useCreateLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; rootPath: string; type: LibraryType }) =>
      api.POST('/api/libraries', { body }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['libraries'] }),
  })
}

export function useTriggerScan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (libraryId: number) =>
      api.POST('/api/libraries/{libraryId}/scan', { params: { path: { libraryId } } }).then(unwrap),
    onSuccess: (_data, libraryId) => {
      qc.invalidateQueries({ queryKey: ['library-root', libraryId] })
      qc.invalidateQueries({ queryKey: ['libraries'] })
    },
  })
}
