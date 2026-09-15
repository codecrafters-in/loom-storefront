import { isMock } from '../../lib/config.js'
import { logoHeight, logoImage } from '../../lib/logo.js'

/**
 * The mark.
 *
 * A filled tile, not a monoline drawing. That is the whole reason this was
 * redrawn: a 1.5px stroke is invisible at the 16px a browser tab actually
 * renders, and a favicon that cannot be seen is a favicon that is not there.
 * A solid shape with high-contrast counters survives being shrunk, sat on a
 * dark browser chrome, or crushed into a circular launcher crop.
 *
 * The glyph is a weave: three wefts crossing two warps, with the warps drawn
 * only in the gaps so the threads read as passing over and under. It is the
 * simplest thing that says "cloth" and still resolves at 16 pixels.
 *
 * Two variants:
 *   tile  — filled, for favicons, app icons and anywhere it sits alone
 *   line  — stroked, inherits currentColor, for use beside the wordmark
 */

/** The weave itself, on a transparent ground. `color` fills the threads. */
function Weave({ color }) {
  return (
    <g fill={color}>
      {/* wefts — full width */}
      <rect x="3.2" y="6.0" width="17.6" height="2.5" rx="1.25" />
      <rect x="3.2" y="10.75" width="17.6" height="2.5" rx="1.25" />
      <rect x="3.2" y="15.5" width="17.6" height="2.5" rx="1.25" />
      {/* warps — drawn only between the wefts, so the threads interlock */}
      <rect x="7.6" y="3.2" width="2.5" height="3.0" rx="1.25" />
      <rect x="7.6" y="8.3" width="2.5" height="2.65" rx="1.25" />
      <rect x="7.6" y="13.05" width="2.5" height="2.65" rx="1.25" />
      <rect x="7.6" y="17.8" width="2.5" height="3.0" rx="1.25" />
      <rect x="13.9" y="3.2" width="2.5" height="3.0" rx="1.25" />
      <rect x="13.9" y="8.3" width="2.5" height="2.65" rx="1.25" />
      <rect x="13.9" y="13.05" width="2.5" height="2.65" rx="1.25" />
      <rect x="13.9" y="17.8" width="2.5" height="3.0" rx="1.25" />
    </g>
  )
}

export function LoomMark({ size = 24, variant = 'tile', className = '' }) {
  const tile = variant === 'tile'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {tile ? (
        <>
          <rect width="24" height="24" rx="5.5" className="fill-accent" />
          <Weave color="rgb(var(--accent-soft))" />
        </>
      ) : (
        <Weave color="currentColor" />
      )}
    </svg>
  )
}

/**
 * `size` fixes the height. Without it the height is the store's `store.logo.height` times `scale`, at most `max`, so
 * the footer and the phone menu follow the height the store chose.
 */
export default function Logo({ config, className = '', size, scale = 1, max, variant = 'tile' }) {
  const logo = config?.store?.logo || {}
  const height = size || logoHeight(logo, { scale, max })

  // The dark-background artwork on a dark theme, when the store has one (lib/logo.js).
  const image = logoImage(config)
  if (image) {
    return (
      <img
        src={image}
        alt={config?.store?.name || 'Home'}
        height={height}
        style={{ height }}
        className={`w-auto ${className}`}
      />
    )
  }

  // A live store's name, never the demo's mark.
  if (!isMock) {
    const text = logo.wordmark || config?.store?.name
    if (!text) return null
    return (
      <span className={`font-display font-medium tracking-[-0.02em] ${className}`} style={{ fontSize: height * 0.86, lineHeight: 1 }}>
        {text}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LoomMark size={height} variant={variant} />
      <span
        className="font-display font-medium tracking-[-0.02em]"
        style={{ fontSize: height * 0.86, lineHeight: 1 }}
      >
        {logo.wordmark || config?.store?.name}
      </span>
    </span>
  )
}
