/**
 * The time left on a promotion, for the home page's `countdown` section.
 *
 * Pure, so the arithmetic is tested without a clock: the component passes the time it renders at. The server renders
 * with its own clock and the browser corrects it on the first tick.
 */

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * `endsAt` as milliseconds, or null when it is not a date.
 *
 * A date-time without an offset (`2026-10-01T18:00:00`, or Odoo's `2026-10-01 18:00:00`) is read as UTC. A browser
 * reads it as its own local time and the server as the server's, so the same promotion would end at different moments
 * in the prerendered page and in the shopper's tab.
 */
export function endTime(endsAt) {
  if (typeof endsAt === 'number') return Number.isFinite(endsAt) ? endsAt : null
  if (typeof endsAt !== 'string' || !endsAt.trim()) return null
  let text = endsAt.trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, '$1T$2')
  if (/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) text += 'Z'
  const time = Date.parse(text)
  return Number.isNaN(time) ? null : time
}

/**
 * `{ total, days, hours, minutes, seconds }` left until `endsAt` at `now`, or null once it has ended (or never could).
 *
 * Seconds round up: with half a second to go the band still says one second, and it disappears when the time is
 * actually up rather than showing a row of zeros first.
 */
export function timeLeft(endsAt, now = Date.now()) {
  const end = endTime(endsAt)
  if (end === null || !Number.isFinite(now)) return null
  const total = end - now
  if (total <= 0) return null
  let rest = Math.ceil(total / SECOND) * SECOND
  const days = Math.floor(rest / DAY)
  rest -= days * DAY
  const hours = Math.floor(rest / HOUR)
  rest -= hours * HOUR
  const minutes = Math.floor(rest / MINUTE)
  rest -= minutes * MINUTE
  return { total, days, hours, minutes, seconds: rest / SECOND }
}

/** Two digits at least, so the numbers do not jump in width as they count down: 7 → `07`, 120 → `120`. */
export const pad = (value) => String(Math.max(0, Math.floor(Number(value) || 0))).padStart(2, '0')
