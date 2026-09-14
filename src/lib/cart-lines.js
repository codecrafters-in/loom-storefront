/**
 * What a bag line says beyond its title, and the order lines are shown in.
 *
 * A line used to be a variant and two option names. It can now carry a
 * no-variant choice (a gift box), text the shopper typed (an engraving), the
 * contents of a set, or be an accessory added alongside another line — and the
 * cart page, the drawer, the checkout summary and the order page all have to
 * say the same thing about it. One reading of the line, here, is how they stay
 * the same.
 */

import { t } from '../i18n/index.js'

/**
 * Lines in display order, each optional product straight after the line it was
 * added with, one level deeper.
 *
 * The server lists them in the order they were added, which puts a case three
 * lines away from the phone it was bought for. A line whose parent is gone (the
 * phone was removed) is shown at the top level rather than hidden — it is still
 * in the bag, and still charged.
 */
export function nestLines(lines = []) {
  const ids = new Set(lines.map((l) => l.id))
  const children = new Map()
  for (const line of lines) {
    if (line.linkedTo && ids.has(line.linkedTo) && line.linkedTo !== line.id) {
      children.set(line.linkedTo, [...(children.get(line.linkedTo) || []), line])
    }
  }
  const out = []
  const seen = new Set()
  const visit = (line, depth) => {
    if (seen.has(line.id)) return
    seen.add(line.id)
    out.push({ line, depth })
    for (const child of children.get(line.id) || []) visit(child, depth + 1)
  }
  for (const line of lines) {
    if (!(line.linkedTo && ids.has(line.linkedTo))) visit(line, 0)
  }
  // A cycle of links has no top; show what is left rather than drop it.
  for (const line of lines) visit(line, 0)
  return out
}

const joined = (v) => (Array.isArray(v) ? v.join(', ') : String(v))

/**
 * The line's small print: options and extras on one row, typed text quoted, and
 * a set's contents listed.
 */
export function lineDetails(line = {}) {
  const pairs = [...Object.entries(line.options || {}), ...Object.entries(line.extraOptions || {})]
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${k}: ${joined(v)}`)
  return {
    summary: pairs.join('  ·  '),
    custom: (line.customValues || []).filter((c) => c?.text).map((c) => `${c.name}: “${c.text}”`),
    combo: (line.comboItems || []).map((item) => {
      const options = Object.values(item.options || {}).filter(Boolean).join(', ')
      return `${item.title}${options ? ` (${options})` : ''}`
    }),
  }
}

const list = (names) =>
  names.length < 2 ? names.join('') : t('{first} and {last}', { first: names.slice(0, -1).join(', '), last: names[names.length - 1] })

/**
 * The sentence to show when the bag refuses a line.
 *
 * The server's own message wins: it is written for the shopper, in the store's
 * language. These are for a response that carries only a code and its detail,
 * which says precisely what is wrong and is too useful to replace with "failed
 * with 422".
 */
export function cartProblem(err) {
  if (!err) return t('Something went wrong.')
  const payload = err.detail && typeof err.detail === 'object' ? err.detail : {}
  if (payload.message) return err.message
  const d = payload.detail && typeof payload.detail === 'object' ? payload.detail : payload
  switch (err.code) {
    case 'choose_options':
      if (d.missing?.length) return t('Choose {options} first.', { options: list(d.missing) })
      break
    case 'combo_incomplete':
      if (d.groups?.length) return t('Choose one for {groups}.', { groups: list(d.groups) })
      break
    case 'invalid_combination':
      return t('That combination is not available. Try another choice.')
    case 'quantity_rule': {
      const parts = []
      if (d.min != null) parts.push(t('at least {min}', { min: d.min }))
      if (d.max != null) parts.push(t('at most {max}', { max: d.max }))
      if (d.step != null && Number(d.step) !== 1) parts.push(t('in steps of {step}', { step: d.step }))
      if (parts.length) return t('That quantity is not available: buy {rule}.', { rule: list(parts) })
      break
    }
    default:
      break
  }
  return err.message || t('Something went wrong.')
}
