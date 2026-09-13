/**
 * The web address of a product: lowercase words joined by single dashes.
 *
 * `typing` keeps a trailing dash, because the slug field is edited a character
 * at a time — tidying it on every keystroke eats the dash before the next word
 * can be typed. The dash is removed when the field is left and before saving.
 */
export function slugify(value, { typing = false } = {}) {
  const slug = String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '')
  return typing ? slug : slug.replace(/-+$/, '')
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Why a slug cannot be saved, or null.
 *
 * A slug ending in a number (`jeans-501`) is refused by backends that read a
 * trailing number as a record id — Odoo is one — so the editor says so up front
 * instead of letting the save fail. `allowTrailingNumber` is for the local demo
 * data, which has no such rule.
 */
export function slugProblem(slug, { allowTrailingNumber = false } = {}) {
  if (!slug) return null
  if (!SLUG_RE.test(slug)) return 'Use lowercase letters and numbers joined by single dashes.'
  if (!allowTrailingNumber && /(?:^|-)\d+$/.test(slug)) {
    return "The slug can't end in a number — e.g. levis-501-jeans rather than levis-jeans-501."
  }
  return null
}
