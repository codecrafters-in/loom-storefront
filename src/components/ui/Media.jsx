import { lazy, Suspense, useEffect, useState } from 'react'
import * as media from '../../lib/media.js'
import { responsive } from '../../lib/images.js'

const VideoEmbed = lazy(() => import('./VideoEmbed.jsx'))

/**
 * Renders whatever a product stored: a CDN URL, a bundled path, or an uploaded
 * file held in the browser. Images become `<img>`, video becomes `<video>`.
 *
 * A `media:` reference has to be resolved out of IndexedDB, which is async. The
 * synchronous cache covers the overwhelming majority of renders — a grid asks
 * for the same handful of ids — and the effect below is the cold path only.
 *
 * Bundled photographs get a `<picture>` with narrower WebP copies; a phone
 * loading a twelve-card grid pulls 246KB instead of 1.1MB. `sizes` is not
 * optional there — without it the browser assumes the image fills the viewport
 * and picks the largest candidate every time, which is the same bytes as
 * before plus a second request format. Pass one from `SIZES`.
 */
export default function Media({
  src,
  alt = '',
  type,
  provider,
  embedUrl,
  className = '',
  poster,
  controls = false,
  autoPlay = false,
  sizes,
  ...rest
}) {
  const [resolved, setResolved] = useState(() => media.resolveSync(src))

  useEffect(() => {
    const immediate = media.resolveSync(src)
    if (immediate) {
      setResolved(immediate)
      return undefined
    }
    if (!media.isMediaRef(src)) {
      setResolved(src)
      return undefined
    }
    let alive = true
    media.resolve(src).then((url) => alive && setResolved(url))
    return () => {
      alive = false
    }
  }, [src])

  /**
   * A hosted film (YouTube, Vimeo) is its poster and a play button until
   * somebody presses it. The player is a third-party frame that sets cookies
   * and pulls megabytes of script; loading it for every visitor to show a still
   * would make everybody pay for the few who watch. Without `embedUrl` — a
   * thumbnail — it is only the poster. `provider: 'file'` is ours, and plays in
   * a plain `<video>` below.
   */
  const hosted = type === 'video' && provider && provider !== 'file'
  if (hosted && embedUrl) return <Embed poster={resolved} embedUrl={embedUrl} alt={alt} className={className} />
  const kind = hosted ? 'image' : type || (resolved?.startsWith('data:video') ? 'video' : 'image')

  if (!resolved) {
    // The well is already the right shape and colour, so a missing source is a
    // pause rather than a hole in the layout.
    return <span className={`block h-full w-full bg-sunken ${className}`} aria-hidden="true" />
  }

  if (kind === 'video') {
    return (
      <video
        src={resolved}
        poster={poster}
        controls={controls}
        autoPlay={autoPlay}
        muted={autoPlay}
        loop={autoPlay}
        playsInline
        aria-label={alt || undefined}
        className={`h-full w-full object-cover ${className}`}
        {...rest}
      />
    )
  }

  // Only for a source the responsive script actually processed. Uploaded
  // files, CDN URLs and SVGs fall through to a plain img, which is the right
  // answer rather than a fallback.
  const alternates = resolved === src ? responsive(src) : null
  if (!alternates) return <img src={resolved} alt={alt} className={className} {...rest} />

  return (
    <picture>
      <source type={alternates.type} srcSet={alternates.srcSet} sizes={sizes} />
      <img src={resolved} alt={alt} sizes={sizes} className={className} {...rest} />
    </picture>
  )
}

function Embed({ poster, embedUrl, alt, className }) {
  const [playing, setPlaying] = useState(false)
  if (playing) {
    return (
      <Suspense fallback={<span className="block h-full w-full bg-sunken" />}>
        <VideoEmbed src={embedUrl} title={alt} />
      </Suspense>
    )
  }
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={alt ? `Play video: ${alt}` : 'Play video'}
      className="group relative block h-full w-full"
    >
      {poster ? <img src={poster} alt="" className={className} /> : <span className="block h-full w-full bg-sunken" />}
      <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-page/90 text-ink shadow-panel transition-transform group-hover:scale-105">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </span>
      </span>
    </button>
  )
}
