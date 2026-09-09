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
 * These were a full-width tabbed section below the fold, then a stack of
 * accordions. Both were wrong, in opposite directions: the section asked a
 * shopper to scroll the buy button off the screen, and the accordion asked them
 * to click four times to find out what the thing is made of.
 *
 * Enrichment exists to be read. Anything that costs an interaction before it
 * can be read is enrichment that mostly is not — the shopper who would have
 * opened all four panels was already going to buy. So: one block, open, with
 * the content of the first tab visible on arrival and every other tab one click
 * away rather than one-click-per-section.
 *
 * The collapse control stays, because somebody who has read it should be able
 * to get it out of the way — but the default is open, which is the half that
 * decides whether any of this gets seen.
 */

/**
 * The "All details" block: a heading, a scrollable pill row, and a panel.
 *
 * Tabs rather than a stack because this is reference material in a 30rem
 * column, and stacking every section makes the page four screens longer for
 * content most people want one fact from. Tabs rather than accordions because
 * a tab shows something by default and an accordion shows nothing.
 *
 * The pill row scrolls sideways rather than wrapping. A wrapped row of five
 * pills is two lines of chrome above the content; a scrolling one is one line,
 * and the half-visible pill at the edge is what tells you to keep going.
 */
export function DetailTabs({ title = 'All details', tabs = [], defaultOpen = true }) {
  const usable = tabs.filter((t) => t && t.when !== false)
  const [open, setOpen] = useState(defaultOpen)
  const [tab, setTab] = useState(null)

  if (!usable.length) return null
  const active = tab && usable.some((t) => t.id === tab) ? tab : usable[0].id
  const panel = usable.find((t) => t.id === active)

  return (
    <section className="mt-8 border-t border-line pt-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[15px] font-medium">{title}</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xs border border-line text-muted transition-colors hover:border-ink hover:text-ink"
        >
          <Icon name="chevron-down" size={15} className={open ? 'rotate-180' : ''} />
        </button>
      </div>

      {open && (
        <>
          <div className="no-scrollbar -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
            {usable.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active === t.id}
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap rounded-xs border px-3.5 py-1.5 text-[13px] transition-colors ${
                  active === t.id
                    ? 'border-ink bg-ink text-page'
                    : 'border-line text-muted hover:border-ink hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-5">{panel?.render()}</div>
        </>
      )}
    </section>
  )
}

/**
 * Feature cards, side by side, swipeable.
 *
 * Stacking them was honest and unreadable: three cards of three lines each is
 * most of a screen for the section a shopper glances at. Side by side, the
 * first card is fully visible and the second is deliberately cut off at the
 * edge — a card that is half on screen is the only reliable way to say "there
 * are more of these" without a caption saying so.
 *
 * The body is clamped rather than truncated at a character count, so the card
 * height is stable and nothing is lost: "more" opens it in place. Clamping to
 * three lines and offering the rest costs nothing to skip and one tap to read,
 * which is the right trade for copy that is nice to have rather than decisive.
 */
export function FeatureCarousel({ items = [] }) {
  const trackRef = useRef(null)
  const [at, setAt] = useState(0)

  if (!items.length) return null

  const scrollBy = (dir) => {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: dir * track.clientWidth * 0.86, behavior: 'smooth' })
  }

  const onScroll = (ev) => {
    const el = ev.currentTarget
    // A fraction, not an index — the arrows care about "is there anything left
    // in this direction", which a card index cannot answer mid-swipe.
    setAt(el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth))
  }

  const many = items.length > 1

  return (
    <div className="relative">
      <ul
        ref={trackRef}
        onScroll={onScroll}
        className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1"
      >
        {items.map((f) => (
          <FeatureCard key={f.title} feature={f} solo={!many} />
        ))}
      </ul>

      {many && (
        <>
          <CarouselArrow side="left" hidden={at <= 0.02} onClick={() => scrollBy(-1)} />
          <CarouselArrow side="right" hidden={at >= 0.98} onClick={() => scrollBy(1)} />
        </>
      )}
    </div>
  )
}

function FeatureCard({ feature: f, solo }) {
  const [expanded, setExpanded] = useState(false)
  // Measuring the clamp is unreliable at this size and reflows on every font
  // swap. A length threshold is deterministic and wrong only at the margin,
  // where the cost is an unnecessary "more" that opens two words.
  const long = (f.body || '').length > 105

  return (
    <li
      className={`flex snap-start flex-col rounded-xs border border-line bg-surface p-4 ${
        solo ? 'w-full' : 'w-[86%] shrink-0 sm:w-[78%]'
      }`}
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-accent-soft text-accent">
        {/* A merchant can point at an image instead of naming an icon — brands
            with their own iconography should not be forced into ours. */}
        {f.icon?.startsWith('http') || f.icon?.startsWith('/') || f.icon?.startsWith('media:') ? (
          <Media src={f.icon} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon name={f.icon || 'sparkle'} size={22} />
        )}
      </span>
      <h3 className="mt-3.5 break-words text-[14px] font-medium leading-snug">{f.title}</h3>
      <p className={`mt-1.5 text-[13px] leading-relaxed text-muted ${expanded || !long ? '' : 'line-clamp-3'}`}>
        {f.body}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 self-start text-[13px] font-medium text-accent hover:underline"
        >
          {expanded ? 'less' : 'more'}
        </button>
      )}
    </li>
  )
}

function CarouselArrow({ side, hidden, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous' : 'Next'}
      tabIndex={hidden ? -1 : 0}
      className={`absolute top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-line bg-page text-ink shadow-sm transition-opacity ${
        side === 'left' ? '-left-1' : '-right-1'
      } ${hidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
    >
      <Icon name={side === 'left' ? 'chevron-left' : 'chevron-right'} size={16} />
    </button>
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
