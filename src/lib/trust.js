import { t } from '../i18n/index.js'

/**
 * The repairs line of the trust block under the buy button (`trust.repairs`).
 *
 * The theme's own sentence was written for a clothing shop ("we mend anything we made"), which a store selling coffee
 * or phones cannot say. The store's sentence (`trust.repairsText`, from Odoo) replaces the whole line when it sends
 * one; without it the line reads as before.
 */
export function repairsLine(trust) {
  if (trust?.repairs !== true) return null
  const own = typeof trust.repairsText === 'string' ? trust.repairsText.trim() : ''
  if (own) return { strong: own, rest: '' }
  return { strong: t('Repaired, not replaced'), rest: t('we mend anything we made, for as long as we exist') }
}
