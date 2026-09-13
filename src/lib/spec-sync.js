/**
 * Highlights and specifications are two views of the same attributes: the
 * highlights are the handful by the buy button, the specifications the full
 * table. A backend stores one value per attribute, so an edit made in either
 * view has to reach the other — otherwise the untouched copy is saved as well
 * and one of the two silently wins.
 *
 * Both return the input unchanged (same reference) when nothing differs.
 */
export function specsFromHighlights(specs = {}, highlights = []) {
  let next = specs
  for (const row of highlights) {
    const key = row?.key?.trim()
    const value = row?.value ?? ''
    if (key && Object.hasOwn(specs, key) && specs[key] !== value) {
      if (next === specs) next = { ...specs }
      next[key] = value
    }
  }
  return next
}

export function highlightsFromSpecs(highlights = [], specs = {}) {
  let changed = false
  const next = highlights.map((row) => {
    const key = row?.key?.trim()
    if (!key || !Object.hasOwn(specs, key) || specs[key] === row.value) return row
    changed = true
    return { ...row, value: specs[key] }
  })
  return changed ? next : highlights
}
