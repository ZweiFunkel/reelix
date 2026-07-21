import { useQuery } from '@tanstack/react-query'
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

export function useChannel(channelId: number | null) {
  return useQuery({
    queryKey: ['channel', channelId],
    enabled: channelId != null,
    queryFn: () => api.GET('/api/channels/{channelId}', { params: { path: { channelId: channelId! } } }).then(unwrap),
  })
}
