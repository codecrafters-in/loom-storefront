import api from './api/index.js'
import { ApiError } from './api/contracts.js'

/**
 * Checkout, in three modes.
 *
 * Which one runs is configuration (`storefront.checkout.mode`), not code, so a
 * merchant can move from a demo to a live payment provider without a rebuild.
 *
 *   demo     Places a fake order through the bundled adapter. For previews.
 *
 *   redirect POSTs the cart and address to the merchant's endpoint and expects
 *            { url } back, then sends the browser there. This is the Stripe
 *            Checkout Session / Razorpay payment-link / Adyen hosted-page
 *            shape, and it is the right default for a real store: no card
 *            number, CVV or expiry ever enters this application, which keeps
 *            the entire frontend out of PCI DSS scope.
 *
 *   api      POSTs and expects an Order back. For merchants who settle payment
 *            elsewhere — invoicing, cash on delivery, wholesale terms.
 *
 * Anything that takes a card in the browser is deliberately not offered here.
 */

const template = (str, vars) =>
  String(str || '').replace(/:([a-zA-Z]+)/g, (m, key) => (vars[key] ?? m))

export async function startCheckout({ config, cart, email, shippingAddress, shippingMethod }) {
  const checkout = config?.checkout || {}
  const mode = checkout.mode || 'demo'

  if (mode === 'demo') {
    const order = await api.checkout({ email, shippingAddress, shippingMethod })
    return { kind: 'order', order }
  }

  const url = template(checkout.createUrl, { cartId: cart?.id })
  if (!url) {
    throw new ApiError(
      `checkout.mode is "${mode}" but checkout.createUrl is empty. Set it in your storefront config.`,
      { code: 'checkout_misconfigured' },
    )
  }

  const payload = {
    cart_id: cart?.id,
    email,
    shipping_address: shippingAddress,
    shipping_method: shippingMethod,
    currency: cart?.currency,
    // Absolute, because the payment provider redirects a browser back here from
    // its own domain and a relative path would resolve against theirs.
    success_url: absolute(template(checkout.successUrl, { orderId: '{ORDER_ID}' })),
    cancel_url: absolute(checkout.cancelUrl || '/cart'),
  }

  const res = await postAbsolute(url, payload)

  if (mode === 'redirect') {
    if (!res?.url) {
      throw new ApiError(
        `${url} returned no "url". A redirect checkout must respond { "url": "https://…" }.`,
        { code: 'checkout_no_redirect', detail: res },
      )
    }
    return { kind: 'redirect', url: res.url }
  }

  if (!res?.id) {
    throw new ApiError(`${url} did not return an Order.`, { code: 'checkout_no_order', detail: res })
  }
  return { kind: 'order', order: res }
}

function absolute(path) {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return new URL(path, window.location.origin).toString()
}

/** `createUrl` may be a full URL (a payment service) or a path on the store API. */
async function postAbsolute(url, body) {
  const { config: env } = await import('./config.js')
  const target = /^https?:\/\//.test(url) ? url : `${env.api.baseUrl}${url}`

  let session = ''
  try {
    session = JSON.parse(localStorage.getItem('loom.session') || 'null')?.token || ''
  } catch {
    /* no session — a guest checkout is normal */
  }

  const res = await fetch(target, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(env.api.token ? { authorization: `Bearer ${env.api.token}` } : session ? { authorization: `Bearer ${session}` } : {}),
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let json = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      throw new ApiError(`${target} returned a non-JSON response.`, { status: res.status, code: 'bad_response', detail: text.slice(0, 200) })
    }
  }
  if (!res.ok) {
    throw new ApiError(json?.message || `Checkout failed with ${res.status}.`, {
      status: res.status,
      code: json?.code || `http_${res.status}`,
      detail: json,
    })
  }
  return json
}
