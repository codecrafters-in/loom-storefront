import demo from './demo.js'
import razorpay from './razorpay.js'

/**
 * One driver per gateway that takes payment on this page, keyed by the
 * backend's provider code.
 *
 * Gateways that need nothing from the page (cash on delivery, bank transfer,
 * saved cards) and gateways that use their own hosted page need no driver. A
 * gateway that takes payment on the page but has no driver here is not offered
 * at all, rather than failing at the pay button.
 *
 * A driver is `{ provider, needsInput, validate?(input), run({ payment, api,
 * input, deps }) }`. `run` finishes the browser's part and returns the payment
 * the backend answered with; polling takes it from there. See docs/CHECKOUT.md.
 */
export const drivers = { demo, razorpay }

export const driverFor = (provider) => (Object.hasOwn(drivers, provider || '') ? drivers[provider] : null)
