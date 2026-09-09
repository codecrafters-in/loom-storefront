import { useLocation, useParams, Link } from 'react-router-dom'
import api from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import { Button, Empty, ErrorState, Icon, Skeleton } from '../components/ui/index.jsx'
import Promises from '../components/layout/Promises.jsx'
import Media from '../components/ui/Media.jsx'
import { SIZES } from '../lib/images.js'
import { formatMoney } from '../lib/money.js'

export default function OrderConfirmation() {
  const { id } = useParams()
  const { state } = useLocation()
  // Checkout hands the order over in router state, so the confirmation renders
  // instantly; the fetch is the fallback for a refresh or a shared link.
  const { data, error, loading, reload } = useAsync(() => api.getOrder(id), [id], {
    skip: !!state?.order,
    initial: state?.order || null,
  })
  const order = state?.order || data

  if (loading) return <div className="wrap py-16"><Skeleton className="h-96 w-full" /></div>
  if (error) {
    return (
      <div className="wrap py-20">
        {error.status === 404
          ? <Empty icon="package" title="Order not found" body="Check the link, or sign in to see your orders." action={<Button to="/account/orders">Your orders</Button>} />
          : <ErrorState error={error} onRetry={reload} />}
      </div>
    )
  }
  if (!order) return null

  return (
    <>
      <div className="wrap max-w-2xl py-16">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-good/10 text-good">
          <Icon name="check" size={22} />
        </span>
        <h1 className="mt-6 text-display-lg">Thank you.</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          Order <strong className="text-ink">{order.number}</strong> is confirmed. A receipt is on its
          way to {order.email}.
        </p>

        <div className="mt-10 rounded-xs border border-line bg-surface">
          <ul className="divide-y divide-line px-6">
            {order.lines.map((l) => (
              <li key={l.id} className="flex gap-4 py-5">
                <div className="w-16 shrink-0">
                  <div className="shot rounded-xs"><Media sizes={SIZES.thumb} src={l.image?.url} type={l.image?.type} alt="" loading="lazy" className="h-full w-full object-cover" /></div>
                </div>
                <div className="min-w-0 flex-1">
                  <Link to={`/product/${l.productSlug}`} className="text-[14px] font-medium">{l.title}</Link>
                  <p className="mt-1 text-[12px] text-faint">
                    {Object.values(l.options).join(' · ')} · Qty {l.quantity}
                  </p>
                </div>
                <span className="text-[14px] tabular-nums">{formatMoney(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-2.5 border-t border-line px-6 py-5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatMoney(order.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Shipping</dt><dd className="tabular-nums">{order.shipping.amount === 0 ? 'Free' : formatMoney(order.shipping)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd className="tabular-nums">{formatMoney(order.tax)}</dd></div>
            <div className="flex justify-between border-t border-line pt-3 text-base"><dt>Total</dt><dd className="tabular-nums">{formatMoney(order.total)}</dd></div>
          </dl>
        </div>

        <div className="mt-8 rounded-xs border border-line p-6">
          <h2 className="eyebrow">Shipping to</h2>
          <address className="mt-3 not-italic text-[14px] leading-relaxed text-muted">
            {order.shippingAddress.name}<br />
            {order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}<br />
            {order.shippingAddress.city}{order.shippingAddress.region ? `, ${order.shippingAddress.region}` : ''} {order.shippingAddress.postalCode}<br />
            {order.shippingAddress.country}
          </address>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Button to="/shop" size="lg">Keep shopping</Button>
          <Button to="/account/orders" variant="outline" size="lg">Your orders</Button>
        </div>
      </div>
      <Promises />
    </>
  )
}
