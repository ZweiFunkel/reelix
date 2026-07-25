import { useEffect, useState } from 'react'
import type { MediaItem } from '../../lib/types'
import { PlayIcon } from '../player/icons'

export function HeroBanner({ items, onPlay }: { items: MediaItem[]; onPlay: (mediaItemId: number, itemType: 'media_item' | 'channel') => void }) {
  const [index, setIndex] = useState(0)
  const current = items[index % items.length]

  useEffect(() => {
    if (items.length < 2) return
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), 8000)
    return () => clearInterval(t)
  }, [items.length])

  if (!current) return null

  return (
    <div className="relative w-full aspect-[16/7] rounded-lg overflow-hidden bg-neutral-900">
      {current.backdropUrl && (
        <img src={current.backdropUrl} alt={current.title} className="absolute inset-0 w-full h-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/20 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/80 via-transparent to-transparent" />

      <div className="absolute bottom-0 left-0 p-6 max-w-lg flex flex-col gap-3">
        <h1 className="text-3xl font-bold drop-shadow">{current.title}</h1>
        {current.overview && <p className="text-sm text-neutral-300 line-clamp-3 drop-shadow">{current.overview}</p>}
        <button
          onClick={() => onPlay(current.id!, current.itemType === 'channel' ? 'channel' : 'media_item')}
          className="flex items-center gap-2 px-5 py-2.5 rounded bg-white text-black font-semibold hover:bg-neutral-200 transition-colors w-fit"
        >
          <PlayIcon className="w-5 h-5" />
          Play
        </button>
      </div>

      {items.length > 1 && (
        <div className="absolute bottom-4 right-4 flex gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`w-2 h-2 rounded-full transition-colors ${i === index % items.length ? 'bg-white' : 'bg-white/30'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
