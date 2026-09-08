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

export const money = (amount, currency = config.store.currency) => ({ amount, currency })

export function minorUnits(currency = config.store.currency) {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2
}

/** Major units (128.5) → minor (12850). Only for turning authored data into money. */
export function toMinor(major, currency = config.store.currency) {
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
export function discountPercent(price, compareAt) {
  if (!compareAt || compareAt.amount <= price.amount) return 0
  return Math.round(((compareAt.amount - price.amount) / compareAt.amount) * 100)
}
