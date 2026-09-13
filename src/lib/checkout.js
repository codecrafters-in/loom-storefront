import api from './api/index.js'
import { ApiError } from './api/contracts.js'
import { loadScript } from './payments/load-script.js'

/**
 * Checkout, in five modes.
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
 *   razorpay Opens Razorpay's own modal over the page. The order is still
 *            created server-side and the browser only ever holds `publicKey`
 *            (their `key_id`, which is public by design). The card fields
 *            belong to Razorpay's iframe, not to this app.
 *
 *   api      POSTs and expects an Order back. For merchants who settle payment
 *            elsewhere — invoicing, cash on delivery, wholesale terms.
 *
 *   payments The backend's own gateways, on this page. The checkout page runs
 *            it step by step (options, pay, poll) through `lib/payments`, so it
 *            never reaches `startCheckout`. See docs/CHECKOUT.md.
 *
 * Anything that takes a card in the browser is deliberately not offered here.
 *
 * No mode reads a secret. `key_secret`, webhook secrets and SMTP passwords go
 * to the server through `POST /admin/credentials` and never come back — a
 * secret this file could read is a secret every visitor could read.
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

  if (mode === 'payments') {
    throw new ApiError('checkout.mode "payments" runs on the checkout page through lib/payments, not startCheckout.', {
      code: 'checkout_misconfigured',
    })
  }

  if (mode === 'razorpay') return startRazorpay({ checkout, cart, email, shippingAddress, shippingMethod })

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

/**
 * Razorpay, hosted in their modal.
 *
 * Three steps, and the middle one is the point: the server creates the Razorpay
 * order with its secret and hands back an id, the browser opens the modal with
 * only the public key, and the server verifies the signature afterwards. A
 * browser that could create the order could also create one for a penny.
 *
 * The verify step is not optional and not a formality. Razorpay's handler runs
 * in the page, so anything it reports can be forged by anyone with a console
 * open; the signature check on the server is the only thing that makes a
 * payment real. That is why this returns the *server's* order, never the
 * handler's payload.
 */
async function startRazorpay({ checkout, cart, email, shippingAddress, shippingMethod }) {
  if (!checkout.publicKey) {
    throw new ApiError(
      'checkout.mode is "razorpay" but checkout.publicKey is empty. Put your Razorpay key_id in Settings → Payments.',
      { code: 'checkout_misconfigured' },
    )
  }

  const createUrl = template(checkout.createUrl, { cartId: cart?.id })
  const session = await postAbsolute(createUrl, {
    cart_id: cart?.id,
    email,
    shipping_address: shippingAddress,
    shipping_method: shippingMethod,
    currency: cart?.currency,
    provider: 'razorpay',
  })

  if (!session?.razorpay_order_id) {
    throw new ApiError(
      `${createUrl} returned no "razorpay_order_id". A razorpay checkout must create the order server-side and respond with its id.`,
      { code: 'checkout_no_order', detail: session },
    )
  }

  await loadScript('https://checkout.razorpay.com/v1/checkout.js')
  if (!window.Razorpay) {
    throw new ApiError('Razorpay Checkout did not load. A blocker or an offline network will do this.', {
      code: 'provider_unavailable',
    })
  }

  const result = await new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: checkout.publicKey,
      order_id: session.razorpay_order_id,
      amount: session.amount ?? cart?.total?.amount,
      currency: session.currency || cart?.currency,
      name: session.name || undefined,
      description: session.description || undefined,
      prefill: { email, contact: shippingAddress?.phone || '', name: shippingAddress?.name || '' },
      handler: resolve,
      // Dismissing the modal is a normal thing to do and must not look like a
      // failure — the bag is untouched and the shopper is still on the page.
      modal: { ondismiss: () => reject(new ApiError('Payment was cancelled.', { code: 'payment_cancelled' })) },
    })
    rzp.on('payment.failed', (e) =>
      reject(new ApiError(e?.error?.description || 'The payment did not go through.', {
        code: 'payment_failed',
        detail: e?.error,
      })),
    )
    rzp.open()
  })

  const verifyUrl = template(checkout.verifyUrl || '/payments/verify', { cartId: cart?.id })
  const order = await postAbsolute(verifyUrl, {
    razorpay_order_id: result.razorpay_order_id,
    razorpay_payment_id: result.razorpay_payment_id,
    razorpay_signature: result.razorpay_signature,
  })

  if (!order?.id) {
    throw new ApiError(
      `${verifyUrl} did not return an Order. The payment may have succeeded — check Razorpay before retrying.`,
      { code: 'verify_failed', detail: order },
    )
  }
  return { kind: 'order', order }
}
