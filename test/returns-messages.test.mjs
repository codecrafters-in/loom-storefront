import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { loadApp } from './helpers/browser.mjs'

const { api, root } = await loadApp()
const { formatDay, newestFirst, returnExpectation, returnNote, returnSentMessage, unavailableReason } = await import(`${root}lib/returns.js`)
const { messageTime, visibleMessages, MAX_MESSAGE_LENGTH } = await import(`${root}lib/order-messages.js`)
const { formatMoney } = await import(`${root}lib/money.js`)
const i18n = await import(`${root}i18n/index.js`)

/* ── where a return stands ─────────────────────────────────────────────── */

test('a return explains what happens next, by status and by when the store refunds', () => {
  assert.match(returnNote({ status: 'requested', method: 'refund' }), /reviewing/)
  assert.equal(returnNote({ status: 'approved', method: 'refund', refundTiming: 'received' }), 'Your refund starts when the items reach us.')
  assert.equal(returnNote({ status: 'approved', method: 'exchange', refundTiming: 'received' }), 'We will email you when the items reach us.', 'an exchange has no refund to start')
  assert.equal(returnNote({ status: 'received', method: 'refund', refundTiming: 'received' }), 'Your refund is on its way.')
  assert.equal(returnNote({ status: 'received', method: 'refund', refundTiming: 'approved' }), 'Your refund is on its way.')
  assert.match(returnNote({ status: 'received', method: 'refund', refundTiming: 'manual' }), /about your refund/, 'the team refunds by hand: no promise it is on its way')
  assert.match(returnNote({ status: 'received', method: 'refund' }), /about your refund/, 'an older backend without refundTiming promises nothing either')
  assert.equal(returnNote({ status: 'cancelled' }), 'This return was cancelled.')
  assert.equal(returnNote({ status: 'rejected', rejectReason: 'Worn' }), '', 'the rejection reason is shown on its own')
  assert.equal(returnNote({ status: 'exchanged' }), '', 'the status already says it')
})

test('a refunded return names the amount when the backend sends it', () => {
  const refunded = { amount: 2500, currency: 'USD' }
  assert.ok(returnNote({ status: 'refunded', method: 'refund', refunded }).includes(formatMoney(refunded)))
  assert.match(returnNote({ status: 'refunded', method: 'refund', refunded: null }), /goes back the way you paid/)
})

test('the answer to a sent return follows what the store did with it', () => {
  // e2e S-5 looks for "Return RET-… sent" when a return waits for the team.
  assert.match(returnSentMessage({ status: 'requested', number: 'RET-0003' }), /^Return RET-0003 sent/)
  assert.equal(returnSentMessage({ status: 'approved', number: 'RET-0003' }), 'Return RET-0003 is approved.')
  assert.equal(returnSentMessage({ status: 'refunded', number: 'RET-0003' }), 'Return RET-0003 is approved and refunded.')
})

test('before sending, the form says how returns get approved and when a refund starts', () => {
  const methods = ['refund', 'exchange']
  assert.equal(
    returnExpectation({ approval: 'automatic', refundTiming: 'received', methods }),
    'Returns inside our policy are approved straight away. Refunds start when the items reach us.',
  )
  assert.equal(
    returnExpectation({ approval: 'automatic', refundTiming: 'approved', methods }),
    'Returns inside our policy are approved straight away. Refunds start as soon as a return is approved.',
  )
  assert.equal(returnExpectation({ approval: 'team', refundTiming: 'manual', methods }), 'We review each return and email you.')
  assert.equal(
    returnExpectation({ approval: 'team', refundTiming: 'received', methods }, 'exchange'),
    'We review each return and email you.',
    'choosing an exchange drops the refund sentence',
  )
  assert.match(returnExpectation({ approval: 'mixed', refundTiming: 'manual', methods }), /^Some returns/)
  assert.equal(returnExpectation({ approval: 'automatic', refundTiming: 'received', methods: ['exchange'] }), 'Returns inside our policy are approved straight away.')
  assert.equal(returnExpectation({ days: 30, methods: [], reasons: [], lines: [] }), '', 'the demo and older backends say nothing')
})

test('an item that cannot go back says why', () => {
  assert.equal(unavailableReason({ reason: 'final_sale' }), 'Final sale')
  assert.equal(unavailableReason({ reason: 'window_over', until: '2026-10-12' }, 'en-US'), 'Return window ended on October 12, 2026')
  assert.equal(unavailableReason({ reason: 'window_over' }), 'Return window ended')
  assert.equal(unavailableReason({ reason: 'something_new' }), 'Cannot be returned')
})

test('a return window’s last day stays on its day in every time zone', () => {
  assert.equal(formatDay('2026-10-12', 'en-US'), 'October 12, 2026')
  assert.equal(formatDay('', 'en-US'), '')
  assert.equal(formatDay('not a date', 'en-US'), '')
})

test('returns list newest first without reordering the backend’s array', () => {
  const items = [{ id: 'a', createdAt: '2026-09-01T10:00:00Z' }, { id: 'b', createdAt: '2026-09-03T10:00:00Z' }, { id: 'c' }]
  assert.deepEqual(newestFirst(items).map((item) => item.id), ['b', 'a', 'c'])
  assert.deepEqual(items.map((item) => item.id), ['a', 'b', 'c'])
})

/* ── order messages ────────────────────────────────────────────────────── */

test('a message shows the year only when it is not this year', () => {
  const now = new Date('2026-09-15T12:00:00Z')
  assert.doesNotMatch(messageTime('2026-09-14T09:30:00Z', 'en-US', now), /2026/)
  assert.match(messageTime('2025-12-30T09:30:00Z', 'en-US', now), /2025/)
  assert.equal(messageTime('', 'en-US', now), '')
  assert.equal(messageTime('garbage', 'en-US', now), '')
})

test('messages: null renders nothing, and an empty body is left out', () => {
  assert.deepEqual(visibleMessages(null), [])
  assert.deepEqual(visibleMessages({ canReply: true, items: [] }), [])
  const items = [
    { id: 1, from: 'store', body: 'Your parcel left today.\nTracking follows.' },
    { id: 2, from: 'customer', body: '   ' },
    { id: 3, from: 'customer', body: 'Thank you!' },
  ]
  assert.deepEqual(visibleMessages({ canReply: true, items }).map((m) => m.id), [1, 3])
  assert.equal(MAX_MESSAGE_LENGTH, 2000)
})

test('the demo store has no conversation to write in', async () => {
  await assert.rejects(api.sendOrderMessage('anything', { body: 'Hello' }), (err) => err.code === 'demo_only')
})

/* ── translations ──────────────────────────────────────────────────────── */

const source = JSON.parse(fs.readFileSync(new URL('../src/i18n/source.json', import.meta.url), 'utf8'))
const holes = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

for (const code of i18n.CATALOGS) {
  test(`the ${code} catalog translates every string, keeping its {placeholders}`, async () => {
    const catalog = (await import(`${root}i18n/catalogs/${code}.js`)).default
    const missing = [...source.strings.filter((s) => typeof catalog[s] !== 'string'), ...source.plurals.map((p) => p.other).filter((s) => !catalog[s])]
    assert.deepEqual(missing, [], `${code} lacks: ${missing.join(' | ')} (node scripts/i18n-extract.mjs --missing ${code})`)
    for (const text of source.strings) {
      assert.equal(holes(catalog[text]), holes(text), `${code}: "${text}" → "${catalog[text]}"`)
    }
  })
}

test('the returns wording is translated where it is shown', async () => {
  await i18n.setLanguage('fr')
  assert.notEqual(returnSentMessage({ status: 'approved', number: 'RET-1' }), 'Return RET-1 is approved.')
  assert.match(returnSentMessage({ status: 'approved', number: 'RET-1' }), /RET-1/)
  await i18n.setLanguage('en')
})
