import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../../lib/api'

export function useLibraryRoot(libraryId: number | null) {
  return useQuery({
    queryKey: ['library-root', libraryId],
    enabled: libraryId != null,
    queryFn: () => api.GET('/api/libraries/{libraryId}/root', { params: { path: { libraryId: libraryId! } } }).then(unwrap),
  })
}

export function useCategoryChildren(categoryId: number | null) {
  return useQuery({
    queryKey: ['category-children', categoryId],
    enabled: categoryId != null,
    queryFn: () => api.GET('/api/categories/{categoryId}/children', { params: { path: { categoryId: categoryId! } } }).then(unwrap),
  })
}

export function useMediaItem(mediaItemId: number | null) {
  return useQuery({
    queryKey: ['media-item', mediaItemId],
    enabled: mediaItemId != null,
    queryFn: () => api.GET('/api/media-items/{mediaItemId}', { params: { path: { mediaItemId: mediaItemId! } } }).then(unwrap),
  })
}

export function useLibraryRecent(libraryId: number | null) {
  return useQuery({
    queryKey: ['library-recent', libraryId],
    enabled: libraryId != null,
    queryFn: () => api.GET('/api/libraries/{libraryId}/recent', { params: { path: { libraryId: libraryId! } } }).then(unwrap),
  })
}

export function useContinueWatching() {
  return useQuery({
    queryKey: ['continue-watching'],
    queryFn: () => api.GET('/api/continue-watching').then(unwrap),
  })
}

export function useMediaItemSiblings(mediaItemId: number | null) {
  return useQuery({
    queryKey: ['media-item-siblings', mediaItemId],
    enabled: mediaItemId != null,
    queryFn: () => api.GET('/api/media-items/{mediaItemId}/siblings', { params: { path: { mediaItemId: mediaItemId! } } }).then(unwrap),
  })
}

export function useChannel(channelId: number | null) {
  return useQuery({
    queryKey: ['channel', channelId],
    enabled: channelId != null,
    queryFn: () => api.GET('/api/channels/{channelId}', { params: { path: { channelId: channelId! } } }).then(unwrap),
  })
}

export function useShow(anchorMediaItemId: number | null) {
  return useQuery({
    queryKey: ['show', anchorMediaItemId],
    enabled: anchorMediaItemId != null,
    queryFn: () => api.GET('/api/media-items/{mediaItemId}/show', { params: { path: { mediaItemId: anchorMediaItemId! } } }).then(unwrap),
  })
}

export function useDeleteMediaItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mediaItemId: number) =>
      api.DELETE('/api/media-items/{mediaItemId}', { params: { path: { mediaItemId } } }).then(unwrap),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library-root'] })
      qc.invalidateQueries({ queryKey: ['category-children'] })
      qc.invalidateQueries({ queryKey: ['library-recent'] })
      qc.invalidateQueries({ queryKey: ['continue-watching'] })
    },
  })
}
