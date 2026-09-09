import { useState } from 'react'
import Seo from '../components/Seo.jsx'
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import api from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import { useAuth } from '../store/AuthContext.jsx'
import { useToast } from '../store/ToastContext.jsx'
import { Badge, Button, Empty, Icon, Skeleton } from '../components/ui/index.jsx'
import { formatMoney } from '../lib/money.js'

const TABS = [
  { to: '/account', end: true, label: 'Profile', icon: 'user' },
  { to: '/account/orders', label: 'Orders', icon: 'package' },
  { to: '/account/addresses', label: 'Addresses', icon: 'map-pin' },
]

export default function Account() {
  const { customer, loading, logout } = useAuth()
  const navigate = useNavigate()

  if (loading) return <div className="wrap py-16"><Skeleton className="h-72 w-full" /></div>
  if (!customer) return <Navigate to="/login" state={{ from: '/account' }} replace />

  return (
    <div className="wrap grid gap-10 py-12 pb-20 lg:grid-cols-[14rem_1fr]">
      <aside>
        <p className="eyebrow">Signed in as</p>
        <p className="mt-2 truncate text-[15px] font-medium">{customer.email}</p>
        <nav className="mt-7 space-y-0.5">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-xs px-3 py-2.5 text-[14px] transition-colors ${isActive ? 'bg-sunken text-ink' : 'text-muted hover:text-ink'}`
              }
            >
              <Icon name={t.icon} size={16} />
              {t.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={async () => { await logout(); navigate('/') }}
            className="flex w-full items-center gap-2.5 rounded-xs px-3 py-2.5 text-[14px] text-muted transition-colors hover:text-sale"
          >
            <Icon name="log-out" size={16} />
            Sign out
          </button>
        </nav>
      </aside>

      <div>
        <Routes>
          <Route index element={<Profile />} />
          <Route path="orders" element={<Orders />} />
          <Route path="addresses" element={<Addresses />} />
        </Routes>
      </div>
    </div>
  )
}

function Profile() {
  const { customer, update } = useAuth()
  const { push } = useToast()
  const [form, setForm] = useState({
    firstName: customer.firstName || '',
    lastName: customer.lastName || '',
    phone: customer.phone || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await update(form)
      push('Profile saved')
    } catch (err) {
      push(err.message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Seo title={'Your account'} noindex />
      <h1 className="text-display-md">Profile</h1>
      <form onSubmit={submit} className="mt-8 max-w-md space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="fn" className="mb-1.5 block text-[13px] font-medium">First name</label>
            <input id="fn" className="field" value={form.firstName} onChange={set('firstName')} />
          </div>
          <div>
            <label htmlFor="ln" className="mb-1.5 block text-[13px] font-medium">Last name</label>
            <input id="ln" className="field" value={form.lastName} onChange={set('lastName')} />
          </div>
        </div>
        <div>
          <label htmlFor="em" className="mb-1.5 block text-[13px] font-medium">Email</label>
          <input id="em" className="field" value={customer.email} disabled />
        </div>
        <div>
          <label htmlFor="ph" className="mb-1.5 block text-[13px] font-medium">Phone</label>
          <input id="ph" type="tel" className="field" value={form.phone} onChange={set('phone')} />
        </div>
        <Button as="button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
      </form>
    </>
  )
}

const STATUS_TONE = { placed: 'new', paid: 'bestseller', fulfilled: 'bestseller', delivered: 'bestseller', cancelled: 'sold-out' }

function Orders() {
  const { data, loading } = useAsync(() => api.listOrders(), [])

  if (loading) return <Skeleton className="h-64 w-full" />
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
      <h1 className="text-display-md">Orders</h1>
      <ul className="mt-8 space-y-4">
        {data.items.map((o) => (
          <li key={o.id} className="rounded-xs border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Link to={`/order/${o.id}`} className="text-[15px] font-medium">{o.number}</Link>
                <p className="mt-1 text-[12px] text-faint">
                  {new Date(o.placedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {' · '}{o.lines.length} {o.lines.length === 1 ? 'item' : 'items'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Badge kind={STATUS_TONE[o.status] || 'low-stock'}>{o.status}</Badge>
                <span className="text-[15px] tabular-nums">{formatMoney(o.total)}</span>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              {o.lines.slice(0, 5).map((l) => (
                <div key={l.id} className="w-12">
                  <div className="shot rounded-xs"><img src={l.image?.url} alt="" loading="lazy" /></div>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

const BLANK = { name: '', line1: '', line2: '', city: '', region: '', postalCode: '', country: 'US', phone: '', isDefault: false }

function Addresses() {
  const { customer, saveAddress, deleteAddress } = useAuth()
  const { push } = useToast()
  const [editing, setEditing] = useState(null)

  const save = async (e) => {
    e.preventDefault()
    try {
      await saveAddress(editing)
      setEditing(null)
      push('Address saved')
    } catch (err) {
      push(err.message, { tone: 'error' })
    }
  }

  const set = (k) => (e) => setEditing((a) => ({ ...a, [k]: e.target.value }))

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-display-md">Addresses</h1>
        {!editing && <Button size="sm" variant="quiet" icon="plus" onClick={() => setEditing({ ...BLANK })}>Add</Button>}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-8 max-w-md space-y-4">
          <div><label htmlFor="a-name" className="mb-1.5 block text-[13px] font-medium">Full name</label><input id="a-name" required className="field" value={editing.name} onChange={set('name')} /></div>
          <div><label htmlFor="a-l1" className="mb-1.5 block text-[13px] font-medium">Address</label><input id="a-l1" required className="field" value={editing.line1} onChange={set('line1')} /></div>
          <div><label htmlFor="a-l2" className="mb-1.5 block text-[13px] font-medium">Apartment (optional)</label><input id="a-l2" className="field" value={editing.line2} onChange={set('line2')} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="a-city" className="mb-1.5 block text-[13px] font-medium">City</label><input id="a-city" required className="field" value={editing.city} onChange={set('city')} /></div>
            <div><label htmlFor="a-pc" className="mb-1.5 block text-[13px] font-medium">Postcode</label><input id="a-pc" required className="field" value={editing.postalCode} onChange={set('postalCode')} /></div>
          </div>
          <label className="flex items-center gap-2.5 text-[13px] text-muted">
            <input type="checkbox" checked={!!editing.isDefault} onChange={(e) => setEditing((a) => ({ ...a, isDefault: e.target.checked }))} className="h-4 w-4 accent-[rgb(var(--accent))]" />
            Use as my default address
          </label>
          <div className="flex gap-3">
            <Button as="button" type="submit">Save address</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </form>
      ) : !customer.addresses.length ? (
        <Empty icon="map-pin" title="No addresses saved" body="Add one and checkout gets a lot faster." action={<Button onClick={() => setEditing({ ...BLANK })}>Add an address</Button>} />
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {customer.addresses.map((a) => (
            <li key={a.id} className="rounded-xs border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[15px] font-medium">{a.name}</p>
                {a.isDefault && <Badge kind="bestseller">Default</Badge>}
              </div>
              <address className="mt-2.5 not-italic text-[13px] leading-relaxed text-muted">
                {a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />
                {a.city}{a.region ? `, ${a.region}` : ''} {a.postalCode}<br />
                {a.country}
              </address>
              <div className="mt-4 flex gap-4 text-[13px]">
                <button type="button" onClick={() => setEditing(a)} className="text-accent link-underline">Edit</button>
                <button type="button" onClick={() => deleteAddress(a.id)} className="text-faint link-underline hover:text-sale">Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
