import { useMemo, useRef, useState } from 'react'
import { Icon } from '../ui/index.jsx'
import Media from '../ui/Media.jsx'
import { attributeByKey, attributeGroups } from '../../data/attributes.js'
import { useStorefront } from '../../store/StorefrontContext.jsx'

/**
 * Product enrichment, in three places rather than one.
 *
 * Highlights sit above the fold because they are the scan — six pairs a shopper
 * reads in two seconds to decide whether to keep going. Features and the full
 * specification table sit below the buy box, because they are the read, and
 * anything below the fold competes with nothing.
 *
 * Putting all of it in one long table means most people read none of it and the
 * rest hunt for the two facts that would have decided the purchase. Putting all
 * of it above the fold pushes the buy button off the screen.
 *
 * Every block renders nothing when it has no data, so a thin product is a
 * shorter page rather than a set of empty headings.
 */

const label = (key) => attributeByKey[key]?.label || key

/** Six pairs, two columns, above the fold. */
export function ProductHighlights({ enrichment, limit = 6 }) {
  const rows = (enrichment?.highlights || []).slice(0, limit)
  if (!rows.length) return null

  return (
    <section className="mt-7 border-t border-line pt-6">
      <h2 className="text-[13px] font-medium">Highlights</h2>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
        {rows.map((row) => (
          <div key={row.key}>
            <dt className="text-[12px] leading-snug text-faint">{label(row.key)}</dt>
            <dd className="mt-0.5 text-[14px] leading-snug text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * The services block — what comes with the piece, not what it is made of.
 *
 * Modelled on the row of assurances a marketplace listing carries directly
 * under the price ("10-day returns", "Pay on delivery", "Fulfilled by…"),
 * because that is the block doing the work: the specification table answers
 * *is this the right thing*, and this answers *what happens if it is not*.
 * Apparel returns run high enough that the second question is usually the one
 * standing between a considered shopper and the button.
 *
 * Two decisions worth stating:
 *
 *  - The explanation is behind a disclosure, not printed. A returns policy
 *    spelled out in full is four lines of legal prose next to the buy button;
 *    the label alone is the reassurance, and the detail is there for the one
 *    shopper in twenty who wants to check the wording before committing.
 *  - A product with no rows of its own falls back to the store's. Most stores
 *    have one returns policy, and making a merchant retype it on every product
 *    is how three products end up promising three different windows.
 */
export function ProductAssurances({ product, className = '' }) {
  const config = useStorefront()
  const [open, setOpen] = useState(null)

  const own = product?.enrichment?.assurances
  const rows = (own?.length ? own : config.trust?.assurances || []).filter((r) => r?.label)
  if (!rows.length) return null

  return (
    <section className={`mt-6 border-t border-line pt-5 ${className}`}>
      <h2 className="eyebrow">Comes with</h2>
      <ul className="mt-3.5 space-y-2">
        {rows.map((r, i) => (
          <li key={`${r.label}-${i}`}>
            <div className="flex items-start gap-2.5 text-[13px] leading-snug">
              <Icon name={r.icon || 'check'} size={16} className="mt-px shrink-0 text-accent" />
              <span className="min-w-0 text-ink">{r.label}</span>
              {r.note && (
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                  aria-label={`What ${r.label} means`}
                  className="shrink-0 rounded-full text-faint transition-colors hover:text-ink"
                >
                  <Icon name="info" size={14} className={open === i ? 'text-ink' : ''} />
                </button>
              )}
            </div>
            {r.note && open === i && (
              <p className="mt-1.5 pl-[26px] text-[12px] leading-relaxed text-muted">{r.note}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Who actually made it.
 *
 * A marketplace names the seller and shows their rating, because on a
 * marketplace the seller is the variable. On an own-brand store the seller is
 * never in doubt and the same block is dead weight — unless it names the mill
 * or the workshop, which is the equivalent unknown and the one a shopper
 * paying a premium is actually buying.
 *
 * Renders nothing without a name, so a store that does not want to disclose its
 * supply chain simply does not have this section.
 */
export function ProductMaker({ enrichment, className = '' }) {
  const m = enrichment?.maker
  if (!m?.name) return null

  const line = [m.location, m.since && `working with us since ${m.since}`].filter(Boolean).join(' · ')

  return (
    <section className={`mt-6 rounded-xs border border-line bg-surface p-4 ${className}`}>
      <p className="eyebrow">Made by</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="text-[14px] font-medium text-ink">{m.name}</span>
        {m.rating && (
          <span className="inline-flex items-center gap-1 rounded-xs bg-good/10 px-1.5 py-0.5 text-[11px] font-medium text-good">
            <Icon name="star" size={11} filled strokeWidth={0} />
            {m.rating}
            {m.ratingCount ? <span className="text-faint">({m.ratingCount})</span> : null}
          </span>
        )}
      </div>
      {line && <p className="mt-1.5 text-[12px] text-faint">{line}</p>}
      {m.note && <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{m.note}</p>}
    </section>
  )
}

/**
 * The detail blocks, in the column beside the buy button.
 *
 * These used to be a full-width tabbed section below the fold, and that was the
 * wrong place for them. Everything a shopper needs in order to decide has to be
 * reachable without leaving the buy button behind — a page that asks someone to
 * scroll past the fold to find the fabric weight has already lost the shoppers
 * who would not have scrolled, and they are the majority.
 *
 * So the detail lives in the same stack as fit, care and delivery: hairline
 * rows, collapsed, with the buy button as the only heavy element on screen. The
 * cost is width, which is why the specification table below is a carousel
 * rather than two columns.
 *
 * Each one renders nothing when it has no data, so a thin product is a shorter
 * stack rather than a row of empty headings.
 */

/** Feature cards, stacked. One per row — a 30rem column has no second column. */
export function FeatureList({ items = [] }) {
  if (!items.length) return null
  return (
    <ul className="space-y-5">
      {items.map((f) => (
        <li key={f.title} className="flex min-w-0 gap-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-accent-soft text-accent">
            {/* A merchant can point at an image instead of naming an icon —
                brands with their own iconography should not be forced into ours. */}
            {f.icon?.startsWith('http') || f.icon?.startsWith('/') || f.icon?.startsWith('media:') ? (
              <Media src={f.icon} alt="" className="h-full w-full object-cover" />
            ) : (
              <Icon name={f.icon || 'sparkle'} size={18} />
            )}
          </span>
          <div className="min-w-0">
            <h3 className="break-words text-[14px] font-medium leading-snug">{f.title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{f.body}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * The specification table as a carousel, one group per slide.
 *
 * A full table does not fit in the buy column, and the alternatives are worse:
 * stacking every group makes the shortest accordion section on the page four
 * screens long, and truncating it hides the one row somebody opened it for.
 *
 * Paging by *group* rather than by row is what makes this work — the groups are
 * already the units a shopper thinks in ("fabric", "fit"), so a slide is a
 * complete answer rather than an arbitrary slice of a list.
 *
 * Built on scroll-snap rather than transforms, so a touch swipe is the native
 * behaviour and the arrows are only there for pointers and keyboards.
 */
export function SpecCarousel({ specs }) {
  const trackRef = useRef(null)
  const [page, setPage] = useState(0)

  const groups = useMemo(() => {
    const rows = specs || {}
    return attributeGroups
      .map((g) => ({
        ...g,
        rows: Object.entries(rows)
          .filter(([key]) => (attributeByKey[key]?.group || 'general') === g.id)
          .map(([key, value]) => ({ key, value })),
      }))
      .filter((g) => g.rows.length)
  }, [specs])

  if (!groups.length) return null

  const go = (next) => {
    const clamped = Math.max(0, Math.min(groups.length - 1, next))
    const track = trackRef.current
    if (track) track.scrollTo({ left: clamped * track.clientWidth, behavior: 'smooth' })
    setPage(clamped)
  }

  // The scroll position is the source of truth, not the button — a swipe has to
  // move the counter too, or the dots lie about where you are.
  const onScroll = (ev) => {
    const el = ev.currentTarget
    if (!el.clientWidth) return
    const next = Math.round(el.scrollLeft / el.clientWidth)
    if (next !== page) setPage(next)
  }

  return (
    <div>
      {groups.length > 1 && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium">{groups[page]?.label}</p>
          <div className="flex items-center gap-1.5">
            <span className="mr-1 font-mono text-[11px] tabular-nums text-faint">
              {page + 1} / {groups.length}
            </span>
            <CarouselButton label="Previous section" disabled={page === 0} onClick={() => go(page - 1)} icon="chevron-left" />
            <CarouselButton
              label="Next section"
              disabled={page === groups.length - 1}
              onClick={() => go(page + 1)}
              icon="chevron-right"
            />
          </div>
        </div>
      )}

      <div
        ref={trackRef}
        onScroll={onScroll}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
      >
        {groups.map((g, i) => (
          <div
            key={g.id}
            className="w-full shrink-0 snap-start pr-px"
            /* Nothing in a slide is focusable, so hiding it from the
               accessibility tree is enough — no `inert` needed, and `inert`
               would risk swallowing the touch that starts the next swipe. */
            aria-hidden={i !== page}
          >
            {groups.length === 1 && <p className="mb-3 text-[13px] font-medium">{g.label}</p>}
            <dl>
              {g.rows.map((row) => (
                <div key={row.key} className="flex gap-4 border-b border-line py-2.5 last:border-b-0">
                  <dt className="w-[9rem] shrink-0 text-[12px] leading-snug text-faint">
                    {label(row.key)}
                    {attributeByKey[row.key]?.unit && ` (${attributeByKey[row.key].unit})`}
                  </dt>
                  <dd className="min-w-0 break-words text-[13px] leading-snug text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {groups.length > 1 && (
        <div className="mt-4 flex justify-center gap-1.5">
          {groups.map((g, i) => (
            <button
              key={g.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${g.label}`}
              aria-current={i === page}
              className={`h-1.5 rounded-full transition-all ${
                i === page ? 'w-5 bg-ink' : 'w-1.5 bg-line hover:bg-faint'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CarouselButton({ label: text, icon, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={text}
      className="grid h-7 w-7 place-items-center rounded-xs border border-line text-muted transition-colors hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-30"
    >
      <Icon name={icon} size={14} />
    </button>
  )
}

/** Compliance rows. Single column — the column is 30rem, not a page. */
export function ManufacturerRows({ info }) {
  if (!info) return null
  return <Manufacturer info={info} />
}

function Manufacturer({ info }) {
  const rows = [
    ['genericName', info.genericName],
    ['countryOfOrigin', info.countryOfOrigin],
    ['manufacturer', info.manufacturer],
    ['packer', info.packer],
    ['importer', info.importer],
    ['netQuantity', info.netQuantity],
    ['packOf', info.packOf],
  ].filter(([, v]) => v)

  return (
    <div>
      <dl>
        {rows.map(([key, value]) => (
          <div key={key} className="flex gap-4 border-b border-line py-2.5 last:border-b-0">
            <dt className="w-[9rem] shrink-0 text-[12px] leading-snug text-faint">{label(key)}</dt>
            <dd className="min-w-0 break-words text-[13px] leading-snug text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {/* Several of these are a legal requirement rather than a nicety —
          India's Legal Metrology rules mandate the manufacturer and packer
          address, the country of origin and the net quantity on a listing. */}
      <p className="mt-4 text-[12px] leading-relaxed text-faint">
        Published to meet packaged-goods disclosure rules. Contact us if anything here is unclear.
      </p>
    </div>
  )
}
