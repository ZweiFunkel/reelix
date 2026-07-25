import { useLibraryRecent } from '../browse/hooks'
import { MediaTile } from '../browse/BrowseGrid'

export function LibraryRow({
  libraryId,
  label,
  onPlay,
  onOpenDetail,
  onOpenPhoto,
}: {
  libraryId: number
  label: string
  onPlay: (mediaItemId: number, itemType: 'media_item' | 'channel') => void
  onOpenDetail: (mediaItemId: number) => void
  onOpenPhoto: (mediaItemId: number) => void
}) {
  const recent = useLibraryRecent(libraryId)
  if (!recent.data || recent.data.length === 0) return null

  return (
    <section>
      <h2 className="text-lg font-medium mb-3">{label}</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {recent.data.map((item) => (
          <div key={item.id} className="w-36 shrink-0">
            <MediaTile item={item} onPlay={onPlay} onOpenDetail={onOpenDetail} onOpenPhoto={onOpenPhoto} />
          </div>
        ))}
      </div>
    </section>
  )
}
