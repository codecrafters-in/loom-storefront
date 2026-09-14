import { test } from 'node:test'
import assert from 'node:assert/strict'
import '../test/helpers/browser.mjs'

const { toMinor, toMajor, formatMoney, discountPercent, isRealDiscount, MIN_DISCOUNT } =
  await import('../src/lib/money.js')

const usd = (amount) => ({ amount, currency: 'USD' })

test('money is stored in integer minor units', () => {
  assert.equal(toMinor(118), 11800)
  assert.equal(toMinor(0.1), 10)
  assert.equal(toMajor(usd(11800)), 118)
  // The reason for minor units at all: this is 0.30000000000000004 in floats.
  assert.equal(toMinor(0.1) + toMinor(0.2), toMinor(0.3))
})

test('every two-decimal price a merchant can type converts exactly', () => {
  // The realistic input range: `<input type="number" step="0.01">`. If any of
  // these drifted by a cent the catalogue would misprice silently.
  for (let cents = 0; cents <= 100_000; cents += 1) {
    const major = cents / 100
    assert.equal(toMinor(major), cents, `${major} did not round-trip`)
  }
})

test('a third decimal is lost to the float, not rounded up', () => {
  // 1.005 * 100 is 100.49999999999999, so Math.round gives 100. Documented
  // rather than patched: the price input is two-decimal, so nothing in the
  // theme can reach this, and quietly changing how money rounds to satisfy a
  // test is a worse trade than knowing where the edge is.
  assert.equal(toMinor(1.005), 100)
  assert.equal(toMinor(1.006), 101)
})

test('a missing amount formats to nothing rather than NaN', () => {
  assert.equal(formatMoney(null), '')
  assert.equal(formatMoney({ currency: 'USD' }), '')
})

test('discountPercent ignores a compare-at at or below the price', () => {
  assert.equal(discountPercent(usd(10000), usd(10000)), 0)
  assert.equal(discountPercent(usd(10000), usd(9000)), 0)
  assert.equal(discountPercent(usd(10000), null), 0)
})

test('a reduction under the threshold is not a sale', () => {
  // The case that prompted this: a merchant set $118 against $120.
  assert.equal(discountPercent(usd(11800), usd(12000)), 2)
  assert.equal(isRealDiscount(usd(11800), usd(12000)), false)
})

test('the threshold is inclusive', () => {
  assert.equal(discountPercent(usd(10000), usd(10500)), MIN_DISCOUNT)
  assert.equal(isRealDiscount(usd(10000), usd(10500)), true)
  assert.equal(isRealDiscount(usd(10000), usd(10400)), false)
})

test('a real discount still reads as one', () => {
  assert.equal(discountPercent(usd(14500), usd(17500)), 17)
  assert.equal(isRealDiscount(usd(14500), usd(17500)), true)
})

test('dinars have three decimals and the backend can say so for any currency', async () => {
  const { minorUnits, registerCurrencies } = await import('../src/lib/money.js')
  assert.equal(minorUnits('KWD'), 3)
  assert.match(formatMoney({ amount: 24560, currency: 'KWD' }, { locale: 'en-US' }), /24\.560/, 'not 245.60')
  assert.equal(toMajor({ amount: 1500, currency: 'JPY' }), 1500)

  // A backend reporting decimals wins over the built-in lists.
  registerCurrencies({ currency: 'XAF', currencies: [{ code: 'XAF', decimals: 0 }, { code: 'CLF', decimals: 4 }] })
  assert.equal(minorUnits('XAF'), 0)
  assert.equal(toMajor({ amount: 12345, currency: 'CLF' }), 1.2345)
  assert.equal(minorUnits(), 0, 'the store currency the backend named is the default')
})
