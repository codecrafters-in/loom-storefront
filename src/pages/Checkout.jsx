import { lazy, Suspense, useCallback, useState, useEffect, useMemo, useRef } from 'react'
import Seo from '../components/Seo.jsx'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { startCheckout } from '../lib/checkout.js'
import api from '../lib/api/index.js'
import { ApiError } from '../lib/api/contracts.js'
import { driverInput, paymentBody, payableTotal, returnUrls, runPayment, visibleMethods } from '../lib/payments/index.js'
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
import { nestLines } from '../lib/cart-lines.js'
import LineDetails from '../components/cart/LineDetails.jsx'
import { isMock } from '../lib/config.js'

const ExpressCheckout = lazy(() => import('../components/checkout/ExpressCheckout.jsx'))

/** Form fields a backend error can point at, by the name it uses. */
const FIELD_IDS = ['email', 'name', 'line1', 'line2', 'city', 'region', 'postalCode', 'country', 'phone', 'accept_terms', 'delivery_slot']

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
  // A guest starts in the store's own country rather than whichever sorts first.
  const localeCountry = (config.pricing?.locale || '').split('-')[1]
  const fallbackCountry = COUNTRIES.find(([code]) => code === localeCountry)?.[0] || COUNTRIES[0]?.[0] || 'US'
  const payments = config.checkout?.mode === 'payments'
  const navigate = useNavigate()
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [method, setMethod] = useState(config.commerce?.shippingMethods?.[0]?.id || 'standard')
  // Delivery methods priced for the address as it is typed; until then (and in the demo), the store's list.
  const [shippingOptions, setShippingOptions] = useState(null)
  // For the chosen method, when the store offers them (live stores only): delivery slots, and shops to collect from.
  const chosenShipping = SHIPPING.find((m) => m.id === method)
  const [slots, setSlots] = useState(null)
  const [deliverySlot, setDeliverySlot] = useState('')
  const [shops, setShops] = useState(null)
  // Billing: the delivery address unless the shopper gives another; a business adds its company name and tax ID.
  const [billingSame, setBillingSame] = useState(true)
  const [billing, setBilling] = useState({ name: '', line1: '', line2: '', city: '', region: '', postalCode: '', country: fallbackCountry })
  const [business, setBusiness] = useState({ on: Boolean(customer?.company || customer?.vat), company: customer?.company || '', vat: customer?.vat || '' })
  // Delivery instructions, a gift message and wrapping, and the terms box, as far as the store's settings offer them.
  const [extras, setExtras] = useState({ note: '', giftMessage: '', giftWrap: false, acceptTerms: false })
  const setExtra = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setExtras((x) => ({ ...x, [key]: value }))
  }
  // Under the store's minimum order Odoo refuses checkout, so the form says so before anyone fills it in.
  const short = cart?.minimumOrder?.remaining?.amount > 0
  const billingFields = () => ({
    ...(billingSame ? {} : { billingAddress: billing }),
    ...(business.on ? { companyName: business.company, vat: business.vat } : {}),
    ...(extras.note.trim() ? { note: extras.note.trim() } : {}),
    ...(extras.giftMessage.trim() ? { giftMessage: extras.giftMessage.trim() } : {}),
    ...(extras.giftWrap ? { giftWrap: true } : {}),
    ...(extras.acceptTerms ? { acceptTerms: true } : {}),
    ...(chosenShipping?.slots && deliverySlot ? { deliverySlot } : {}),
  })

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
  const [saveMethod, setSaveMethod] = useState(false)
  // A gateway form mounted on the page (Stripe's card fields), for Pay.
  const mounted = useRef(null)
  const [notice, setNotice] = useState(location.state?.paymentMessage || null)
  const [waiting, setWaiting] = useState(null)
  const errorRef = useRef(null)
  const latest = useRef({ form, method, cart, refresh, extra: {} })
  latest.current = { form, method, cart, refresh, extra: billingFields() }
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
  const setBillingRegion = useCallback((e) => {
    const value = e.target.value
    setBilling((b) => ({ ...b, region: value }))
  }, [])
  const setBillingField = (key) => (e) => {
    const value = e.target.value
    setBilling((b) => ({ ...b, [key]: value }))
  }
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

  // The backend rates each delivery method for the address and applies the chosen one, so the bag's totals follow.
  useEffect(() => {
    if (isMock || !cart?.id || !form.country) return undefined
    const timer = setTimeout(async () => {
      try {
        const result = await api.getShippingOptions(cart.id, {
          address: { city: form.city, region: form.region, postalCode: form.postalCode, country: form.country },
          method: shippingOptions?.some((o) => o.id === method) ? method : undefined,
        })
        setShippingOptions(result.options)
        if (result.selected && result.selected !== method) setMethod(result.selected)
        refresh().catch(() => {})
      } catch {
        setShippingOptions(null)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [cart?.id, form.country, form.region, form.postalCode, method]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isMock || !cart?.id || !chosenShipping?.slots) return undefined
    let alive = true
    api
      .getDeliverySlots(cart.id, method)
      .then((result) => {
        if (!alive) return
        setSlots(result)
        setDeliverySlot((current) => (result.slots.some((slot) => slot.id === current) ? current : result.selected || ''))
      })
      .catch(() => alive && setSlots(null))
    return () => {
      alive = false
    }
  }, [cart?.id, method, chosenShipping?.slots])

  // Shops nearest the postcode as it is typed.
  useEffect(() => {
    if (isMock || !cart?.id || !chosenShipping?.pickup) return undefined
    let alive = true
    const timer = setTimeout(() => {
      api
        .getPickupLocations(cart.id, { method, postalCode: form.postalCode, country: form.country })
        .then((result) => alive && setShops(result.locations))
        .catch(() => alive && setShops([]))
    }, 400)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [cart?.id, method, chosenShipping?.pickup, form.postalCode, form.country])

  const chooseShop = async (locationId) => {
    setError(null)
    try {
      await api.setPickupLocation(cart.id, { method, locationId })
      await refresh()
    } catch (err) {
      setError(err)
    }
  }

  /**
   * What can pay for this cart depends on where it is going and how, so the
   * options follow the country and the delivery method. Other address edits do
   * not change them, and the pay request sends the whole form anyway.
   */
  const loadOptions = async () => {
    const { form: values, method: shipping, cart: current, refresh: reload, extra } = latest.current
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
        ...extra,
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
    setBusy(true)
    setError(null)
    setNotice(null)
    setWaiting(null)
    const { input, problem } = await driverInput(driver, { demoInput, mounted: mounted.current })
    if (problem) {
      fail(new ApiError(problem, { code: 'invalid_card' }))
      return
    }
    try {
      const { email, ...address } = form
      const urls = returnUrls(config.checkout, window.location.origin)
      const created = await api.createPayment(cart.id, paymentBody({
        email,
        shippingAddress: address,
        shippingMethod: method,
        currency: cart.currency,
        method: chosen,
        saveMethod: saveMethod && chosen.canSave,
        expectedTotal: options?.amount?.amount,
        ...urls,
        ...billingFields(),
      }))
      const result = await runPayment(created, { api, input })

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
        ...billingFields(),
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

  const chosenMethod = payments && stage === 'payment' ? methods.find((m) => m.key === selected) : null
  const payTotal = payableTotal(options?.amount || cart.total, chosenMethod)
  const buttonLabel = busy
    ? payments && stage === 'payment' ? 'Processing payment…' : 'Just a moment…'
    : payments
      ? stage === 'payment' ? `${chosenMethod?.flow === 'offline' ? 'Place order' : 'Pay'} · ${formatMoney(payTotal)}` : 'Continue to payment'
      : config.checkout?.mode === 'redirect'
        ? `Continue to payment · ${formatMoney(cart.total)}`
        : `Place order · ${formatMoney(cart.total)}`

  return (
    <>
      <Seo title={'Checkout'} noindex />
      <div className="wrap grid items-start gap-12 py-10 pb-20 lg:grid-cols-[1fr_22rem]">
      <form onSubmit={submit} className="max-w-xl">
        <h1 className="text-display-lg">Checkout</h1>

        {/* A wallet sheet has no terms box and skips the minimum order: those orders use the form. */}
        {payments && !isMock && !config.checkout?.termsRequired && !short && (
          <Suspense fallback={null}>
            <ExpressCheckout className="mt-6" />
          </Suspense>
        )}

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
          {!customer && config.features?.accounts !== false && (
            <p className="text-[13px] text-muted">
              Have an account?{' '}
              <Link to="/login" state={{ from: '/checkout' }} className="text-ink link-underline">Sign in</Link>
              {' '}for your saved addresses — your bag comes with you.
            </p>
          )}
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
            <Field
              label={config.checkout?.phoneRequired === false ? 'Phone (optional, for delivery updates)' : 'Phone (for delivery updates)'}
              id="phone"
              type="tel"
              required={config.checkout?.phoneRequired === true}
              value={form.phone}
              onChange={set('phone')}
              autoComplete="tel"
            />
          )}
        </Section>

        <Section title="Billing">
          <label className="flex items-center gap-2.5 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={billingSame}
              onChange={(e) => setBillingSame(e.target.checked)}
              className="h-4 w-4 accent-[rgb(var(--accent))]"
            />
            Billing address is the same as the delivery address
          </label>
          {!billingSame && (
            <>
              <Field label="Name on the invoice" id="billing-name" required value={billing.name} onChange={setBillingField('name')} autoComplete="billing name" />
              <Field label="Address" id="billing-line1" required value={billing.line1} onChange={setBillingField('line1')} autoComplete="billing address-line1" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="City" id="billing-city" required value={billing.city} onChange={setBillingField('city')} autoComplete="billing address-level2" />
                <RegionField id="billing-region" country={billing.country} value={billing.region} onChange={setBillingRegion} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Postcode" id="billing-postalCode" value={billing.postalCode} onChange={setBillingField('postalCode')} autoComplete="billing postal-code" />
                <div>
                  <label htmlFor="billing-country" className="mb-1.5 block text-[13px] font-medium">Country</label>
                  <select id="billing-country" value={billing.country} onChange={setBillingField('country')} className="field" autoComplete="billing country">
                    {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
          <label className="flex items-center gap-2.5 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={business.on}
              onChange={(e) => {
                const on = e.target.checked
                setBusiness((b) => ({ ...b, on }))
              }}
              className="h-4 w-4 accent-[rgb(var(--accent))]"
            />
            I’m buying for a business
          </label>
          {business.on && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Company name"
                id="company"
                value={business.company}
                onChange={(e) => {
                  const company = e.target.value
                  setBusiness((b) => ({ ...b, company }))
                }}
                autoComplete="organization"
              />
              <Field
                label="Tax ID (VAT, GSTIN…)"
                id="vat"
                value={business.vat}
                onChange={(e) => {
                  const vat = e.target.value
                  setBusiness((b) => ({ ...b, vat }))
                }}
              />
            </div>
          )}
        </Section>

        <Section title="Delivery">
          {shippingOptions?.length === 0 && (
            <p role="status" className="rounded-xs border border-line bg-surface p-3.5 text-[13px] text-muted">
              We don’t deliver to this address yet. Check the country and postcode.
            </p>
          )}
          <div className="space-y-2.5">
            {(shippingOptions ? shippingOptions.map((o) => ({ id: o.id, label: o.label, note: o.note, price: o.amount })) : SHIPPING).map((s) => (
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
                  {(shippingOptions ? s.price === 0 : cart.shipping.amount === 0 && s.id === 'standard')
                    ? 'Free'
                    : formatMoney({ amount: s.price, currency: cart.currency })}
                </span>
              </label>
            ))}
          </div>

          {chosenShipping?.pickup && !isMock && (
            <fieldset className="space-y-2.5">
              <legend className="mb-2 text-[13px] font-medium">Collect from</legend>
              {shops === null && <p className="text-[13px] text-faint">Finding shops near you…</p>}
              {shops?.length === 0 && (
                <p role="status" className="text-[13px] text-muted">No shop can take this order for collection. Choose delivery instead.</p>
              )}
              {shops?.map((shop) => (
                <label
                  key={shop.id}
                  className={`flex cursor-pointer items-start gap-3.5 rounded-xs border p-4 transition-colors ${cart.pickupLocation?.id === shop.id ? 'border-ink' : 'border-line hover:border-muted'}`}
                >
                  <input
                    type="radio"
                    name="pickup"
                    value={shop.id}
                    checked={cart.pickupLocation?.id === shop.id}
                    onChange={() => chooseShop(shop.id)}
                    disabled={busy || !shop.inStock}
                    className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{shop.name}</span>
                    <span className="block text-[13px] text-faint">{[shop.street, shop.city, shop.postalCode].filter(Boolean).join(', ')}</span>
                    {!shop.inStock && <span className="block text-[13px] text-sale">Not everything in your bag is in stock here</span>}
                  </span>
                  {shop.distanceKm != null && <span className="text-[13px] tabular-nums text-faint">{shop.distanceKm} km</span>}
                </label>
              ))}
            </fieldset>
          )}

          {chosenShipping?.slots && slots?.required && (
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium">Delivery slot</legend>
              {slots.slots.length === 0 ? (
                <p role="status" className="text-[13px] text-muted">No delivery slots are free right now. Choose another delivery option.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {slots.slots.map((slot, i) => (
                    <label
                      key={slot.id}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-xs border p-3 text-[13px] transition-colors ${deliverySlot === slot.id ? 'border-ink' : 'border-line hover:border-muted'}`}
                    >
                      <input
                        id={i === 0 ? 'delivery_slot' : undefined}
                        type="radio"
                        name="delivery_slot"
                        required
                        value={slot.id}
                        checked={deliverySlot === slot.id}
                        onChange={() => setDeliverySlot(slot.id)}
                        className="h-4 w-4 accent-[rgb(var(--accent))]"
                      />
                      <span>
                        <span className="block font-medium">{slotDay(slot.date)}</span>
                        <span className="block text-faint">{slot.from}–{slot.to}{slot.label ? ` · ${slot.label}` : ''}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )}
        </Section>

        {(config.checkout?.orderNote || config.checkout?.giftMessage || config.checkout?.giftWrap) && (
          <Section title="Notes & gifts">
            {config.checkout?.orderNote && (
              <div>
                <label htmlFor="note" className="mb-1.5 block text-[13px] font-medium">Delivery instructions <span className="font-normal text-faint">(optional)</span></label>
                <textarea id="note" rows={2} maxLength={1000} className="field" value={extras.note} onChange={setExtra('note')} placeholder="Gate code, a safe place to leave it…" />
              </div>
            )}
            {config.checkout?.giftWrap && (
              <label className="flex items-center gap-2.5 text-[13px] text-muted">
                <input type="checkbox" checked={extras.giftWrap} onChange={setExtra('giftWrap')} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                Gift wrap this order
                {config.checkout.giftWrap.price > 0 && <span className="tabular-nums">(+{formatMoney({ amount: config.checkout.giftWrap.price, currency: cart.currency })})</span>}
              </label>
            )}
            {config.checkout?.giftMessage && (
              <div>
                <label htmlFor="giftMessage" className="mb-1.5 block text-[13px] font-medium">Gift message <span className="font-normal text-faint">(optional)</span></label>
                <textarea id="giftMessage" rows={2} maxLength={500} className="field" value={extras.giftMessage} onChange={setExtra('giftMessage')} />
              </div>
            )}
          </Section>
        )}

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
            saveMethod={saveMethod}
            onSaveMethod={setSaveMethod}
            onDriverReady={(handle) => { mounted.current = handle }}
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

        {config.checkout?.termsRequired && (
          <label className="mt-8 flex items-start gap-2.5 text-[13px] text-muted">
            <input
              id="accept_terms"
              type="checkbox"
              required
              checked={extras.acceptTerms}
              onChange={setExtra('acceptTerms')}
              className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]"
            />
            <span>
              I accept the{' '}
              {config.checkout.termsUrl ? <Link to={config.checkout.termsUrl} className="link-underline text-ink">terms</Link> : 'terms'}.
            </span>
          </label>
        )}

        {short && (
          <p role="status" className="mt-6 rounded-xs border border-line bg-surface p-3.5 text-[13px] text-muted">
            Orders start at {formatMoney(cart.minimumOrder.amount)}. Add {formatMoney(cart.minimumOrder.remaining)} more to check out.
          </p>
        )}

        <Button
          as="button"
          type="submit"
          size="lg"
          full
          className="mt-8"
          disabled={busy || short || (payments && stage === 'payment' && (optionsLoading || !selected))}
        >
          {buttonLabel}
        </Button>
        {config.checkout?.termsUrl && !config.checkout?.termsRequired && (
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
            {nestLines(cart.lines).map(({ line: l, depth }) => (
              <li key={l.id} className={`flex gap-3.5 ${depth ? 'pl-6' : ''}`}>
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
                  <LineDetails line={l} />
                </div>
                <span className="text-[13px] tabular-nums">{formatMoney(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-6 space-y-2.5 border-t border-line pt-5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatMoney(cart.subtotal)}</dd></div>
            {cart.codes || cart.promotions ? (
              [...(cart.codes || []).map((c) => ({ key: `code-${c.code}`, label: c.label || c.code, amount: c.amount })),
                ...(cart.promotions || []).map((p) => ({ key: `promo-${p.name}`, label: p.name, amount: p.amount }))]
                .filter((row) => row.amount?.amount > 0)
                .map((row) => (
                  <div key={row.key} className="flex justify-between text-sale"><dt>{row.label}</dt><dd className="tabular-nums">−{formatMoney(row.amount)}</dd></div>
                ))
            ) : cart.discount.amount > 0 && (
              <div className="flex justify-between text-sale"><dt>{cart.discountCode?.label}</dt><dd className="tabular-nums">−{formatMoney(cart.discount)}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-muted">Shipping</dt><dd className="tabular-nums">{cart.shipping.amount === 0 ? 'Free' : formatMoney(cart.shipping)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd className="tabular-nums">{formatMoney(cart.tax)}</dd></div>
            {chosenMethod?.fee?.amount > 0 && (
              <div className="flex justify-between"><dt className="text-muted">Cash on delivery fee</dt><dd className="tabular-nums">{formatMoney(chosenMethod.fee)}</dd></div>
            )}
            {cart.giftWrap?.amount > 0 && (
              <div className="flex justify-between"><dt className="text-muted">Gift wrapping</dt><dd className="tabular-nums">{formatMoney(cart.giftWrap)}</dd></div>
            )}
          </dl>
          <p className="mt-4 flex justify-between border-t border-line pt-4 text-lg">
            <span>Total</span><span className="tabular-nums">{formatMoney(payableTotal(cart.total, chosenMethod))}</span>
          </p>
        </div>
      </aside>
      </div>
    </>
  )
}

/** "Tue 16 Sep" in the shopper's language, from a slot's calendar date. */
const slotDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

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
