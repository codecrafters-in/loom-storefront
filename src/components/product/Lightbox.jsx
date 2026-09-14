import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/index.jsx'
import Media from '../ui/Media.jsx'

/**
 * The photograph, full screen, with zoom.
 *
 * Apparel is bought on detail a 900px thumbnail cannot carry — the weave, the
 * stitch density, how a collar actually rolls. A shopper who cannot get closer
 * either takes the risk or leaves, and in a category where returns already run
 * high, "takes the risk" is not the outcome to design for either.
 *
 * Three decisions worth stating:
 *
 *  - **Zoom is a transform on a wrapper, not a bigger image request.** The
 *    source is already the largest file there is; re-fetching at a higher
 *    density on tap would put a spinner in the middle of the interaction that
 *    is meant to answer a question.
 *  - **Pan is clamped to the image.** Unclamped panning is how a zoomed photo
 *    ends up as an empty grey field with a sleeve in the corner, and the way
 *    back is not obvious.
 *  - **Zooming disables the swipe.** Sharing one gesture between "look closer"
 *    and "next photo" means neither works: every pan halfway across the image
 *    would advance the gallery.
 *
 * Video is shown but never zoomed — a scaled `<video>` with its own controls
 * inside a transformed wrapper puts the controls off screen.
 */
const MAX_ZOOM = 3

export default function Lightbox({ images = [], index = 0, onIndex, onClose }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const frameRef = useRef(null)
  const drag = useRef(null)

  const image = images[index]
  const isVideo = image?.type === 'video'
  const zoomable = !isVideo

  const reset = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const go = useCallback(
    (delta) => {
      if (images.length < 2) return
      reset()
      onIndex((index + delta + images.length) % images.length)
    },
    [images.length, index, onIndex, reset],
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(MAX_ZOOM, z + 0.5))
      else if (e.key === '-') setZoom((z) => Math.max(1, z - 0.5))
    }
    window.addEventListener('keydown', onKey)
    // The page behind must not scroll while a full-screen layer is open.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [go, onClose])

  /** Keep the visible edge of the image inside the frame at any zoom. */
  const clamp = useCallback((next, z) => {
    const box = frameRef.current?.getBoundingClientRect()
    if (!box) return next
    const maxX = (box.width * (z - 1)) / 2
    const maxY = (box.height * (z - 1)) / 2
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    }
  }, [])

  const zoomTo = (z) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, z))
    setZoom(next)
    setPan((p) => (next === 1 ? { x: 0, y: 0 } : clamp(p, next)))
  }

  const onPointerDown = (e) => {
    if (!zoomable) return
    drag.current = { x: e.clientX, y: e.clientY, pan, moved: 0 }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy))
    if (zoom > 1) setPan(clamp({ x: d.pan.x + dx, y: d.pan.y + dy }, zoom))
  }

  const onPointerUp = (e) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const dx = e.clientX - d.x

    // A horizontal flick only means "next" while the image is not zoomed —
    // otherwise every pan across the frame would change photograph.
    if (zoom === 1 && Math.abs(dx) > 60) {
      go(dx < 0 ? 1 : -1)
      return
    }
    // A tap that did not travel is a zoom toggle, which is the gesture people
    // try first and the one a desktop click should do too.
    if (zoomable && d.moved < 6) zoomTo(zoom > 1 ? 1 : 2)
  }

  if (!image) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-ink/95"
      role="dialog"
      aria-modal="true"
      aria-label="Product photographs"
    >
      <div className="flex items-center justify-between gap-3 px-3 py-3 text-page sm:px-5">
        <span className="font-mono text-[11px] tabular-nums text-page/70">
          {index + 1} / {images.length}
        </span>

        <div className="flex items-center gap-1">
          {zoomable && (
            <>
              <IconButton label="Zoom out" icon="minus" disabled={zoom <= 1} onClick={() => zoomTo(zoom - 0.5)} />
              <span className="w-12 text-center font-mono text-[11px] tabular-nums text-page/70">
                {Math.round(zoom * 100)}%
              </span>
              <IconButton label="Zoom in" icon="plus" disabled={zoom >= MAX_ZOOM} onClick={() => zoomTo(zoom + 0.5)} />
            </>
          )}
          <IconButton label="Close" icon="close" onClick={onClose} />
        </div>
      </div>

      <div
        ref={frameRef}
        className="relative flex-1 select-none overflow-hidden"
        style={{ touchAction: zoom > 1 ? 'none' : 'pan-y', cursor: !zoomable ? 'default' : zoom > 1 ? 'grab' : 'zoom-in' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null }}
      >
        <div
          className="h-full w-full transition-transform duration-200 ease-out"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transitionProperty: drag.current ? 'none' : 'transform',
          }}
        >
          <Media
            src={image.url}
            type={image.type}
            provider={image.provider}
            embedUrl={image.embedUrl}
            alt={image.alt || ''}
            controls={isVideo}
            className="h-full w-full object-contain"
            draggable={false}
          />
        </div>

        {images.length > 1 && (
          <>
            <Arrow side="left" onClick={() => go(-1)} />
            <Arrow side="right" onClick={() => go(1)} />
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="no-scrollbar flex justify-start gap-2 overflow-x-auto px-3 py-3 sm:justify-center sm:px-5">
          {images.map((img, i) => (
            <button
              key={img.id || i}
              type="button"
              onClick={() => { reset(); onIndex(i) }}
              aria-label={`Photograph ${i + 1}`}
              aria-current={i === index}
              className={`w-14 shrink-0 overflow-hidden rounded-xs ring-1 transition-opacity ${
                i === index ? 'opacity-100 ring-page' : 'opacity-50 ring-transparent hover:opacity-90'
              }`}
            >
              <span className="shot block bg-ink/40">
                <Media src={img.url} type={img.type} provider={img.provider} alt="" className="h-full w-full object-cover" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function IconButton({ label, icon, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-xs text-page transition-colors hover:bg-page/15 disabled:pointer-events-none disabled:opacity-30"
    >
      <Icon name={icon} size={18} />
    </button>
  )
}

function Arrow({ side, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous photograph' : 'Next photograph'}
      className={`absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-page/85 text-ink transition-colors hover:bg-page ${
        side === 'left' ? 'left-3' : 'right-3'
      }`}
    >
      <Icon name={side === 'left' ? 'chevron-left' : 'chevron-right'} size={20} />
    </button>
  )
}
