import { ApiError } from '../../api/contracts.js'
import { loadScript } from '../load-script.js'

export const RAZORPAY_SDK = 'https://checkout.razorpay.com/v1/checkout.js'

/**
 * Razorpay Checkout options, from what the backend created.
 *
 * The backend made the Razorpay order with its secret; the browser only ever
 * holds the public key and that order's id, so it cannot invent an amount.
 */
export function razorpayOptions(payment) {
  const client = payment?.client || {}
  const options = {
    key: client.razorpay_public_token || client.razorpay_key_id,
    order_id: client.razorpay_order_id,
    customer_id: client.razorpay_customer_id || undefined,
    amount: client.amount,
    currency: client.currency,
    description: payment?.reference,
    recurring: client.is_tokenize_request ? '1' : '0',
    prefill: client.prefill || undefined,
  }
  if (client.callback_url) options.callback_url = client.callback_url
  return options
}

/**
 * Razorpay's modal, over the checkout page.
 *
 * A failed attempt does not end anything: the modal shows the error and lets
 * the shopper try another card or UPI app, so a failure is only reported if the
 * modal is then closed. What the handler reports runs in this page and proves
 * nothing on its own — the backend checks Razorpay's signature before the
 * payment counts.
 */
export default {
  provider: 'razorpay',
  needsInput: false,

  async run({ payment, api, deps = {} }) {
    const options = razorpayOptions(payment)
    if (!options.key || !options.order_id) {
      throw new ApiError('Razorpay is not set up for this store yet.', {
        code: 'payment_misconfigured',
        detail: payment?.client,
      })
    }

    await (deps.loadScript || loadScript)(RAZORPAY_SDK)
    const Razorpay = deps.Razorpay || (typeof window !== 'undefined' ? window.Razorpay : undefined)
    if (!Razorpay) {
      throw new ApiError('Razorpay Checkout did not load. A content blocker or a lost connection will do this.', {
        code: 'provider_unavailable',
      })
    }

    const response = await new Promise((resolve, reject) => {
      let lastFailure = null
      try {
        const modal = new Razorpay({
          ...options,
          handler: resolve,
          modal: {
            ondismiss: () =>
              reject(
                lastFailure
                  ? new ApiError(lastFailure.description || 'The payment did not go through.', {
                    code: 'payment_failed',
                    detail: lastFailure,
                  })
                  : new ApiError('Payment was cancelled. Your bag is unchanged.', { code: 'payment_cancelled' }),
              ),
          },
        })
        modal.on('payment.failed', (event) => {
          lastFailure = event?.error || {}
        })
        modal.open()
      } catch (err) {
        reject(err)
      }
    })

    return api.paymentAction(payment.id, 'complete', {
      razorpay_payment_id: response?.razorpay_payment_id,
      razorpay_order_id: response?.razorpay_order_id,
      razorpay_signature: response?.razorpay_signature,
    })
  },
}
