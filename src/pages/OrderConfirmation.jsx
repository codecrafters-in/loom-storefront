import { useLocation, useParams, Link } from 'react-router-dom'
import api from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import { Button, Empty, ErrorState, Icon, Skeleton } from '../components/ui/index.jsx'
import Promises from '../components/layout/Promises.jsx'
import Media from '../components/ui/Media.jsx'
import { SIZES } from '../lib/images.js'
import { formatMoney } from '../lib/money.js'
import { config } from '../lib/config.js'
import { nestLines } from '../lib/cart-lines.js'
import LineDetails from '../components/cart/LineDetails.jsx'

/**
 * A download link as the backend gave it. `GET /orders/:id/downloads/:doc` is a
 * route on the API, so a bare one is resolved against the API's base URL; an
 * absolute link, or a file the demo serves itself, is used as it is.
 */
const downloadUrl = (url = '') => (/^\/orders\//.test(url) ? `${config.api.baseUrl}${url}` : url)

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

  const stage = orderStage(order)
  // Older demo orders stored the tracking number as a bare string.
  const tracking = typeof order.tracking === 'string' ? { code: order.tracking } : order.tracking

  return (
    <>
      <div className="wrap max-w-2xl py-16">
        <span className={`grid h-12 w-12 place-items-center rounded-full ${stage.tone === 'muted' ? 'bg-sunken text-muted' : 'bg-good/10 text-good'}`}>
          <Icon name={stage.icon} size={22} />
        </span>
        <h1 className="mt-6 text-display-lg">{stage.title}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          Order <strong className="text-ink">{order.number}</strong> {stage.body}
        </p>

        {(tracking?.code || tracking?.url) && order.status !== 'cancelled' && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xs border border-line bg-surface p-5">
            <div className="min-w-0">
              <p className="eyebrow">Tracking</p>
              <p className="mt-2 text-[14px]">
                {tracking.carrier && <span className="text-muted">{tracking.carrier} · </span>}
                {tracking.code && <span className="font-mono">{tracking.code}</span>}
              </p>
            </div>
            {tracking.url && (
              <Button href={tracking.url} target="_blank" rel="noreferrer" size="sm" variant="quiet" iconRight="arrow-right">
                Track parcel
              </Button>
            )}
          </div>
        )}

        {/* Only a paid order carries these; before payment the backend answers 404 for the files anyway. */}
        {order.downloads?.length > 0 && (
          <div className="mt-8 rounded-xs border border-line bg-surface p-5">
            <p className="eyebrow">Downloads</p>
            <ul className="mt-3 space-y-2">
              {order.downloads.map((d) => (
                <li key={d.id}>
                  <a href={downloadUrl(d.url)} download className="inline-flex items-center gap-2 text-[14px] text-accent link-underline">
                    <Icon name="package" size={15} />
                    {d.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-10 rounded-xs border border-line bg-surface">
          <ul className="divide-y divide-line px-6">
            {nestLines(order.lines).map(({ line: l, depth }) => (
              <li key={l.id} className={`flex gap-4 py-5 ${depth ? 'pl-6' : ''}`}>
                <div className="w-16 shrink-0">
                  <div className="shot rounded-xs"><Media sizes={SIZES.thumb} src={l.image?.url} type={l.image?.type} alt="" loading="lazy" className="h-full w-full object-cover" /></div>
                </div>
                <div className="min-w-0 flex-1">
                  <Link to={`/product/${l.productSlug}`} className="text-[14px] font-medium">{l.title}</Link>
                  <LineDetails line={l} quantity />
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

/**
 * The headline follows the parcel. The same page is the receipt straight after
 * checkout and the place a shopper comes back to from an email a week later, and
 * "Thank you" above an order that has already arrived reads as if nothing moved.
 */
function orderStage(order) {
  if (order.status === 'cancelled') {
    return { icon: 'close', tone: 'muted', title: 'Order cancelled.', body: 'was cancelled. If you were charged, the refund goes back the way you paid.' }
  }
  if (order.status === 'delivered') {
    return { icon: 'check', title: 'Delivered.', body: `has arrived. Questions about it? Reply to the email we sent to ${order.email}.` }
  }
  if (order.status === 'fulfilled') {
    return { icon: 'truck', title: 'On its way.', body: 'has shipped. Follow it with the tracking below.' }
  }
  if (order.payment?.status === 'pending') {
    return { icon: 'check', title: 'Thank you.', body: `is placed. ${order.payment.method ? `You pay by ${order.payment.method} — ` : ''}we confirm it by email to ${order.email}.` }
  }
  return { icon: 'check', title: 'Thank you.', body: `is confirmed. A receipt is on its way to ${order.email}.` }
}
