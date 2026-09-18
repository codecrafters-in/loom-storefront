/**
 * The demo backend's account, after-purchase, community and payment calls, split out of mock.js like mock-admin.js:
 * they load with the first of them and share mock.js's state.
 */
import { ApiError } from './contracts.js'
import {
  KEY, latency, read, write, login, register, logout, getCart, DEMO_CUSTOMER,
  checkStock, emptyCart, loadCart, nowIso, placeOrderFromCart, priceCart, saveCart,
} from './mock.js'

/** The demo has no questions; asking one is thanked, as if the store will answer. */
export async function getQuestions() {
  await latency()
  return { items: [], total: 0, page: 1, perPage: 5 }
}
export async function askQuestion() {
  await latency()
  return { id: 'q_demo', status: 'pending' }
}
export async function createAlert() {
  await latency()
  return { ok: true, status: 'waiting' }
}
export async function stopAlerts() {
  await latency()
  return { ok: true }
}
export async function confirmNewsletter() {
  await latency()
  return { ok: true }
}
export async function unsubscribeNewsletter() {
  await latency()
  return { ok: true }
}

/** The demo keeps no reviews: a new one is thanked, as if waiting for approval. */
export async function createReview() {
  await latency()
  return { id: 'rev_demo', status: 'pending' }
}

/* ── passwords, invitations, verification ─────────────────────────────── */

/** The demo sends no email: every request succeeds, and any link token works. */
export async function forgotPassword() {
  await latency()
  return { ok: true }
}

export async function resetPassword({ password }) {
  const current = read(KEY.customer, null)
  return login({ email: current?.email || DEMO_CUSTOMER.email, password })
}

export async function signupWithToken({ password }) {
  return register({ email: DEMO_CUSTOMER.email, password })
}

export async function verifyEmail() {
  await latency()
  return { ok: true }
}

export async function resendVerification() {
  await latency()
  return { ok: true, verified: true }
}

/* ── sign-in and privacy ───────────────────────────────────────────────── */

function signedInCustomer() {
  const customer = read(KEY.customer, null)
  if (!customer) throw new ApiError('Not signed in.', { status: 401, code: 'unauthenticated' })
  return customer
}

export async function changePassword({ password }) {
  await latency()
  signedInCustomer()
  if (!password || password.length < 8) throw new ApiError('Please choose a password of at least 8 characters.', { status: 422, code: 'weak_password' })
  return { ok: true }
}

/** The demo sends no email, so the new address applies at once. */
export async function changeEmail({ email }) {
  await latency()
  write(KEY.customer, { ...signedInCustomer(), email })
  return { ok: true, pendingEmail: email, sent: false }
}

export async function confirmEmailChange() {
  await latency()
  return { ok: true, email: read(KEY.customer, null)?.email || DEMO_CUSTOMER.email }
}

export async function exportData() {
  await latency()
  const profile = signedInCustomer()
  const orders = read(KEY.orders, []).filter((order) => order.email === profile.email)
  const data = { exportedAt: new Date().toISOString(), store: 'Demo', profile, orders, savedItems: [], newsletter: [], messages: [] }
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
}

export async function deleteAccount() {
  signedInCustomer()
  return logout()
}

/** The demo has no company accounts: a customer is on their own, and invitations need a live store. */
export async function getCompany() {
  await latency()
  signedInCustomer()
  return { company: null, role: 'admin', canManage: true, members: [] }
}

async function liveStoreOnly() {
  await latency()
  throw new ApiError('The demo store does not do this.', { status: 422, code: 'demo_only' })
}
export const inviteMember = liveStoreOnly
export const updateMember = liveStoreOnly
export const removeMember = liveStoreOnly
/** The demo has no sales team to send a quote. */
export const requestQuote = liveStoreOnly
/** Demo orders cannot be returned: nothing is ever delivered. */
export async function getOrderReturns() {
  await latency()
  return { options: { days: 30, until: null, methods: [], reasons: [], lines: [] }, items: [] }
}
export async function listReturns() {
  await latency()
  signedInCustomer()
  return { items: [], total: 0, page: 1, perPage: 20 }
}
export const createReturn = liveStoreOnly
export const cancelReturn = liveStoreOnly
/** Demo orders are for looking at: they cannot be cancelled or bought again. */
export const cancelOrder = liveStoreOnly
/** Demo orders carry no messages (`order.messages` is absent), so there is no conversation to write in. */
export const sendOrderMessage = liveStoreOnly
export const reorder = liveStoreOnly

/** The demo store does not offer sign-in by text message (`features.phoneLogin` is off). */
export async function requestLoginCode() {
  await latency()
  return { ok: true }
}

/** The demo offers no sign-in providers (`features.socialLogin` is empty). */
export async function startOAuth() {
  throw new ApiError('This sign-in option is not available in this store.', { status: 404, code: 'oauth_unavailable' })
}

export async function finishOAuth() {
  throw new ApiError('This sign-in has expired. Please try again.', { status: 422, code: 'invalid_state' })
}

export async function verifyLoginCode() {
  throw new ApiError('That code is not right, or it has expired.', { status: 422, code: 'invalid_code' })
}

/** The demo keeps its bag in this browser; there is nothing to recover. */
export async function recoverCart() {
  return getCart()
}

/* ── on-site payments (checkout.mode "payments") ───────────────────────── */

/**
 * The two kinds of method a real backend offers, so the payment step can be
 * previewed without one: a test card taken on the page, and cash on delivery,
 * which needs nothing from the shopper.
 */
const PAYMENT_METHODS = [
  {
    id: 'demo-card', providerId: 'demo', methodId: 'card', provider: 'demo', providerName: 'Demo',
    code: 'card', name: 'Card', image: null, brands: [], flow: 'direct', test: true, canSave: false, note: null,
  },
  {
    id: 'custom-cod', providerId: 'custom', methodId: 'cod', provider: 'custom', providerName: 'Cash on Delivery',
    code: 'cash_on_delivery', name: 'Cash on delivery', image: null, brands: [], flow: 'offline', test: false,
    canSave: false, note: 'Pay the courier in cash or by UPI when your parcel arrives.',
  },
]

function paymentCart(cartId) {
  const cart = priceCart(loadCart())
  if (cartId && cart.id && cart.id !== cartId) {
    throw new ApiError('That bag has expired. Please review it and try again.', { status: 404, code: 'cart_not_found' })
  }
  if (!cart.lines.length) throw new ApiError('Your bag is empty.', { status: 422, code: 'empty_cart' })
  return cart
}

const loadPayments = () => read(KEY.payments, {})

function savePayment(payment) {
  const all = { ...loadPayments(), [payment.id]: payment }
  // Keep the newest fifty; an abandoned attempt should not live in storage forever.
  const newest = Object.values(all).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 50)
  write(KEY.payments, Object.fromEntries(newest.map((p) => [p.id, p])))
}

function findPayment(paymentId) {
  const payment = loadPayments()[paymentId]
  if (!payment) throw new ApiError('We could not find that payment.', { status: 404, code: 'not_found' })
  return payment
}

/** What the API answers with — never the cart id or the stored request. */
const paymentView = ({ cartId: _cartId, request: _request, createdAt: _createdAt, ...payment }) => ({
  message: null, client: {}, redirect: null, order: null, ...payment,
})

/** The money is taken (or promised, for cash on delivery): place the order exactly as checkout does. */
function settlePayment(payment, status, message = null) {
  const { email, shippingAddress, shippingMethod, methodName } = payment.request
  const order = placeOrderFromCart(priceCart(loadCart()), {
    email,
    shippingAddress,
    shippingMethod,
    payment: {
      provider: payment.provider,
      status: status === 'paid' ? 'captured' : 'pending',
      reference: payment.reference,
      method: methodName,
      capturedAt: status === 'paid' ? nowIso() : null,
    },
  })
  write(KEY.placed, [order.id, ...read(KEY.placed, [])].slice(0, 50))
  saveCart(emptyCart())
  Object.assign(payment, { status, message, order: { id: order.id, number: order.number } })
}

export async function getPaymentOptions(cartId, { email } = {}) {
  await latency()
  const cart = paymentCart(cartId)
  if (!email) throw new ApiError('Please enter your email address.', { status: 422, code: 'email_required' })
  checkStock(cart)
  return { amount: cart.total, methods: PAYMENT_METHODS, savedMethods: [], total: PAYMENT_METHODS.length }
}

export async function createPayment(cartId, body = {}) {
  await latency()
  const cart = paymentCart(cartId)
  const method = PAYMENT_METHODS.find(
    (m) => m.providerId === String(body.providerId) && m.methodId === String(body.methodId),
  )
  if (!method) {
    throw new ApiError('That payment method is not available for this order.', { status: 422, code: 'invalid_payment_method' })
  }
  if (!body.email) throw new ApiError('Please enter your email address.', { status: 422, code: 'email_required' })
  if (body.expectedTotal != null && body.expectedTotal !== cart.total.amount) {
    throw new ApiError('Your bag changed while you were paying. Please check the total and try again.', {
      status: 409,
      code: 'cart_changed',
    })
  }
  checkStock(cart)

  const reference = `LM-PAY-${Date.now().toString(36).toUpperCase()}`
  const payment = {
    id: `pay_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
    reference,
    provider: method.provider,
    flow: method.flow,
    status: 'draft',
    message: null,
    client: method.flow === 'direct'
      ? {
        reference,
        amount: cart.total.amount,
        currency: cart.total.currency,
        prefill: { name: body.shippingAddress?.name || '', email: body.email, contact: body.shippingAddress?.phone || '' },
      }
      : {},
    redirect: null,
    order: null,
    cartId: cart.id,
    createdAt: nowIso(),
    request: {
      email: body.email,
      shippingAddress: body.shippingAddress,
      shippingMethod: body.shippingMethod || 'standard',
      methodName: method.name,
    },
  }
  if (cart.total.amount === 0) settlePayment(payment, 'paid')
  else if (method.flow === 'offline') settlePayment(payment, 'pending', method.note)
  savePayment(payment)
  return paymentView(payment)
}

export async function paymentAction(paymentId, action, body = {}) {
  await latency()
  const payment = findPayment(paymentId)
  if (payment.provider !== 'demo' || action !== 'simulate') {
    throw new ApiError(`"${action}" is not a step this payment takes.`, { status: 404, code: 'unsupported_action' })
  }
  // A replayed step changes nothing once the payment has an answer.
  if (payment.status !== 'draft') return paymentView(payment)

  switch (body.outcome) {
    case 'done':
      settlePayment(payment, 'paid')
      break
    case 'pending':
      settlePayment(payment, 'pending', 'Your payment is being confirmed.')
      break
    case 'cancel':
      Object.assign(payment, { status: 'cancelled', message: 'The payment was cancelled. Your bag is unchanged.' })
      break
    case 'error':
      Object.assign(payment, { status: 'failed', message: 'The card was declined. This is a test — try another outcome.' })
      break
    default:
      throw new ApiError('Choose what the test payment should do.', { status: 422, code: 'invalid_outcome' })
  }
  savePayment(payment)
  return paymentView(payment)
}

export async function getPayment(paymentId) {
  await latency()
  return paymentView(findPayment(paymentId))
}
