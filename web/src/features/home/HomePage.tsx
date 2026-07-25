import { useContinueWatching, useLibraryRecent } from '../browse/hooks'
import { MediaTile } from '../browse/BrowseGrid'
import { HeroBanner } from './HeroBanner'
import { LibraryRow } from './LibraryRow'
import type { Library } from '../../lib/types'
import type { Page } from '../../components/Sidebar'

export function HomePage({
  libraries,
  isAdmin,
  onPlay,
  onOpenDetail,
  onOpenPhoto,
  onNavigate,
  onAddLibrary,
}: {
  libraries: Library[] | undefined
  isAdmin: boolean
  onPlay: (mediaItemId: number, itemType: 'media_item' | 'channel') => void
  onOpenDetail: (mediaItemId: number) => void
  onOpenPhoto: (mediaItemId: number) => void
  onNavigate: (page: Page) => void
  onAddLibrary: () => void
}) {
  const continueWatching = useContinueWatching()
  const browsableLibraries = libraries?.filter((l) => l.type !== 'M3U') ?? []
  const heroPool = useLibraryRecent(browsableLibraries[0]?.id ?? null)

  const hasContinueWatching = (continueWatching.data?.length ?? 0) > 0
  const heroItems = (heroPool.data ?? []).filter((item) => item.backdropUrl).slice(0, 5)

  return (
    <div className="flex flex-col gap-10">
      {heroItems.length > 0 && <HeroBanner items={heroItems} onPlay={onPlay} />}

      {hasContinueWatching && (
        <section>
          <h2 className="text-lg font-medium mb-3">Continue Watching</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {continueWatching.data!.map((item) => (
              <div key={item.id} className="w-36 shrink-0">
                <MediaTile item={item} onPlay={onPlay} onOpenDetail={onOpenDetail} onOpenPhoto={onOpenPhoto} />
              </div>
            ))}
          </div>
        </section>
      )}

      {browsableLibraries.map((lib) => (
        <LibraryRow
          key={lib.id}
          libraryId={lib.id!}
          label={lib.name!}
          onPlay={onPlay}
          onOpenDetail={onOpenDetail}
          onOpenPhoto={onOpenPhoto}
        />
      ))}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Your Libraries</h2>
          {isAdmin && (
            <button onClick={onAddLibrary} className="px-3 py-2 rounded bg-red-600 hover:bg-red-500 font-medium text-xs">
              + Add library
            </button>
          )}
        </div>
        {(!libraries || libraries.length === 0) && (
          <p className="text-neutral-500 text-sm">{isAdmin ? 'No libraries yet — add one to get started.' : 'No libraries yet.'}</p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {libraries?.map((lib) => (
            <button
              key={lib.id}
              onClick={() => onNavigate({ kind: 'browse', path: [{ libraryId: lib.id!, categoryId: null, label: lib.name! }] })}
              className="aspect-[2/3] rounded-md bg-neutral-800/80 hover:bg-neutral-700 transition-colors flex flex-col items-center justify-center gap-2 p-3 text-center"
            >
              <span className="text-sm text-neutral-200 line-clamp-2">{lib.name}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
