import { ApiError } from '../api/contracts.js'
import { loadScript } from './load-script.js'
import { STRIPE_SDK, stripeAppearance } from './drivers/stripe.js'
import { isComplete, paymentBody, pollPayment } from './index.js'

/**
 * Apple Pay and Google Pay in the bag, through Stripe's Express Checkout Element.
 *
 * The wallet sheet opens straight from the button. While it is open the wallet shares only the city, region,
 * postcode and country; the backend prices delivery for that and the sheet's total follows it. On confirm the
 * full address and contact details go through the same payment route as checkout, so the backend applies the
 * same rules and charges the amount it computed, never the wallet's.
 */

/** A wallet's partial address, as the backend's shipping options take it. */
export const partialAddress = (address = {}) => ({
  city: address.city || '',
  region: address.state || '',
  postalCode: address.postal_code || '',
  country: String(address.country || '').toUpperCase(),
})

/** The backend's delivery options, as the wallet sheet lists them. */
export const shippingRates = (options = []) =>
  options.map((option) => ({ id: option.id, displayName: option.label, amount: option.amount }))

/** A storefront Address from what the wallet shared on confirm. */
export function walletAddress(event = {}) {
  const billing = event.billingDetails || {}
  const shipping = event.shippingAddress?.address ? event.shippingAddress : { name: billing.name, address: billing.address }
  const a = shipping.address || {}
  return {
    name: shipping.name || billing.name || '',
    line1: a.line1 || '',
    line2: a.line2 || '',
    city: a.city || '',
    region: a.state || '',
    postalCode: a.postal_code || '',
    country: String(a.country || '').toUpperCase(),
    phone: billing.phone || '',
  }
}

/** The payment request for a confirmed wallet sheet. */
export function expressPaymentBody({ event, method, cart, total, urls = {} }) {
  return paymentBody({
    email: event?.billingDetails?.email || '',
    shippingAddress: walletAddress(event),
    shippingMethod: event?.shippingRate?.id,
    currency: cart?.currency,
    method: { providerId: method.providerId, methodId: method.methodId },
    expectedTotal: total,
    ...urls,
  })
}

/**
 * Mount the wallet buttons. Resolves to `{ destroy }`, or null when the store has no wallet for this bag.
 *
 * `onAvailable(bool)` says whether the browser has a wallet to show; `onDone(payment)` gets a final payment (with
 * `order` once it is placed); `onError(err)` gets a failure the sheet could not show itself.
 */
export async function mountExpressCheckout({ container, express, cart, api, urls, deps = {}, onAvailable, onDone, onError }) {
  const method = express?.methods?.[0]
  const config = method?.config
  if (!config?.publishableKey || !cart?.id) return null
  await (deps.loadScript || loadScript)(STRIPE_SDK)
  const StripeJS = deps.Stripe || (typeof window !== 'undefined' ? window.Stripe : undefined)
  if (!StripeJS) return null

  let total = express.amount?.amount ?? 0
  let address = null
  let rates = []
  if (express.shippingRequired) {
    const first = await api.getShippingOptions(cart.id, {})
    rates = shippingRates(first.options)
    total = first.total?.amount ?? total
    if (!rates.length) return null
  }

  const stripe = StripeJS(config.publishableKey, config.apiVersion ? { apiVersion: config.apiVersion } : undefined)
  const elements = stripe.elements({
    mode: 'payment',
    amount: total,
    currency: config.currency,
    captureMethod: config.captureMethod || 'automatic',
    paymentMethodTypes: [config.paymentMethodType || 'card'],
    appearance: deps.appearance ?? stripeAppearance(),
  })
  const element = elements.create('expressCheckout', {
    emailRequired: true,
    phoneNumberRequired: true,
    shippingAddressRequired: Boolean(express.shippingRequired),
    ...(express.shippingRequired ? { shippingRates: rates } : {}),
    business: config.merchantName ? { name: config.merchantName } : undefined,
    buttonType: { applePay: 'buy', googlePay: 'buy' },
  })

  element.on('ready', ({ availablePaymentMethods } = {}) => {
    onAvailable?.(Boolean(availablePaymentMethods && Object.values(availablePaymentMethods).some(Boolean)))
  })
  // The sheet must open within a second of the click; everything it needs is set on create.
  element.on('click', (event) => event.resolve())

  element.on('shippingaddresschange', async (event) => {
    try {
      const result = await api.getShippingOptions(cart.id, { address: partialAddress(event.address) })
      if (!result.options?.length) {
        event.reject()
        return
      }
      address = event.address
      total = result.total.amount
      elements.update({ amount: total })
      event.resolve({ shippingRates: shippingRates(result.options) })
    } catch {
      event.reject()
    }
  })

  element.on('shippingratechange', async (event) => {
    try {
      const result = await api.getShippingOptions(cart.id, {
        address: address ? partialAddress(address) : undefined,
        method: event.shippingRate?.id,
      })
      total = result.total.amount
      elements.update({ amount: total })
      event.resolve()
    } catch {
      event.reject()
    }
  })

  element.on('confirm', async (event) => {
    try {
      const { error: submitError } = (await elements.submit()) || {}
      if (submitError) throw new ApiError(submitError.message || 'Please check your details.', { code: 'invalid_card' })
      const created = await api.createPayment(cart.id, expressPaymentBody({ event, method, cart, total, urls }))
      const secret = created?.client?.client_secret
      if (!secret) throw new ApiError(created?.message || 'The payment did not go through.', { code: 'payment_failed' })
      const { error, paymentIntent } = (await stripe.confirmPayment({
        elements,
        clientSecret: secret,
        confirmParams: { return_url: created.client.return_url },
        redirect: 'if_required',
      })) || {}
      if (error) throw new ApiError(error.message || 'The payment did not go through.', { code: 'payment_failed' })
      let payment = await api.paymentAction(created.id, 'complete', { payment_intent: paymentIntent?.id })
      if (!isComplete(payment)) {
        const polled = await pollPayment(payment.id, { getPayment: api.getPayment, ...(deps.poll || {}) })
        payment = polled.payment || payment
      }
      await onDone?.(payment)
    } catch (err) {
      event.paymentFailed?.({ reason: 'fail', message: err?.message })
      onError?.(err)
    }
  })

  element.mount(container)
  return { element, elements, destroy: () => element.destroy?.() }
}
