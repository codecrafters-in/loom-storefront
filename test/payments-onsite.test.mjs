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

const order = { id: 'order_1', number: 'LM-1' }
const pay = (over = {}) => ({ id: 'pay_1', reference: 'R1', provider: 'demo', flow: 'direct', status: 'draft', client: {}, redirect: null, order: null, ...over })

/* ── which methods the page offers ─────────────────────────────────────── */

test('saved methods come first, and an on-page method with no driver is not offered', () => {
  const list = payments.visibleMethods({
    methods: [
      { id: '1-1', provider: 'stripe', flow: 'direct', name: 'Card' },
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
