import { useEffect, useRef } from 'react'
import Hls from 'hls.js'
import { api } from '../../lib/api'
import { useMediaItem, useChannel } from '../browse/hooks'

const DIRECT_PLAY_EXTENSIONS = ['.mp4', '.webm', '.m4v']
const PROGRESS_REPORT_INTERVAL_MS = 10_000
const WATCHED_THRESHOLD = 0.9

function reportProgress(mediaItemId: number, video: HTMLVideoElement) {
  if (!video.duration || Number.isNaN(video.duration)) return
  api.POST('/api/media-items/{mediaItemId}/progress', {
    params: { path: { mediaItemId } },
    body: {
      positionSeconds: video.currentTime,
      durationSeconds: video.duration,
      watched: video.currentTime / video.duration >= WATCHED_THRESHOLD,
    },
  })
}

export function Player({
  mediaItemId,
  itemType = 'media_item',
  onClose,
}: {
  mediaItemId: number
  itemType?: 'media_item' | 'channel'
  onClose: () => void
}) {
  const isChannel = itemType === 'channel'
  const mediaItemQuery = useMediaItem(isChannel ? null : mediaItemId)
  const channelQuery = useChannel(isChannel ? mediaItemId : null)
  const { data: item, isLoading } = isChannel ? channelQuery : mediaItemQuery
  const videoRef = useRef<HTMLVideoElement>(null)

  const streamUrl = isChannel ? `/api/channels/${mediaItemId}/stream` : `/api/media-items/${mediaItemId}/stream`
  // Live channels are always played through hls.js/native HLS — there's
  // no local file extension to inspect, and nothing to seek/resume.
  const isDirectPlay = isChannel ? false : item ? DIRECT_PLAY_EXTENSIONS.some((ext) => item.filePath?.toLowerCase().endsWith(ext)) : true

  useEffect(() => {
    const video = videoRef.current
    if (!video || !item) return

    if (!isChannel) {
      const resumeAt = item.progress?.positionSeconds
      if (resumeAt && resumeAt > 0 && !item.progress?.watched) {
        video.currentTime = resumeAt
      }
    }

    if (isDirectPlay) {
      video.src = streamUrl
      return
    }

    if (Hls.isSupported()) {
      const hls = new Hls()
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      if (isChannel) return () => hls.destroy()
      const interval = window.setInterval(() => reportProgress(mediaItemId, video), PROGRESS_REPORT_INTERVAL_MS)
      return () => {
        window.clearInterval(interval)
        hls.destroy()
      }
    }

    // Safari/WebKit: native HLS support, no hls.js needed.
    video.src = streamUrl
    if (isChannel) return
    const interval = window.setInterval(() => reportProgress(mediaItemId, video), PROGRESS_REPORT_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [item, isDirectPlay, isChannel, streamUrl, mediaItemId])

  const handleClose = () => {
    if (!isChannel && videoRef.current) reportProgress(mediaItemId, videoRef.current)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-neutral-300 text-sm">{item?.title ?? (isLoading ? 'Loading…' : '')}</span>
        <button onClick={handleClose} className="text-neutral-400 hover:text-white px-2 py-1">
          ✕ Close
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <video ref={videoRef} controls autoPlay className="max-h-full max-w-full" />
      </div>
    </div>
  )
}
