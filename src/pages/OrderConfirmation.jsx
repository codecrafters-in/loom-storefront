import { lazy, Suspense, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import api from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import { Button, Empty, ErrorState, Icon, Skeleton } from '../components/ui/index.jsx'
import Promises from '../components/layout/Promises.jsx'
import Media from '../components/ui/Media.jsx'
import { SIZES } from '../lib/images.js'
import { formatMoney } from '../lib/money.js'
import { config } from '../lib/config.js'
import { useAuth } from '../store/AuthContext.jsx'
import { useCart } from '../store/CartContext.jsx'
import { useStorefront } from '../store/StorefrontContext.jsx'
import { useToast } from '../store/ToastContext.jsx'
import { nestLines } from '../lib/cart-lines.js'
import LineDetails from '../components/cart/LineDetails.jsx'
import { formatDay } from '../lib/returns.js'
import { COUNTER_FROM, MAX_MESSAGE_LENGTH, messageTime, visibleMessages } from '../lib/order-messages.js'
import { t, mark } from '../i18n/index.js'

const PayNow = lazy(() => import('../components/checkout/PayNow.jsx'))
const ReturnWizard = lazy(() => import('../components/account/ReturnWizard.jsx'))

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

        {order.timeline?.length > 1 && <Timeline events={order.timeline} />}

        {order.invoices?.length > 0 && (
          <div className="mt-8 rounded-xs border border-line bg-surface p-5">
            <p className="eyebrow">{t('Invoices')}</p>
            <ul className="mt-3 space-y-2">
              {order.invoices.map((invoice) => (
                <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 text-[14px]">
                  <a
                    href={downloadUrl(invoice.url)}
                    onClick={(e) => saveDownload(e, { url: invoice.url, name: `${invoice.number.replaceAll('/', '-')}.pdf` })}
                    className="inline-flex items-center gap-2 text-accent link-underline"
                  >
                    <Icon name="package" size={15} />
                    {invoice.kind === 'credit_note' ? t('Credit note {number}', { number: invoice.number }) : t('Invoice {number}', { number: invoice.number })}
                  </a>
                  <span className="tabular-nums text-muted">{formatMoney(invoice.total)}</span>
                </li>
              ))}
            </ul>
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

        {(order.cancellation || order.cancelRequest || order.canReorder) && (
          <OrderActions order={order} onChange={setFresh} />
        )}

        {(order.canReturn || order.returnCount > 0) && <OrderReturns order={order} onChange={setFresh} />}

        {/* `null` when the store keeps messages off; older backends leave it out. */}
        {order.messages && <OrderMessages order={order} onChange={setFresh} />}

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

const EVENT_LABEL = {
  placed: mark('Placed'), paid: mark('Paid'), shipped: mark('Shipped'), delivered: mark('Delivered'),
  cancelled: mark('Cancelled'), refunded: mark('Refunded'),
}

/** What happened to the order and when, oldest first (`order.timeline`, from Odoo). */
function Timeline({ events }) {
  const locale = useStorefront().pricing?.locale || 'en-US'
  const when = (iso) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <div className="mt-8 rounded-xs border border-line bg-surface p-5">
      <p className="eyebrow">{t('Progress')}</p>
      <ol className="mt-4 space-y-3 border-s border-line ps-5">
        {events.map((event) => (
          <li key={`${event.kind}-${event.at}`} className="relative text-[14px]">
            <span aria-hidden="true" className="absolute -start-[25px] top-1.5 h-2 w-2 rounded-full bg-ink" />
            <span className="text-ink">{t(EVENT_LABEL[event.kind] || event.kind)}</span>
            <span className="text-muted"> · {when(event.at)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * Where a request to cancel stands (`order.cancelRequest`): waiting for the team, declined with their answer, or
 * accepted (the order is cancelled; the answer shows when they wrote one). Older backends only mark the request on
 * `order.cancellation.requestedAt`. Null when there is nothing to say.
 */
function cancelRequestNote(order, locale) {
  const request = order.cancelRequest
  if (request?.status === 'pending' && request.requestedAt) {
    const date = formatDay(request.requestedAt, locale)
    return (
      <p className="text-[14px] text-muted">
        {order.messages
          ? t('You asked us to cancel on {date}. We will answer here and by email.', { date })
          : t('You asked us to cancel on {date}. We will email you our answer.', { date })}
      </p>
    )
  }
  // Once the parcel has arrived, a declined request is history rather than news.
  if (request?.status === 'declined' && order.status !== 'delivered') {
    return (
      <div className="rounded-xs bg-sunken/60 p-4 text-[14px]">
        <p className="flex items-start gap-2 font-medium text-ink">
          <Icon name="info" size={16} className="mt-0.5 shrink-0 text-muted" />
          {t('We could not cancel this order.')}
        </p>
        {request.answer && <p className="mt-2 whitespace-pre-line break-words text-muted">{request.answer}</p>}
        {order.messages?.canReply && <p className="mt-2 text-[13px] text-muted">{t('Questions? Write to us below.')}</p>}
      </div>
    )
  }
  if (request?.status === 'accepted' && request.answer) {
    return (
      <div className="rounded-xs bg-sunken/60 p-4 text-[14px]">
        <p className="font-medium text-ink">{t('We cancelled this order as you asked.')}</p>
        <p className="mt-2 whitespace-pre-line break-words text-muted">{request.answer}</p>
      </div>
    )
  }
  if (request?.status === 'pending' || (!request && order.cancellation?.requestedAt)) {
    return <p className="text-[14px] text-muted">{t('You asked us to cancel this order. We will email you our answer.')}</p>
  }
  return null
}

/**
 * Cancel (or ask to), as far as the store's policy allows, and buy the same things again. The cancellation is
 * confirmed in place, with an optional reason, because it cannot be undone.
 */
function OrderActions({ order, onChange }) {
  const { refresh } = useCart()
  const { push } = useToast()
  const navigate = useNavigate()
  const locale = useStorefront().pricing?.locale || 'en-US'
  const [reason, setReason] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const cancellation = order.cancellation
  const asking = cancellation?.mode === 'request'
  const waiting = order.cancelRequest?.status === 'pending' || Boolean(cancellation?.requestedAt)
  const canCancel = Boolean(cancellation) && !waiting
  const note = cancelRequestNote(order, locale)

  const cancel = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onChange(await api.cancelOrder(order.id, { reason }))
      setReason(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const buyAgain = async () => {
    setBusy(true)
    setError(null)
    try {
      const cart = await api.reorder(order.id)
      await refresh().catch(() => {})
      for (const notice of cart.notices || []) push(notice.message)
      navigate('/cart')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (!note && !order.canReorder && !canCancel) return null

  return (
    <div className="mt-8 rounded-xs border border-line p-5">
      {reason === null ? note : (
        <form onSubmit={cancel} className="space-y-3">
          <p className="text-[14px] text-ink">
            {asking
              ? t('We will look at your request and email you.')
              : cancellation?.mode === 'refund'
                ? t('The order is cancelled at once and the payment refunded the way you paid.')
                : t('The order is cancelled at once.')}
          </p>
          <label htmlFor="cancel-reason" className="block text-[13px] font-medium">{t('Reason (optional)')}</label>
          <textarea id="cancel-reason" rows={2} maxLength={500} className="field h-auto py-2" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex flex-wrap gap-3">
            <Button as="button" type="submit" size="sm" variant="danger" disabled={busy}>
              {busy ? t('Just a moment…') : asking ? t('Send request') : t('Cancel order')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReason(null)} disabled={busy}>{t('Keep order')}</Button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="mt-3 text-[13px] text-sale">{error}</p>}
      {reason === null && (order.canReorder || canCancel) && (
        <div className={`flex flex-wrap gap-3 ${note ? 'mt-4' : ''}`}>
          {order.canReorder && (
            <Button size="sm" variant="quiet" icon="refresh" onClick={buyAgain} disabled={busy}>{t('Buy again')}</Button>
          )}
          {canCancel && (
            <Button size="sm" variant="ghost" onClick={() => setReason('')} disabled={busy}>
              {asking ? t('Ask to cancel') : t('Cancel order')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The order's returns, and the way to start one. The list loads when the order has returns (`returnCount`) and the
 * form when the shopper asks for it, so an order nobody sends back costs no extra request.
 */
function OrderReturns({ order, onChange }) {
  const [returning, setReturning] = useState(false)
  // Stays true once the form has been opened, so the answer to a sent return is still on screen when the form closes.
  const [opened, setOpened] = useState(false)
  const listed = order.returnCount > 0

  const open = () => {
    setOpened(true)
    setReturning(true)
  }

  return (
    <section aria-labelledby="order-returns" className="mt-8 rounded-xs border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="order-returns" className="eyebrow">{t('Returns')}</h2>
        {order.canReturn && !returning && (
          <Button size="sm" icon="package" onClick={open}>{t('Return items')}</Button>
        )}
      </div>
      {!listed && !opened && (
        <p className="mt-3 text-[14px] text-muted">{t('Something not right? You can return items from this order.')}</p>
      )}
      {(listed || opened) && (
        <Suspense fallback={<Skeleton className="mt-4 h-40 w-full" />}>
          <ReturnWizard
            order={order}
            showForm={returning}
            onFormDone={() => setReturning(false)}
            onFormCancel={() => setReturning(false)}
            onChanged={() => api.getOrder(order.id).then(onChange).catch(() => {})}
          />
        </Suspense>
      )}
    </section>
  )
}

/**
 * The conversation about the order (`order.messages`): what the store wrote and what the shopper asked, oldest first,
 * and a box to write in while the store takes replies. Sending answers with the whole order, like cancelling does.
 */
function OrderMessages({ order, onChange }) {
  const config = useStorefront()
  const locale = config.pricing?.locale || 'en-US'
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)
  const items = visibleMessages(order.messages)
  const canReply = Boolean(order.messages.canReply)

  const send = async (e) => {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setBusy(true)
    setError(null)
    setSent(false)
    try {
      onChange(await api.sendOrderMessage(order.id, { body: text }))
      setBody('')
      setSent(true)
    } catch (err) {
      setError(err.message)
      // The store stopped taking replies since the page loaded: show the order as it now stands.
      if (err.code === 'messages_closed') api.getOrder(order.id).then(onChange).catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="order-messages" className="mt-8 rounded-xs border border-line bg-surface p-5">
      <h2 id="order-messages" className="eyebrow">{t('Messages')}</h2>
      {items.length ? (
        <ol className="mt-4 space-y-3">
          {items.map((message) => {
            const mine = message.from === 'customer'
            return (
              <li key={message.id} className={`max-w-[85%] rounded-xs border border-line p-3.5 ${mine ? 'ms-auto bg-sunken/60' : 'bg-page'}`}>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                  <span className="font-medium text-ink">{mine ? t('You') : message.author || config.store?.name}</span>
                  <time dateTime={message.at}>{messageTime(message.at, locale)}</time>
                  {message.returnNumber && (
                    <span className="rounded-xs border border-line px-1.5 py-0.5 text-[11px]">{t('Return {number}', { number: message.returnNumber })}</span>
                  )}
                </p>
                <p className="mt-1.5 whitespace-pre-line break-words text-[14px] leading-relaxed text-ink">{message.body}</p>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="mt-3 text-[14px] text-muted">
          {t('No messages yet.')}
          {canReply && <> {t('Questions about this order? Write to us here.')}</>}
        </p>
      )}
      {canReply && (
        <form onSubmit={send} className="mt-5 border-t border-line pt-5">
          <label htmlFor="order-message" className="mb-1.5 block text-[13px] font-medium">{t('Write a message')}</label>
          <textarea
            id="order-message"
            rows={3}
            maxLength={MAX_MESSAGE_LENGTH}
            className="field h-auto py-2"
            value={body}
            onChange={(e) => {
              setBody(e.target.value)
              setSent(false)
            }}
            aria-describedby={body.length >= COUNTER_FROM ? 'order-message-count' : undefined}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <Button as="button" type="submit" size="sm" disabled={busy || !body.trim()}>{busy ? t('Sending…') : t('Send')}</Button>
            {body.length >= COUNTER_FROM && (
              <span id="order-message-count" className="text-[12px] tabular-nums text-muted">{body.length} / {MAX_MESSAGE_LENGTH}</span>
            )}
          </div>
        </form>
      )}
      {error && <p role="alert" className="mt-3 text-[13px] text-sale">{error}</p>}
      <p role="status" className="sr-only">{sent ? t('Message sent.') : ''}</p>
    </section>
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
    return {
      icon: 'check',
      title: t('Delivered.'),
      body: order.messages?.canReply
        ? t('has arrived. Questions about it? Write to us below.')
        : t('has arrived. Questions about it? Reply to the email we sent to {email}.', { email: order.email }),
    }
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
