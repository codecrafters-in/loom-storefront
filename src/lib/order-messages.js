/**
 * The order's conversation with the store (`order.messages`, Odoo's chatter as the customer may see it).
 */

/** The backend refuses a longer message (`POST /orders/:id/messages`). */
export const MAX_MESSAGE_LENGTH = 2000

/** The counter shows once a message gets close to the limit. */
export const COUNTER_FROM = 1600

/** When a message was written: day and time, and the year only when it is not this year. */
export function messageTime(iso, locale = 'en-US', now = new Date()) {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const year = at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }
  return at.toLocaleString(locale, { day: 'numeric', month: 'short', ...year, hour: 'numeric', minute: '2-digit' })
}

/** The messages oldest first (the backend's order), without any that have nothing to show. */
export const visibleMessages = (messages) => (messages?.items || []).filter((m) => m && String(m.body || '').trim())
