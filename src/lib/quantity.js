/**
 * How much of a thing a shopper may buy, and how much the page admits is left.
 *
 * Both used to be constants — one to ninety-nine, "Only N left" at three — and
 * both are wrong the moment the product is not a shirt. Coffee is sold by the
 * quarter kilo, a phone is two to a customer, and a store that does not publish
 * stock levels must not have them leak out of a helpful sentence under the
 * button. The backend sends the rules (`quantity`, `stock`); this applies them
 * the same way on the product page and in the bag, so the stepper never offers
 * a number the server will refuse with `422 quantity_rule`.
 */

const DEFAULT_RULE = { min: 1, max: null, step: 1, unit: '', decimals: false }

/** A rule with every field filled, whatever an older backend left out. */
export function ruleOf(rule) {
  const r = { ...DEFAULT_RULE, ...(rule || {}) }
  const min = Number(r.min) > 0 ? Number(r.min) : 1
  const step = Number(r.step) > 0 ? Number(r.step) : 1
  const max = r.max === null || r.max === undefined || !Number.isFinite(Number(r.max)) ? null : Number(r.max)
  return { min, max, step, unit: r.unit || '', decimals: Boolean(r.decimals) }
}

// Three places is more than any unit a shop sells in, and stops 0.1 + 0.2 from
// arriving at the server as 0.30000000000000004.
const tidy = (n) => Math.round(n * 1000) / 1000

/**
 * The nearest quantity the rule allows, no more than `cap` (what is in stock).
 *
 * Snapped to the step counted from the minimum, so a 0.25 kg step starting at
 * 0.5 kg offers 0.75 and never 0.6.
 */
export function clampQuantity(value, rule, cap) {
  const r = ruleOf(rule)
  const ceiling = Math.min(r.max ?? Infinity, Number.isFinite(cap) ? cap : Infinity)
  let q = Number(value)
  if (!Number.isFinite(q)) q = r.min
  q = r.min + Math.round((q - r.min) / r.step) * r.step
  if (!r.decimals) q = Math.round(q)
  return tidy(Math.max(r.min, Math.min(ceiling, q)))
}

/** "kg", but nothing for a count — "2 Units" under a stepper that already says 2 is noise. */
export const unitLabel = (rule) => {
  const unit = ruleOf(rule).unit.trim()
  return /^(units?|pcs?|pieces?|each)$/i.test(unit) ? '' : unit
}

/** Props for `QuantityStepper`. `cap` is the stock on hand, when the store says. */
export function stepperProps(rule, cap) {
  const r = ruleOf(rule)
  const ceiling = Math.min(r.max ?? 99, Number.isFinite(cap) && cap > 0 ? cap : Infinity)
  return { min: r.min, max: Math.max(r.min, ceiling), step: r.step, unit: unitLabel(r) }
}

/**
 * The sentence about stock, or null.
 *
 * `exact` says the number; `low` says it only under the threshold, as "Only N
 * left"; `hidden` never says a number at all, and neither does a variant whose
 * `inventory` is null. A backend without `stock` gets what the theme always did:
 * a warning at three.
 */
export function stockNote(product, variant, storeStock) {
  const stock = product?.stock || storeStock || { display: 'low', lowThreshold: 3 }
  const n = variant?.inventory
  if (!variant?.available || stock.display === 'hidden' || typeof n !== 'number' || n <= 0) return null
  const low = n <= (stock.lowThreshold ?? 3)
  if (stock.display === 'exact') return { low, text: `${n} in stock` }
  return low ? { low, text: `Only ${n} left` } : null
}
