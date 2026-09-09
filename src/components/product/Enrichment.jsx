import { useMemo, useState } from 'react'
import { Icon } from '../ui/index.jsx'
import Media from '../ui/Media.jsx'
import { attributeByKey, attributeGroups } from '../../data/attributes.js'

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

function Features({ items }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((f) => (
        <li key={f.title} className="flex gap-4 rounded-xs border border-line bg-page p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-accent-soft text-accent">
            {/* A merchant can point at an image instead of naming an icon —
                brands with their own iconography should not be forced into ours. */}
            {f.icon?.startsWith('http') || f.icon?.startsWith('/') || f.icon?.startsWith('media:') ? (
              <Media src={f.icon} alt="" className="h-full w-full object-cover" />
            ) : (
              <Icon name={f.icon || 'sparkle'} size={20} />
            )}
          </span>
          <div className="min-w-0">
            <h3 className="text-[14px] font-medium leading-snug">{f.title}</h3>
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
