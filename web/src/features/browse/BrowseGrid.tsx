import { useState } from 'react'
import type { CategoryChildren, MediaItem } from '../../lib/types'

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return null
  const mins = Math.round(seconds / 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function PhotoTile({ item, onOpen }: { item: MediaItem; onOpen: () => void }) {
  const [failed, setFailed] = useState(false)

  return (
    <button
      onClick={onOpen}
      className="group aspect-[2/3] rounded-md bg-neutral-800 hover:ring-2 hover:ring-red-500 transition-all relative overflow-hidden"
    >
      {!failed ? (
        <img
          src={`/api/media-items/${item.id}/thumbnail`}
          alt={item.title}
          onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
          <svg viewBox="0 0 24 24" className="w-9 h-9 text-neutral-500" fill="currentColor">
            <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
          </svg>
          <span className="text-xs text-neutral-400 line-clamp-2">{item.title}</span>
        </div>
      )}
    </button>
  )
}

export function BrowseGrid({
  data,
  onOpenCategory,
  onPlay,
  onOpenPhoto,
}: {
  data: CategoryChildren
  onOpenCategory: (categoryId: number) => void
  onPlay: (mediaItemId: number, itemType: 'media_item' | 'channel') => void
  onOpenPhoto: (mediaItemId: number) => void
}) {
  const hasSubcategories = data.subcategories && data.subcategories.length > 0
  const hasItems = data.items && data.items.length > 0

  if (!hasSubcategories && !hasItems) {
    return (
      <p className="text-neutral-500 text-sm px-1">
        Nothing here yet — trigger a scan, or this folder is empty.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {hasSubcategories && (
        <section>
          <h2 className="text-sm font-medium text-neutral-400 mb-3 px-1">Categories</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {data.subcategories!.map((cat) => (
              <button
                key={cat.id}
                onClick={() => onOpenCategory(cat.id!)}
                className="group aspect-[2/3] rounded-md bg-neutral-800/80 hover:bg-neutral-700 transition-colors flex flex-col items-center justify-center gap-2 p-3 text-center"
              >
                <svg viewBox="0 0 24 24" className="w-8 h-8 text-neutral-500 group-hover:text-neutral-300" fill="currentColor">
                  <path d="M10 4H2v16h20V6H12l-2-2z" />
                </svg>
                <span className="text-sm text-neutral-200 line-clamp-2">{cat.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {hasItems && (
        <section>
          <h2 className="text-sm font-medium text-neutral-400 mb-3 px-1">Titles</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {data.items!.map((item) =>
              item.mediaType === 'photo' ? (
                <PhotoTile key={item.id} item={item} onOpen={() => onOpenPhoto(item.id!)} />
              ) : (
                <button
                  key={item.id}
                  onClick={() => onPlay(item.id!, item.itemType === 'channel' ? 'channel' : 'media_item')}
                  className="group aspect-[2/3] rounded-md bg-neutral-800 hover:bg-red-900/40 transition-colors flex flex-col items-center justify-center gap-2 p-3 text-center relative overflow-hidden"
                >
                  <svg viewBox="0 0 24 24" className="w-9 h-9 text-neutral-500 group-hover:text-red-400" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span className="text-sm text-neutral-200 line-clamp-2">{item.title}</span>
                  {item.itemType === 'channel' ? (
                    <span className="text-[10px] font-semibold tracking-wide text-red-400 absolute bottom-2 right-2">LIVE</span>
                  ) : (
                    formatDuration(item.durationSeconds) && (
                      <span className="text-xs text-neutral-500 absolute bottom-2 right-2">
                        {formatDuration(item.durationSeconds)}
                      </span>
                    )
                  )}
                </button>
              ),
            )}
          </div>
        </section>
      )}
    </div>
  )
}
