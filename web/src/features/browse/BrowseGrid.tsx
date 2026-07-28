import { useState } from 'react'
import type { CategoryChildren, MediaItem } from '../../lib/types'
import { mediaUrl } from '../../lib/api'

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
      className="group w-full h-full aspect-[2/3] rounded-md bg-neutral-800 hover:ring-2 hover:ring-red-500 transition-all relative overflow-hidden"
    >
      {!failed ? (
        <img
          src={mediaUrl(`/api/media-items/${item.id}/thumbnail`)}
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

export function MediaTile({
  item,
  onPlay,
  onOpenDetail,
  onOpenShow,
  onOpenPhoto,
}: {
  item: MediaItem
  onPlay: (mediaItemId: number, itemType: 'media_item' | 'channel') => void
  onOpenDetail: (mediaItemId: number) => void
  onOpenShow?: (anchorMediaItemId: number) => void
  onOpenPhoto: (mediaItemId: number) => void
}) {
  const [thumbFailed, setThumbFailed] = useState(false)

  if (item.mediaType === 'photo') {
    return <PhotoTile item={item} onOpen={() => onOpenPhoto(item.id!)} />
  }

  const isChannel = item.itemType === 'channel'
  const isShow = item.itemType === 'show'
  const progressPct =
    item.progress?.positionSeconds != null && item.durationSeconds
      ? Math.min(100, (item.progress.positionSeconds / item.durationSeconds) * 100)
      : null

  // Prefer TMDb poster art; for local videos with no match, fall back to
  // the frame-grab thumbnail generated at scan time. Live channels and
  // show tiles without a TMDb match have neither.
  const imageSrc = item.posterUrl ?? (!isChannel && !isShow && !thumbFailed ? mediaUrl(`/api/media-items/${item.id}/thumbnail`) : null)
  const episodeBadge =
    !isShow && item.seasonNumber != null && item.episodeNumber != null ? `S${item.seasonNumber} · E${item.episodeNumber}` : null

  const handleClick = () => {
    if (isChannel) onPlay(item.id!, 'channel')
    // Live channels play immediately (no useful detail page for live
    // TV); a grouped show tile opens the show page; everything else
    // opens the detail page first, same as Jellyfin/Netflix — the
    // Player itself is reached via its Play button.
    else if (isShow) onOpenShow?.(item.id!)
    else onOpenDetail(item.id!)
  }

  return (
    <button
      onClick={handleClick}
      className="group w-full h-full aspect-[2/3] rounded-md bg-neutral-800 hover:ring-2 hover:ring-red-500 transition-all flex flex-col items-center justify-center gap-2 p-3 text-center relative overflow-hidden"
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={item.title}
          onError={() => setThumbFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <>
          <svg viewBox="0 0 24 24" className="w-9 h-9 text-neutral-500 group-hover:text-red-400" fill="currentColor">
            {isShow ? (
              <path d="M4 4h16v16H4V4zm2 2v2h2V6H6zm4 0v2h2V6h-2zm4 0v2h2V6h-2zM6 10v8h12v-8H6z" />
            ) : (
              <path d="M8 5v14l11-7z" />
            )}
          </svg>
          <span className="text-sm text-neutral-200 line-clamp-2">{item.title}</span>
        </>
      )}
      {episodeBadge && (
        <span className="text-[10px] font-medium text-white bg-black/60 px-1 rounded absolute top-2 left-2">{episodeBadge}</span>
      )}
      {isChannel ? (
        <span className="text-[10px] font-semibold tracking-wide text-red-400 absolute bottom-2 right-2">LIVE</span>
      ) : (
        formatDuration(item.durationSeconds) && (
          <span
            className={`text-xs absolute bottom-2 right-2 ${imageSrc ? 'text-white bg-black/60 px-1 rounded' : 'text-neutral-500'}`}
          >
            {formatDuration(item.durationSeconds)}
          </span>
        )
      )}
      {imageSrc && (
        <span className="absolute bottom-2 left-2 right-10 text-xs text-white bg-black/60 px-1 rounded truncate opacity-0 group-hover:opacity-100 transition-opacity">
          {item.title}
        </span>
      )}
      {progressPct != null && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-700">
          <div className="h-full bg-red-500" style={{ width: `${progressPct}%` }} />
        </div>
      )}
    </button>
  )
}

export function BrowseGrid({
  data,
  onOpenCategory,
  onPlay,
  onOpenDetail,
  onOpenShow,
  onOpenPhoto,
}: {
  data: CategoryChildren
  onOpenCategory: (categoryId: number) => void
  onPlay: (mediaItemId: number, itemType: 'media_item' | 'channel') => void
  onOpenDetail: (mediaItemId: number) => void
  onOpenShow: (anchorMediaItemId: number) => void
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
            {data.items!.map((item) => (
              <MediaTile
                key={item.id}
                item={item}
                onPlay={onPlay}
                onOpenDetail={onOpenDetail}
                onOpenShow={onOpenShow}
                onOpenPhoto={onOpenPhoto}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
