import { invalidateAndNotify } from './api/cache.js'

/**
 * The pricelist a shopper picked in the currency switcher (a live store with more than one currency).
 *
 * Kept in this browser and sent as `X-Loom-Pricelist` on every API call, so every price, the bag and the settings come
 * back in that currency. The backend ignores an id its website does not offer.
 */
const KEY = 'loom.pricelist'

export function chosenPricelist() {
  try {
    const value = localStorage.getItem(KEY)
    return /^\d+$/.test(value || '') ? value : ''
  } catch {
    return ''
  }
}

export function choosePricelist(id) {
  try {
    if (id) localStorage.setItem(KEY, String(id))
    else localStorage.removeItem(KEY)
    // The bag moves to the choice; until it answers, the choice is what prices the shop.
    localStorage.removeItem(BAG_KEY)
  } catch {
    /* storage unavailable: the choice lasts until the page reloads */
  }
}

/**
 * The fiscal position and the pricelist of the shopper's bag, sent as `X-Loom-Fiscal-Position` and `X-Loom-Pricelist`:
 * once a bag has them (an address that makes it tax-free, a code, a currency), the catalogue is priced with them too,
 * as Odoo's own shop is. Called with a cart's `fiscalPositionId` or `pricelistId`, keeps it and drops the prices
 * cached the old way; without, reads it.
 */
const BAG_KEY = 'loom.bag-pricelist'

const follow = (key) => (id) => {
  try {
    if (id && id !== localStorage.getItem(key)) {
      localStorage.setItem(key, id)
      invalidateAndNotify()
    }
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

export const fiscalPosition = follow('loom.fiscal')
export const bagPricelist = follow(BAG_KEY)
