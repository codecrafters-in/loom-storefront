import { useCart } from '../../store/CartContext.jsx'
import { t } from '../../i18n/index.js'

/**
 * The bag cannot change while its payment is open on a gateway's own page: the
 * amount the gateway is charging would no longer match the order. Say so where
 * the bag is, with the one way out.
 */
export default function PaymentLock({ className = '' }) {
  const { cart, cancelPayment, busy } = useCart()
  if (!cart?.paymentInProgress) return null
  return (
    <div role="status" className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xs border border-line bg-accent-soft/60 p-3.5 text-[13px] leading-relaxed ${className}`}>
      <span>{t('You started paying for this bag on the payment page. Finish there, or cancel that payment to change your bag.')}</span>
      <button type="button" onClick={() => cancelPayment().catch(() => {})} disabled={busy} className="text-accent link-underline">
        {t('Cancel payment')}
      </button>
    </div>
  )
}
