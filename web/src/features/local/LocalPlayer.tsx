import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import mpegts from 'mpegts.js'
import { formatDuration, formatClockTime } from '../player/format'
import { PlayIcon, PauseIcon, VolumeIcon, FullscreenIcon, BackIcon, SpinnerIcon } from '../player/icons'
import { parseEnigma2StreamUrl, zapEnigma2Channel, enigma2StreamSrc } from '../../lib/enigma2'
import { toggleAppFullscreen } from '../../lib/fullscreen'

const DIRECT_PLAY_EXTENSIONS = ['.mp4', '.webm', '.m4v', '.mov']
// How long to give an Enigma2 receiver's tuner to lock onto the new
// channel after a zap request before we start reading its stream —
// starting immediately reads a mix of the old and new channel's data.
const ZAP_SETTLE_MS = 1200

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
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [zapping, setZapping] = useState(false)
  const idleTimerRef = useRef<number | null>(null)

  const isDirectPlay = DIRECT_PLAY_EXTENSIONS.some((ext) => src.toLowerCase().split('?')[0].endsWith(ext))
  const enigma2Target = parseEnigma2StreamUrl(src)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    setPlaybackError(null)
    let cancelled = false
    let hls: Hls | null = null
    let tsPlayer: ReturnType<typeof mpegts.createPlayer> | null = null

    ;(async () => {
      if (enigma2Target) {
        setZapping(true)
        try {
          await zapEnigma2Channel(enigma2Target)
        } catch (err) {
          console.warn('reelix: enigma2 zap request failed, trying to play anyway', err)
        }
        await new Promise((resolve) => setTimeout(resolve, ZAP_SETTLE_MS))
        setZapping(false)
      }
      if (cancelled) return

      if (isDirectPlay || (!enigma2Target && !Hls.isSupported())) {
        video.src = src
        return
      }

      // Enigma2/Dreambox receivers stream raw MPEG-TS (not an HLS
      // manifest), which hls.js can't parse — mpegts.js demuxes that
      // directly via MSE. Anything else is assumed to be real HLS.
      if (enigma2Target) {
        tsPlayer = mpegts.createPlayer({ type: 'mse', isLive: true, url: enigma2StreamSrc(src) })
        tsPlayer.on(mpegts.Events.ERROR, (type: string, detail: string) => {
          console.error('reelix: local mpegts error', type, detail)
          setPlaybackError(`Can't play this receiver's stream (${type}: ${detail}). Check that it's reachable on the network and the channel exists.`)
        })
        tsPlayer.attachMediaElement(video)
        tsPlayer.load()
        tsPlayer.play()
        return
      }

      hls = new Hls()
      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error('reelix: local HLS error', data.type, data.details, data.fatal ? '(fatal)' : '', data)
        if (data.fatal) {
          setPlaybackError(`Can't play this stream (${data.details}). If this is an IPTV channel, its own server or receiver might need to be online/tuned to it first.`)
        }
      })
      hls.loadSource(src)
      hls.attachMedia(video)
    })()

    return () => {
      cancelled = true
      hls?.destroy()
      tsPlayer?.destroy()
    }
    // enigma2Target is a pure function of src, so it's intentionally
    // left out of the deps below — including it (a fresh object every
    // render) would re-run this effect, and its zap request, every
    // single render instead of only when src actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    toggleAppFullscreen(containerRef.current)
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
          onError={(e) => {
            const err = e.currentTarget.error
            console.error('reelix: local video error', err?.code, err?.message)
            setPlaybackError(`Can't play this stream${err?.message ? ` (${err.message})` : ''}. If this is an IPTV channel, its own server or receiver might need to be online/tuned to it first.`)
          }}
        />
        {zapping && (
          <div className="flex flex-col items-center gap-3 absolute pointer-events-none">
            <SpinnerIcon className="w-12 h-12 text-white/80 animate-spin" />
            <span className="text-white/80 text-sm">Switching receiver to this channel…</span>
          </div>
        )}
        {buffering && !playbackError && !zapping && <SpinnerIcon className="w-12 h-12 text-white/80 animate-spin absolute pointer-events-none" />}
        {playbackError && (
          <div className="absolute inset-0 flex items-center justify-center px-8">
            <p className="text-neutral-300 text-sm text-center max-w-md">{playbackError}</p>
          </div>
        )}
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
