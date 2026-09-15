import { lazy, Suspense } from 'react'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { Icon } from '../ui/index.jsx'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { formatMoney } from '../../lib/money.js'
import { isMock } from '../../lib/config.js'
import { t, plural } from '../../i18n/index.js'
import { repairsLine } from '../../lib/trust.js'

// Only a real backend can say whether a postcode is served; the demo build leaves the checker out.
const DeliveryCheck = isMock ? null : lazy(() => import('./DeliveryCheck.jsx'))

/**
 * The reassurance block, immediately under the buy button.
 *
 * Placement is the point. A return policy beside add-to-cart is one of the
 * better-attested lifts in apparel; the same words in the footer do close to
 * nothing, because the doubt arrives at the moment of commitment and that is
 * where the answer has to be.
 *
 * A dated delivery estimate beats a range for the same reason: "arrives
 * Thursday" is a fact to plan around, "2–4 working days" is arithmetic the
 * shopper has to do, and doing it is a moment to leave.
 */
export default function TrustRow({ flat = false, product = null }) {
  const config = useStorefront()
  const trust = config.trust || {}
  const { data: eta } = useAsync(() => api.getDeliveryEstimate({ method: 'standard' }), [])

  const free = config.commerce?.freeShippingOver
  // A product's own policy (`product.returns`) wins over the store's window: a final-sale item promises no returns,
  // and one category can have a longer window than the rest.
  const policy = product?.returns
  const finalSale = policy?.returnable === false
  const days = finalSale ? 0 : policy?.returnable ? policy.days ?? 0 : config.commerce?.returnsWindowDays ?? 0
  const repairs = repairsLine(trust)

  const rows = [
    eta && {
      icon: 'truck',
      strong: t('Arrives {date}', {
        date: new Date(eta.arrivesAt).toLocaleDateString(config.pricing?.locale || 'en-US', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
      }),
      rest: eta.shipsToday ? t('if you order before {cutoff}', { cutoff: eta.cutoff }) : t('orders after the cutoff ship tomorrow'),
    },
    free && {
      icon: 'package',
      strong: t('Free shipping over {amount}', { amount: formatMoney({ amount: free, currency: config.pricing?.currency || 'USD' }) }),
      // The demo's own promises stay in English and out of the catalogs: a live store's build must not carry them.
      rest: isMock ? 'tracked, and insured until it reaches you' : '',
    },
    days > 0 && {
      icon: 'refresh',
      strong: isMock ? `Free ${days}-day returns` : plural(days, '{count}-day returns', '{count}-day returns'),
      rest: isMock ? 'prepaid label in every parcel — try it on at home' : '',
    },
    finalSale && {
      icon: 'info',
      strong: t('Final sale'),
      rest: t('this item cannot be returned'),
    },
    // The store's own sentence (`trust.repairsText`) when it sends one.
    repairs && { icon: 'shield', ...repairs },
  ].filter(Boolean)

  return (
    <div className={flat ? 'mt-7 border-t border-line pt-6' : 'mt-6 rounded-xs border border-line bg-surface p-4'}>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.strong} className="flex gap-2.5 text-[13px] leading-snug">
            <Icon name={r.icon} size={16} className="mt-px shrink-0 text-accent" />
            {/* min-w-0 so a long line wraps instead of widening the column. */}
            <span className="min-w-0">
              <span className="text-ink">{r.strong}</span>
              {r.rest && <span className="text-muted"> — {r.rest}</span>}
            </span>
          </li>
        ))}
      </ul>
      {!isMock && (
        <Suspense fallback={null}>
          <DeliveryCheck />
        </Suspense>
      )}

    </div>
  )
}

/**
 * Secure checkout and the payment marks, on their own.
 *
 * Split out of the block above so it can close the column rather than sit four
 * lines under the button. The delivery date and the returns window answer a
 * question the shopper has *while choosing*, so they belong next to the choice.
 * This answers one they have once they have decided, which is why it reads
 * better after the detail than before it — the last thing on the way out.
 */
export function PaymentsRow({ className = '' }) {
  const config = useStorefront()
  const payments = config.trust?.payments || []
  if (!payments.length) return null

  return (
    <div className={`mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4 ${className}`}>
      <span className="inline-flex items-center gap-1.5 text-[11px] text-faint">
        <Icon name="shield" size={13} className="text-good" />
        {t('Secure checkout')}
      </span>
      {payments.map((p) => (
        <span key={p} className="rounded-xs border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
          {p}
        </span>
      ))}
    </div>
  )
}

/**
 * Demand, stated honestly.
 *
 * Real counts from the API, never a fake "17 people are viewing this" — a
 * considered buyer recognises the pattern, and the moment they do, every other
 * number on the page becomes suspect too. Under a threshold, this renders
 * nothing rather than advertising that a product is unpopular.
 */
export function SocialProof({ product }) {
  const config = useStorefront()
  const s = product.social
  if (!s) return null
  const limits = config.trust?.socialProofThresholds || {}
  const boughtFloor = limits.bought ?? 25
  const savedFloor = limits.saved ?? 20
  const notes = []
  if (s.boughtLast30Days >= boughtFloor) notes.push(plural(s.boughtLast30Days, '{count} bought in the last 30 days', '{count} bought in the last 30 days'))
  if (s.savedCount >= savedFloor) notes.push(plural(s.savedCount, '{count} person has this saved', '{count} people have this saved'))
  if (!notes.length) return null

  return (
    <p className="mt-4 flex items-center gap-2 text-[13px] text-muted">
      <Icon name="sparkle" size={14} className="text-accent" />
      {notes.join(' · ')}
    </p>
  )
}
