/**
 * Admin orders: where an order stands and what can be done with it next.
 *
 * A real backend sends `orderState`, `paymentStatus`, `delivery` and `actions`
 * itself (docs/API.md). The demo adapter derives the same fields here from the
 * orders it keeps, and the admin screens read their labels and progress steps
 * from here too — so the badge an order wears and the buttons it offers come
 * from one set of rules and cannot disagree.
 */

/** Every action, in the order the detail page offers them. */
export const ORDER_ACTIONS = ['ship', 'update_tracking', 'deliver', 'record_payment', 'cancel']

/** The list's filter tabs: the query each sends and the `counts` key it shows. */
export const ORDER_VIEWS = [
  { id: 'all', label: 'All', query: {} },
  { id: 'to_ship', label: 'To ship', query: { delivery: 'to_ship' }, count: 'toShip' },
  {
    id: 'awaiting',
    label: 'Awaiting payment',
    query: { payment: 'awaiting' },
    count: 'awaitingPayment',
    hint: 'Money not received yet: a payment still pending, such as Cash on Delivery, or no payment recorded at all.',
  },
  { id: 'shipped', label: 'Shipped', query: { delivery: 'shipped' }, count: 'shipped' },
  { id: 'delivered', label: 'Delivered', query: { delivery: 'delivered' }, count: 'delivered' },
  { id: 'cancelled', label: 'Cancelled', query: { status: 'cancelled' }, count: 'cancelled' },
]

export const ORDER_STATE_LABELS = { quotation: 'Quotation', confirmed: 'Confirmed', cancelled: 'Cancelled' }
export const PAYMENT_LABELS = {
  paid: 'Paid',
  authorized: 'Authorised',
  pending: 'Awaiting payment',
  failed: 'Payment failed',
  unpaid: 'Unpaid',
}
export const DELIVERY_LABELS = {
  none: 'No delivery',
  to_ship: 'To ship',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

/** Tones name the theme's colour tokens; the admin UI turns them into classes. */
export const PAYMENT_TONES = { paid: 'good', authorized: 'accent', pending: 'accent', failed: 'sale', unpaid: 'muted' }
export const DELIVERY_TONES = { none: 'muted', to_ship: 'accent', shipped: 'ink', delivered: 'good', cancelled: 'faint' }
export const ORDER_STATE_TONES = { quotation: 'accent', confirmed: 'ink', cancelled: 'faint' }

/** Placed → Paid → Shipped → Delivered, each with whether it has happened and when. */
export function progressSteps(order) {
  const delivery = order.delivery || {}
  const paid = ['paid', 'authorized'].includes(order.paymentStatus)
  const shipped = ['shipped', 'delivered'].includes(delivery.status)
  return [
    { id: 'placed', label: 'Placed', done: true, at: order.placedAt || null },
    {
      id: 'paid',
      label: order.paymentStatus === 'authorized' ? 'Authorised' : 'Paid',
      done: paid,
      at: paid ? order.payment?.capturedAt || null : null,
    },
    { id: 'shipped', label: 'Shipped', done: shipped, at: delivery.shippedAt || null },
    { id: 'delivered', label: 'Delivered', done: delivery.status === 'delivered', at: delivery.deliveredAt || null },
  ]
}

/** `null` when the tracking details are fine, else the message to show. Every field is optional. */
export function trackingProblem(tracking = {}) {
  const url = String(tracking.url || '').trim()
  if (url && !/^https?:\/\/\S+$/i.test(url)) return 'The tracking link must start with http:// or https://.'
  if (String(tracking.code || '').trim().length > 128) return 'The tracking number is too long.'
  return null
}

// Payments settled outside the checkout — cash on delivery, bank transfer.
const OFFLINE_PROVIDERS = new Set(['custom'])

const PAYMENT_STATUS = {
  captured: 'paid',
  refunded: 'paid',
  partially_refunded: 'paid',
  authorized: 'authorized',
  pending: 'pending',
  failed: 'failed',
  cancelled: 'failed',
}

/**
 * The admin view of a stored order, for an adapter that keeps orders itself.
 *
 * Adds exactly the fields a backend adds (docs/API.md → Admin orders) and leaves
 * the customer-facing Order untouched underneath, so the same record still
 * renders on the shopper's order page.
 */
export function adminOrderView(order, { shippingMethods = [] } = {}) {
  const payment = order.payment || null
  const cancelled = order.status === 'cancelled'
  const offlinePending = Boolean(payment && OFFLINE_PROVIDERS.has(payment.provider) && payment.status === 'pending')
  // Older demo orders stored the tracking number as a bare string.
  const tracking = typeof order.tracking === 'string' ? { code: order.tracking } : order.tracking || {}

  const paymentStatus = payment
    ? PAYMENT_STATUS[payment.status] || 'unpaid'
    : ['paid', 'fulfilled', 'delivered', 'refunded'].includes(order.status) ? 'paid' : 'unpaid'

  let deliveryStatus
  if (cancelled) deliveryStatus = 'cancelled'
  else if (order.deliveredAt || order.status === 'delivered') deliveryStatus = 'delivered'
  else if (order.shippedAt || order.status === 'fulfilled') deliveryStatus = 'shipped'
  else if (order.status === 'refunded') deliveryStatus = 'cancelled'
  else if (!order.lines?.length) deliveryStatus = 'none'
  else deliveryStatus = 'to_ship'

  // Cash on delivery stays a quotation until it is sent: the parcel goes before the money does.
  const orderState = cancelled ? 'cancelled' : offlinePending && deliveryStatus === 'to_ship' ? 'quotation' : 'confirmed'
  const shipped = deliveryStatus === 'shipped' || deliveryStatus === 'delivered'
  const canShip = deliveryStatus === 'to_ship' && orderState !== 'cancelled'

  const actions = []
  if (canShip) actions.push('ship')
  if (shipped) actions.push('update_tracking')
  if (canShip || deliveryStatus === 'shipped') actions.push('deliver')
  if (offlinePending && !cancelled) actions.push('record_payment')
  if (!shipped && !cancelled && deliveryStatus !== 'cancelled') actions.push('cancel')

  return {
    ...order,
    backendId: null,
    backendUrl: null,
    customer: {
      name: order.shippingAddress?.name || '',
      email: order.email || '',
      phone: order.shippingAddress?.phone || '',
    },
    orderState,
    paymentStatus,
    delivery: {
      status: deliveryStatus,
      method: shippingMethods.find((m) => m.id === order.shippingMethod)?.label || order.shippingMethod || '',
      shippedAt: order.shippedAt || null,
      deliveredAt: order.deliveredAt || null,
      carrier: tracking.carrier || '',
      trackingCode: tracking.code || '',
      trackingUrl: tracking.url || '',
      references: [],
    },
    actions,
  }
}

/** The list's tab counts, over every order regardless of the filter in use. */
/** Payment statuses that mean the money has not arrived (the `payment=awaiting` filter). */
export const AWAITING_PAYMENT = ['pending', 'unpaid']

/**
 * Tab counts, each computed by running that tab's own filter — so the number on
 * a tab can never promise orders its list does not show.
 */
export function orderCounts(views) {
  const counts = {}
  for (const view of ORDER_VIEWS) {
    if (view.count) counts[view.count] = filterOrders(views, view.query).length
  }
  return counts
}

/** Filter admin views the way `GET /admin/orders` does. */
export function filterOrders(views, { q, status, payment, delivery } = {}) {
  const needle = String(q || '').trim().toLowerCase()
  return views.filter((order) => {
    if (status && order.status !== status) return false
    if (payment === 'awaiting') {
      if (!AWAITING_PAYMENT.includes(order.paymentStatus) || order.orderState === 'cancelled') return false
    } else if (payment && order.paymentStatus !== payment) return false
    if (delivery && order.delivery.status !== delivery) return false
    if (!needle) return true
    return [order.number, order.customer.email, order.customer.name, order.delivery.trackingCode]
      .some((field) => String(field || '').toLowerCase().includes(needle))
  })
}
