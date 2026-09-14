/**
 * The back office, driven through Odoo's JSON-RPC API.
 *
 * Scenarios need a merchant to do things — change a price, empty a shelf,
 * invoice an order, refund it. Clicking through Odoo's UI would make every
 * storefront test hostage to Odoo's markup, so the merchant's actions go
 * through `/web/session/authenticate` + `/web/dataset/call_kw` as admin: the
 * same ORM methods the backend buttons call, and the same access rules.
 */
import { settings } from './env.js'

export class Odoo {
  constructor(context) {
    this.context = context
    this.seq = 0
  }

  static async connect(playwright) {
    const context = await playwright.request.newContext({ baseURL: settings.odooUrl })
    const res = await context.post('/web/session/authenticate', {
      data: {
        jsonrpc: '2.0',
        method: 'call',
        params: { db: settings.db, login: settings.admin.login, password: settings.admin.password },
      },
    })
    const body = await res.json().catch(() => null)
    if (!res.ok() || body?.error || !body?.result?.uid) {
      await context.dispose()
      throw new Error(
        `Could not sign in to Odoo at ${settings.odooUrl} (db ${settings.db}) as ${settings.admin.login}: ` +
          (body?.error?.data?.message || body?.error?.message || `HTTP ${res.status()}`),
      )
    }
    return new Odoo(context)
  }

  async dispose() {
    await this.context.dispose()
  }

  async call(model, method, args = [], kwargs = {}) {
    const res = await this.context.post(`/web/dataset/call_kw/${model}/${method}`, {
      data: { jsonrpc: '2.0', method: 'call', id: ++this.seq, params: { model, method, args, kwargs } },
    })
    const body = await res.json().catch(() => null)
    if (!res.ok() || !body || body.error) {
      const message = body?.error?.data?.message || body?.error?.message || `HTTP ${res.status()}`
      throw new Error(`Odoo ${model}.${method} failed: ${message}`)
    }
    return body.result
  }

  searchRead(model, domain, fields = [], { limit, order, context } = {}) {
    return this.call(model, 'search_read', [domain], { fields, limit, order, context })
  }

  async one(model, domain, fields = [], options = {}) {
    const [record] = await this.searchRead(model, domain, fields, { ...options, limit: 1 })
    return record || null
  }

  read(model, ids, fields = []) {
    return this.call(model, 'read', [ids, fields])
  }

  write(model, ids, values, context) {
    return this.call(model, 'write', [ids, values], context ? { context } : {})
  }

  create(model, values, context) {
    return this.call(model, 'create', [values], context ? { context } : {})
  }

  /* ── merchant actions ─────────────────────────────────────────────────── */

  async template(name, fields = ['id', 'list_price']) {
    const record = await this.one('product.template', [['name', '=', name]], fields, { context: { active_test: false } })
    if (!record) throw new Error(`No product "${name}" in Odoo. Run tools/e2e_seed.py.`)
    return record
  }

  async setListPrice(templateName, price) {
    const { id } = await this.template(templateName)
    await this.write('product.template', [id], { list_price: price })
  }

  /** On-hand quantity in the main warehouse, set through an inventory adjustment like Inventory > Physical Inventory. */
  async setStock(productId, quantity) {
    const warehouse = await this.one('stock.warehouse', [], ['lot_stock_id'])
    const context = { inventory_mode: true }
    const quantId = await this.create(
      'stock.quant',
      { product_id: Number(productId), location_id: warehouse.lot_stock_id[0], inventory_quantity: quantity },
      context,
    )
    await this.call('stock.quant', 'action_apply_inventory', [[quantId]], { context })
  }

  order(domain, fields = []) {
    return this.one('sale.order', domain, [
      'name', 'state', 'website_id', 'loom_store_id', 'partner_id', 'partner_invoice_id', 'amount_untaxed',
      'amount_total', 'invoice_ids', 'picking_ids', 'transaction_ids', 'order_line', 'loom_token', ...fields,
    ])
  }

  orderByNumber(number, fields) {
    return this.order([['name', '=', number]], fields)
  }

  /** Sales > Order > Create invoice (regular invoice), then Confirm — unless Odoo already invoiced it automatically. */
  async invoiceOrder(orderId) {
    let [order] = await this.read('sale.order', [orderId], ['invoice_ids'])
    if (!order.invoice_ids.length) {
      const context = { active_model: 'sale.order', active_ids: [orderId], active_id: orderId }
      const wizardId = await this.create('sale.advance.payment.inv', { advance_payment_method: 'delivered' }, context)
      await this.call('sale.advance.payment.inv', 'create_invoices', [[wizardId]], { context })
      ;[order] = await this.read('sale.order', [orderId], ['invoice_ids'])
    }
    const drafts = await this.searchRead('account.move', [['id', 'in', order.invoice_ids], ['state', '=', 'draft']], ['id'])
    if (drafts.length) await this.call('account.move', 'action_post', [drafts.map((m) => m.id)])
    return this.read('account.move', order.invoice_ids, [
      'name', 'state', 'move_type', 'partner_id', 'commercial_partner_id', 'amount_total', 'payment_state',
    ])
  }

  /** Accounting > Invoice > Credit note (full refund), confirmed. */
  async refundInvoice(invoiceId, reason = 'Customer return') {
    const context = { active_model: 'account.move', active_ids: [invoiceId], active_id: invoiceId }
    const wizardId = await this.create('account.move.reversal', { reason, journal_id: false }, context)
    const action = await this.call('account.move.reversal', 'refund_moves', [[wizardId]], { context })
    const refundIds = action?.res_id ? [action.res_id] : action?.domain?.find?.((d) => d[0] === 'id')?.[2] || []
    if (refundIds.length) await this.call('account.move', 'action_post', [refundIds])
    return refundIds
  }

  /** Messages Odoo recorded on a document (emails sent to the customer show up here). */
  messages(model, resId, fields = ['subject', 'message_type', 'partner_ids', 'body', 'email_from']) {
    return this.searchRead('mail.message', [['model', '=', model], ['res_id', '=', resId]], fields, { order: 'id asc' })
  }
}
