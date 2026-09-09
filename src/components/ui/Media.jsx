import { useEffect, useState } from 'react'
import * as media from '../../lib/media.js'
import { responsive } from '../../lib/images.js'

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

  const kind = type || (resolved?.startsWith('data:video') ? 'video' : 'image')

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
