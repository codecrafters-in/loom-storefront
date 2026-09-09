import { useMemo, useState } from 'react'
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
 * The full detail, below the fold, in tabs.
 *
 * Tabs rather than four stacked sections: this is reference material, and
 * somebody who came for the wash instructions should not scroll past twelve
 * feature cards to reach them.
 */
export function ProductDetails({ product }) {
  const e = product.enrichment
  const [tab, setTab] = useState(null)

  const specGroups = useMemo(() => {
    const specs = e?.specs || {}
    return attributeGroups
      .map((g) => ({
        ...g,
        rows: Object.entries(specs)
          .filter(([key]) => (attributeByKey[key]?.group || 'general') === g.id)
          .map(([key, value]) => ({ key, value })),
      }))
      .filter((g) => g.rows.length)
  }, [e])

  const tabs = [
    e?.features?.length && { id: 'features', label: 'Features' },
    specGroups.length && { id: 'specs', label: 'Specifications' },
    product.description && { id: 'description', label: 'Description' },
    e?.manufacturer && { id: 'manufacturer', label: 'Manufacturer info' },
  ].filter(Boolean)

  if (!tabs.length) return null
  const active = tab && tabs.some((t) => t.id === tab) ? tab : tabs[0].id

  return (
    <section className="border-t border-line bg-surface">
      <div className="wrap wrap-tight py-14">
        <h2 className="text-display-md">All details</h2>

        <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active === t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-xs border px-4 py-2 text-[13px] transition-colors ${
                active === t.id
                  ? 'border-ink bg-ink text-page'
                  : 'border-line text-muted hover:border-ink hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-8">
          {active === 'features' && <Features items={e.features} />}
          {active === 'specs' && <Specs groups={specGroups} />}
          {active === 'description' && (
            <p className="max-w-2xl text-[15px] leading-relaxed text-muted">{product.description}</p>
          )}
          {active === 'manufacturer' && <Manufacturer info={e.manufacturer} />}
        </div>
      </div>
    </section>
  )
}

/**
 * Feature cards.
 *
 * The column count is decided by the grid, not by a breakpoint. `sm:grid-cols-2
 * lg:grid-cols-3` asks the *viewport* how wide the cards should be, which is
 * the wrong question the moment this component renders anywhere narrower than
 * the page — the admin preview panel being the obvious case, where a wide
 * monitor produced three 100px columns of one word per line.
 *
 * `auto-fit` + `minmax` asks the container instead, so the same component is
 * three-up on a product page, one-up in a preview rail, and correct in both
 * without either knowing about the other. The inner `min()` is what stops a
 * container narrower than the track from overflowing.
 */
function Features({ items }) {
  return (
    <ul
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(17rem, 100%), 1fr))' }}
    >
      {items.map((f) => (
        <li key={f.title} className="flex min-w-0 gap-4 rounded-xs border border-line bg-page p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-accent-soft text-accent">
            {/* A merchant can point at an image instead of naming an icon —
                brands with their own iconography should not be forced into ours. */}
            {f.icon?.startsWith('http') || f.icon?.startsWith('/') || f.icon?.startsWith('media:') ? (
              <Media src={f.icon} alt="" className="h-full w-full object-cover" />
            ) : (
              <Icon name={f.icon || 'sparkle'} size={20} />
            )}
          </span>
          <div className="min-w-0">
            {/* Long single words — a mill name, a certification — must wrap
                rather than push the track wider than its share of the row. */}
            <h3 className="hyphens-auto break-words text-[14px] font-medium leading-snug">{f.title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{f.body}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function Specs({ groups }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? groups : groups.slice(0, 2)

  return (
    <div className="max-w-3xl">
      {shown.map((g) => (
        <div key={g.id} className="mb-8 last:mb-0">
          <h3 className="text-[14px] font-medium">{g.label}</h3>
          <dl className="mt-4 grid gap-x-10 sm:grid-cols-2">
            {g.rows.map((row) => (
              <div key={row.key} className="border-b border-line py-3">
                <dt className="text-[12px] text-faint">
                  {label(row.key)}
                  {attributeByKey[row.key]?.unit && ` (${attributeByKey[row.key].unit})`}
                </dt>
                <dd className="mt-0.5 text-[14px] leading-snug text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      {groups.length > 2 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-xs border border-line px-4 py-2 text-[13px] text-muted transition-colors hover:border-ink hover:text-ink"
        >
          {expanded ? 'See less' : `See all ${groups.length} sections`}
          <Icon name="chevron-down" size={14} className={expanded ? 'rotate-180' : ''} />
        </button>
      )}
    </div>
  )
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
    <div className="max-w-3xl">
      <dl className="grid gap-x-10 sm:grid-cols-2">
        {rows.map(([key, value]) => (
          <div key={key} className="border-b border-line py-3">
            <dt className="text-[12px] text-faint">{label(key)}</dt>
            <dd className="mt-0.5 text-[14px] leading-snug text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {/* Several of these are a legal requirement rather than a nicety —
          India's Legal Metrology rules mandate the manufacturer and packer
          address, the country of origin and the net quantity on a listing. */}
      <p className="mt-5 text-[12px] leading-relaxed text-faint">
        Published to meet packaged-goods disclosure rules. Contact us if anything here is unclear.
      </p>
    </div>
  )
}
