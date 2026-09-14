import { useEffect } from 'react'
import { Icon } from '../ui/index.jsx'
import { isMock } from '../../lib/config.js'
import { t, plural, mark } from '../../i18n/index.js'

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
  'true-to-size': { label: mark('True to size'), tone: 'text-good', icon: 'check' },
  'runs-small': { label: mark('Runs small'), tone: 'text-sale', icon: 'info' },
  'runs-large': { label: mark('Runs large'), tone: 'text-sale', icon: 'info' },
}

export function FitBlock({ product, onOpenChart, flat = false }) {
  const fit = product.fit
  if (!fit) return null
  const v = VERDICT[fit.verdict]
  const fb = fit.feedback

  // `flat` drops the card. Inside an accordion the border would be a box in a
  // box, which is the fastest way to make a column look cluttered.
  return (
    <section className={flat ? '' : 'mt-8 rounded-xs border border-line bg-surface p-5'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!flat && <h2 className="text-[13px] font-medium">{t('Fit')}</h2>}
        {product.sizeChart && (
          <button
            type="button"
            onClick={onOpenChart}
            className="ms-auto inline-flex items-center gap-1.5 text-[13px] text-accent link-underline"
          >
            <Icon name="filter" size={14} />
            {product.sizeChart.name || t('Size chart')}
          </button>
        )}
      </div>

      {v && (
        <p className={`${flat ? 'mt-1' : 'mt-3'} inline-flex items-center gap-1.5 text-[14px] font-medium ${v.tone}`}>
          <Icon name={v.icon} size={15} />
          {t(v.label)}
        </p>
      )}

      {fb && (
        <div className="mt-4">
          {/* One bar rather than three numbers: the shape of it is readable at a
              glance, and the glance is all most people give it. */}
          <div className="flex h-2 overflow-hidden rounded-full bg-sunken" role="img"
            aria-label={t('{small}% say it runs small, {true}% true to size, {large}% runs large', { small: fb.small, true: fb.true, large: fb.large })}>
            <span className="bg-sale/50" style={{ width: `${fb.small}%` }} />
            <span className="bg-good" style={{ width: `${fb.true}%` }} />
            <span className="bg-accent/50" style={{ width: `${fb.large}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-faint">
            <span>{t('Runs small {percent}%', { percent: fb.small })}</span>
            <span className="font-medium text-ink">{t('True to size {percent}%', { percent: fb.true })}</span>
            <span>{t('Runs large {percent}%', { percent: fb.large })}</span>
          </div>
          <p className="mt-2 text-[12px] text-faint">{plural(fit.sample, 'From {count} verified purchase.', 'From {count} verified purchases.')}</p>
        </div>
      )}

      {fit.note && <p className="mt-4 text-[14px] leading-relaxed text-muted">{fit.note}</p>}

      {fit.model && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">
          <Icon name="user" size={14} className="text-faint" />
          {t('Model is {label} ({height}cm) and wears a {size}', { label: fit.model.label, height: fit.model.height, size: fit.model.size })}
        </p>
      )}
    </section>
  )
}

export function FabricBlock({ product, flat = false }) {
  const f = product.fabric
  if (!f) return null
  return (
    <section className={flat ? '' : 'mt-4 rounded-xs border border-line bg-surface p-5'}>
      {!flat && <h2 className="text-[13px] font-medium">{t('Fabric')}</h2>}
      <dl className={`grid gap-x-6 gap-y-3 sm:grid-cols-2 ${flat ? '' : 'mt-3'}`}>
        <Fact label={t('Composition')} value={f.composition.map(([m, pct]) => `${pct}% ${m}`).join(', ')} />
        {f.weight && <Fact label={t('Weight')} value={t('{weight} gsm', { weight: f.weight })} />}
        {f.weave && <Fact label={t('Construction')} value={f.weave} />}
        {f.origin && <Fact label={t('Made in')} value={f.origin} />}
      </dl>

      {f.certifications?.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="eyebrow">{t('Certified')}</p>
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
            {t('Independently audited. Certificate numbers on request.')}
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

/**
 * A store's chart: clothing sizes, ring sizes, furniture dimensions, pack sizes.
 * The first column names each row; the others carry the chart's unit, if any.
 */
export function ChartTable({ chart }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-line text-start">
            {chart.columns.map((c, i) => (
              <th key={c} className="py-2.5 pe-4 font-medium">
                {c}
                {i > 0 && chart.unit && <span className="ms-1 text-[11px] font-normal text-faint">{chart.unit}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.rows.map((row) => (
            <tr key={row[0]} className="border-b border-line">
              {row.map((cell, i) => (
                <td key={i} className={`py-2.5 pe-4 tabular-nums ${i === 0 ? 'font-medium text-ink' : 'text-muted'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {chart.note && <p className="mt-4 text-[13px] leading-relaxed text-muted">{chart.note}</p>}
    </div>
  )
}

/** The chart, in a dialog so it never pushes the buy button down. */
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
        aria-label={chart.name || t('Size chart')}
        className="relative max-h-[88dvh] w-full overflow-y-auto rounded-t-xl bg-page p-6 shadow-panel sm:max-w-2xl sm:rounded-xs"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl">{chart.name || t('Size chart')}</h2>
            <p className="mt-1 text-[13px] text-muted">{product.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('Close')} className="text-muted hover:text-ink">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="mt-6">
          <ChartTable chart={chart} />
        </div>

        {isMock && (
          <div className="mt-5 rounded-xs bg-accent-soft/60 p-4">
            <p className="text-[13px] font-medium text-accent">{t('The one measurement worth taking')}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-accent/90">
              {t('Find a garment you already own and like the fit of. Lay it flat and measure across the chest, 2.5cm below the armhole. Double it, and match that number to the table above. It transfers between brands in a way that a letter size does not.')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
