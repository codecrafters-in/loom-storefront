import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { Icon } from '../ui/index.jsx'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { formatMoney } from '../../lib/money.js'

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
export default function TrustRow() {
  const config = useStorefront()
  const trust = config.trust || {}
  const { data: eta } = useAsync(() => api.getDeliveryEstimate({ method: 'standard' }), [])

  const free = config.commerce?.freeShippingOver
  const days = config.commerce?.returnsWindowDays ?? 30

  const rows = [
    eta && {
      icon: 'truck',
      strong: `Arrives ${new Date(eta.arrivesAt).toLocaleDateString(config.pricing?.locale || 'en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })}`,
      rest: eta.shipsToday ? `if you order before ${eta.cutoff}` : `orders after the cutoff ship tomorrow`,
    },
    free && {
      icon: 'package',
      strong: `Free shipping over ${formatMoney({ amount: free, currency: config.pricing?.currency || 'USD' })}`,
      rest: 'tracked, and insured until it reaches you',
    },
    {
      icon: 'refresh',
      strong: `Free ${days}-day returns`,
      rest: 'prepaid label in every parcel — try it on at home',
    },
    trust.repairs !== false && {
      icon: 'shield',
      strong: 'Repaired, not replaced',
      rest: 'we mend anything we made, for as long as we exist',
    },
  ].filter(Boolean)

  return (
    <div className="mt-6 rounded-xs border border-line bg-surface p-4">
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.strong} className="flex gap-2.5 text-[13px] leading-snug">
            <Icon name={r.icon} size={16} className="mt-px shrink-0 text-accent" />
            <span>
              <span className="text-ink">{r.strong}</span>{' '}
              <span className="text-muted">— {r.rest}</span>
            </span>
          </li>
        ))}
      </ul>

      {trust.payments?.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-faint">
            <Icon name="shield" size={13} className="text-good" />
            Secure checkout
          </span>
          {trust.payments.map((p) => (
            <span key={p} className="rounded-xs border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
              {p}
            </span>
          ))}
        </div>
      )}
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
  if (s.boughtLast30Days >= boughtFloor) notes.push(`${s.boughtLast30Days} bought in the last 30 days`)
  if (s.savedCount >= savedFloor) notes.push(`${s.savedCount} people have this saved`)
  if (!notes.length) return null

  return (
    <p className="mt-4 flex items-center gap-2 text-[13px] text-muted">
      <Icon name="sparkle" size={14} className="text-accent" />
      {notes.join(' · ')}
    </p>
  )
}
