/**
 * The two decisions inside the error boundary, as plain functions.
 *
 * Not because the component is complicated, but because these are the parts
 * that are wrong silently. A boundary that never resets leaves every page after
 * the first one broken for the rest of the session, and nobody notices until
 * they navigate; a report that carries an entire stack trace as its label makes
 * an analytics dashboard useless. Neither shows up in a render.
 */

/**
 * Clear the boundary when the route changed, and only then.
 *
 * Resetting on every update would flicker between the error screen and the
 * render that keeps throwing.
 */
export const shouldReset = (hasError, previousKey, key) => Boolean(hasError) && previousKey !== key

/** A label, not a stack trace. The stack goes to the console. */
export const describeError = (error) => String(error?.message || error || 'Unknown error').slice(0, 200)

/**
 * The form fields a `422` answer names (`detail.fields`), as a set; empty for any other error.
 *
 * The API error keeps the whole JSON body as its `detail`, so Odoo's list is at `detail.detail.fields`; the demo
 * adapter puts it at `detail.fields`. A form marks those fields rather than only repeating the message at the bottom.
 */
export function fieldErrors(error) {
  if (error?.status !== 422) return new Set()
  const fields = error.detail?.detail?.fields || error.detail?.fields
  return new Set(Array.isArray(fields) ? fields.filter((field) => typeof field === 'string') : [])
}
