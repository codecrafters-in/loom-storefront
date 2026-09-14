import { lazy, Suspense, useState } from 'react'
import { useLocation, useParams, useSearchParams, Link } from 'react-router-dom'
import api from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import { Button, Empty, ErrorState, Icon, Skeleton } from '../components/ui/index.jsx'
import Promises from '../components/layout/Promises.jsx'
import Media from '../components/ui/Media.jsx'
import { SIZES } from '../lib/images.js'
import { formatMoney } from '../lib/money.js'
import { config } from '../lib/config.js'
import { useAuth } from '../store/AuthContext.jsx'
import { nestLines } from '../lib/cart-lines.js'
import LineDetails from '../components/cart/LineDetails.jsx'
import { t } from '../i18n/index.js'

const PayNow = lazy(() => import('../components/checkout/PayNow.jsx'))

/**
 * A download link as the backend gave it. `GET /orders/:id/downloads/:doc` is a
 * route on the API, so a bare one is resolved against the API's base URL; an
 * absolute link, or a file the demo serves itself, is used as it is.
 */
const downloadUrl = (url = '') => (/^\/orders\//.test(url) ? `${config.api.baseUrl}${url}` : url)

/**
 * Save a download with the customer's token when it is an API route (see
 * `downloadFile`); anything else, or a failure, falls back to the plain link.
 */
async function saveDownload(event, download) {
  const href = downloadUrl(download.url)
  event.preventDefault()
  try {
    const blob = await api.downloadFile(href)
    if (!blob) {
      window.location.assign(href)
      return
    }
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = download.name
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(link.href), 30_000)
  } catch {
    window.location.assign(href)
  }
}

export default function OrderConfirmation() {
  const { id } = useParams()
  const { signedIn } = useAuth()
  const { state } = useLocation()
  // Checkout hands the order over in router state, so the confirmation renders
  // instantly; the fetch is the fallback for a refresh or a shared link.
  const { data, error, loading, reload } = useAsync(() => api.getOrder(id), [id], {
    skip: !!state?.order,
    initial: state?.order || null,
  })
  const [params] = useSearchParams()
  // The order as it stands after paying on this page.
  const [fresh, setFresh] = useState(null)
  const order = fresh || state?.order || data

  if (loading) return <div className="wrap py-16"><Skeleton className="h-96 w-full" /></div>
  if (error) {
    return (
      <div className="wrap py-20">
        {error.status === 404
          ? <Empty icon="package" title={t('Order not found')} body={t('Check the link, or sign in to see your orders.')} action={<Button to="/account/orders">{t('Your orders')}</Button>} />
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
          {t('Order')} <strong className="text-ink">{order.number}</strong> {stage.body}
        </p>

        {order.canPay && (
          <Suspense fallback={<Skeleton className="mt-8 h-24 w-full" />}>
            <PayNow
              order={order}
              autoOpen={params.get('pay') === '1'}
              notice={state?.paymentMessage}
              onPaid={() => api.getOrder(id).then(setFresh).catch(reload)}
            />
          </Suspense>
        )}

        {(tracking?.code || tracking?.url) && order.status !== 'cancelled' && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xs border border-line bg-surface p-5">
            <div className="min-w-0">
              <p className="eyebrow">{t('Tracking')}</p>
              <p className="mt-2 text-[14px]">
                {tracking.carrier && <span className="text-muted">{tracking.carrier} · </span>}
                {tracking.code && <span className="font-mono">{tracking.code}</span>}
              </p>
            </div>
            {tracking.url && (
              <Button href={tracking.url} target="_blank" rel="noreferrer" size="sm" variant="quiet" iconRight="arrow-right">
                {t('Track parcel')}
              </Button>
            )}
          </div>
        )}

        {/* Only a paid order carries these; before payment the backend answers 404 for the files anyway. */}
        {order.downloads?.length > 0 && (
          <div className="mt-8 rounded-xs border border-line bg-surface p-5">
            <p className="eyebrow">{t('Downloads')}</p>
            <ul className="mt-3 space-y-2">
              {order.downloads.map((d) => (
                <li key={d.id}>
                  <a href={downloadUrl(d.url)} download onClick={(e) => saveDownload(e, d)} className="inline-flex items-center gap-2 text-[14px] text-accent link-underline">
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
              <li key={l.id} className={`flex gap-4 py-5 ${depth ? 'ps-6' : ''}`}>
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
            <div className="flex justify-between"><dt className="text-muted">{t('Subtotal')}</dt><dd className="tabular-nums">{formatMoney(order.subtotal)}</dd></div>
            {order.discount?.amount > 0 && (
              <div className="flex justify-between text-sale"><dt>{order.discountCode?.label || t('Discount')}</dt><dd className="tabular-nums">−{formatMoney(order.discount)}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-muted">{t('Shipping')}</dt><dd className="tabular-nums">{order.shipping.amount === 0 ? t('Free') : formatMoney(order.shipping)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">{t('Tax')}</dt><dd className="tabular-nums">{formatMoney(order.tax)}</dd></div>
            {order.fee?.amount > 0 && (
              <div className="flex justify-between"><dt className="text-muted">{t('Cash on delivery fee')}</dt><dd className="tabular-nums">{formatMoney(order.fee)}</dd></div>
            )}
            {order.giftWrap?.amount > 0 && (
              <div className="flex justify-between"><dt className="text-muted">{t('Gift wrapping')}</dt><dd className="tabular-nums">{formatMoney(order.giftWrap)}</dd></div>
            )}
            <div className="flex justify-between border-t border-line pt-3 text-base"><dt>{t('Total')}</dt><dd className="tabular-nums">{formatMoney(order.total)}</dd></div>
            {order.refundedTotal?.amount > 0 && (
              <div className="flex justify-between text-muted"><dt>{t('Refunded')}</dt><dd className="tabular-nums">−{formatMoney(order.refundedTotal)}</dd></div>
            )}
          </dl>
        </div>

        <div className="mt-8 rounded-xs border border-line p-6">
          <h2 className="eyebrow">{order.pickupLocation ? t('Collect from') : t('Shipping to')}</h2>
          <address className="mt-3 not-italic text-[14px] leading-relaxed text-muted">
            {order.pickupLocation ? (
              <>
                {order.pickupLocation.name}<br />
                {order.pickupLocation.street}<br />
                {order.pickupLocation.city} {order.pickupLocation.postalCode}
              </>
            ) : (
              <>
                {order.shippingAddress.name}<br />
                {order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}<br />
                {order.shippingAddress.city}{order.shippingAddress.region ? `, ${order.shippingAddress.region}` : ''} {order.shippingAddress.postalCode}<br />
                {order.shippingAddress.country}
              </>
            )}
          </address>
          {order.deliverySlot && (
            <p className="mt-3 text-[14px] text-muted">
              {t('Delivery slot:')} <span className="text-ink">{order.deliverySlot.date} · {order.deliverySlot.from}–{order.deliverySlot.to}</span>
            </p>
          )}
        </div>

        {(order.billingAddress || order.company || order.vat) && (
          <div className="mt-4 rounded-xs border border-line p-6">
            <h2 className="eyebrow">{t('Billing')}</h2>
            <address className="mt-3 not-italic text-[14px] leading-relaxed text-muted">
              {order.company && <>{order.company}<br /></>}
              {order.billingAddress && (
                <>
                  {order.billingAddress.name}<br />
                  {order.billingAddress.line1}{order.billingAddress.line2 ? `, ${order.billingAddress.line2}` : ''}<br />
                  {order.billingAddress.city}{order.billingAddress.region ? `, ${order.billingAddress.region}` : ''} {order.billingAddress.postalCode}<br />
                  {order.billingAddress.country}
                  {order.vat && <br />}
                </>
              )}
              {order.vat && <>{t('Tax ID {vat}', { vat: order.vat })}</>}
            </address>
          </div>
        )}

        {(order.note || order.giftMessage || order.giftWrapped) && (
          <div className="mt-6 rounded-xs border border-line p-6 text-[14px] leading-relaxed text-muted">
            <h2 className="eyebrow">{t('Your notes')}</h2>
            {order.note && <p className="mt-3 whitespace-pre-line"><span className="text-ink">{t('Delivery instructions:')}</span> {order.note}</p>}
            {order.giftWrapped && <p className="mt-3 text-ink">{t('Gift wrapped')}</p>}
            {order.giftMessage && <p className="mt-3 whitespace-pre-line"><span className="text-ink">{t('Gift message:')}</span> {order.giftMessage}</p>}
          </div>
        )}

        <div className="mt-10 flex flex-wrap gap-3">
          <Button to="/shop" size="lg">{t('Keep shopping')}</Button>
          {signedIn || config.features?.accounts === false ? (
            <Button to="/account/orders" variant="outline" size="lg">{t('Your orders')}</Button>
          ) : (
            // After a guest order: an account for next time, with the email already filled in.
            <Button to="/login" state={{ mode: 'register', email: order.email, from: '/account' }} variant="outline" size="lg">
              {t('Create an account')}
            </Button>
          )}
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
    return { icon: 'close', tone: 'muted', title: t('Order cancelled.'), body: t('was cancelled. If you were charged, the refund goes back the way you paid.') }
  }
  if (order.status === 'refunded') {
    return { icon: 'refresh', tone: 'muted', title: t('Refunded.'), body: t('was refunded. The money goes back the way you paid; your bank can take a few days to show it.') }
  }
  if (order.canPay) {
    return { icon: 'info', tone: 'muted', title: t('Payment due.'), body: t('is waiting for a payment of {amount}.', { amount: formatMoney(order.amountDue) }) }
  }
  if (order.status === 'delivered') {
    return { icon: 'check', title: t('Delivered.'), body: t('has arrived. Questions about it? Reply to the email we sent to {email}.', { email: order.email }) }
  }
  if (order.status === 'fulfilled') {
    return { icon: 'truck', title: t('On its way.'), body: t('has shipped. Follow it with the tracking below.') }
  }
  if (order.payment?.status === 'pending') {
    return {
      icon: 'check',
      title: t('Thank you.'),
      body: order.payment.method
        ? t('is placed. You pay by {method} — we confirm it by email to {email}.', { method: order.payment.method, email: order.email })
        : t('is placed. We confirm it by email to {email}.', { email: order.email }),
    }
  }
  return { icon: 'check', title: t('Thank you.'), body: t('is confirmed. A receipt is on its way to {email}.', { email: order.email }) }
}
