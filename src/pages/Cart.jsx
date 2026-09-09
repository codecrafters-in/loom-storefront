import { useState } from 'react'
import Seo from '../components/Seo.jsx'
import { Link } from 'react-router-dom'
import { useCart } from '../store/CartContext.jsx'
import { Button, Empty, Icon, QuantityStepper, Skeleton } from '../components/ui/index.jsx'
import Promises from '../components/layout/Promises.jsx'
import { formatMoney } from '../lib/money.js'
import { useStorefront } from '../store/StorefrontContext.jsx'
import Media from '../components/ui/Media.jsx'

export default function Cart() {
  const { cart, loading, busy, update, remove, applyDiscount } = useCart()
  const [code, setCode] = useState('')
  const config = useStorefront()

  if (loading) {
    return (
      <div className="wrap grid gap-10 py-14 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (!cart?.lines.length) {
    return (
      <>
        <Empty
          icon="bag"
          title="Your bag is empty"
          body="Have a look at what is new, or pick up something you saved earlier."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button to="/shop" size="lg">Shop everything</Button>
              <Button to="/wishlist" variant="outline" size="lg">Saved items</Button>
            </div>
          }
        />
        <Promises />
      </>
    )
  }

  return (
    <>
      <Seo title={'Your bag'} noindex />
      <div className="wrap py-10">
        <h1 className="text-display-lg">Your bag</h1>
        <p className="mt-3 text-[15px] text-muted">
          {cart.lines.length} {cart.lines.length === 1 ? 'item' : 'items'}
        </p>
      </div>

      <div className="wrap grid items-start gap-12 pb-20 lg:grid-cols-[1fr_22rem]">
        <ul className="divide-y divide-line border-y border-line">
          {cart.lines.map((line) => (
            <li key={line.id} className="flex gap-5 py-6">
              <Link to={`/product/${line.productSlug}`} className="w-24 shrink-0 sm:w-28">
                <div className="shot rounded-xs">
                  <Media src={line.image?.url} type={line.image?.type} alt={line.image?.alt || line.title} loading="lazy" className="h-full w-full object-cover" />
                </div>
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <Link to={`/product/${line.productSlug}`} className="text-[15px] font-medium">
                      {line.title}
                    </Link>
                    <p className="mt-1 text-[13px] text-faint">
                      {Object.entries(line.options).map(([k, v]) => `${k}: ${v}`).join('  ·  ')}
                    </p>
                  </div>
                  <span className="shrink-0 text-[15px] tabular-nums">{formatMoney(line.lineTotal)}</span>
                </div>
                <div className="mt-auto flex items-center justify-between pt-4">
                  <QuantityStepper value={line.quantity} onChange={(q) => update(line.id, q)} disabled={busy} />
                  <button
                    type="button"
                    onClick={() => remove(line.id)}
                    className="inline-flex items-center gap-1.5 text-[13px] text-faint transition-colors hover:text-sale"
                  >
                    <Icon name="trash" size={14} /> Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="lg:sticky lg:top-24">
          <div className="rounded-xs border border-line bg-surface p-6">
            <h2 className="font-display text-lg">Summary</h2>

            {cart.freeShippingRemaining?.amount > 0 && (
              <div className="mt-5 rounded-xs bg-accent-soft/60 p-3.5">
                <p className="text-[13px] text-accent">
                  Add {formatMoney(cart.freeShippingRemaining)} for free shipping
                </p>
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full bg-accent transition-[width] duration-500"
                    style={{
                      width: `${Math.min(100, (cart.subtotal.amount / cart.freeShippingThreshold.amount) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {config.features?.discountCodes !== false && (
            <>
            <form
              onSubmit={(e) => { e.preventDefault(); applyDiscount(code).catch(() => {}) }}
              className="mt-5 flex gap-2"
            >
              <label className="sr-only" htmlFor="discount">Discount code</label>
              <input
                id="discount"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Discount code"
                className="field h-10 text-[13px]"
              />
              <Button as="button" type="submit" variant="quiet" size="sm" disabled={busy} className="shrink-0 h-10">
                Apply
              </Button>
            </form>
            {cart.discountCode && (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-good">
                <Icon name="check" size={13} /> {cart.discountCode.code} — {cart.discountCode.label}
              </p>
            )}
            <p className="mt-2 text-[11px] text-faint">Demo codes: LOOM10, WELCOME15, FREESHIP</p>
            </>
            )}

            <dl className="mt-6 space-y-2.5 border-t border-line pt-5 text-sm">
              <Row label="Subtotal" value={formatMoney(cart.subtotal)} />
              {cart.discount.amount > 0 && (
                <Row label={cart.discountCode?.label || 'Discount'} value={`−${formatMoney(cart.discount)}`} tone="sale" />
              )}
              <Row label="Shipping" value={cart.shipping.amount === 0 ? 'Free' : formatMoney(cart.shipping)} />
              <Row label="Estimated tax" value={formatMoney(cart.tax)} />
            </dl>
            {config.pricing?.showTaxNote && config.pricing?.taxNote && (
              <p className="mt-2 text-[11px] text-faint">{config.pricing.taxNote}</p>
            )}
            <p className="mt-4 flex justify-between border-t border-line pt-4 text-lg">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(cart.total)}</span>
            </p>

            <Button to="/checkout" full size="lg" className="mt-6">Checkout</Button>
            <Link to="/shop" className="mt-4 block text-center text-[13px] text-muted link-underline">
              Continue shopping
            </Link>
          </div>
        </aside>
      </div>

      <Promises />
    </>
  )
}

function Row({ label, value, tone }) {
  return (
    <div className="flex justify-between">
      <dt className={tone === 'sale' ? 'text-sale' : 'text-muted'}>{label}</dt>
      <dd className={`tabular-nums ${tone === 'sale' ? 'text-sale' : ''}`}>{value}</dd>
    </div>
  )
}
