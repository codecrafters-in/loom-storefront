import { useEffect } from 'react'
import { Icon } from '../ui/index.jsx'

/**
 * Fit and fabric — the two blocks that decide whether an apparel order sticks.
 *
 * Size and fit cause roughly two thirds of fashion returns, and apparel return
 * rates run 20–40%, the highest of any category. Nothing else on a product page
 * moves that number as much as telling someone, before they buy, what the
 * garment actually measures and how it fitted the people who already own it.
 *
 * Three signals, in order of how much a shopper trusts them:
 *   1. Aggregated fit feedback from purchasers — not the brand's own opinion
 *   2. Garment measurements in centimetres — checkable against something they own
 *   3. Model height and size worn — turns a photograph into a scale reference
 */

const VERDICT = {
  'true-to-size': { label: 'True to size', tone: 'text-good', icon: 'check' },
  'runs-small': { label: 'Runs small', tone: 'text-sale', icon: 'info' },
  'runs-large': { label: 'Runs large', tone: 'text-sale', icon: 'info' },
}

export function FitBlock({ product, onOpenChart }) {
  const fit = product.fit
  if (!fit) return null
  const v = VERDICT[fit.verdict]
  const fb = fit.feedback

  return (
    <section className="mt-8 rounded-xs border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[13px] font-medium">Fit</h2>
        {product.sizeChart && (
          <button
            type="button"
            onClick={onOpenChart}
            className="inline-flex items-center gap-1.5 text-[13px] text-accent link-underline"
          >
            <Icon name="filter" size={14} />
            Size chart & measurements
          </button>
        )}
      </div>

      {v && (
        <p className={`mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium ${v.tone}`}>
          <Icon name={v.icon} size={15} />
          {v.label}
        </p>
      )}

      {fb && (
        <div className="mt-4">
          {/* One bar rather than three numbers: the shape of it is readable at a
              glance, and the glance is all most people give it. */}
          <div className="flex h-2 overflow-hidden rounded-full bg-sunken" role="img"
            aria-label={`${fb.small}% say it runs small, ${fb.true}% true to size, ${fb.large}% runs large`}>
            <span className="bg-sale/50" style={{ width: `${fb.small}%` }} />
            <span className="bg-good" style={{ width: `${fb.true}%` }} />
            <span className="bg-accent/50" style={{ width: `${fb.large}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-faint">
            <span>Runs small {fb.small}%</span>
            <span className="font-medium text-ink">True to size {fb.true}%</span>
            <span>Runs large {fb.large}%</span>
          </div>
          <p className="mt-2 text-[12px] text-faint">From {fit.sample} verified purchases.</p>
        </div>
      )}

      {fit.note && <p className="mt-4 text-[14px] leading-relaxed text-muted">{fit.note}</p>}

      {fit.model && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">
          <Icon name="user" size={14} className="text-faint" />
          Model is {fit.model.label} ({fit.model.height}cm) and wears a {fit.model.size}
        </p>
      )}
    </section>
  )
}

export function FabricBlock({ product }) {
  const f = product.fabric
  if (!f) return null
  return (
    <section className="mt-4 rounded-xs border border-line bg-surface p-5">
      <h2 className="text-[13px] font-medium">Fabric</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Fact label="Composition" value={f.composition.map(([m, pct]) => `${pct}% ${m}`).join(', ')} />
        {f.weight && <Fact label="Weight" value={`${f.weight} gsm`} />}
        {f.weave && <Fact label="Construction" value={f.weave} />}
        {f.origin && <Fact label="Made in" value={f.origin} />}
      </dl>

      {f.certifications?.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="eyebrow">Certified</p>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {f.certifications.map((c) => (
              <li
                key={c}
                className="inline-flex items-center gap-1.5 rounded-xs border border-line px-2.5 py-1.5 text-[12px] text-muted"
              >
                <Icon name="shield" size={13} className="text-good" />
                {c}
              </li>
            ))}
          </ul>
          {/* Third-party marks are worth naming because they are checkable —
              which is the whole difference between a certification and a claim. */}
          <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
            Independently audited. Certificate numbers on request.
          </p>
        </div>
      )}
    </section>
  )
}

function Fact({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.1em] text-faint">{label}</dt>
      <dd className="mt-1 text-[14px] text-ink">{value}</dd>
    </div>
  )
}

/** The measurements themselves, in a dialog so they never push the buy button down. */
export function SizeChartModal({ product, open, onClose }) {
  const chart = product.sizeChart

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open || !chart) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Size chart"
        className="relative max-h-[88dvh] w-full overflow-y-auto rounded-t-xl bg-page p-6 shadow-panel sm:max-w-2xl sm:rounded-xs"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl">Size chart</h2>
            <p className="mt-1 text-[13px] text-muted">{product.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-line text-left">
                {chart.columns.map((c) => (
                  <th key={c} className="py-2.5 pr-4 font-medium">
                    {c}
                    {c !== 'Size' && <span className="ml-1 text-[11px] font-normal text-faint">{chart.unit}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chart.rows.map((row) => (
                <tr key={row[0]} className="border-b border-line">
                  {row.map((cell, i) => (
                    <td key={i} className={`py-2.5 pr-4 tabular-nums ${i === 0 ? 'font-medium text-ink' : 'text-muted'}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-5 text-[13px] leading-relaxed text-muted">{chart.note}</p>

        <div className="mt-5 rounded-xs bg-accent-soft/60 p-4">
          <p className="text-[13px] font-medium text-accent">The one measurement worth taking</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-accent/90">
            Find a garment you already own and like the fit of. Lay it flat and measure across the
            chest, 2.5cm below the armhole. Double it, and match that number to the table above.
            It transfers between brands in a way that a letter size does not.
          </p>
        </div>
      </div>
    </div>
  )
}
