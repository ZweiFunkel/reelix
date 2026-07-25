import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiFetch, unwrap } from '../../lib/api'
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
    mutationFn: (body: { name: string; rootPath?: string; type: LibraryType; managed?: boolean }) =>
      api.POST('/api/libraries', { body }).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['libraries'] }),
  })
}

export function useUploadToLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ libraryId, file }: { libraryId: number; file: File }) => {
      const form = new FormData()
      form.append('file', file)
      const res = await apiFetch(`/api/libraries/${libraryId}/upload`, { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Upload failed (${res.status})`)
      }
      return res.json()
    },
    onSuccess: (_data, { libraryId }) => {
      qc.invalidateQueries({ queryKey: ['library-root', libraryId] })
      qc.invalidateQueries({ queryKey: ['library-recent', libraryId] })
      qc.invalidateQueries({ queryKey: ['libraries'] })
    },
  })
}

export function useDeleteLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (libraryId: number) =>
      api.DELETE('/api/libraries/{libraryId}', { params: { path: { libraryId } } }).then(unwrap),
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
