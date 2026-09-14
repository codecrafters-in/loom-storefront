import { config } from './config.js'

/**
 * Money is integer minor units plus a currency code — never a float.
 *
 * 0.1 + 0.2 is not 0.3 in binary floating point, and a storefront that adds up
 * a cart in floats will eventually be a cent out on a real order. Every amount
 * that crosses the API boundary is an integer of the currency's smallest unit
 * (cents for USD, paise for INR), which is also what Stripe, Shopify and Adyen
 * all do.
 *
 *   { amount: 12800, currency: 'USD' }  →  $128.00
 */

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK'])
// Dinars and rials are counted in fils and baisa: a thousand to one. Shown with two decimals, 24.560 KWD read as 245.60.
const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'])

/**
 * What the backend says about its currencies (`pricing.currency` and `pricing.currencies[].decimals` in the settings
 * document). It wins over the lists above, which only cover the demo and a backend that does not say.
 */
const reported = new Map()
let storeCurrency = ''

export function registerCurrencies(pricing) {
  if (!pricing) return
  if (pricing.currency) storeCurrency = String(pricing.currency).toUpperCase()
  for (const entry of pricing.currencies || []) {
    if (entry?.code && Number.isInteger(entry.decimals)) reported.set(String(entry.code).toUpperCase(), entry.decimals)
  }
}

/** The store's currency: the backend's, else the build's, else the demo catalogue's. */
const defaultCurrency = () => storeCurrency || config.store.currency || 'USD'

export const money = (amount, currency = defaultCurrency()) => ({ amount, currency })

export function minorUnits(currency = defaultCurrency()) {
  const code = String(currency || '').toUpperCase()
  if (reported.has(code)) return reported.get(code)
  return ZERO_DECIMAL.has(code) ? 0 : THREE_DECIMAL.has(code) ? 3 : 2
}

/** Major units (128.5) → minor (12850). Only for turning authored data into money. */
export function toMinor(major, currency = defaultCurrency()) {
  return Math.round(major * 10 ** minorUnits(currency))
}

export function toMajor(m) {
  if (!m) return 0
  return m.amount / 10 ** minorUnits(m.currency)
}

export function formatMoney(m, { locale = config.store.locale } = {}) {
  if (!m || typeof m.amount !== 'number') return ''
  const digits = minorUnits(m.currency)
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: m.currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(toMajor(m))
  } catch {
    // An unknown currency code should not blank out a price.
    return `${m.currency} ${toMajor(m).toFixed(digits)}`
  }
}

export const addMoney = (a, b) => money(a.amount + b.amount, a.currency)
export const mulMoney = (m, n) => money(Math.round(m.amount * n), m.currency)

/** Percent off, rounded the way a shopper expects to read it. */
/**
 * Below this, a reduction is not a saving and should not be advertised.
 *
 * A merchant setting a compare-at price a couple of dollars above the price
 * gets "−2%" in red next to a sale badge, which is worth nothing to a shopper
 * and costs something: a discount too small to matter reads as a store trying
 * to manufacture urgency, and that suspicion does not stay local to the badge.
 * The struck-through price still shows — it is a fact — but it is not dressed
 * up as an offer.
 */
export const MIN_DISCOUNT = 5

export function discountPercent(price, compareAt) {
  if (!compareAt || compareAt.amount <= price.amount) return 0
  return Math.round(((compareAt.amount - price.amount) / compareAt.amount) * 100)
}

/** Whether a reduction is worth calling a sale. */
export function isRealDiscount(price, compareAt) {
  return discountPercent(price, compareAt) >= MIN_DISCOUNT
}
