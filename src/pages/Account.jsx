import { useCallback, useState } from 'react'
import Seo from '../components/Seo.jsx'
import RegionField from '../components/address/RegionField.jsx'
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import api from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import { useAuth } from '../store/AuthContext.jsx'
import { useToast } from '../store/ToastContext.jsx'
import { useStorefront } from '../store/StorefrontContext.jsx'
import { useWishlist } from '../store/WishlistContext.jsx'
import { Badge, Button, Empty, ErrorState, Icon, Skeleton } from '../components/ui/index.jsx'
import { formatMoney } from '../lib/money.js'
import { isMock } from '../lib/config.js'

const TABS = [
  { to: '/account', end: true, label: 'Overview', icon: 'user' },
  { to: '/account/orders', label: 'Orders', icon: 'package' },
  { to: '/account/addresses', label: 'Addresses', icon: 'map-pin' },
]
// Only where the store takes payments on the storefront: that is where "Save for next time" is offered.
const PAYMENT_TAB = { to: '/account/payment-methods', label: 'Payment methods', icon: 'shield' }
// Points and store credit from the backend's loyalty programs; the demo has none.
const REWARDS_TAB = { to: '/account/rewards', label: 'Rewards', icon: 'award' }

const STATUS_TONE = { placed: 'new', paid: 'bestseller', fulfilled: 'bestseller', delivered: 'bestseller', cancelled: 'sold-out', refunded: 'sold-out' }
const STATUS_LABEL = { placed: 'Placed', pending: 'Awaiting payment', paid: 'Paid', fulfilled: 'On its way', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded' }

const statusLabel = (status) => STATUS_LABEL[status] || (status ? status[0].toUpperCase() + status.slice(1) : '')

function useAccountLocale() {
  const config = useStorefront()
  const countries = config.commerce?.countries?.length ? config.commerce.countries : [['US', 'United States']]
  return { config, locale: config.pricing?.locale || 'en-US', countries }
}

const formatDate = (iso, locale) =>
  iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) : ''

const countryName = (countries, code) => countries.find(([c]) => c === code)?.[1] || code

/*
 * The account is somewhere a customer comes to look things up — where is my
 * order, which address will checkout use — far more often than to change them.
 * So everything reads as information first, and a form only appears for the
 * one thing being edited, in place, with a way back out.
 */
export default function Account() {
  const { customer, loading, logout } = useAuth()
  const navigate = useNavigate()
  const checkoutMode = useStorefront().checkout?.mode
  const tabs = [...TABS, ...(checkoutMode === 'payments' ? [PAYMENT_TAB] : []), ...(isMock ? [] : [REWARDS_TAB])]

  if (loading) return <div className="wrap py-16"><Skeleton className="h-72 w-full" /></div>
  if (!customer) return <Navigate to="/login" state={{ from: '/account' }} replace />

  const initials = [customer.firstName, customer.lastName].filter(Boolean).map((n) => n[0]).join('').toUpperCase()
    || (customer.email || '?')[0].toUpperCase()

  return (
    <div className="wrap py-10 pb-20 sm:py-12">
      <Seo title="Your account" noindex />

      <header className="flex flex-wrap items-center justify-between gap-5 border-b border-line pb-8">
        <div className="flex min-w-0 items-center gap-4">
          <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-sunken text-[17px] font-medium text-ink">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="eyebrow">Your account</p>
            <h1 className="mt-1.5 truncate text-display-md">
              {customer.firstName ? `Hello, ${customer.firstName}` : 'Hello'}
            </h1>
            <p className="mt-1 truncate text-[13px] text-muted">{customer.email}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon="log-out"
          onClick={async () => { await logout(); navigate('/') }}
        >
          Sign out
        </Button>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[12rem_1fr] lg:gap-12">
        {/*
          A column on a wide screen, a row of pills on a narrow one — stacked
          full-width rows on a phone push the orders below the fold on a page
          whose whole purpose is to get someone to their orders.
        */}
        <nav aria-label="Account" className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xs border px-3 py-2.5 text-[14px] transition-colors lg:border-transparent ${
                  isActive
                    ? 'border-ink bg-ink text-page lg:bg-sunken lg:text-ink'
                    : 'border-line text-muted hover:text-ink'
                }`
              }
            >
              <Icon name={t.icon} size={16} />
              {t.label}
            </NavLink>
          ))}
        </nav>

        <div className="min-w-0">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="orders" element={<Orders />} />
            <Route path="addresses" element={<Addresses />} />
            <Route path="payment-methods" element={<PaymentMethods />} />
            <Route path="rewards" element={<Rewards />} />
            <Route path="*" element={<Navigate to="/account" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}

/* ── building blocks ─────────────────────────────────────────────────────── */

function Card({ title, action, children, className = '' }) {
  return (
    <section className={`rounded-xs border border-line bg-surface p-5 sm:p-6 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="eyebrow">{title}</h2>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function TextAction({ children, tone = 'accent', ...rest }) {
  const color = tone === 'danger' ? 'text-faint hover:text-sale' : 'text-accent'
  return (
    <button type="button" className={`text-[13px] link-underline ${color}`} {...rest}>
      {children}
    </button>
  )
}

function PageHeading({ title, note, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-display-md">{title}</h2>
        {note && <p className="mt-2 text-[14px] text-muted">{note}</p>}
      </div>
      {action}
    </div>
  )
}

function Detail({ label, value, empty, onAdd }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-4 text-[14px]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">
        {value || (onAdd
          ? <button type="button" onClick={onAdd} className="text-accent link-underline">{empty}</button>
          : <span className="text-faint">—</span>)}
      </dd>
    </div>
  )
}

function AddressLines({ address, countries }) {
  return (
    <address className="not-italic text-[14px] leading-relaxed text-muted">
      <span className="block font-medium text-ink">{address.name}</span>
      {address.line1}{address.line2 ? `, ${address.line2}` : ''}
      <br />
      {[address.city, address.region, address.postalCode].filter(Boolean).join(', ')}
      <br />
      {countryName(countries, address.country)}
      {address.phone && <><br />{address.phone}</>}
    </address>
  )
}

function OrderCard({ order, locale }) {
  const items = order.lines.reduce((n, line) => n + (line.quantity || 1), 0)
  const extra = order.lines.length - 4

  return (
    <Link
      to={`/order/${order.id}`}
      className="group block rounded-xs border border-line bg-surface p-5 transition-colors hover:border-ink"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium">Order {order.number}</p>
          <p className="mt-1 text-[12px] text-faint">
            {formatDate(order.placedAt, locale)} · {items} {items === 1 ? 'item' : 'items'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Badge kind={STATUS_TONE[order.status] || 'low-stock'}>{statusLabel(order.status)}</Badge>
          <span className="text-[15px] tabular-nums">{formatMoney(order.total)}</span>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          {order.lines.slice(0, 4).map((line) => (
            <div key={line.id} className="w-12">
              <div className="shot rounded-xs"><img src={line.image?.url} alt="" loading="lazy" /></div>
            </div>
          ))}
          {extra > 0 && <span className="pl-1 text-[12px] text-faint">+{extra}</span>}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-[13px] text-muted transition-colors group-hover:text-ink">
          View order <Icon name="arrow-right" size={14} />
        </span>
      </div>
    </Link>
  )
}

/* ── overview ────────────────────────────────────────────────────────────── */

function Overview() {
  const { customer } = useAuth()
  const { config, locale, countries } = useAccountLocale()
  const { count: savedCount } = useWishlist()
  const orders = useAsync(() => api.listOrders(), [])
  const latest = orders.data?.items?.[0]
  const defaultAddress = customer.addresses.find((a) => a.isDefault) || customer.addresses[0]

  return (
    <div className="space-y-8">
      <section aria-labelledby="latest-order">
        <div className="flex items-center justify-between gap-3">
          <h2 id="latest-order" className="eyebrow">Latest order</h2>
          {orders.data?.items?.length > 1 && (
            <Link to="/account/orders" className="text-[13px] text-accent link-underline">
              All {orders.data.items.length} orders
            </Link>
          )}
        </div>
        <div className="mt-4">
          {orders.loading ? (
            <Skeleton className="h-32 w-full" />
          ) : orders.error ? (
            <ErrorState error={orders.error} onRetry={orders.reload} />
          ) : latest ? (
            <OrderCard order={latest} locale={locale} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xs border border-dashed border-line p-5">
              <p className="text-[14px] text-muted">No orders yet. When you place one, you can follow it from here.</p>
              <Button to="/shop" size="sm" variant="quiet" iconRight="arrow-right">Start shopping</Button>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <PersonalDetails />

        <Card
          title="Default address"
          action={
            <Link to="/account/addresses" className="text-[13px] text-accent link-underline">
              {customer.addresses.length ? 'Manage' : 'Add'}
            </Link>
          }
        >
          {defaultAddress ? (
            <AddressLines address={defaultAddress} countries={countries} />
          ) : (
            <p className="text-[14px] text-muted">No address saved yet. Add one and checkout fills it in for you.</p>
          )}
        </Card>
      </div>

      {config.features?.wishlist !== false && (
        <Link
          to="/wishlist"
          className="group flex items-center justify-between gap-4 rounded-xs border border-line bg-surface p-5 transition-colors hover:border-ink"
        >
          <span className="flex items-center gap-3 text-[14px]">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-sunken text-muted"><Icon name="heart" size={16} /></span>
            Saved items
          </span>
          <span className="flex items-center gap-2 text-[14px] tabular-nums text-muted group-hover:text-ink">
            {savedCount}
            <Icon name="chevron-right" size={16} />
          </span>
        </Link>
      )}
    </div>
  )
}

function PersonalDetails() {
  const { customer, update } = useAuth()
  const { push } = useToast()
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)

  const start = () =>
    setForm({
      firstName: customer.firstName || '', lastName: customer.lastName || '', phone: customer.phone || '',
      company: customer.company || '', vat: customer.vat || '',
    })
  const set = (k) => (e) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [k]: value }))
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await update(form)
      push('Details saved')
      setForm(null)
    } catch (err) {
      push(err.message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ')

  return (
    <Card title="Personal details" action={!form && <TextAction onClick={start}>Edit</TextAction>}>
      {form ? (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <AddressField id="fn" label="First name" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" autoFocus />
            <AddressField id="ln" label="Last name" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" />
          </div>
          <AddressField id="ph" label="Phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
          <div className="grid gap-4 sm:grid-cols-2">
            <AddressField id="co" label="Company (optional)" value={form.company} onChange={set('company')} autoComplete="organization" />
            <AddressField id="vat" label="Tax ID (optional)" value={form.vat} onChange={set('vat')} />
          </div>
          <p className="text-[12px] text-faint">Your email, {customer.email}, is how you sign in, so it can’t be changed here.</p>
          <div className="flex gap-3">
            <Button as="button" type="submit" size="sm" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setForm(null)} disabled={busy}>Cancel</Button>
          </div>
        </form>
      ) : (
        <dl className="space-y-3.5">
          <Detail label="Name" value={name} empty="Add your name" onAdd={start} />
          <Detail label="Email" value={customer.email} />
          <Detail label="Phone" value={customer.phone} empty="Add a phone number" onAdd={start} />
          {(customer.company || customer.vat) && <Detail label="Company" value={[customer.company, customer.vat && `Tax ID ${customer.vat}`].filter(Boolean).join(' · ')} />}
        </dl>
      )}
    </Card>
  )
}

/* ── orders ──────────────────────────────────────────────────────────────── */

function Orders() {
  const { locale } = useAccountLocale()
  const { data, error, loading, reload } = useAsync(() => api.listOrders(), [])

  if (loading) return <Skeleton className="h-64 w-full" />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data?.items.length) {
    return (
      <Empty
        icon="package"
        title="No orders yet"
        body="When you place one, it will show up here with tracking."
        action={<Button to="/shop">Shop everything</Button>}
      />
    )
  }

  return (
    <>
      <PageHeading
        title="Orders"
        note={`${data.items.length} ${data.items.length === 1 ? 'order' : 'orders'}, newest first.`}
      />
      <ul className="mt-6 space-y-4">
        {data.items.map((order) => (
          <li key={order.id}><OrderCard order={order} locale={locale} /></li>
        ))}
      </ul>
    </>
  )
}

/* ── addresses ───────────────────────────────────────────────────────────── */

const ADDRESS_LABELS = {
  name: 'Full name', line1: 'Address', city: 'City', region: 'State / region',
  postalCode: 'Postcode', country: 'Country', phone: 'Phone',
}

const blankAddress = (country) => ({
  name: '', line1: '', line2: '', city: '', region: '', postalCode: '', country, phone: '', isDefault: false, type: 'shipping',
})

function AddressField({ id, label, invalid, ...rest }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">{label}</label>
      <input id={id} className={`field ${invalid ? 'border-sale' : ''}`} aria-invalid={invalid || undefined} {...rest} />
    </div>
  )
}

function Addresses() {
  const { customer, saveAddress, deleteAddress } = useAuth()
  const { push } = useToast()
  const { config, countries } = useAccountLocale()
  const [editing, setEditing] = useState(null)
  const [problems, setProblems] = useState([])
  const [confirming, setConfirming] = useState(null)
  const [busy, setBusy] = useState(false)

  // Country and state are what the backend checks hardest — a US or Indian
  // address is refused without its state — so the form asks for both, from the
  // countries the store actually ships to.
  const localeCountry = (config.pricing?.locale || '').split('-')[1]
  const defaultCountry =
    customer.addresses.find((a) => a.isDefault)?.country ||
    countries.find(([code]) => code === localeCountry)?.[0] ||
    countries[0][0]

  const open = (address, fields = []) => {
    setConfirming(null)
    setProblems(fields)
    setEditing(address)
  }

  const save = async (e) => {
    e.preventDefault()
    setProblems([])
    setBusy(true)
    try {
      await saveAddress(editing)
      setEditing(null)
      push('Address saved')
    } catch (err) {
      setProblems(err.detail?.fields || [])
      push(err.message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const makeDefault = async (address) => {
    try {
      await saveAddress({ ...address, isDefault: true })
      push('Default address updated')
    } catch (err) {
      // An address saved before the store asked for a state cannot be re-saved
      // as it is — open it with the missing fields marked instead of failing.
      if (err.code === 'invalid_address') open({ ...address, isDefault: true }, err.detail?.fields || [])
      push(err.message, { tone: 'error' })
    }
  }

  const remove = async (address) => {
    try {
      await deleteAddress(address.id)
      push('Address removed')
    } catch (err) {
      push(err.message, { tone: 'error' })
    } finally {
      setConfirming(null)
    }
  }

  const set = (k) => (e) => {
    const value = e.target.value
    setProblems((p) => p.filter((field) => field !== k))
    setEditing((a) => ({ ...a, [k]: value }))
  }
  const invalid = (k) => problems.includes(k)
  // Stable, because the state field settles its value in an effect that depends on it.
  const setRegion = useCallback((e) => {
    const value = e.target.value
    setProblems((p) => p.filter((field) => field !== 'region'))
    setEditing((a) => (a ? { ...a, region: value } : a))
  }, [])

  if (editing) {
    const name = countryName(countries, editing.country)
    return (
      <>
        <PageHeading title={editing.id ? 'Edit address' : 'New address'} />
        <form onSubmit={save} noValidate={false} className="mt-6 max-w-xl space-y-4 rounded-xs border border-line bg-surface p-5 sm:p-6">
          <AddressField id="a-name" label="Full name" required invalid={invalid('name')} value={editing.name} onChange={set('name')} autoComplete="name" autoFocus />
          <AddressField id="a-l1" label="Address" required invalid={invalid('line1')} value={editing.line1} onChange={set('line1')} autoComplete="address-line1" />
          <AddressField id="a-l2" label="Apartment, suite (optional)" value={editing.line2 || ''} onChange={set('line2')} autoComplete="address-line2" />
          <div className="grid gap-4 sm:grid-cols-2">
            <AddressField id="a-city" label="City" required invalid={invalid('city')} value={editing.city} onChange={set('city')} autoComplete="address-level2" />
            <RegionField id="a-region" country={editing.country || defaultCountry} invalid={invalid('region')} value={editing.region || ''} onChange={setRegion} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <AddressField id="a-pc" label="Postcode" required invalid={invalid('postalCode')} value={editing.postalCode} onChange={set('postalCode')} autoComplete="postal-code" />
            <div>
              <label htmlFor="a-country" className="mb-1.5 block text-[13px] font-medium">Country</label>
              <select
                id="a-country"
                className={`field ${invalid('country') ? 'border-sale' : ''}`}
                aria-invalid={invalid('country') || undefined}
                value={editing.country || defaultCountry}
                onChange={set('country')}
                autoComplete="country"
              >
                {/* An address saved for a country the store no longer ships to stays selectable. */}
                {editing.country && !countries.some(([code]) => code === editing.country) && (
                  <option value={editing.country}>{editing.country}</option>
                )}
                {countries.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </div>
          </div>
          <AddressField id="a-phone" label="Phone (for delivery updates)" type="tel" value={editing.phone || ''} onChange={set('phone')} autoComplete="tel" />
          <div>
            <label htmlFor="a-type" className="mb-1.5 block text-[13px] font-medium">Use this address for</label>
            <select
              id="a-type"
              className="field"
              value={editing.type === 'billing' ? 'billing' : 'shipping'}
              onChange={(e) => {
                const type = e.target.value
                setEditing((a) => ({ ...a, type, isDefault: type === 'billing' ? false : a.isDefault }))
              }}
            >
              <option value="shipping">Deliveries</option>
              <option value="billing">Invoices (billing address)</option>
            </select>
          </div>
          {editing.type !== 'billing' && (
          <label className="flex items-center gap-2.5 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={!!editing.isDefault}
              onChange={(e) => setEditing((a) => ({ ...a, isDefault: e.target.checked }))}
              className="h-4 w-4 accent-[rgb(var(--accent))]"
            />
            Use as my default address
          </label>
          )}
          {problems.length > 0 && (
            <p role="alert" className="text-[13px] text-sale">
              {problems.includes('region') && editing.region
                ? `"${editing.region}" is not a state of ${name}. Use the state's full name or its code.`
                : `Please add: ${problems.map((field) => ADDRESS_LABELS[field] || field).join(', ')}.`}
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <Button as="button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</Button>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
          </div>
        </form>
      </>
    )
  }

  if (!customer.addresses.length) {
    return (
      <Empty
        icon="map-pin"
        title="No addresses saved"
        body="Add one and checkout fills it in for you."
        action={<Button icon="plus" onClick={() => open(blankAddress(defaultCountry))}>Add an address</Button>}
      />
    )
  }

  return (
    <>
      <PageHeading title="Addresses" note="Checkout starts with your default address. You can change it there too." />
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {customer.addresses.map((a) => (
          <li key={a.id} className={`flex flex-col rounded-xs border bg-surface p-5 ${a.isDefault ? 'border-ink' : 'border-line'}`}>
            <div className="flex items-start justify-between gap-3">
              <AddressLines address={a} countries={countries} />
              {a.isDefault && <Badge kind="bestseller">Default</Badge>}
              {a.type === 'billing' && <Badge kind="new">Billing</Badge>}
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5">
              {confirming === a.id ? (
                <>
                  <span className="text-[13px] text-ink">Remove this address?</span>
                  <TextAction tone="danger" onClick={() => remove(a)}>Remove</TextAction>
                  <TextAction onClick={() => setConfirming(null)}>Keep</TextAction>
                </>
              ) : (
                <>
                  <TextAction onClick={() => open(a)}>Edit</TextAction>
                  {!a.isDefault && a.type !== 'billing' && <TextAction onClick={() => makeDefault(a)}>Set as default</TextAction>}
                  <TextAction tone="danger" onClick={() => setConfirming(a.id)}>Remove</TextAction>
                </>
              )}
            </div>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => open(blankAddress(defaultCountry))}
            className="flex h-full min-h-[10rem] w-full flex-col items-center justify-center gap-2 rounded-xs border border-dashed border-line p-5 text-[14px] text-muted transition-colors hover:border-ink hover:text-ink"
          >
            <Icon name="plus" size={18} />
            Add a new address
          </button>
        </li>
      </ul>
    </>
  )
}

/* ── payment methods ─────────────────────────────────────────────────────── */

function PaymentMethods() {
  const { push } = useToast()
  const { data, error, loading, reload } = useAsync(() => api.listPaymentMethods(), [])
  const [items, setItems] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const list = items || data?.items || []

  const remove = async (method) => {
    try {
      setItems((await api.deletePaymentMethod(method.id)).items)
      push('Payment method removed')
    } catch (err) {
      push(err.message, { tone: 'error' })
    } finally {
      setConfirming(null)
    }
  }

  if (loading) return <Skeleton className="h-40 w-full" />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!list.length) {
    return (
      <Empty
        icon="shield"
        title="No saved payment methods"
        body={'Tick "Save for next time" when you pay, and the card or account appears here for a faster checkout.'}
      />
    )
  }

  return (
    <>
      <PageHeading title="Payment methods" note="Kept by the payment provider. This shop never sees or stores your full card number." />
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {list.map((m) => (
          <li key={m.id} className="flex flex-col rounded-xs border border-line bg-surface p-5">
            <p className="text-[15px] font-medium">{m.name}</p>
            <p className="mt-1 text-[13px] text-muted">{[m.method, m.provider].filter(Boolean).join(' · ')}</p>
            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5">
              {confirming === m.id ? (
                <>
                  <span className="text-[13px] text-ink">Remove this payment method?</span>
                  <TextAction tone="danger" onClick={() => remove(m)}>Remove</TextAction>
                  <TextAction onClick={() => setConfirming(null)}>Keep</TextAction>
                </>
              ) : (
                <TextAction tone="danger" onClick={() => setConfirming(m.id)}>Remove</TextAction>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

/* ── rewards ─────────────────────────────────────────────────────────────── */

function Rewards() {
  const { locale } = useAccountLocale()
  const { data, error, loading, reload } = useAsync(() => api.getLoyalty(), [])
  if (loading) return <Skeleton className="h-40 w-full" />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data?.items.length) {
    return <Empty icon="award" title="No rewards yet" body="Points and store credit you earn with your orders appear here." />
  }
  const points = (value) => new Intl.NumberFormat(locale).format(value)
  return (
    <>
      <PageHeading title="Rewards" note="Your points and store credit. Use them in your bag at checkout." />
      <ul className="mt-6 space-y-4">
        {data.items.map((card) => (
          <li key={card.id} className="rounded-xs border border-line bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-[15px] font-medium">{card.program}</p>
              <p className="text-[20px] tabular-nums">
                {card.balance ? formatMoney(card.balance) : `${points(card.points)} ${card.pointName || 'points'}`}
              </p>
            </div>
            {card.expiresAt && <p className="mt-1 text-[12px] text-faint">Valid until {formatDate(card.expiresAt, locale)}</p>}
            {card.history?.length > 0 && (
              <ul className="mt-4 divide-y divide-line border-t border-line text-[13px]">
                {card.history.map((entry, index) => (
                  <li key={`${entry.date}-${index}`} className="flex justify-between gap-3 py-2">
                    <span className="min-w-0 text-muted">{formatDate(entry.date, locale)} · {entry.description}</span>
                    <span className="shrink-0 tabular-nums">
                      {entry.issued ? `+${points(entry.issued)}` : ''}{entry.used ? ` −${points(entry.used)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

