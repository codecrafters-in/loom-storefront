/**
 * The real-backend adapter's account, after-purchase and community calls, loaded with the first of them
 * (see `later` in http.js): password and email changes, sign-in by code or provider, company accounts, returns,
 * cancelling and buying again, reviews, questions, alerts, the newsletter links, and asking what can pay for the bag
 * and starting its payment. Documented in docs/API.md.
 */
import { ApiError, ContractError, assertCart, assertList } from './contracts.js'
import {
  get, post, request, send, customerToken, storeSession, mergeGuestWishlist, SESSION_KEY, CART_KEY, FRESH_CART_KEY, ensureCart,
  assertPayment, forgetSpentCart,
} from './http.js'

/** Answered questions about a product (`features.questions`): `{items, total, page, perPage}`. */
export const getQuestions = (slug, { page = 1, perPage = 5 } = {}) =>
  get(`/products/${encodeURIComponent(slug)}/questions`, { page, per_page: perPage }).then((r) => assertList(r, `GET /products/${slug}/questions`))
/** `{question, name, email}`: `{id, status: pending}`; the answer is emailed and then shows on the page. */
export const askQuestion = (slug, body) => post(`/products/${encodeURIComponent(slug)}/questions`, body)
/** `{kind: stock | price, variantId, email}`: one email when the option is back in stock or its price drops. */
export const createAlert = (slug, body) => post(`/products/${encodeURIComponent(slug)}/alerts`, body)
/** The token in an alert email: the shopper's waiting alerts in the store stop. */
export const stopAlerts = (token) => post('/alerts/unsubscribe', { token })
/** The token in the newsletter confirmation email (double opt-in). */
export const confirmNewsletter = (token) => post('/newsletter/confirm', { token })
export const unsubscribeNewsletter = (token) => post('/newsletter/unsubscribe', { token })

/** A review (who may write one: `features.reviewPolicy`): `{id, status: approved | pending}`. */
export const createReview = (slug, body) => post(`/products/${encodeURIComponent(slug)}/reviews`, body)

/** What can still be returned from an order (`options`), and the returns asked for so far (`items`). */
export const getOrderReturns = (orderId) => get(`/orders/${encodeURIComponent(orderId)}/returns`)
/** `{method, note, lines: [{lineId, quantity, reasonId, comment}], photos: [{name, data}]}`: the new return. */
export const createReturn = (orderId, body) => post(`/orders/${encodeURIComponent(orderId)}/returns`, body)
export const cancelReturn = (orderId, returnId) =>
  post(`/orders/${encodeURIComponent(orderId)}/returns/${encodeURIComponent(returnId)}/cancel`, {})
/** The signed-in customer's returns across their orders, newest first. */
export const listReturns = ({ page = 1 } = {}) => get('/returns', { page }).then((r) => assertList(r, 'GET /returns'))

/** Cancel the order, or ask the store to (`order.cancellation`): the order as it now stands. */
export const cancelOrder = (orderId, { reason } = {}) => post(`/orders/${encodeURIComponent(orderId)}/cancel`, { reason })
/** `{body}` (up to 2000 characters) to the store about the order (`order.messages.canReply`): the order as it now stands. */
export const sendOrderMessage = (orderId, body) => post(`/orders/${encodeURIComponent(orderId)}/messages`, body)

/** The order's items in this browser's bag (or a new one): the bag, with `notices` for what could not be added. */
export async function reorder(orderId) {
  let cartId = null
  try {
    cartId = localStorage.getItem(CART_KEY)
  } catch {
    /* no stored bag: a new one is made */
  }
  const cart = assertCart(await post(`/orders/${encodeURIComponent(orderId)}/reorder`, { cart_id: cartId || undefined }), 'POST /orders/:id/reorder')
  try {
    localStorage.setItem(CART_KEY, cart.id)
    localStorage.removeItem(FRESH_CART_KEY)
  } catch {
    /* storage unavailable: the bag lives for this tab only */
  }
  return cart
}

/** A reset link by email, when an account uses that address. The answer is the same either way. */
export const forgotPassword = (body) => post('/auth/password/forgot', body)
/** The new password from a reset link (`/reset-password?token=`): signs this browser in and every other one out. */
export const resetPassword = ({ token, password }) =>
  post('/auth/password/reset', { token, password }).then(storeSession).then(mergeGuestWishlist)
/** An invited customer's account, from the link in their invitation (`/create-account?token=`). */
export const signupWithToken = ({ token, password }) =>
  post('/auth/signup', { token, password }).then(storeSession).then(mergeGuestWishlist)
export const verifyEmail = (token) => post('/auth/verify', { token })
export const resendVerification = () => post('/me/verify/resend', {})

/** A new password: this browser stays signed in, every other one is signed out. */
export const changePassword = ({ current, password }) => post('/me/password', { current, password })
/** A confirmation link to the new address (`{pendingEmail}`); the sign-in email changes when it is opened. */
export const changeEmail = ({ email, password }) => post('/me/email', { email, password })
/** The link in that message (`/confirm-email?token=`): `{email}`, the account's sign-in email from now on. */
export const confirmEmailChange = (token) => post('/auth/email/confirm', { token })

/** Everything the store keeps about the signed-in customer, as a JSON file (a Blob). */
export async function exportData() {
  const res = await send('GET', '/me/export', { auth: customerToken() })
  if (!res.ok) {
    throw new ApiError(`GET /me/export failed with ${res.status}.`, { status: res.status, code: `http_${res.status}` })
  }
  return res.blob()
}

/** Closes the account (orders and invoices stay with the store) and signs this browser out. */
export async function deleteAccount({ password, stopEmails = false }) {
  await post('/me/delete', { password, stopEmails })
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* already gone */
  }
  return { ok: true }
}

/** The signed-in customer's company, their role, and colleagues when they are its administrator. */
export const getCompany = () => get('/me/company')
/** An account for a colleague (`role`: admin or buyer), who sets a password from Odoo's invitation email. */
export const inviteMember = ({ email, name, role }) => post('/me/company/members', { email, name, role })
export const updateMember = (memberId, { role }) =>
  request('PATCH', `/me/company/members/${encodeURIComponent(memberId)}`, { body: { role } })
export const removeMember = (memberId) => request('DELETE', `/me/company/members/${encodeURIComponent(memberId)}`)

/** The bag as a quote request (`features.quotes`): `{orderId, number}`. This browser starts a new bag. */
export async function requestQuote(cartId, { note } = {}) {
  const res = await post(`/carts/${encodeURIComponent(cartId)}/quote`, { note })
  try {
    localStorage.removeItem(CART_KEY)
  } catch {
    /* storage unavailable: the old id answers 404 and a new bag starts */
  }
  return res
}

/** A six-digit code by text message to the phone on an account (`features.phoneLogin`). The same answer either way. */
export const requestLoginCode = (body) => post('/auth/otp/request', body)
/** The page of a sign-in provider from Odoo's OAuth app (`features.socialLogin`): `{url, state}`. */
export const startOAuth = (provider) => post('/auth/oauth/start', { provider })
/** The token the provider handed back to `/login/oauth`, with the state it was started with. */
export const finishOAuth = ({ state, accessToken }) =>
  post('/auth/oauth', { state, accessToken }).then(storeSession).then(mergeGuestWishlist)
export const verifyLoginCode = ({ phone, code }) =>
  post('/auth/otp/verify', { phone, code }).then(storeSession).then(mergeGuestWishlist)

/** The bag from Odoo's abandoned-cart email (`/cart?recover=…&order=…`), as this browser's bag again. */
export async function recoverCart({ order, token }) {
  const cart = assertCart(await post('/carts/recover', { order, token }), 'POST /carts/recover')
  try {
    localStorage.setItem(CART_KEY, cart.id)
    localStorage.removeItem(FRESH_CART_KEY)
  } catch {
    /* storage unavailable: the bag lives for this tab only */
  }
  return cart
}

/* ── on-site payments (checkout.mode "payments"): what can pay, and starting a payment ── */

// Never cached: every answer here is about one shopper's money.

const checkoutFields = (body = {}) => ({
  email: body.email,
  shipping_address: body.shippingAddress,
  shipping_method: body.shippingMethod,
  currency: body.currency,
  // Optional: a billing address other than the delivery one, and a business's company name and tax ID.
  billing_address: body.billingAddress,
  company_name: body.companyName,
  vat: body.vat,
  // Optional, as far as the store's checkout settings allow: delivery instructions, gift message and wrapping, and
  // the terms checkbox when the store requires it.
  note: body.note,
  gift_message: body.giftMessage,
  gift_wrap: body.giftWrap,
  accept_terms: body.acceptTerms,
  // One of `getDeliverySlots`, when the delivery method offers slots.
  delivery_slot: body.deliverySlot,
  // Odoo's Extra Info step: `{ name: value }` for the fields in `checkout.extraInfo`.
  extra_info: body.extraInfo,
  // Ticked "email me news and offers": a newsletter subscription waiting for its confirmation email.
  newsletter: body.newsletter || undefined,
  newsletter_consent: body.newsletter ? body.newsletterConsent : undefined,
})

export async function getPaymentOptions(cartIdArg, body = {}) {
  const id = cartIdArg || (await ensureCart()).id
  const options = await post(`/carts/${encodeURIComponent(id)}/payment-options`, checkoutFields(body))
  if (!options || !Array.isArray(options.methods)) {
    throw new ContractError('POST /carts/:id/payment-options', 'an object with a "methods" array', options)
  }
  return options
}

export async function createPayment(cartIdArg, body = {}) {
  const id = cartIdArg || (await ensureCart()).id
  const payment = await post(`/carts/${encodeURIComponent(id)}/payments`, {
    ...checkoutFields(body),
    provider_id: body.providerId,
    method_id: body.methodId,
    token_id: body.tokenId,
    // A company allowed to pay on invoice: the order is confirmed without a payment (method `code: invoice`).
    pay_on_invoice: body.payOnInvoice || undefined,
    save_method: Boolean(body.saveMethod),
    success_url: body.successUrl,
    cancel_url: body.cancelUrl,
    expected_total: body.expectedTotal,
  })
  return forgetSpentCart(assertPayment(payment, 'POST /carts/:id/payments'))
}
