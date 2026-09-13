import { ApiError } from '../api/contracts.js'
import { driverFor } from './drivers/index.js'

/**
 * On-site payments — `checkout.mode: "payments"`.
 *
 * The backend owns the gateways. It lists what can pay for this cart, creates
 * the payment, and is the only party that can say it was paid; the storefront
 * shows the methods, runs the gateway's own form where there is one, and asks.
 * Nothing here records a payment.
 *
 * Kept free of React so every decision the checkout page makes is testable.
 */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Money has moved, or will without the shopper doing anything else (cash on delivery, bank transfer). */
export function isSettled(payment) {
  if (!payment) return false
  if (payment.status === 'paid' || payment.status === 'authorized') return true
  return payment.status === 'pending' && Boolean(payment.order)
}

export const isFailed = (payment) => payment?.status === 'cancelled' || payment?.status === 'failed'

/** Final from the page's point of view: failed, or settled with an order to show. */
export const isComplete = (payment) => isFailed(payment) || (isSettled(payment) && Boolean(payment.order))

export function failureMessage(payment) {
  if (payment?.message) return payment.message
  return payment?.status === 'cancelled'
    ? 'The payment was cancelled. Your bag is unchanged.'
    : 'The payment did not go through. Please try again or choose another way to pay.'
}

/**
 * The methods the page can take, saved ones first.
 *
 * A method that takes payment on this page but has no driver is left out: an
 * option that can only fail is worse than a shorter list.
 */
export function visibleMethods(options, hasDriver = (provider) => Boolean(driverFor(provider))) {
  const saved = (options?.savedMethods || []).map((token) => ({
    ...token,
    key: `saved:${token.id}`,
    saved: true,
    flow: 'token',
  }))
  const methods = (options?.methods || [])
    .filter((method) => method.flow !== 'direct' || hasDriver(method.provider))
    .map((method) => ({ ...method, key: `method:${method.id}` }))
  return [...saved, ...methods]
}

/** What the page does with a payment the backend just answered with. */
export function nextStep(payment) {
  if (isFailed(payment)) return 'failed'
  if (isSettled(payment) && payment.order) return 'done'
  if (isSettled(payment)) return 'poll' // paid, and the order is still being confirmed
  if (payment?.flow === 'redirect') return payment.redirect?.url ? 'redirect' : 'broken'
  if (payment?.flow === 'direct') return 'driver'
  return 'poll'
}

/**
 * Ask the backend until the payment is final.
 *
 * Backs off from `first` to `max` so a slow gateway is not hammered, and gives
 * up after `timeoutMs` with the last answer — a webhook can take minutes, and
 * the shopper deserves to be told that rather than watch a spinner.
 */
export async function pollPayment(
  id,
  { getPayment, sleep = wait, now = Date.now, timeoutMs = 120_000, first = 1000, max = 5000, factor = 1.5, signal, onUpdate } = {},
) {
  const started = now()
  let delay = first
  let last = null
  for (;;) {
    if (signal?.aborted) return { payment: last, timedOut: false, aborted: true }
    try {
      last = await getPayment(id)
      onUpdate?.(last)
      if (isComplete(last)) return { payment: last, timedOut: false }
    } catch (err) {
      // 409 `retry` is the backend asking for exactly this, and a 5xx or a
      // dropped connection is a blip. Any other 4xx will not change by asking.
      const client = err?.status >= 400 && err?.status < 500
      if (client && err.code !== 'retry') throw err
    }
    if (now() - started + delay > timeoutMs) return { payment: last, timedOut: true }
    await sleep(delay)
    delay = Math.min(max, Math.round(delay * factor))
  }
}

/**
 * Take a payment the backend just created to an answer the page can act on.
 *
 * → `{ kind: 'order', payment }` settled, with `payment.order`
 * → `{ kind: 'redirect', url }` a gateway that only works on its own page
 * → `{ kind: 'failed', payment, message }`
 * → `{ kind: 'timeout', payment }` still not final; the backend will email
 *
 * Throws what a driver throws, e.g. `payment_cancelled` when a modal is closed.
 */
export async function runPayment(payment, { api, input, deps, poll = {} } = {}) {
  let current = payment
  const step = nextStep(current)

  if (step === 'redirect') return { kind: 'redirect', url: current.redirect.url }
  if (step === 'broken') {
    throw new ApiError('The payment service asked to redirect but gave no address.', {
      code: 'payment_no_redirect',
      detail: current,
    })
  }
  if (step === 'driver') {
    const driver = driverFor(current.provider)
    if (!driver) {
      throw new ApiError(`This store cannot take "${current.provider}" payments on this page yet.`, {
        code: 'payment_unsupported',
      })
    }
    current = (await driver.run({ payment: current, api, input, deps })) || current
  }

  if (!isComplete(current)) {
    const { payment: polled, timedOut } = await pollPayment(current.id, { getPayment: api.getPayment, ...poll })
    if (polled) current = polled
    if (timedOut) return { kind: 'timeout', payment: current }
  }
  if (isFailed(current)) return { kind: 'failed', payment: current, message: failureMessage(current) }
  return { kind: 'order', payment: current }
}

/** The request body for `createPayment`, from what the checkout form holds. */
export function paymentBody({ email, shippingAddress, shippingMethod, currency, method, expectedTotal, successUrl, cancelUrl, saveMethod }) {
  return {
    email,
    shippingAddress,
    shippingMethod,
    currency,
    ...(method?.saved ? { tokenId: method.id } : { providerId: method?.providerId, methodId: method?.methodId }),
    saveMethod: Boolean(saveMethod),
    expectedTotal,
    successUrl,
    cancelUrl,
  }
}

/**
 * Where a gateway sends the shopper back to. Absolute, because the gateway
 * resolves a relative path against its own domain; `{ORDER_ID}` stays literal
 * for the backend to fill in.
 */
export function returnUrls(checkout = {}, origin = '') {
  const base = String(origin).replace(/\/+$/, '')
  const absolute = (path) => (/^https?:\/\//.test(path) ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`)
  const success = String(checkout.successUrl || '/order/:orderId').replace(/:orderId\b/g, '{ORDER_ID}')
  return { successUrl: absolute(success), cancelUrl: absolute(checkout.cancelUrl || '/cart') }
}
