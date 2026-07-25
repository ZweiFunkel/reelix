import type { Page } from '../components/Sidebar'

// Keeps the browser URL in sync with in-app navigation so a reload (or
// a bookmarked/shared link) lands back on the same page instead of
// always dumping the user at Home — the whole app previously lived in
// pure React state with no URL involvement at all.
export function pageToPath(page: Page): string {
  switch (page.kind) {
    case 'home':
      return '/'
    case 'admin':
      return '/admin'
    case 'detail':
      return `/media/${page.mediaItemId}`
    case 'show':
      return `/show/${page.anchorMediaItemId}`
    case 'browse': {
      const libraryId = page.path[0]?.libraryId
      const categoryIds = page.path.map((e) => e.categoryId).filter((id): id is number => id != null)
      return `/library/${libraryId}${categoryIds.length ? '/' + categoryIds.join('/') : ''}`
    }
  }
}

export type ParsedRoute =
  | { kind: 'home' }
  | { kind: 'admin' }
  | { kind: 'detail'; mediaItemId: number }
  | { kind: 'show'; anchorMediaItemId: number }
  | { kind: 'browse-ids'; libraryId: number; categoryIds: number[] }

export function parsePath(pathname: string): ParsedRoute {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return { kind: 'home' }
  if (parts[0] === 'admin') return { kind: 'admin' }
  if (parts[0] === 'media' && parts[1]) return { kind: 'detail', mediaItemId: Number(parts[1]) }
  if (parts[0] === 'show' && parts[1]) return { kind: 'show', anchorMediaItemId: Number(parts[1]) }
  if (parts[0] === 'library' && parts[1]) {
    const libraryId = Number(parts[1])
    const categoryIds = parts
      .slice(2)
      .map(Number)
      .filter((n) => !Number.isNaN(n))
    return { kind: 'browse-ids', libraryId, categoryIds }
  }
  return { kind: 'home' }
}

// LOADING_LABEL marks a breadcrumb entry restored from a bare URL (just
// ids, no names) that still needs its real name fetched.
export const LOADING_LABEL = '…'

export function pageFromLocation(): Page {
  const parsed = parsePath(window.location.pathname)
  switch (parsed.kind) {
    case 'home':
      return { kind: 'home' }
    case 'admin':
      return { kind: 'admin' }
    case 'detail':
      return { kind: 'detail', mediaItemId: parsed.mediaItemId }
    case 'show':
      return { kind: 'show', anchorMediaItemId: parsed.anchorMediaItemId }
    case 'browse-ids':
      return {
        kind: 'browse',
        path: [
          { libraryId: parsed.libraryId, categoryId: null, label: LOADING_LABEL },
          ...parsed.categoryIds.map((categoryId) => ({ libraryId: parsed.libraryId, categoryId, label: LOADING_LABEL })),
        ],
      }
  }
}
