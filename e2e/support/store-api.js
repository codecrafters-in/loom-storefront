/**
 * The store API, called from the test runner rather than the browser.
 *
 * Used for two things only: setting up a precondition that is not what a
 * scenario is about (a customer who already has an order), and reading the
 * outcome the storefront claims (the order the confirmation page shows). The
 * behaviour under test always goes through the browser.
 */
import { settings } from './env.js'

export const US_ADDRESS = {
  name: 'Sam Rivera',
  line1: '117 Mercer Street',
  line2: 'Apt 4B',
  city: 'New York',
  region: 'NY',
  postalCode: '10012',
  country: 'US',
  phone: '+1 555 0134',
}

export class StoreApi {
  constructor(context, base) {
    this.context = context
    this.base = base
  }

  static async create(playwright, { base = settings.api, origin = settings.storefrontUrl } = {}) {
    const context = await playwright.request.newContext({
      extraHTTPHeaders: { Origin: origin, Accept: 'application/json' },
    })
    return new StoreApi(context, base)
  }

  async dispose() {
    await this.context.dispose()
  }

  /** `{ status, json, text, headers }` — never throws on an HTTP error, for tests that expect one. */
  async call(method, path, { body, token, headers = {} } = {}) {
    const res = await this.context.fetch(this.base + path, {
      method,
      data: body === undefined ? undefined : body,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      failOnStatusCode: false,
    })
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      /* not JSON */
    }
    return { status: res.status(), json, text, headers: res.headers() }
  }

  async ok(method, path, options) {
    const res = await this.call(method, path, options)
    if (res.status >= 400) throw new Error(`${method} ${this.base}${path} -> ${res.status}: ${res.text.slice(0, 600)}`)
    return res.json
  }

  product(slug) {
    return this.ok('GET', `/products/${encodeURIComponent(slug)}`)
  }

  /** The variant of `slug` whose options match, e.g. `{ Color: 'Red', Size: 'M' }`. */
  async variant(slug, options = {}) {
    const product = await this.product(slug)
    const found = product.variants.find((v) => Object.entries(options).every(([k, value]) => v.options[k] === value))
    if (!found) throw new Error(`${slug} has no variant ${JSON.stringify(options)}`)
    return found
  }

  async login(email, password) {
    return (await this.ok('POST', '/auth/login', { body: { email, password } })).token
  }

  /** A new customer account, signed in: `{ email, password, token }`. A fresh one per test keeps the per-account sign-in limit out of the way. */
  async register({ email, password = 'e2e-customer-pass', firstName = 'Casey', lastName = 'Tester' }) {
    const { token } = await this.ok('POST', '/auth/register', { body: { email, password, firstName, lastName } })
    return { email, password, token }
  }

  /** Empty the signed-in customer's open bag, so a scenario starts from a known state. */
  async emptyCustomerBag(token) {
    const cart = await this.ok('POST', '/carts', { body: {}, token })
    if (cart.lines.length) await this.ok('DELETE', `/carts/${cart.id}/lines`, { token })
    return cart.id
  }

  /**
   * Buy something without the browser: a precondition, never the behaviour under test.
   * `provider` is `demo` (paid by the test card) or a `custom` method name such as "Cash on Delivery".
   */
  async placeOrder({ token, email, lines, provider = 'demo', address = US_ADDRESS }) {
    const cart = await this.ok('POST', '/carts', { body: { fresh: true }, token })
    for (const { variantId, quantity = 1 } of lines) {
      await this.ok('POST', `/carts/${cart.id}/lines`, { body: { variant_id: variantId, quantity }, token })
    }
    const checkout = { email, shipping_address: address, shipping_method: settings.carrierCode }
    const options = await this.ok('POST', `/carts/${cart.id}/payment-options`, { body: checkout, token })
    const method = options.methods.find((m) => m.provider === provider || m.name === provider)
    if (!method) throw new Error(`No payment method "${provider}" in ${JSON.stringify(options.methods.map((m) => m.name))}`)
    let payment = await this.ok('POST', `/carts/${cart.id}/payments`, {
      body: { ...checkout, provider_id: method.providerId, method_id: method.methodId, expected_total: options.amount.amount },
      token,
    })
    if (method.provider === 'demo') {
      payment = await this.ok('POST', `/payments/${payment.id}/actions/simulate`, { body: { outcome: 'done', cardNumber: '4242' } })
    }
    if (!payment.order) payment = await this.ok('GET', `/payments/${payment.id}`)
    if (!payment.order) throw new Error(`Payment ${payment.reference} has no order: ${JSON.stringify(payment)}`)
    return { cartId: cart.id, payment, order: await this.ok('GET', `/orders/${payment.order.id}`, { token }) }
  }
}
