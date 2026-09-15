/**
 * How the footer lays out its link columns, for any number of them.
 *
 * The footer used to be the brand column plus a fixed three: a store with four
 * columns got three on the first row and the fourth alone under them. Columns
 * now fill rows evenly (four make two by two on a phone, never three and one),
 * and the brand column sits beside them only while they still have room.
 *
 * Tailwind only sees class names written out in full, hence the tables. The
 * Python twin, for the preview in Odoo, is `footer_layout` in the addon's
 * services/content_preview.py.
 */

const PHONE = ['', 'grid-cols-1', 'grid-cols-2']
const TABLET = ['', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-3', 'md:grid-cols-4']
const LAPTOP = ['', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4', 'lg:grid-cols-5', 'lg:grid-cols-6']
/** Brand column beside the links: from laptop width up to four columns, from desktop width with five. */
const BESIDE = {
  1: 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]',
  2: 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]',
  3: 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,3fr)]',
  4: 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,4fr)]',
  5: 'xl:grid-cols-[minmax(0,1.4fr)_minmax(0,5fr)]',
}

/** How many per row, at most `most`, with rows as even as they can be: 4 at most 3 gives 2 (two rows of two). */
export function perRow(count, most) {
  if (!count) return 0
  return Math.ceil(count / Math.ceil(count / most))
}

/**
 * `{ outer, links, beside }`: classes for the footer's outer grid and for the
 * grid of link columns, and when the brand column sits beside them
 * (`laptop`, `desktop` or `never`).
 */
export function footerLayout(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  if (!n) return { outer: '', links: '', beside: 'never' }
  return {
    outer: BESIDE[n] || '',
    links: [PHONE[perRow(n, 2)], TABLET[perRow(n, 4)], LAPTOP[perRow(n, 6)]].join(' '),
    beside: n <= 4 ? 'laptop' : n === 5 ? 'desktop' : 'never',
  }
}
