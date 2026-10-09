import { mark } from '../i18n/index.js'

/**
 * The rows above a bag's (or an order's) total, exactly as Odoo's cart summary (`website_sale.total`) prints them:
 * Delivery (with or without tax as the store shows prices), Subtotal (the untaxed amount, delivery included) and
 * Taxes. Discounts, gift wrapping and a cash-on-delivery fee are order lines in Odoo's cart; here they come first,
 * as the lines would. `fee` is a cash-on-delivery fee chosen at checkout, before the bag carries it.
 * Labels are English: `t()` them to show. A row's `money` is null when there is no amount yet (delivery before a
 * method is chosen).
 */
export function totalRows(bag = {}, fee) {
  const off = bag.codes || bag.promotions
    ? [...(bag.codes || []).map((c) => [c.label || c.code, c.amount]), ...(bag.promotions || []).map((p) => [p.name, p.amount])]
    : [[bag.discountCode?.label || mark('Discount'), bag.discount]]
  const extra = fee?.amount > 0 ? fee : bag.fee
  return [
    ...off.filter(([, money]) => money?.amount > 0).map(([label, money]) => ({ label, money, off: true })),
    bag.giftWrap?.amount > 0 && { label: mark('Gift wrapping'), money: bag.giftWrap },
    extra?.amount > 0 && { label: mark('Cash on delivery fee'), money: extra },
    // No method chosen yet (`shippingMethod: null`): Odoo's cart prints "-" until the delivery step.
    bag.requiresShipping !== false && { label: mark('Delivery'), money: bag.shippingMethod === null ? null : bag.shipping },
    // An older backend sends no `untaxed`: the total less the tax is the same number.
    { label: mark('Subtotal'), money: bag.untaxed || { ...bag.total, amount: bag.total?.amount - (bag.tax?.amount || 0) } },
    bag.tax && { label: mark('Taxes'), money: bag.tax },
  ].filter(Boolean)
}
