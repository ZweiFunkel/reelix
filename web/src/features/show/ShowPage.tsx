import { useShow } from '../browse/hooks'
import { MediaTile } from '../browse/BrowseGrid'
import { BackIcon } from '../player/icons'

export function ShowPage({
  anchorMediaItemId,
  onBack,
  onPlay,
  onOpenDetail,
  onOpenPhoto,
}: {
  anchorMediaItemId: number
  onBack: () => void
  onPlay: (mediaItemId: number, itemType: 'media_item' | 'channel') => void
  onOpenDetail: (mediaItemId: number) => void
  onOpenPhoto: (mediaItemId: number) => void
}) {
  const { data: show, isLoading } = useShow(anchorMediaItemId)

  if (isLoading || !show) {
    return <p className="text-neutral-500 text-sm">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-6 -mx-6 -mt-6">
      <div className="relative w-full aspect-[16/6] bg-neutral-900 overflow-hidden">
        {show.backdropUrl && <img src={show.backdropUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />}
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
        <h1 className="text-2xl font-semibold">{show.title}</h1>
        {show.overview && <p className="text-sm text-neutral-300 leading-relaxed">{show.overview}</p>}
      </div>

      <div className="px-6 flex flex-col gap-8">
        {(show.seasons ?? []).map((season) => (
          <section key={season.seasonNumber} className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Season {season.seasonNumber}</h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {(season.episodes ?? []).map((ep) => (
                <div key={ep.id} className="w-36 shrink-0">
                  <MediaTile item={ep} onPlay={onPlay} onOpenDetail={onOpenDetail} onOpenPhoto={onOpenPhoto} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
