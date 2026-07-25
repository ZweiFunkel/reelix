import { useMediaItem, useMediaItemSiblings } from '../browse/hooks'
import { MediaTile } from '../browse/BrowseGrid'
import { PlayIcon, BackIcon } from '../player/icons'
import { formatClockTime } from '../player/format'

function formatDurationLong(seconds: number | null | undefined) {
  if (!seconds) return null
  const mins = Math.round(seconds / 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function DetailPage({
  mediaItemId,
  onBack,
  onPlay,
  onOpenDetail,
  onOpenPhoto,
}: {
  mediaItemId: number
  onBack: () => void
  onPlay: (mediaItemId: number, itemType: 'media_item' | 'channel') => void
  onOpenDetail: (mediaItemId: number) => void
  onOpenPhoto: (mediaItemId: number) => void
}) {
  const { data: item, isLoading } = useMediaItem(mediaItemId)
  const siblings = useMediaItemSiblings(mediaItemId)

  if (isLoading || !item) {
    return <p className="text-neutral-500 text-sm">Loading…</p>
  }

  const isEpisode = item.seasonNumber != null && item.episodeNumber != null
  const rowLabel = isEpisode ? `More from Season ${item.seasonNumber}` : null
  const rowItems = (siblings.data ?? []).filter((s) => s.itemType === 'media_item')

  return (
    <div className="flex flex-col gap-6 -mx-6 -mt-6">
      <div className="relative w-full aspect-[16/6] bg-neutral-900 overflow-hidden">
        {item.backdropUrl && <img src={item.backdropUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-transparent" />
        <button
          onClick={onBack}
          className="absolute top-4 left-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
          title="Back"
        >
          <BackIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="px-6 flex flex-col gap-4 max-w-4xl">
        {isEpisode && <span className="text-sm text-neutral-400">{item.showTitle}</span>}
        <div>
          <h1 className="text-2xl font-semibold">{item.title}</h1>
          {isEpisode && (
            <p className="text-sm text-neutral-400 mt-1">
              Season {item.seasonNumber} · Episode {item.episodeNumber}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm text-neutral-400">
          {item.rating != null && (
            <span className="flex items-center gap-1 text-amber-400">★ {item.rating.toFixed(1)}</span>
          )}
          {formatDurationLong(item.durationSeconds) && <span>{formatDurationLong(item.durationSeconds)}</span>}
          {item.durationSeconds && (
            <span>Ends {formatClockTime(new Date(Date.now() + item.durationSeconds * 1000))}</span>
          )}
        </div>

        <button
          onClick={() => onPlay(item.id!, 'media_item')}
          className="flex items-center gap-2 px-5 py-2.5 rounded bg-red-600 hover:bg-red-500 font-semibold w-fit"
        >
          <PlayIcon className="w-5 h-5" />
          Play
        </button>

        {item.overview && <p className="text-sm text-neutral-300 leading-relaxed">{item.overview}</p>}
      </div>

      {rowLabel && rowItems.length > 0 && (
        <div className="px-6 flex flex-col gap-3">
          <h2 className="text-lg font-medium">{rowLabel}</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {rowItems.map((s) => (
              <div key={s.id} className={`w-36 shrink-0 ${s.id === item.id ? 'ring-2 ring-red-500 rounded-md' : ''}`}>
                <MediaTile item={s} onPlay={onPlay} onOpenDetail={onOpenDetail} onOpenPhoto={onOpenPhoto} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
