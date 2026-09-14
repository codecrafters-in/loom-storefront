/**
 * A hosted player, mounted only after somebody pressed play.
 *
 * Only the privacy-enhanced hosts are framed — the same two the
 * Content-Security-Policy's `frame-src` allows (scripts/lib/csp.mjs). A URL the
 * policy would refuse is not framed at all, because a blocked frame is a grey
 * box with no explanation and this at least says what happened.
 *
 * Its own chunk: most product pages have no film, and the few that do have
 * shoppers who never press play.
 */
const ALLOWED = /^https:\/\/(www\.youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/)/

export default function VideoEmbed({ src, title, className = '' }) {
  if (!ALLOWED.test(src || '')) {
    return (
      <span className="grid h-full w-full place-items-center bg-sunken p-6 text-center text-[13px] text-muted">
        This video cannot be played here.
      </span>
    )
  }
  return (
    <iframe
      src={`${src}${src.includes('?') ? '&' : '?'}autoplay=1`}
      title={title || 'Video'}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      className={`block h-full w-full border-0 ${className}`}
    />
  )
}
