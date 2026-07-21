import { useMediaItem } from './hooks'

export function PhotoLightbox({ mediaItemId, onClose }: { mediaItemId: number; onClose: () => void }) {
  const { data: item } = useMediaItem(mediaItemId)

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-neutral-300 text-sm">{item?.title}</span>
        <button onClick={onClose} className="text-neutral-400 hover:text-white px-2 py-1">
          ✕ Close
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <img
          src={`/api/media-items/${mediaItemId}/stream`}
          alt={item?.title}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    </div>
  )
}
