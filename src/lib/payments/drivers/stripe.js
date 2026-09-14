import { ApiError } from '../../api/contracts.js'
import { loadScript } from '../load-script.js'

export const STRIPE_SDK = 'https://js.stripe.com/v3/'

/** The store's own colours inside Stripe's form, read from the theme's CSS variables when there is a page. */
export function stripeAppearance(doc = typeof document === 'undefined' ? null : document) {
  const appearance = { theme: 'stripe' }
  if (!doc?.documentElement || typeof getComputedStyle !== 'function') return appearance
  const css = getComputedStyle(doc.documentElement)
  const rgb = (name) => {
    const value = css.getPropertyValue(name).trim()
    return /^\d+\s+\d+\s+\d+$/.test(value) ? `rgb(${value.split(/\s+/).join(', ')})` : null
  }
  const variables = { colorPrimary: rgb('--accent'), colorText: rgb('--ink'), borderRadius: css.getPropertyValue('--radius').trim() || null }
  const set = Object.fromEntries(Object.entries(variables).filter(([, value]) => value))
  return Object.keys(set).length ? { ...appearance, variables: set } : appearance
}

/**
 * Options for Stripe's Payment Element, from what the backend listed for the method.
 *
 * The card form is shown before the payment exists ("deferred" mode), for the order's amount and currency;
 * the PaymentIntent the backend creates on Pay has the same ones.
 */
export function elementsOptions(config, { saveMethod = false, appearance } = {}) {
  const options = {
    mode: 'payment',
    amount: config.amount,
    currency: config.currency,
    captureMethod: config.captureMethod || 'automatic',
    paymentMethodTypes: [config.paymentMethodType || 'card'],
  }
  if (appearance) options.appearance = appearance
  if (config.tokenizationRequired || saveMethod) options.setupFutureUsage = 'off_session'
  return options
}

/**
 * Stripe's Payment Element, on the checkout page.
 *
 * The card number is typed into Stripe's own iframe, never into this page. `mount` shows the form when the
 * method is picked; Pay checks it (`submit`), the backend creates the PaymentIntent, and `run` confirms it
 * with Stripe, which handles 3-D Secure in place. Stripe's answer in the browser proves nothing: the backend
 * reads the PaymentIntent from Stripe before the payment counts.
 */
export default {
  provider: 'stripe',
  needsInput: true,

  async mount(container, method, { saveMethod = false, deps = {} } = {}) {
    const config = method?.config || {}
    if (!config.publishableKey) {
      throw new ApiError('Stripe is not set up for this store yet.', { code: 'payment_misconfigured', detail: config })
    }
    await (deps.loadScript || loadScript)(STRIPE_SDK)
    const StripeJS = deps.Stripe || (typeof window !== 'undefined' ? window.Stripe : undefined)
    if (!StripeJS) {
      throw new ApiError('Stripe did not load. A content blocker or a lost connection will do this.', {
        code: 'provider_unavailable',
      })
    }
    const stripe = StripeJS(config.publishableKey, config.apiVersion ? { apiVersion: config.apiVersion } : undefined)
    const elements = stripe.elements(elementsOptions(config, { saveMethod, appearance: deps.appearance ?? stripeAppearance() }))
    const element = elements.create('payment', { defaultValues: { billingDetails: config.billingDetails || {} } })
    element.mount(container)
    return {
      stripe,
      elements,
      setSaveMethod(save) {
        if (!config.tokenizationRequired) elements.update({ setupFutureUsage: save ? 'off_session' : null })
      },
      /** Stripe's own check of the card details; a sentence for the shopper, or null. */
      async submit() {
        const { error } = (await elements.submit()) || {}
        return error ? error.message || 'Please check your card details.' : null
      },
      destroy() {
        element.destroy?.()
      },
    }
  },

  async run({ payment, api, input }) {
    const client = payment?.client || {}
    if (!input?.stripe || !input?.elements || !client.client_secret) {
      throw new ApiError('Stripe is not set up for this store yet.', { code: 'payment_misconfigured', detail: client })
    }
    const { error, paymentIntent } = (await input.stripe.confirmPayment({
      elements: input.elements,
      clientSecret: client.client_secret,
      confirmParams: { return_url: client.return_url },
      // Cards stay on this page, 3-D Secure included; a bank that needs its own page comes back to the
      // storefront's return page.
      redirect: 'if_required',
    })) || {}
    if (error) {
      throw new ApiError(error.message || 'The payment did not go through.', {
        code: error.type === 'validation_error' ? 'invalid_card' : 'payment_failed',
        detail: { type: error.type, code: error.code },
      })
    }
    return api.paymentAction(payment.id, 'complete', { payment_intent: paymentIntent?.id })
  },
}
