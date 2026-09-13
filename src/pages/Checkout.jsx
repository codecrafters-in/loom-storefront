import { useCallback, useState, useEffect, useMemo, useRef } from 'react'
import Seo from '../components/Seo.jsx'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { startCheckout } from '../lib/checkout.js'
import api from '../lib/api/index.js'
import { ApiError } from '../lib/api/contracts.js'
import { paymentBody, returnUrls, runPayment, visibleMethods } from '../lib/payments/index.js'
import { driverFor } from '../lib/payments/drivers/index.js'
import { beginCheckout, purchase } from '../lib/analytics.js'
import { useStorefront } from '../store/StorefrontContext.jsx'
import Media from '../components/ui/Media.jsx'
import PaymentStep from '../components/checkout/PaymentStep.jsx'
import RegionField from '../components/address/RegionField.jsx'
import { prefillCheckout } from '../lib/prefill.js'
import { SIZES } from '../lib/images.js'
import { useCart } from '../store/CartContext.jsx'
import { useAuth } from '../store/AuthContext.jsx'
import { Button, Empty, Icon } from '../components/ui/index.jsx'
import { formatMoney } from '../lib/money.js'

/** Form fields a backend error can point at, by the name it uses. */
const FIELD_IDS = ['email', 'name', 'line1', 'line2', 'city', 'region', 'postalCode', 'country', 'phone']

/**
 * Checkout stops at the point where a payment provider would take over.
 *
 * That boundary is deliberate: card data must never touch a storefront theme.
 * In production this form collects the address, then hands off to Stripe
 * Elements, Razorpay or whatever the merchant uses, and the order is created
 * server-side once payment confirms.
 *
 * In `payments` mode the hand-off happens on this page: the backend lists the
 * methods it can take for this cart, and the gateway's own form (or modal)
 * takes the card. See lib/payments.
 */
export default function Checkout() {
  const { cart, refresh } = useCart()
  const { customer } = useAuth()
  const config = useStorefront()
  const COUNTRIES = config.commerce?.countries || [['US', 'United States']]
  const SHIPPING = config.commerce?.shippingMethods || []
  const payments = config.checkout?.mode === 'payments'
  const navigate = useNavigate()
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [method, setMethod] = useState(config.commerce?.shippingMethods?.[0]?.id || 'standard')

  // A guest starts in the store's own country rather than whichever sorts first.
  const localeCountry = (config.pricing?.locale || '').split('-')[1]
  const fallbackCountry = COUNTRIES.find(([code]) => code === localeCountry)?.[0] || COUNTRIES[0]?.[0] || 'US'
  const [form, setForm] = useState(() => prefillCheckout({
    email: '', name: '', line1: '', line2: '', city: '', region: '', postalCode: '', country: fallbackCountry, phone: '',
  }, customer))

  // Payments mode only.
  const [stage, setStage] = useState('details')
  const [options, setOptions] = useState(null)
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [optionsError, setOptionsError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [demoInput, setDemoInput] = useState({ cardNumber: '4242 4242 4242 4242', outcome: 'done' })
  const [notice, setNotice] = useState(location.state?.paymentMessage || null)
  const [waiting, setWaiting] = useState(null)
  const errorRef = useRef(null)
  const latest = useRef({ form, method, cart, refresh })
  latest.current = { form, method, cart, refresh }
  const optionsRequest = useRef({ seq: 0, key: '' })

  // Fields the shopper has typed into — an account that loads late never overwrites them.
  const touched = useRef(new Set())
  const set = (k) => (e) => {
    const value = e.target.value
    touched.current.add(k)
    setForm((f) => ({ ...f, [k]: value }))
  }

  // A refreshed checkout renders before the account has loaded, so the form
  // starts empty. Fill it with the default address when the customer arrives.
  const prefilledFor = useRef(customer?.id || null)
  useEffect(() => {
    if (!customer || prefilledFor.current === customer.id) return
    prefilledFor.current = customer.id
    setForm((f) => prefillCheckout(f, customer, touched.current))
  }, [customer])
  // Stable, because the state field settles its value in an effect that depends on it.
  const setRegion = useCallback((e) => {
    const value = e.target.value
    setForm((f) => ({ ...f, region: value }))
  }, [])
  const methods = useMemo(() => visibleMethods(options), [options])

  // Above the early returns: a hook after one runs in a different order on the
  // render where it fires. Once per arrival at the form, not per render — the funnel step is reaching
  // checkout, and reporting it four times makes the drop-off look invented.
  useEffect(() => {
    if (cart?.lines?.length) beginCheckout(cart)
  }, [cart?.lines?.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Send focus to what went wrong: the field the backend named, or the message.
  useEffect(() => {
    if (!error) return
    const fields = error.detail?.detail?.fields || error.detail?.fields || []
    const field = error.code === 'email_required' ? 'email' : fields.find((f) => FIELD_IDS.includes(f))
    const target = (field && document.getElementById(field)) || errorRef.current
    target?.focus()
  }, [error])

  /**
   * What can pay for this cart depends on where it is going and how, so the
   * options follow the country and the delivery method. Other address edits do
   * not change them, and the pay request sends the whole form anyway.
   */
  const loadOptions = async () => {
    const { form: values, method: shipping, cart: current, refresh: reload } = latest.current
    const request = (optionsRequest.current = { seq: optionsRequest.current.seq + 1, key: `${values.country}|${shipping}` })
    setOptionsLoading(true)
    setOptionsError(null)
    try {
      const { email, ...address } = values
      const next = await api.getPaymentOptions(current?.id, {
        email,
        shippingAddress: address,
        shippingMethod: shipping,
        currency: current?.currency,
      })
      if (request !== optionsRequest.current) return
      setOptions(next)
      const list = visibleMethods(next)
      setSelected((key) => (list.some((m) => m.key === key) ? key : list[0]?.key || null))
      // The backend applied the address and delivery, so the totals may have moved.
      reload().catch(() => {})
    } catch (err) {
      if (request !== optionsRequest.current) return
      setOptions(null)
      setOptionsError(err)
    } finally {
      if (request === optionsRequest.current) setOptionsLoading(false)
    }
  }

  useEffect(() => {
    if (!payments || stage !== 'payment') return undefined
    if (optionsRequest.current.key === `${form.country}|${method}`) return undefined
    const first = !optionsRequest.current.key
    const timer = setTimeout(loadOptions, first ? 0 : 500)
    return () => clearTimeout(timer)
  }, [payments, stage, form.country, method])

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

  const fail = (err) => {
    setError(err)
    setBusy(false)
  }

  const finish = async (payment) => {
    await refresh().catch(() => {})
    let order = null
    try {
      order = await api.getOrder(payment.order.id)
    } catch {
      /* the confirmation page fetches it itself */
    }
    if (order) purchase(order)
    navigate(`/order/${payment.order.id}`, order ? { state: { order } } : undefined)
  }

  const pay = async () => {
    const chosen = methods.find((m) => m.key === selected)
    if (!chosen) {
      fail(new ApiError('Choose how you would like to pay.', { code: 'payment_method_required' }))
      return
    }
    const driver = chosen.saved ? null : driverFor(chosen.provider)
    const problem = driver?.validate?.(demoInput)
    if (problem) {
      fail(new ApiError(problem, { code: 'invalid_card' }))
      return
    }

    setBusy(true)
    setError(null)
    setNotice(null)
    setWaiting(null)
    try {
      const { email, ...address } = form
      const urls = returnUrls(config.checkout, window.location.origin)
      const created = await api.createPayment(cart.id, paymentBody({
        email,
        shippingAddress: address,
        shippingMethod: method,
        currency: cart.currency,
        method: chosen,
        expectedTotal: options?.amount?.amount,
        ...urls,
      }))
      const result = await runPayment(created, { api, input: driver?.needsInput ? demoInput : undefined })

      if (result.kind === 'redirect') {
        // Hand the browser to the gateway's own page. Nothing after this runs.
        window.location.assign(result.url)
        return
      }
      if (result.kind === 'order') {
        await finish(result.payment)
        return
      }
      if (result.kind === 'timeout') {
        setWaiting(result.payment)
        setBusy(false)
        return
      }
      fail(new ApiError(result.message, { code: `payment_${result.payment.status}` }))
    } catch (err) {
      if (err.code === 'payment_cancelled') {
        // Closing a payment window is a normal thing to do, not a failure.
        setNotice(err.message)
        setBusy(false)
        return
      }
      if (err.code === 'cart_changed') loadOptions()
      fail(err)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (payments) {
      if (stage === 'payment') await pay()
      else setStage('payment')
      return
    }
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
      purchase(result.order)
      navigate(`/order/${result.order.id}`, { state: { order: result.order } })
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  const payTotal = options?.amount || cart.total
  const buttonLabel = busy
    ? payments && stage === 'payment' ? 'Processing payment…' : 'Just a moment…'
    : payments
      ? stage === 'payment' ? `Pay · ${formatMoney(payTotal)}` : 'Continue to payment'
      : config.checkout?.mode === 'redirect'
        ? `Continue to payment · ${formatMoney(cart.total)}`
        : `Place order · ${formatMoney(cart.total)}`

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
            <RegionField id="region" country={form.country} value={form.region} onChange={setRegion} />
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

        {payments && stage === 'payment' && (
          <PaymentStep
            methods={methods}
            selected={selected}
            onSelect={setSelected}
            loading={optionsLoading}
            error={optionsError}
            disabled={busy}
            demoInput={demoInput}
            onDemoInput={setDemoInput}
          />
        )}

        {notice && (
          <p role="status" className="mt-6 flex items-start gap-2.5 rounded-xs border border-line bg-surface p-3.5 text-[13px] text-muted">
            <Icon name="info" size={16} className="mt-px shrink-0 text-accent" />
            <span>{notice}</span>
          </p>
        )}

        {waiting && (
          <div role="status" className="mt-6 rounded-xs border border-line bg-surface p-3.5 text-[13px] leading-relaxed text-muted">
            We have not heard back from the payment provider yet. If the payment went through, we will email you a
            confirmation — there is no need to pay again.
            {waiting.order && (
              <Link to={`/order/${waiting.order.id}`} className="ml-1 text-ink link-underline">View your order</Link>
            )}
          </div>
        )}

        {error && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="mt-6 rounded-xs border border-sale/25 bg-surface p-3.5 text-[13px] text-sale outline-none">
            {error.message}
          </p>
        )}

        <Button
          as="button"
          type="submit"
          size="lg"
          full
          className="mt-8"
          disabled={busy || (payments && stage === 'payment' && (optionsLoading || !selected))}
        >
          {buttonLabel}
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
                    <Media sizes={SIZES.thumb} src={l.image?.url} type={l.image?.type} alt="" loading="lazy" className="h-full w-full object-cover" />
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
