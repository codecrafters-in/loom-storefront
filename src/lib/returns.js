import { mark } from '../i18n/index.js'

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
