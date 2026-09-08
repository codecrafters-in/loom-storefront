/**
 * The mark.
 *
 * Drawn rather than uploaded so it inherits `currentColor`, stays crisp at any
 * size, costs nothing to load, and re-colours with the theme for free. A
 * merchant who has real artwork sets `store.logo.imageUrl` and this steps
 * aside.
 *
 * The glyph is a loom: two warp threads with a weft crossing them. It reads at
 * 16px in a favicon and at 200px on a splash screen, which is the only test a
 * mark like this has to pass.
 */
export function LoomMark({ size = 22, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* frame */}
      <rect x="2.5" y="2.5" width="19" height="19" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      {/* warp */}
      <path d="M9 3v18M15 3v18" stroke="currentColor" strokeWidth="1.3" opacity="0.45" />
      {/* weft, crossing over and under */}
      <path
        d="M3 9h4.6M10.4 9h3.2M16.4 9H21M3 15h4.6M10.4 15h3.2M16.4 15H21"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function Logo({ config, className = '', size }) {
  const logo = config?.store?.logo || {}
  const height = size || logo.height || 22

  if (logo.imageUrl) {
    return (
      <img
        src={logo.imageUrl}
        alt={config?.store?.name || 'Home'}
        height={height}
        style={{ height }}
        className={`w-auto ${className}`}
      />
    )
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LoomMark size={height} />
      <span className="font-display tracking-tight" style={{ fontSize: height * 0.95, lineHeight: 1 }}>
        {logo.wordmark || config?.store?.name || 'LOOM'}
      </span>
    </span>
  )
}
