import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { api } from '../../lib/api'
import { useMediaItem, useChannel, useMediaItemSiblings } from '../browse/hooks'
import { formatDuration, formatClockTime } from './format'
import { toggleAppFullscreen } from '../../lib/fullscreen'
import { PlayIcon, PauseIcon, SkipBackIcon, SkipForwardIcon, VolumeIcon, FullscreenIcon, BackIcon, SpinnerIcon } from './icons'

const DIRECT_PLAY_EXTENSIONS = ['.mp4', '.webm', '.m4v']
const PROGRESS_REPORT_INTERVAL_MS = 10_000
const WATCHED_THRESHOLD = 0.9
const SKIP_SECONDS = 10
const CONTROLS_IDLE_HIDE_MS = 3_000
const NEXT_EPISODE_PROMPT_SECONDS = 15

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
  onNext,
}: {
  mediaItemId: number
  itemType?: 'media_item' | 'channel'
  onClose: () => void
  onNext?: (mediaItemId: number) => void
}) {
  const isChannel = itemType === 'channel'
  const mediaItemQuery = useMediaItem(isChannel ? null : mediaItemId)
  const channelQuery = useChannel(isChannel ? mediaItemId : null)
  const { data: item, isLoading } = isChannel ? channelQuery : mediaItemQuery
  const siblings = useMediaItemSiblings(isChannel ? null : mediaItemId)
  const nextItem = (() => {
    if (!siblings.data) return null
    const idx = siblings.data.findIndex((s) => s.id === mediaItemId)
    return idx >= 0 ? siblings.data[idx + 1] ?? null : null
  })()
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const idleTimerRef = useRef<number | null>(null)

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
      hls.on(Hls.Events.ERROR, (_event, data) => {
        // Surfaced so a dying ffmpeg process or a stalled fetch shows up
        // as something diagnosable instead of playback just quietly
        // stopping with no trace anywhere.
        console.error('reelix: HLS error', data.type, data.details, data.fatal ? '(fatal)' : '', data)
      })
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

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play()
    else video.pause()
  }

  const showControls = () => {
    setControlsVisible(true)
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    idleTimerRef.current = window.setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false)
    }, CONTROLS_IDLE_HIDE_MS)
  }

  useEffect(() => {
    showControls()
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isPlaying) setControlsVisible(true)
    else showControls()
  }, [isPlaying])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowLeft') {
        skip(-SKIP_SECONDS)
      } else if (e.key === 'ArrowRight') {
        skip(SKIP_SECONDS)
      } else if (e.key === 'Escape') {
        handleClose()
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen()
      } else if (e.key === 'm' || e.key === 'M') {
        changeVolume(muted ? 1 : 0)
      } else {
        return
      }
      showControls()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted])

  const skip = (seconds: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + seconds))
  }

  const seekTo = (seconds: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = seconds
    setCurrentTime(seconds)
  }

  const changeVolume = (v: number) => {
    const video = videoRef.current
    if (!video) return
    video.volume = v
    video.muted = v === 0
    setVolume(v)
    setMuted(v === 0)
  }

  const toggleFullscreen = () => {
    toggleAppFullscreen(containerRef.current)
  }

  // Prefer the server's ffprobe-derived duration over the <video>
  // element's own, which briefly under-reports while HLS is still
  // growing the playlist (especially right after a rescan invalidates
  // the transcode's scratch dir) — without this, remaining/seek-bar/
  // "Ends" all flash a much-too-short duration for a second or two
  // before catching up to the real value.
  const displayDuration = (!isChannel && item?.durationSeconds) || duration
  const isLive = isChannel || !Number.isFinite(displayDuration) || displayDuration === 0
  const remaining = Math.max(0, displayDuration - currentTime)

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black z-50 flex flex-col"
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      <div
        className={`flex items-center gap-3 px-4 py-3 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button onClick={handleClose} className="text-neutral-300 hover:text-white p-1" title="Back">
          <BackIcon className="w-6 h-6" />
        </button>
        <span className="text-white text-base font-medium truncate">{item?.title ?? (isLoading ? 'Loading…' : '')}</span>
      </div>

      <div className="flex-1 flex items-center justify-center min-h-0 relative">
        <video
          ref={videoRef}
          autoPlay
          className="w-full h-full object-contain"
          onClick={togglePlay}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onVolumeChange={(e) => {
            setVolume(e.currentTarget.volume)
            setMuted(e.currentTarget.muted)
          }}
          onEnded={() => {
            if (nextItem?.id != null && onNext) onNext(nextItem.id)
            else handleClose()
          }}
        />
        {buffering && (
          <SpinnerIcon className="w-12 h-12 text-white/80 animate-spin absolute pointer-events-none" />
        )}
        {!isLive && nextItem && remaining <= NEXT_EPISODE_PROMPT_SECONDS && onNext && (
          <button
            onClick={() => onNext(nextItem.id!)}
            className="absolute bottom-6 right-6 flex items-center gap-2 px-4 py-2.5 rounded bg-neutral-900/90 border border-neutral-700 hover:bg-neutral-800 text-sm font-medium"
          >
            Next: {nextItem.title}
            <SkipForwardIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      <div
        className={`flex flex-col gap-1 px-4 pb-4 pt-2 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {isLive ? (
          <div className="flex items-center gap-2 py-1">
            <span className="text-[10px] font-semibold tracking-wide text-red-400 bg-red-950/60 px-2 py-0.5 rounded">
              LIVE
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm text-neutral-300">
            <span className="w-14 text-right tabular-nums">-{formatDuration(remaining)}</span>
            <input
              type="range"
              min={0}
              max={displayDuration || 0}
              step={0.1}
              value={currentTime}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="flex-1 accent-red-500 cursor-pointer"
            />
            <span className="w-40 text-neutral-400 tabular-nums">
              {formatDuration(displayDuration)} · Ends {formatClockTime(new Date(Date.now() + remaining * 1000))}
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          {!isLive && (
            <>
              <button onClick={() => skip(-SKIP_SECONDS)} className="text-neutral-300 hover:text-white p-1" title="Back 10s">
                <SkipBackIcon className="w-6 h-6" />
              </button>
              <button onClick={togglePlay} className="text-neutral-100 hover:text-white p-1">
                {isPlaying ? <PauseIcon className="w-7 h-7" /> : <PlayIcon className="w-7 h-7" />}
              </button>
              <button onClick={() => skip(SKIP_SECONDS)} className="text-neutral-300 hover:text-white p-1" title="Forward 10s">
                <SkipForwardIcon className="w-6 h-6" />
              </button>
            </>
          )}
          {isLive && (
            <button onClick={togglePlay} className="text-neutral-100 hover:text-white p-1">
              {isPlaying ? <PauseIcon className="w-7 h-7" /> : <PlayIcon className="w-7 h-7" />}
            </button>
          )}

          <div className="flex-1" />

          <button onClick={() => changeVolume(muted ? 1 : 0)} className="text-neutral-300 hover:text-white p-1">
            <VolumeIcon muted={muted} className="w-5 h-5" />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            className="w-20 accent-red-500 cursor-pointer"
          />
          <button onClick={toggleFullscreen} className="text-neutral-300 hover:text-white p-1">
            <FullscreenIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
