/**
 * Even rows for a grid whose number of items the merchant decides.
 *
 * A fixed `grid-cols-3` leaves a fourth item alone on its own row. These give
 * as many per row as fit, spread so the rows are as even as they can be. The
 * Python twin, for the previews in Odoo, is `per_row` in the addon's
 * services/content_preview.py.
 */

/** How many per row, at most `most`, with rows as even as they can be: 4 at most 3 gives 2 (two rows of two). */
export function perRow(count, most) {
  if (!count) return 0
  return Math.ceil(count / Math.ceil(count / most))
}

// Written out in full so Tailwind finds them.
const PROMISES_TABLET = ['', 'sm:grid-cols-1', 'sm:grid-cols-2', 'sm:grid-cols-3']
const PROMISES_LAPTOP = ['', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4']

/** The promises strip: one per row on phones, up to three on tablets and four on a laptop, in even rows. */
export function promisesGrid(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  if (!n) return ''
  return `${PROMISES_TABLET[perRow(n, 3)]} ${PROMISES_LAPTOP[perRow(n, 4)]}`
}
