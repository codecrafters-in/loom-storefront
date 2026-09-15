import { useState } from 'react'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { Button, Icon } from '../../components/ui/index.jsx'
import { useToast } from '../../store/ToastContext.jsx'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { formatMoney } from '../../lib/money.js'

/*
 * An order taken by phone or email.
 *
 * The backend builds it the way a storefront checkout would (prices, taxes, delivery, stock), then, as chosen: gives
 * the customer a link to pay on the storefront, books money already received by bank transfer or cash, or leaves a
 * quotation. The same attempt sent twice (a double click, a retry after a timeout) places one order.
 */

const PAYMENTS = [
  ['link', 'Send a payment link', 'The customer pays on the storefront’s order page.'],
  ['record', 'Already paid', 'Money received by bank transfer or cash: the order is confirmed.'],
  ['quote', 'Quotation only', 'Nothing to pay yet; confirm it later in Odoo.'],
]

const ADDRESS = [
  ['name', 'Full name', true],
  ['phone', 'Phone', false],
  ['line1', 'Address', true],
  ['line2', 'Apartment, floor (optional)', false],
  ['city', 'City', true],
  ['region', 'State or region', false],
  ['postalCode', 'Postal code', false],
  ['country', 'Country code', true],
]

const newKey = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
const emptyAddress = () => Object.fromEntries(ADDRESS.map(([key]) => [key, '']))

export default function PhoneOrder() {
  const config = useStorefront()
  const { push } = useToast()
  const methods = (config.commerce?.shippingMethods || []).filter((m) => !m.pickup)
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState(emptyAddress)
  const [lines, setLines] = useState([])
  const [typed, setTyped] = useState('')
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState(methods[0]?.id || '')
  const [payment, setPayment] = useState('link')
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [placed, setPlaced] = useState(null)
  const [key, setKey] = useState(newKey)

  const found = useAsync(
    () => (search.length < 2 ? Promise.resolve(null) : api.adminListProducts({ q: search, perPage: 8 })),
    [search],
  )

  const add = (product, variant) =>
    setLines((current) => {
      const existing = current.find((line) => line.variantId === variant.id)
      if (existing) return current.map((line) => (line === existing ? { ...line, quantity: line.quantity + 1 } : line))
      const options = Object.values(variant.options || {}).filter(Boolean).join(' · ')
      return [...current, { variantId: variant.id, title: product.title, options, price: variant.price || product.price, quantity: 1 }]
    })
  const setQuantity = (variantId, quantity) =>
    setLines((current) => current
      .map((line) => (line.variantId === variantId ? { ...line, quantity } : line))
      .filter((line) => line.quantity > 0))

  const items = lines.reduce((sum, line) => sum + (line.price?.amount || 0) * line.quantity, 0)
  const currency = lines[0]?.price?.currency
  const ready = email.includes('@') && lines.length && ADDRESS.every(([field, , required]) => !required || address[field].trim())

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const order = await api.adminPlaceOrder({
        email: email.trim(),
        lines: lines.map(({ variantId, quantity }) => ({ variantId, quantity })),
        shippingAddress: { ...address, country: address.country.trim().toUpperCase() },
        shippingMethod: method || undefined,
        payment,
        notify: payment === 'link' && notify,
        idempotencyKey: key,
      })
      setPlaced(order)
      push(`Order ${order.number} placed`)
    } catch (err) {
      push(err.message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const another = () => {
    setPlaced(null)
    setLines([])
    setEmail('')
    setAddress(emptyAddress())
    setKey(newKey())
  }

  if (placed) {
    return (
      <>
        <h1 className="text-display-md">Order {placed.number} placed</h1>
        <p className="mt-2 text-[13px] text-muted">
          {formatMoney(placed.total)} for {placed.customer?.email}
        </p>
        {placed.paymentUrl && (
          <div className="mt-6 max-w-2xl rounded-xs border border-line bg-surface p-5">
            <label htmlFor="payment-link" className="mb-1.5 block text-[13px] font-medium">Payment link</label>
            <div className="flex gap-2">
              <input id="payment-link" readOnly className="field font-mono text-[12px]" value={placed.paymentUrl} onFocus={(e) => e.target.select()} />
              <Button size="sm" variant="quiet" onClick={() => navigator.clipboard?.writeText(placed.paymentUrl).then(() => push('Link copied'))}>Copy</Button>
            </div>
            <p className="mt-2 text-[12px] text-faint">
              {notify ? 'Also emailed to the customer.' : 'Send it to the customer by message or email.'}
            </p>
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button to={`/admin/orders/${encodeURIComponent(placed.number)}`}>Open the order</Button>
          <Button variant="ghost" onClick={another}>Take another order</Button>
        </div>
      </>
    )
  }

  return (
    <>
      <h1 className="text-display-md">New order</h1>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
        For an order taken by phone or email. Odoo prices it, adds delivery and taxes, and checks the stock, as it
        would at checkout. A customer who already has an account gets the order on it.
      </p>

      <form onSubmit={submit} className="mt-8 grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="rounded-xs border border-line bg-surface p-5">
            <h2 className="text-[14px] font-medium">Products</h2>
            <div className="mt-4 flex gap-2">
              <label htmlFor="find-product" className="sr-only">Find a product</label>
              <input
                id="find-product"
                className="field"
                placeholder="Name or SKU"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    setSearch(typed.trim())
                  }
                }}
              />
              <Button size="sm" variant="quiet" onClick={() => setSearch(typed.trim())}>Find</Button>
            </div>
            {found.data?.items?.length === 0 && <p className="mt-3 text-[13px] text-muted">No product matches “{search}”.</p>}
            <ul className="mt-3 space-y-2">
              {(found.data?.items || []).map((product) => (
                <li key={product.id} className="rounded-xs border border-line p-3">
                  <p className="text-[13px] font-medium">{product.title}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(product.variants || []).map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        disabled={variant.available === false}
                        onClick={() => add(product, variant)}
                        className="rounded-xs border border-line px-2.5 py-1 text-[12px] transition-colors hover:border-ink disabled:opacity-40"
                      >
                        {Object.values(variant.options || {}).filter(Boolean).join(' · ') || 'Add'}
                        {variant.sku ? <span className="text-faint"> · {variant.sku}</span> : null}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>

            {lines.length > 0 && (
              <ul className="mt-5 divide-y divide-line border-t border-line">
                {lines.map((line) => (
                  <li key={line.variantId} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{line.title}</p>
                      {line.options && <p className="text-[12px] text-muted">{line.options}</p>}
                    </div>
                    <label htmlFor={`qty-${line.variantId}`} className="sr-only">Quantity of {line.title}</label>
                    <input
                      id={`qty-${line.variantId}`}
                      type="number"
                      min="0"
                      className="field w-20 tabular-nums"
                      value={line.quantity}
                      onChange={(e) => setQuantity(line.variantId, Math.max(0, Number(e.target.value) || 0))}
                    />
                    <span className="w-24 text-right text-[13px] tabular-nums">
                      {line.price ? formatMoney({ amount: line.price.amount * line.quantity, currency: line.price.currency }) : ''}
                    </span>
                    <button type="button" aria-label={`Remove ${line.title}`} onClick={() => setQuantity(line.variantId, 0)} className="text-muted hover:text-sale">
                      <Icon name="x" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {currency && (
              <p className="mt-3 text-right text-[13px] text-muted">
                Items {formatMoney({ amount: items, currency })} · delivery and taxes are added by Odoo
              </p>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-xs border border-line bg-surface p-5">
            <h2 className="text-[14px] font-medium">Customer and delivery</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="order-email" className="mb-1.5 block text-[13px] font-medium">Email</label>
                <input id="order-email" type="email" required className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {ADDRESS.map(([field, label, required]) => (
                  <div key={field} className={field === 'line1' || field === 'line2' ? 'sm:col-span-2' : ''}>
                    <label htmlFor={`order-${field}`} className="mb-1.5 block text-[13px] font-medium">{label}</label>
                    <input
                      id={`order-${field}`}
                      required={required}
                      className={`field ${field === 'country' ? 'font-mono uppercase' : ''}`}
                      maxLength={field === 'country' ? 2 : undefined}
                      placeholder={field === 'country' ? 'US' : undefined}
                      value={address[field]}
                      onChange={(e) => setAddress((current) => ({ ...current, [field]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              {methods.length > 0 && (
                <div>
                  <label htmlFor="order-method" className="mb-1.5 block text-[13px] font-medium">Delivery</label>
                  <select id="order-method" className="field" value={method} onChange={(e) => setMethod(e.target.value)}>
                    {methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xs border border-line bg-surface p-5">
            <h2 className="text-[14px] font-medium">Payment</h2>
            <div className="mt-4 space-y-3">
              {PAYMENTS.map(([value, label, note]) => (
                <label key={value} className="flex cursor-pointer gap-2.5 text-[13px]">
                  <input type="radio" name="payment" value={value} checked={payment === value} onChange={() => setPayment(value)}
                    className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]" />
                  <span>
                    <span className="font-medium">{label}</span>
                    <span className="block text-[12px] text-muted">{note}</span>
                  </span>
                </label>
              ))}
              {payment === 'link' && (
                <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
                  <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                  Email the link to the customer
                </label>
              )}
            </div>
          </section>

          <Button as="button" type="submit" full disabled={!ready || busy}>{busy ? 'Placing…' : 'Place order'}</Button>
        </div>
      </form>
    </>
  )
}
