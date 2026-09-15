import { mark, t } from '../i18n/index.js'
import { formatMoney } from './money.js'

/** How a return stands, in the customer's words (`loom.return.request` states in Odoo). */
export const RETURN_STATUS = {
  requested: mark('Requested'),
  approved: mark('Approved: send the items back'),
  received: mark('Items received'),
  refunded: mark('Refunded'),
  exchanged: mark('Replacement on its way'),
  credited: mark('Store credit added'),
  rejected: mark('Not accepted'),
  cancelled: mark('Cancelled'),
}

export const RETURN_TONE = {
  requested: 'new', approved: 'low-stock', received: 'low-stock', refunded: 'bestseller', exchanged: 'bestseller',
  credited: 'bestseller', rejected: 'sold-out', cancelled: 'sold-out',
}

export const RETURN_METHOD = {
  refund: mark('Refund to the way I paid'),
  exchange: mark('Exchange (another size or a replacement)'),
  credit: mark('Store credit'),
}

export const MAX_RETURN_PHOTOS = 3
export const MAX_RETURN_PHOTO_BYTES = 5 * 1024 * 1024

/**
 * A day as the shopper reads it ("12 October 2026"). A bare date (`2026-10-12`, a return window's last day) stays on
 * that day wherever the shopper is; a full timestamp is shown in their own time zone.
 */
export function formatDay(iso, locale = 'en-US') {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const bare = /^\d{4}-\d{2}-\d{2}$/.test(iso)
  return at.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', ...(bare ? { timeZone: 'UTC' } : {}) })
}

/**
 * What happens next with a return, in a sentence under its status ('' when the status says it all). It follows the
 * store's settings: `refundTiming` is `manual` (the team refunds), `received` (automatically when the items are back)
 * or `approved` (as soon as the return is approved); older backends leave it out.
 */
export function returnNote(item) {
  const refund = item.method === 'refund'
  switch (item.status) {
    case 'requested':
      return t('We are reviewing your return and will email you.')
    case 'approved':
      return refund && item.refundTiming === 'received'
        ? t('Your refund starts when the items reach us.')
        : t('We will email you when the items reach us.')
    case 'received':
      if (!refund) return t('We are checking the items and will email you.')
      return item.refundTiming === 'received' || item.refundTiming === 'approved'
        ? t('Your refund is on its way.')
        : t('We are checking the items and will email you about your refund.')
    case 'refunded':
      return item.refunded?.amount > 0
        ? t('We refunded {amount} the way you paid. Your bank can take a few days to show it.', { amount: formatMoney(item.refunded) })
        : t('The money goes back the way you paid. Your bank can take a few days to show it.')
    case 'cancelled':
      return t('This return was cancelled.')
    default:
      return ''
  }
}

/**
 * What to expect once the form is sent, from `options.approval` (how the returnable items get approved) and, when the
 * shopper wants their money back, `options.refundTiming`. `method` is the one chosen so far, if any.
 */
export function returnExpectation(options = {}, method = '') {
  const approval =
    options.approval === 'automatic' ? t('Returns inside our policy are approved straight away.')
      : options.approval === 'team' ? t('We review each return and email you.')
        : options.approval === 'mixed' ? t('Some returns are approved straight away; we review the others and email you.')
          : ''
  const refunding = method ? method === 'refund' : (options.methods || []).includes('refund')
  const timing = !refunding ? ''
    : options.refundTiming === 'received' ? t('Refunds start when the items reach us.')
      : options.refundTiming === 'approved' ? t('Refunds start as soon as a return is approved.')
        : ''
  return [approval, timing].filter(Boolean).join(' ')
}

/** The answer to a return just sent: the store may approve it, and even refund it, straight away. */
export function returnSentMessage(item) {
  if (item.status === 'refunded') return t('Return {number} is approved and refunded.', { number: item.number })
  if (item.status === 'approved') return t('Return {number} is approved.', { number: item.number })
  return t('Return {number} sent. We will email you when we have looked at it.', { number: item.number })
}

/** Why a delivered item cannot go back (`options.unavailable[].reason`). */
export function unavailableReason(line, locale) {
  if (line.reason === 'final_sale') return t('Final sale')
  if (line.reason === 'window_over') {
    return line.until ? t('Return window ended on {date}', { date: formatDay(line.until, locale) }) : t('Return window ended')
  }
  return t('Cannot be returned')
}

/** Newest first, whatever order the backend listed them in. */
export const newestFirst = (items = []) => [...items].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
