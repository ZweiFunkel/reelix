import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { formatDuration, formatClockTime } from '../player/format'
import { PlayIcon, PauseIcon, VolumeIcon, FullscreenIcon, BackIcon, SpinnerIcon } from '../player/icons'

const DIRECT_PLAY_EXTENSIONS = ['.mp4', '.webm', '.m4v', '.mov']

// A stripped-down sibling of features/player/Player.tsx for content that
// isn't a Reelix mediaItemId/channelId — local on-device files and M3U
// channels picked outside any server. No progress reporting (there's no
// WatchState for local content) and no next-episode, since neither
// concept applies here; everything else (controls, HLS fallback) mirrors
// the real player so playback feels consistent either way.
export function LocalPlayer({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
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

  const isDirectPlay = DIRECT_PLAY_EXTENSIONS.some((ext) => src.toLowerCase().split('?')[0].endsWith(ext))

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (isDirectPlay || !Hls.isSupported()) {
      video.src = src
      return
    }

    const hls = new Hls()
    hls.on(Hls.Events.ERROR, (_event, data) => {
      console.error('reelix: local HLS error', data.type, data.details, data.fatal ? '(fatal)' : '', data)
    })
    hls.loadSource(src)
    hls.attachMedia(video)
    return () => hls.destroy()
  }, [src, isDirectPlay])

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
    }, 3000)
  }

  useEffect(() => {
    showControls()
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowLeft') {
        seekBy(-10)
      } else if (e.key === 'ArrowRight') {
        seekBy(10)
      } else if (e.key === 'Escape') {
        onClose()
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

  const seekBy = (seconds: number) => {
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
    if (document.fullscreenElement) document.exitFullscreen()
    else containerRef.current?.requestFullscreen()
  }

  const isLive = !Number.isFinite(duration) || duration === 0
  const remaining = Math.max(0, duration - currentTime)

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black z-50 flex flex-col" onMouseMove={showControls} onTouchStart={showControls}>
      <div
        className={`flex items-center gap-3 px-4 py-3 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button onClick={onClose} className="text-neutral-300 hover:text-white p-1" title="Back">
          <BackIcon className="w-6 h-6" />
        </button>
        <span className="text-white text-base font-medium truncate">{title}</span>
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
          onEnded={onClose}
        />
        {buffering && <SpinnerIcon className="w-12 h-12 text-white/80 animate-spin absolute pointer-events-none" />}
      </div>

      <div
        className={`flex flex-col gap-1 px-4 pb-4 pt-2 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {isLive ? (
          <div className="flex items-center gap-2 py-1">
            <span className="text-[10px] font-semibold tracking-wide text-red-400 bg-red-950/60 px-2 py-0.5 rounded">LIVE</span>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm text-neutral-300">
            <span className="w-14 text-right tabular-nums">-{formatDuration(remaining)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="flex-1 accent-red-500 cursor-pointer"
            />
            <span className="w-40 text-neutral-400 tabular-nums">
              {formatDuration(duration)} · Ends {formatClockTime(new Date(Date.now() + remaining * 1000))}
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={togglePlay} className="text-neutral-100 hover:text-white p-1">
            {isPlaying ? <PauseIcon className="w-7 h-7" /> : <PlayIcon className="w-7 h-7" />}
          </button>

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
