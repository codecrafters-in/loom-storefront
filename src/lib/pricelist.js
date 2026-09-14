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
  } catch {
    /* storage unavailable: the choice lasts until the page reloads */
  }
}
