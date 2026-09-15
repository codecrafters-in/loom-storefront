import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadApp } from './helpers/browser.mjs'

/**
 * On-site payments — `checkout.mode: "payments"`.
 *
 * The decisions the checkout page makes (which methods to show, what to do
 * with an answer, how long to keep asking) are tested without React, and the
 * mock adapter is driven end to end the way the page drives a real backend.
 */

const { api } = await loadApp()
const payments = await import('../src/lib/payments/index.js')
const { driverFor } = await import('../src/lib/payments/drivers/index.js')
const razorpay = (await import('../src/lib/payments/drivers/razorpay.js')).default
const stripeModule = await import('../src/lib/payments/drivers/stripe.js')
const stripe = stripeModule.default
const express = await import('../src/lib/payments/express.js')

const order = { id: 'order_1', number: 'LM-1' }
const pay = (over = {}) => ({ id: 'pay_1', reference: 'R1', provider: 'demo', flow: 'direct', status: 'draft', client: {}, redirect: null, order: null, ...over })

/* ── which methods the page offers ─────────────────────────────────────── */

test('saved methods come first, and an on-page method with no driver is not offered', () => {
  const list = payments.visibleMethods({
    methods: [
      { id: '1-1', provider: 'adyen', flow: 'direct', name: 'Card' },
      { id: '2-2', provider: 'razorpay', flow: 'direct', name: 'UPI' },
      { id: '3-3', provider: 'paypal', flow: 'redirect', name: 'PayPal' },
      { id: '4-4', provider: 'custom', flow: 'offline', name: 'Cash on delivery' },
    ],
    savedMethods: [{ id: '7', provider: 'stripe', name: '•••• 4242' }],
  })
  assert.deepEqual(list.map((m) => m.key), ['saved:7', 'method:2-2', 'method:3-3', 'method:4-4'])
  assert.equal(list[0].flow, 'token', 'a saved method is charged by the backend, so it needs no driver')
})

/* ── what to do with an answer ─────────────────────────────────────────── */

test('each answer leads to one next step', () => {
  assert.equal(payments.nextStep(pay({ status: 'paid', order })), 'done')
  assert.equal(payments.nextStep(pay({ status: 'pending', flow: 'offline', order })), 'done')
  assert.equal(payments.nextStep(pay({ status: 'paid' })), 'poll', 'paid but the order is still being confirmed')
  assert.equal(payments.nextStep(pay({ status: 'failed' })), 'failed')
  assert.equal(payments.nextStep(pay({ status: 'cancelled' })), 'failed')
  assert.equal(payments.nextStep(pay({ flow: 'redirect', redirect: { url: 'https://pay.example/x' } })), 'redirect')
  assert.equal(payments.nextStep(pay({ flow: 'redirect' })), 'broken')
  assert.equal(payments.nextStep(pay({ flow: 'direct' })), 'driver')
  assert.equal(payments.nextStep(pay({ flow: 'token' })), 'poll')
})

test('return urls are absolute and keep the order placeholder for the backend', () => {
  const urls = payments.returnUrls({ successUrl: '/order/:orderId', cancelUrl: '/cart' }, 'https://shop.example/')
  assert.equal(urls.successUrl, 'https://shop.example/order/{ORDER_ID}')
  assert.equal(urls.cancelUrl, 'https://shop.example/cart')
})

/* ── asking until it is final ──────────────────────────────────────────── */

function clock() {
  let now = 0
  const slept = []
  return { now: () => now, sleep: async (ms) => { slept.push(ms); now += ms }, slept }
}

test('polling backs off and stops at the first final answer', async () => {
  const c = clock()
  const answers = [pay(), pay({ status: 'pending' }), pay({ status: 'paid', order })]
  const { payment, timedOut } = await payments.pollPayment('pay_1', { getPayment: async () => answers.shift(), ...c })
  assert.equal(payment.status, 'paid')
  assert.equal(timedOut, false)
  assert.deepEqual(c.slept, [1000, 1500])
})

test('polling gives up with the last answer instead of spinning forever', async () => {
  const c = clock()
  const { payment, timedOut } = await payments.pollPayment('pay_1', {
    getPayment: async () => pay({ status: 'pending' }),
    timeoutMs: 10_000,
    ...c,
  })
  assert.equal(timedOut, true)
  assert.equal(payment.status, 'pending')
  assert.ok(c.slept.every((ms) => ms <= 5000), 'the delay is capped')
  assert.ok(c.now() <= 10_000)
})

test('polling rides out a retry or a server blip, but not a missing payment', async () => {
  const blip = Object.assign(new Error('busy'), { status: 409, code: 'retry' })
  const down = Object.assign(new Error('down'), { status: 502, code: 'http_502' })
  const answers = [blip, down, pay({ status: 'paid', order })]
  const { payment } = await payments.pollPayment('pay_1', {
    getPayment: async () => {
      const next = answers.shift()
      if (next instanceof Error) throw next
      return next
    },
    ...clock(),
  })
  assert.equal(payment.status, 'paid')

  const missing = Object.assign(new Error('gone'), { status: 404, code: 'not_found' })
  await assert.rejects(payments.pollPayment('pay_1', { getPayment: async () => { throw missing }, ...clock() }), /gone/)
})

/* ── running a payment ─────────────────────────────────────────────────── */

test('a hosted-page gateway is a redirect, with nothing polled', async () => {
  let polled = false
  const result = await payments.runPayment(pay({ flow: 'redirect', provider: 'paypal', redirect: { url: 'https://odoo/loom/pay/x' } }), {
    api: { getPayment: async () => { polled = true } },
  })
  assert.deepEqual(result, { kind: 'redirect', url: 'https://odoo/loom/pay/x' })
  assert.equal(polled, false)
})

test('the demo card sends only the last four digits, then waits for the backend', async () => {
  const calls = []
  const api_ = {
    paymentAction: async (id, action, body) => {
      calls.push([id, action, body])
      return pay({ status: 'pending' })
    },
    getPayment: async () => pay({ status: 'paid', order }),
  }
  const result = await payments.runPayment(pay(), {
    api: api_,
    input: { cardNumber: '4242 4242 4242 4242', outcome: 'done' },
    poll: clock(),
  })
  assert.equal(result.kind, 'order')
  assert.deepEqual(calls, [['pay_1', 'simulate', { outcome: 'done', cardNumber: '4242' }]])
})

test('a declined payment comes back as a failure with the reason', async () => {
  const result = await payments.runPayment(pay(), {
    api: { paymentAction: async () => pay({ status: 'failed', message: 'Declined.' }), getPayment: async () => null },
    input: { cardNumber: '4000000000000002', outcome: 'error' },
  })
  assert.equal(result.kind, 'failed')
  assert.equal(result.message, 'Declined.')
})

test('an unknown on-page gateway is refused before anything is sent', async () => {
  await assert.rejects(payments.runPayment(pay({ provider: 'adyen' }), { api: {} }), (err) => err.code === 'payment_unsupported')
  assert.equal(driverFor('adyen'), null)
  assert.equal(driverFor('constructor'), null, 'the registry is not fooled by object prototype names')
})

/* ── razorpay ──────────────────────────────────────────────────────────── */

function fakeRazorpay() {
  const seen = {}
  class Razorpay {
    constructor(options) {
      seen.options = options
      seen.instance = this
      this.handlers = {}
    }
    on(event, fn) {
      this.handlers[event] = fn
    }
    open() {
      seen.opened = true
    }
  }
  return { Razorpay, seen }
}

const razorpayPayment = pay({
  provider: 'razorpay',
  client: { razorpay_key_id: 'rzp_test_1', razorpay_order_id: 'order_rzp_1', amount: 12800, currency: 'INR', prefill: { email: 'a@b.c' } },
})
const deps = (Razorpay) => ({ Razorpay, loadScript: async () => {} })

test('razorpay opens with the backend order, and the signature goes back to be checked', async () => {
  const { Razorpay, seen } = fakeRazorpay()
  const sent = []
  const running = razorpay.run({
    payment: razorpayPayment,
    api: { paymentAction: async (...args) => { sent.push(args); return pay({ status: 'paid', order }) } },
    deps: deps(Razorpay),
  })
  await new Promise((r) => setImmediate(r))
  assert.equal(seen.opened, true)
  assert.equal(seen.options.key, 'rzp_test_1')
  assert.equal(seen.options.order_id, 'order_rzp_1')
  assert.equal(seen.options.description, 'R1')

  seen.options.handler({ razorpay_payment_id: 'pay_rzp', razorpay_order_id: 'order_rzp_1', razorpay_signature: 'sig' })
  const result = await running
  assert.equal(result.status, 'paid')
  assert.deepEqual(sent, [['pay_1', 'complete', { razorpay_payment_id: 'pay_rzp', razorpay_order_id: 'order_rzp_1', razorpay_signature: 'sig' }]])
})

test('closing the razorpay modal is a cancel, or the last failure if an attempt failed', async () => {
  const first = fakeRazorpay()
  const cancelled = razorpay.run({ payment: razorpayPayment, api: {}, deps: deps(first.Razorpay) })
  await new Promise((r) => setImmediate(r))
  first.seen.options.modal.ondismiss()
  await assert.rejects(cancelled, (err) => err.code === 'payment_cancelled')

  const second = fakeRazorpay()
  const failed = razorpay.run({ payment: razorpayPayment, api: {}, deps: deps(second.Razorpay) })
  await new Promise((r) => setImmediate(r))
  second.seen.instance.handlers['payment.failed']({ error: { description: 'Bank declined' } })
  second.seen.options.modal.ondismiss()
  await assert.rejects(failed, (err) => err.code === 'payment_failed' && err.message === 'Bank declined')
})

test('razorpay without a key or order is a setup problem, said plainly', async () => {
  await assert.rejects(razorpay.run({ payment: pay({ provider: 'razorpay' }), api: {} }), (err) => err.code === 'payment_misconfigured')
})

/* ── the mock adapter, end to end ──────────────────────────────────────── */

const address = { name: 'A Buyer', line1: '1 Mill St', city: 'Erode', postalCode: '638001', country: 'IN', phone: '+91 90000 00000' }
const details = { email: 'buyer@example.com', shippingAddress: address, shippingMethod: 'standard' }

async function fill(slug = 'wool-overcoat') {
  const product = await api.getProduct(slug)
  const variant = product.variants.find((v) => v.inventory >= 1)
  await api.addToCart({ variantId: variant.id, quantity: 1 })
  return api.getCart()
}

test('the demo backend offers a test card and cash on delivery for the cart total', async () => {
  const cart = await fill()
  const options = await api.getPaymentOptions(cart.id, details)
  assert.deepEqual(options.methods.map((m) => [m.provider, m.flow]), [['demo', 'direct'], ['custom', 'offline']])
  assert.equal(options.amount.amount, cart.total.amount)
})

test('a test card payment places the order only once it is paid', async () => {
  const cart = await api.getCart()
  const options = await api.getPaymentOptions(cart.id, details)
  const card = options.methods.find((m) => m.provider === 'demo')

  const created = await api.createPayment(cart.id, { ...details, providerId: card.providerId, methodId: card.methodId, expectedTotal: options.amount.amount })
  assert.equal(created.status, 'draft')
  assert.equal(created.order, null)
  assert.equal(created.client.amount, cart.total.amount)
  assert.equal((await api.getCart()).lines.length, 1, 'nothing is bought before the money moves')

  const paid = await api.paymentAction(created.id, 'simulate', { outcome: 'done', cardNumber: '4242' })
  assert.equal(paid.status, 'paid')
  assert.ok(paid.order?.id)
  assert.equal((await api.getPayment(created.id)).status, 'paid')

  const placed = await api.getOrder(paid.order.id)
  assert.equal(placed.payment.status, 'captured')
  assert.equal(placed.payment.reference, created.reference)
  assert.equal((await api.getCart()).lines.length, 0)

  const replay = await api.paymentAction(created.id, 'simulate', { outcome: 'error', cardNumber: '4242' })
  assert.equal(replay.status, 'paid', 'a replayed step does not undo a paid payment')
})

test('cash on delivery places a pending order straight away', async () => {
  const cart = await fill('cotton-cap')
  const cod = (await api.getPaymentOptions(cart.id, details)).methods.find((m) => m.flow === 'offline')
  const created = await api.createPayment(cart.id, { ...details, providerId: cod.providerId, methodId: cod.methodId })
  assert.equal(created.status, 'pending')
  assert.ok(created.order?.id)
  assert.ok(created.message)
  assert.equal(payments.nextStep(created), 'done')
  assert.equal((await api.getOrder(created.order.id)).payment.status, 'pending')
})

test('a cancelled test payment leaves the bag as it was', async () => {
  const cart = await fill('cotton-cap')
  const card = (await api.getPaymentOptions(cart.id, details)).methods.find((m) => m.provider === 'demo')
  const created = await api.createPayment(cart.id, { ...details, providerId: card.providerId, methodId: card.methodId })
  const cancelled = await api.paymentAction(created.id, 'simulate', { outcome: 'cancel' })
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.order, null)
  assert.equal((await api.getCart()).lines.length, 1)
})

test('a changed bag, an unknown step and an unknown payment are refused clearly', async () => {
  const cart = await api.getCart()
  const card = (await api.getPaymentOptions(cart.id, details)).methods.find((m) => m.provider === 'demo')
  await assert.rejects(
    api.createPayment(cart.id, { ...details, providerId: card.providerId, methodId: card.methodId, expectedTotal: cart.total.amount + 1 }),
    (err) => err.status === 409 && err.code === 'cart_changed',
  )
  const created = await api.createPayment(cart.id, { ...details, providerId: card.providerId, methodId: card.methodId })
  await assert.rejects(api.paymentAction(created.id, 'complete', {}), (err) => err.status === 404 && err.code === 'unsupported_action')
  await assert.rejects(api.getPayment('pay_nope'), (err) => err.status === 404)
  await api.clearCart()
})

/* ── Phase 4: fees, paying later, a gateway page left open, saved methods ── */

test('a cash-on-delivery fee is added to what the shopper pays, and nothing else changes the total', () => {
  const total = { amount: 12000, currency: 'INR' }
  assert.deepEqual(payments.payableTotal(total, { fee: { amount: 5000, currency: 'INR' } }), { amount: 17000, currency: 'INR' })
  assert.equal(payments.payableTotal(total, { fee: null }), total)
  assert.equal(payments.payableTotal(total, undefined), total)
  assert.equal(payments.payableTotal(null, { fee: { amount: 1 } }), null)
})

test('the demo answers the new payment calls the way a real backend does when there is nothing to do', async () => {
  await assert.rejects(api.getOrderPaymentOptions('order_1'), (err) => err.status === 409 && err.code === 'nothing_to_pay')
  await assert.rejects(api.createOrderPayment('order_1', {}), (err) => err.status === 409 && err.code === 'nothing_to_pay')
  const bag = await api.cancelCartPayment()
  assert.ok(Array.isArray(bag.lines), 'cancelling a payment answers the bag')
  await assert.rejects(api.deletePaymentMethod('7'), (err) => err.status === 404)
})

/* ── stripe ────────────────────────────────────────────────────────────── */

function fakeStripe({ submitError = null, confirmResult } = {}) {
  const seen = { updates: [] }
  const element = { mount: (el) => { seen.mountedOn = el }, destroy: () => { seen.destroyed = true } }
  const elements = {
    create: (type, options) => { seen.created = { type, options }; return element },
    update: (options) => seen.updates.push(options),
    submit: async () => (submitError ? { error: { message: submitError } } : {}),
  }
  const Stripe = (key, options) => {
    seen.key = key
    seen.stripeOptions = options
    return {
      elements: (options_) => { seen.elementsOptions = options_; return elements },
      confirmPayment: async (args) => { seen.confirm = args; return confirmResult || { paymentIntent: { id: 'pi_1', status: 'succeeded' } } },
    }
  }
  return { Stripe, seen }
}

const stripeMethod = {
  key: 'method:9-1', provider: 'stripe', flow: 'direct',
  config: {
    publishableKey: 'pk_test_1', apiVersion: '2019-05-16', currency: 'usd', amount: 12000, captureMethod: 'automatic',
    paymentMethodType: 'card', billingDetails: { name: 'A Buyer' }, tokenizationRequired: false,
  },
}
const stripeDeps = (Stripe) => ({ Stripe, loadScript: async () => {}, appearance: { theme: 'stripe' } })

test('stripe shows its card form for the order amount, and saving a card is passed to Stripe', async () => {
  const { Stripe, seen } = fakeStripe()
  const box = {}
  const handle = await stripe.mount(box, stripeMethod, { deps: stripeDeps(Stripe) })
  assert.equal(seen.key, 'pk_test_1')
  assert.deepEqual(seen.stripeOptions, { apiVersion: '2019-05-16' })
  assert.deepEqual(seen.elementsOptions, {
    mode: 'payment', amount: 12000, currency: 'usd', captureMethod: 'automatic', paymentMethodTypes: ['card'], appearance: { theme: 'stripe' },
  })
  assert.equal(seen.created.type, 'payment')
  assert.deepEqual(seen.created.options.defaultValues.billingDetails, { name: 'A Buyer' })
  assert.equal(seen.mountedOn, box)

  handle.setSaveMethod(true)
  handle.setSaveMethod(false)
  assert.deepEqual(seen.updates, [{ setupFutureUsage: 'off_session' }, { setupFutureUsage: null }])
  assert.equal(await handle.submit(), null)
  handle.destroy()
  assert.equal(seen.destroyed, true)
})

test('stripe checks the card before anything is created, and a problem is said plainly', async () => {
  const { Stripe } = fakeStripe({ submitError: 'Your card number is incomplete.' })
  const handle = await stripe.mount({}, stripeMethod, { deps: stripeDeps(Stripe) })
  assert.deepEqual(await payments.driverInput(stripe, { mounted: handle }), { problem: 'Your card number is incomplete.' })
  assert.match((await payments.driverInput(stripe, {})).problem, /still loading/)
  const ok = await stripe.mount({}, stripeMethod, { deps: stripeDeps(fakeStripe().Stripe) })
  assert.equal((await payments.driverInput(stripe, { mounted: ok })).input, ok)
})

test('the demo card and razorpay need no mounted form', async () => {
  const demoDriver = driverFor('demo')
  assert.deepEqual(await payments.driverInput(demoDriver, { demoInput: { cardNumber: '4242 4242 4242 4242', outcome: 'done' } }), {
    input: { cardNumber: '4242 4242 4242 4242', outcome: 'done' },
  })
  assert.deepEqual(await payments.driverInput(razorpay, {}), { input: undefined })
  assert.deepEqual(await payments.driverInput(null, {}), { input: undefined })
})

test('stripe confirms with the payment\'s secret on this page, then the backend checks it with Stripe', async () => {
  const { Stripe, seen } = fakeStripe()
  const handle = await stripe.mount({}, stripeMethod, { deps: stripeDeps(Stripe) })
  const sent = []
  const result = await stripe.run({
    payment: pay({ provider: 'stripe', client: { client_secret: 'pi_1_secret_x', return_url: 'https://shop.test/checkout/return?payment=pay_1' } }),
    api: { paymentAction: async (...args) => { sent.push(args); return pay({ status: 'paid', order }) } },
    input: handle,
  })
  assert.equal(seen.confirm.clientSecret, 'pi_1_secret_x')
  assert.equal(seen.confirm.elements, handle.elements)
  assert.equal(seen.confirm.redirect, 'if_required')
  assert.deepEqual(seen.confirm.confirmParams, { return_url: 'https://shop.test/checkout/return?payment=pay_1' })
  assert.deepEqual(sent, [['pay_1', 'complete', { payment_intent: 'pi_1' }]])
  assert.equal(result.status, 'paid')
})

test('a card stripe declines is a failure with its reason, and nothing is posted', async () => {
  const { Stripe } = fakeStripe({ confirmResult: { error: { type: 'card_error', message: 'Your card was declined.' } } })
  const handle = await stripe.mount({}, stripeMethod, { deps: stripeDeps(Stripe) })
  let posted = false
  await assert.rejects(
    stripe.run({
      payment: pay({ provider: 'stripe', client: { client_secret: 'pi_1_secret_x', return_url: 'https://shop.test/r' } }),
      api: { paymentAction: async () => { posted = true } },
      input: handle,
    }),
    (err) => err.code === 'payment_failed' && err.message === 'Your card was declined.',
  )
  assert.equal(posted, false)
})

test('stripe without keys is a setup problem, said plainly', async () => {
  await assert.rejects(stripe.mount({}, { provider: 'stripe', config: {} }, { deps: stripeDeps(fakeStripe().Stripe) }), (err) => err.code === 'payment_misconfigured')
  await assert.rejects(stripe.run({ payment: pay({ provider: 'stripe', client: {} }), api: {}, input: null }), (err) => err.code === 'payment_misconfigured')
  assert.equal(stripeModule.elementsOptions({ ...stripeMethod.config, tokenizationRequired: true }).setupFutureUsage, 'off_session')
})

/* ── apple pay / google pay (stripe express checkout) ──────────────────── */

function fakeWallet({ confirmResult } = {}) {
  const seen = { updates: [], handlers: {} }
  const element = {
    on: (name, fn) => { seen.handlers[name] = fn },
    mount: (el) => { seen.mountedOn = el },
    destroy: () => { seen.destroyed = true },
  }
  const elements = {
    create: (type, options) => { seen.created = { type, options }; return element },
    update: (options) => seen.updates.push(options),
    submit: async () => ({}),
  }
  const Stripe = (key) => {
    seen.key = key
    return {
      elements: (options) => { seen.elementsOptions = options; return elements },
      confirmPayment: async (args) => { seen.confirm = args; return confirmResult || { paymentIntent: { id: 'pi_w' } } },
    }
  }
  return { Stripe, seen }
}

const walletExpress = {
  amount: { amount: 12400, currency: 'USD' },
  shippingRequired: true,
  methods: [{ providerId: '9', methodId: '1', provider: 'stripe', config: { ...stripeMethod.config, billingDetails: {}, merchantName: 'Loom' } }],
}
const walletCart = { id: 'cart_w', currency: 'USD' }

function walletApi(calls) {
  return {
    getShippingOptions: async (cartId, body) => {
      calls.push(['shipping', cartId, body])
      if (body.address?.country === 'ZZ') return { options: [], total: { amount: 0 } }
      const express_ = body.method === 'express'
      return {
        options: [{ id: 'standard', label: 'Standard', amount: 400 }, { id: 'express', label: 'Express', amount: 1500 }],
        selected: express_ ? 'express' : 'standard',
        total: { amount: express_ ? 13500 : 12400, currency: 'USD' },
      }
    },
    createPayment: async (cartId, body) => {
      calls.push(['create', cartId, body])
      return pay({ provider: 'stripe', client: { client_secret: 'pi_w_secret', return_url: 'https://shop.test/checkout/return?payment=pay_1' } })
    },
    paymentAction: async (...args) => { calls.push(['action', ...args]); return pay({ status: 'paid', order }) },
    getPayment: async () => pay({ status: 'paid', order }),
  }
}

test('wallet buttons open with the bag total and the store\'s delivery prices, and ask for contact details', async () => {
  const { Stripe, seen } = fakeWallet()
  const calls = []
  const handle = await express.mountExpressCheckout({
    container: 'box', express: walletExpress, cart: walletCart, api: walletApi(calls),
    deps: { Stripe, loadScript: async () => {}, appearance: { theme: 'stripe' } },
  })
  assert.ok(handle)
  assert.equal(seen.key, 'pk_test_1')
  assert.equal(seen.elementsOptions.amount, 12400)
  assert.equal(seen.elementsOptions.currency, 'usd')
  assert.equal(seen.created.type, 'expressCheckout')
  assert.equal(seen.created.options.emailRequired, true)
  assert.equal(seen.created.options.phoneNumberRequired, true)
  assert.equal(seen.created.options.shippingAddressRequired, true)
  assert.deepEqual(seen.created.options.shippingRates, [{ id: 'standard', displayName: 'Standard', amount: 400 }, { id: 'express', displayName: 'Express', amount: 1500 }])
  assert.equal(seen.mountedOn, 'box')

  let resolved = false
  seen.handlers.click({ resolve: () => { resolved = true } })
  assert.equal(resolved, true, 'the sheet opens at once')

  let available = null
  const second = fakeWallet()
  await express.mountExpressCheckout({
    container: 'b2', express: walletExpress, cart: walletCart, api: walletApi([]),
    deps: { Stripe: second.Stripe, loadScript: async () => {}, appearance: {} },
    onAvailable: (ok) => { available = ok },
  })
  second.seen.handlers.ready({ availablePaymentMethods: { applePay: false, googlePay: true } })
  assert.equal(available, true, 'a browser with a wallet shows the buttons')
  second.seen.handlers.ready({ availablePaymentMethods: null })
  assert.equal(available, false, 'a browser without one shows nothing')
})

test('the wallet\'s address and delivery choice reprice the sheet from the backend', async () => {
  const { Stripe, seen } = fakeWallet()
  const calls = []
  await express.mountExpressCheckout({
    container: 'box', express: walletExpress, cart: walletCart, api: walletApi(calls),
    deps: { Stripe, loadScript: async () => {}, appearance: {} },
  })
  let rates = null
  await seen.handlers.shippingaddresschange({
    address: { city: 'New York', state: 'NY', postal_code: '10012', country: 'us' },
    resolve: (payload) => { rates = payload.shippingRates },
    reject: () => assert.fail('a valid address is not rejected'),
  })
  assert.deepEqual(calls.at(-1), ['shipping', 'cart_w', { address: { city: 'New York', region: 'NY', postalCode: '10012', country: 'US' } }])
  assert.equal(rates.length, 2)

  let resolved = false
  await seen.handlers.shippingratechange({ shippingRate: { id: 'express' }, resolve: () => { resolved = true }, reject: () => assert.fail() })
  assert.equal(resolved, true)
  assert.deepEqual(calls.at(-1)[2], { address: { city: 'New York', region: 'NY', postalCode: '10012', country: 'US' }, method: 'express' })
  assert.deepEqual(seen.updates.at(-1), { amount: 13500 }, 'the sheet charges what the backend computed')

  let rejected = false
  await seen.handlers.shippingaddresschange({ address: { country: 'ZZ' }, resolve: () => assert.fail(), reject: () => { rejected = true } })
  assert.equal(rejected, true, 'an address with no delivery is refused in the sheet')
})

test('confirming the wallet creates the payment with its details, confirms with Stripe and places the order', async () => {
  const { Stripe, seen } = fakeWallet()
  const calls = []
  let done = null
  await express.mountExpressCheckout({
    container: 'box', express: walletExpress, cart: walletCart, api: walletApi(calls),
    urls: { successUrl: 'https://shop.test/order/{ORDER_ID}', cancelUrl: 'https://shop.test/cart' },
    deps: { Stripe, loadScript: async () => {}, appearance: {} },
    onDone: (payment) => { done = payment },
  })
  await seen.handlers.confirm({
    billingDetails: { name: 'Sam Rivera', email: 'sam@example.com', phone: '+1 555 0134', address: { country: 'US' } },
    shippingAddress: { name: 'Sam Rivera', address: { line1: '117 Mercer St', line2: '', city: 'New York', state: 'NY', postal_code: '10012', country: 'US' } },
    shippingRate: { id: 'standard' },
    paymentFailed: () => assert.fail('a good payment does not fail'),
  })
  const [, cartId, body] = calls.find((c) => c[0] === 'create')
  assert.equal(cartId, 'cart_w')
  assert.equal(body.email, 'sam@example.com')
  assert.equal(body.shippingMethod, 'standard')
  assert.equal(body.providerId, '9')
  assert.equal(body.expectedTotal, 12400)
  assert.deepEqual(body.shippingAddress, { name: 'Sam Rivera', line1: '117 Mercer St', line2: '', city: 'New York', region: 'NY', postalCode: '10012', country: 'US', phone: '+1 555 0134' })
  assert.equal(seen.confirm.clientSecret, 'pi_w_secret')
  assert.equal(seen.confirm.redirect, 'if_required')
  assert.deepEqual(calls.find((c) => c[0] === 'action'), ['action', 'pay_1', 'complete', { payment_intent: 'pi_w' }])
  assert.equal(done.order.id, 'order_1')
})

test('a wallet payment stripe declines is reported to the sheet', async () => {
  const { Stripe, seen } = fakeWallet({ confirmResult: { error: { message: 'Your card was declined.' } } })
  let failed = null
  let reported = null
  await express.mountExpressCheckout({
    container: 'box', express: walletExpress, cart: walletCart, api: walletApi([]),
    deps: { Stripe, loadScript: async () => {}, appearance: {} },
    onError: (err) => { reported = err },
  })
  await seen.handlers.confirm({ billingDetails: { email: 'a@b.c' }, shippingRate: { id: 'standard' }, paymentFailed: (p) => { failed = p } })
  assert.equal(failed.reason, 'fail')
  assert.equal(reported.message, 'Your card was declined.')
})

test('no wallet buttons without a wallet method, or when nothing can be delivered', async () => {
  assert.equal(await express.mountExpressCheckout({ container: 'x', express: { methods: [] }, cart: walletCart, api: {} }), null)
  const api_ = { getShippingOptions: async () => ({ options: [], total: { amount: 0 } }) }
  assert.equal(await express.mountExpressCheckout({
    container: 'x', express: walletExpress, cart: walletCart, api: api_, deps: { Stripe: fakeWallet().Stripe, loadScript: async () => {}, appearance: {} },
  }), null)
  assert.equal((await api.getExpressOptions()).methods.length, 0, 'the demo has no wallet')
})

/* ── delivery ──────────────────────────────────────────────────────────── */

test('the demo says it delivers wherever it lists a delivery method', async () => {
  const answer = await api.checkServiceability({ country: 'IN', postalCode: '380001' })
  assert.equal(answer.deliverable, true)
  assert.equal(answer.postalCode, '380001')
  assert.ok(answer.methods.length > 0)
  assert.ok(answer.methods.every((m) => m.id && m.label))
})

/* ── codes, rewards and gift cards (demo answers) ──────────────────────── */

test('the demo keeps one code: adding applies it, removing clears it, and the new calls answer like a backend', async () => {
  await fill('cotton-cap')
  const applied = await api.addCode('LOOM10')
  assert.equal(applied.discountCode?.code, 'LOOM10')
  const cleared = await api.removeCode('LOOM10')
  assert.equal(cleared.discountCode, null)
  await assert.rejects(api.claimReward({ couponId: '1', rewardId: '1' }), (err) => err.status === 422 && err.code === 'invalid_reward')
  await assert.rejects(api.getGiftCard('NOPE'), (err) => err.status === 404)
  await api.clearCart()
})


/* ── pay on invoice (a company allowed it in Odoo) ─────────────────────── */

test('pay on invoice is offered like an offline method and asks for no gateway', () => {
  const invoice = { id: 'invoice', providerId: null, methodId: null, provider: 'invoice', code: 'invoice', flow: 'offline', name: 'Pay on invoice' }
  const [method] = payments.visibleMethods({ methods: [invoice] }, () => false)
  assert.equal(method.key, 'method:invoice')
  assert.equal(payments.nextStep({ ...invoice, status: 'pending', order }), 'done', 'a confirmed order waiting for its invoice is finished')

  const body = payments.paymentBody({ email: 'buyer@example.com', method })
  assert.equal(body.payOnInvoice, true)
  assert.equal('providerId' in body, false)
  assert.equal('methodId' in body, false)
})
