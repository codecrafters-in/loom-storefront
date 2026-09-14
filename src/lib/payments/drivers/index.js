import demo from './demo.js'
import razorpay from './razorpay.js'
import stripe from './stripe.js'

/**
 * One driver per gateway that takes payment on this page, keyed by the
 * backend's provider code.
 *
 * Gateways that need nothing from the page (cash on delivery, bank transfer,
 * saved cards) and gateways that use their own hosted page need no driver. A
 * gateway that takes payment on the page but has no driver here is not offered
 * at all, rather than failing at the pay button.
 *
 * A driver is `{ provider, needsInput, validate?(input), mount?(container,
 * method, { saveMethod }), run({ payment, api, input, deps }) }`. `mount` shows
 * the gateway's own form when the method is picked (Stripe) and returns what
 * `run` receives as `input`. `run` finishes the browser's part and returns the payment
 * the backend answered with; polling takes it from there. See docs/CHECKOUT.md.
 */
export const drivers = { demo, razorpay, stripe }

export const driverFor = (provider) => (Object.hasOwn(drivers, provider || '') ? drivers[provider] : null)
