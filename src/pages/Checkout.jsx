import { useState } from 'react'
import Seo from '../components/Seo.jsx'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { startCheckout } from '../lib/checkout.js'
import { useStorefront } from '../store/StorefrontContext.jsx'
import Media from '../components/ui/Media.jsx'
import { useCart } from '../store/CartContext.jsx'
import { useAuth } from '../store/AuthContext.jsx'
import { Button, Empty, Icon } from '../components/ui/index.jsx'
import { formatMoney } from '../lib/money.js'

/**
 * Checkout stops at the point where a payment provider would take over.
 *
 * That boundary is deliberate: card data must never touch a storefront theme.
 * In production this form collects the address, then hands off to Stripe
 * Elements, Razorpay or whatever the merchant uses, and the order is created
 * server-side once payment confirms.
 */
export default function Checkout() {
  const { cart, refresh } = useCart()
  const { customer } = useAuth()
  const config = useStorefront()
  const COUNTRIES = config.commerce?.countries || [['US', 'United States']]
  const SHIPPING = config.commerce?.shippingMethods || []
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [method, setMethod] = useState(config.commerce?.shippingMethods?.[0]?.id || 'standard')

  const defaultAddress = customer?.addresses?.find((a) => a.isDefault) || customer?.addresses?.[0]
  const [form, setForm] = useState({
    email: customer?.email || '',
    name: defaultAddress?.name || '',
    line1: defaultAddress?.line1 || '',
    line2: defaultAddress?.line2 || '',
    city: defaultAddress?.city || '',
    region: defaultAddress?.region || '',
    postalCode: defaultAddress?.postalCode || '',
    country: defaultAddress?.country || 'US',
    phone: defaultAddress?.phone || '',
  })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // Guest checkout is the default. A store that requires an account sends the
  // shopper to sign in and back, rather than failing at submit.
  if (config.checkout?.requireAccount && !customer) {
    return <Navigate to="/login" state={{ from: '/checkout' }} replace />
  }

  if (!cart?.lines.length) {
    return (
      <Empty
        icon="bag"
        title="Nothing to check out"
        body="Your bag is empty."
        action={<Button to="/shop" size="lg">Shop everything</Button>}
      />
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { email, ...address } = form
      const result = await startCheckout({
        config,
        cart,
        email,
        shippingAddress: address,
        shippingMethod: method,
      })
      if (result.kind === 'redirect') {
        // Hand the browser to the payment provider. Nothing after this runs.
        window.location.assign(result.url)
        return
      }
      await refresh()
      navigate(`/order/${result.order.id}`, { state: { order: result.order } })
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <>
      <Seo title={'Checkout'} noindex />
      <div className="wrap grid items-start gap-12 py-10 pb-20 lg:grid-cols-[1fr_22rem]">
      <form onSubmit={submit} className="max-w-xl">
        <h1 className="text-display-lg">Checkout</h1>

        {config.checkout?.mode === 'demo' && (
          <p className="mt-5 flex items-start gap-2.5 rounded-xs border border-line bg-surface p-3.5 text-[13px] leading-relaxed text-muted">
            <Icon name="info" size={16} className="mt-px shrink-0 text-accent" />
            <span>
              This is a demo. No payment is taken and no card details are collected — a real build
              hands off to a payment provider at this point, so card data never touches the storefront.
            </span>
          </p>
        )}

        <Section title="Contact">
          <Field label="Email" id="email" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
        </Section>

        <Section title="Shipping address">
          <Field label="Full name" id="name" required value={form.name} onChange={set('name')} autoComplete="name" />
          <Field label="Address" id="line1" required value={form.line1} onChange={set('line1')} autoComplete="address-line1" />
          <Field label="Apartment, suite (optional)" id="line2" value={form.line2} onChange={set('line2')} autoComplete="address-line2" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City" id="city" required value={form.city} onChange={set('city')} autoComplete="address-level2" />
            <Field label="State / region" id="region" value={form.region} onChange={set('region')} autoComplete="address-level1" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Postcode" id="postalCode" required value={form.postalCode} onChange={set('postalCode')} autoComplete="postal-code" />
            <div>
              <label htmlFor="country" className="mb-1.5 block text-[13px] font-medium">Country</label>
              <select id="country" value={form.country} onChange={set('country')} className="field" autoComplete="country">
                {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </div>
          </div>
          {config.checkout?.collectPhone !== false && (
            <Field label="Phone (for delivery updates)" id="phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
          )}
        </Section>

        <Section title="Delivery">
          <div className="space-y-2.5">
            {SHIPPING.map((s) => (
              <label
                key={s.id}
                className={`flex cursor-pointer items-center gap-3.5 rounded-xs border p-4 transition-colors ${method === s.id ? 'border-ink' : 'border-line hover:border-muted'}`}
              >
                <input
                  type="radio"
                  name="shipping"
                  value={s.id}
                  checked={method === s.id}
                  onChange={() => setMethod(s.id)}
                  className="h-4 w-4 accent-[rgb(var(--accent))]"
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block text-[13px] text-faint">{s.note}</span>
                </span>
                <span className="text-sm tabular-nums">
                  {cart.shipping.amount === 0 && s.id === 'standard'
                    ? 'Free'
                    : formatMoney({ amount: s.price, currency: cart.currency })}
                </span>
              </label>
            ))}
          </div>
        </Section>

        {error && (
          <p className="mt-6 rounded-xs border border-sale/25 bg-surface p-3.5 text-[13px] text-sale">
            {error.message}
          </p>
        )}

        <Button as="button" type="submit" size="lg" full className="mt-8" disabled={busy}>
          {busy
            ? 'Just a moment…'
            : config.checkout?.mode === 'redirect'
              ? `Continue to payment · ${formatMoney(cart.total)}`
              : `Place order · ${formatMoney(cart.total)}`}
        </Button>
        {config.checkout?.termsUrl && (
          <p className="mt-4 text-center text-[12px] leading-relaxed text-faint">
            By placing this order you agree to our{' '}
            <Link to={config.checkout.termsUrl} className="link-underline text-muted">terms</Link>.
          </p>
        )}
        <Link to="/cart" className="mt-4 block text-center text-[13px] text-muted link-underline">
          Back to bag
        </Link>
      </form>

      <aside className="lg:sticky lg:top-24">
        <div className="rounded-xs border border-line bg-surface p-6">
          <h2 className="font-display text-lg">Order</h2>
          <ul className="mt-5 space-y-4">
            {cart.lines.map((l) => (
              <li key={l.id} className="flex gap-3.5">
                <div className="relative w-14 shrink-0">
                  <div className="shot rounded-xs">
                    <Media src={l.image?.url} type={l.image?.type} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </div>
                  <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 font-mono text-[10px] text-page tabular-nums">
                    {l.quantity}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium leading-snug">{l.title}</p>
                  <p className="mt-0.5 text-[12px] text-faint">
                    {Object.values(l.options).join(' · ')}
                  </p>
                </div>
                <span className="text-[13px] tabular-nums">{formatMoney(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-6 space-y-2.5 border-t border-line pt-5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatMoney(cart.subtotal)}</dd></div>
            {cart.discount.amount > 0 && (
              <div className="flex justify-between text-sale"><dt>{cart.discountCode?.label}</dt><dd className="tabular-nums">−{formatMoney(cart.discount)}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-muted">Shipping</dt><dd className="tabular-nums">{cart.shipping.amount === 0 ? 'Free' : formatMoney(cart.shipping)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd className="tabular-nums">{formatMoney(cart.tax)}</dd></div>
          </dl>
          <p className="mt-4 flex justify-between border-t border-line pt-4 text-lg">
            <span>Total</span><span className="tabular-nums">{formatMoney(cart.total)}</span>
          </p>
        </div>
      </aside>
      </div>
    </>
  )
}

function Section({ title, children }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-[13px] font-medium uppercase tracking-[0.08em]">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({ label, id, ...rest }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">{label}</label>
      <input id={id} className="field" {...rest} />
    </div>
  )
}
