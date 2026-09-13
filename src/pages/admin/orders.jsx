import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import api, { isMock } from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { Button, Empty, ErrorState, Icon, Pagination, Skeleton } from '../../components/ui/index.jsx'
import { useToast } from '../../store/ToastContext.jsx'
import { formatMoney } from '../../lib/money.js'
import {
  DELIVERY_LABELS,
  DELIVERY_TONES,
  ORDER_STATE_LABELS,
  ORDER_STATE_TONES,
  ORDER_VIEWS,
  PAYMENT_LABELS,
  PAYMENT_TONES,
  progressSteps,
  trackingProblem,
} from '../../lib/admin-orders.js'

/*
 * Orders, for the people who pack them.
 *
 * The list answers "what needs doing" — the tabs are the jobs, not a status
 * enum — and the detail page offers only the next steps the order can take,
 * straight from the backend's `actions`, so a button is never shown that the
 * server would refuse.
 */

const PER_PAGE = 25

const ROW_GRID = 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_3.5rem_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.9fr)_1rem]'

const TONE_DOT = {
  good: 'bg-good',
  accent: 'bg-accent',
  sale: 'bg-sale',
  ink: 'bg-ink',
  muted: 'bg-muted',
  faint: 'bg-faint',
}

const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const dateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''

function StatusPill({ tone = 'muted', children }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-ink">
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone] || TONE_DOT.muted}`} />
      {children}
    </span>
  )
}

/* ── list ──────────────────────────────────────────────────────────────── */

export function Orders() {
  const [params, setParams] = useSearchParams()
  const view = ORDER_VIEWS.find((v) => v.id === params.get('view')) || ORDER_VIEWS[0]
  const page = Math.max(Number(params.get('page')) || 1, 1)
  const q = params.get('q') || ''
  const [typed, setTyped] = useState(q)

  const update = (changes) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      const empty = value === null || value === undefined || value === ''
      if (empty || (key === 'view' && value === 'all') || (key === 'page' && Number(value) <= 1)) next.delete(key)
      else next.set(key, String(value))
    }
    setParams(next, { replace: true })
  }

  // Search waits for a pause in typing, then starts again from the first page.
  useEffect(() => {
    if (typed === q) return undefined
    const timer = setTimeout(() => update({ q: typed.trim(), page: null }), 300)
    return () => clearTimeout(timer)
  }, [typed]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, error, loading, reload } = useAsync(
    () => api.adminListOrders({ ...view.query, q: q || undefined, page, perPage: PER_PAGE }),
    [view.id, q, page],
  )

  const counts = data?.counts
  const nothingYet = data && view.id === 'all' && !q && data.total === 0

  return (
    <>
      <h1 className="text-display-md">Orders</h1>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
        Pack what is waiting to ship, add tracking as it leaves, and mark it delivered when it
        arrives. The customer&rsquo;s order page follows every step.
      </p>

      <div role="tablist" aria-label="Filter orders" className="no-scrollbar -mx-1 mt-6 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {ORDER_VIEWS.map((v) => {
          const active = v.id === view.id
          const count = v.count ? counts?.[v.count] : null
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => update({ view: v.id, page: null })}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xs border px-3 py-2 text-[13px] transition-colors ${
                active ? 'border-ink bg-ink text-page' : 'border-line bg-surface text-muted hover:border-ink hover:text-ink'
              }`}
            >
              {v.label}
              {count != null && (
                <span className={`text-[12px] tabular-nums ${active ? 'text-page/70' : 'text-faint'}`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {view.hint && <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-muted">{view.hint}</p>}

      <div className="relative mt-4 max-w-sm">
        <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Search number, customer or tracking"
          aria-label="Search orders"
          className="field h-9 pl-9 text-[13px]"
        />
      </div>

      <div className="mt-6">
        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data ? (
          <Skeleton className="h-64 w-full" />
        ) : nothingYet ? (
          <Empty icon="truck" title="No orders yet" body="Orders placed on the storefront appear here, ready to pack and ship." />
        ) : !data.items.length ? (
          <p className="rounded-xs border border-dashed border-line p-8 text-center text-[14px] text-muted">
            No orders {q ? `match “${q}”` : 'here'}{view.id !== 'all' ? ` under ${view.label}` : ''}.
          </p>
        ) : (
          <>
            <div className={`hidden gap-4 px-4 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint md:grid ${ROW_GRID}`}>
              <span>Order</span>
              <span>Customer</span>
              <span>Items</span>
              <span className="text-right">Total</span>
              <span>Payment</span>
              <span>Delivery</span>
              <span />
            </div>
            <ul className={`space-y-2 transition-opacity ${loading ? 'opacity-60' : ''}`}>
              {data.items.map((order) => <OrderRow key={order.id} order={order} />)}
            </ul>
            <div className="mt-6">
              <Pagination
                page={data.page || page}
                perPage={data.perPage || PER_PAGE}
                total={data.total}
                onPage={(p) => update({ page: p })}
              />
            </div>
          </>
        )}
      </div>
    </>
  )
}

function OrderRow({ order }) {
  const items = (order.lines || []).reduce((n, line) => n + (line.quantity || 1), 0)
  const delivery = order.delivery?.status
  return (
    <li>
      <Link
        to={`/admin/orders/${encodeURIComponent(order.id)}`}
        className={`grid grid-cols-2 items-center gap-x-4 gap-y-3 rounded-xs border border-line bg-surface p-4 transition-colors hover:border-ink ${ROW_GRID}`}
      >
        <div className="min-w-0">
          <p className="font-mono text-[13px] text-ink">{order.number}</p>
          <p className="mt-0.5 text-[12px] text-faint">{shortDate(order.placedAt)}</p>
        </div>
        <div className="min-w-0 text-right md:text-left">
          <p className="truncate text-[14px]">{order.customer?.name || order.email}</p>
          <p className="truncate text-[12px] text-faint">{order.customer?.email}</p>
        </div>
        <p className="hidden text-[13px] tabular-nums text-muted md:block">{items}</p>
        <p className="text-[14px] tabular-nums md:text-right">
          {formatMoney(order.total)}
          <span className="text-[12px] text-faint md:hidden"> · {items} {items === 1 ? 'item' : 'items'}</span>
        </p>
        <div className="flex flex-wrap justify-end gap-1.5 md:contents">
          <div className="md:flex">
            <StatusPill tone={PAYMENT_TONES[order.paymentStatus]}>{PAYMENT_LABELS[order.paymentStatus] || order.paymentStatus}</StatusPill>
          </div>
          <div className="md:flex">
            <StatusPill tone={DELIVERY_TONES[delivery]}>{DELIVERY_LABELS[delivery] || delivery}</StatusPill>
          </div>
        </div>
        <Icon name="chevron-right" size={16} className="hidden text-faint md:block" />
      </Link>
    </li>
  )
}

/* ── detail ────────────────────────────────────────────────────────────── */

export function OrderDetail() {
  const { id } = useParams()
  const { push } = useToast()
  const { data, error, reload } = useAsync(() => api.adminGetOrder(id), [id])
  const [order, setOrder] = useState(null)
  const [busy, setBusy] = useState(null)
  const [problem, setProblem] = useState(null)
  const [refunding, setRefunding] = useState(false)

  useEffect(() => {
    if (data) setOrder(data)
  }, [data])

  /** Run one action. The response is the whole order, so the page re-renders from it. */
  const run = async (action, body, { area, done }) => {
    setBusy(action)
    setProblem(null)
    try {
      setOrder(await api.adminUpdateOrder(order.id, { action, ...body }))
      push(done)
      return true
    } catch (err) {
      setProblem({ area, message: err.message })
      return false
    } finally {
      setBusy(null)
    }
  }

  if (error && !order) {
    return error.status === 404 ? (
      <Empty
        icon="package"
        title="Order not found"
        body="The link may be wrong, or the order belongs to another store."
        action={<Button to="/admin/orders">All orders</Button>}
      />
    ) : (
      <ErrorState error={error} onRetry={reload} />
    )
  }
  if (!order) return <Skeleton className="h-96 w-full" />

  const can = (action) => (order.actions || []).includes(action)
  const shared = { order, can, busy, run }
  const problemFor = (area) => (problem?.area === area ? problem.message : null)

  return (
    <div className="pb-16">
      <Link to="/admin/orders" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted link-underline">
        <Icon name="chevron-left" size={14} /> All orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-display-md">Order {order.number}</h1>
            <StatusPill tone={ORDER_STATE_TONES[order.orderState]}>
              {ORDER_STATE_LABELS[order.orderState] || order.orderState}
            </StatusPill>
          </div>
          <p className="mt-1.5 text-[13px] text-muted">
            Placed {dateTime(order.placedAt)}
            {order.customer?.name ? ` by ${order.customer.name}` : ''}
          </p>
        </div>
        {order.backendUrl && (
          <Button href={order.backendUrl} target="_blank" rel="noreferrer" variant="quiet" size="sm" iconRight="arrow-right">
            Open in Odoo
          </Button>
        )}
      </div>

      <Progress order={order} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
          <DeliveryCard {...shared} problem={problemFor('delivery')} />
          <ItemsCard order={order} />
        </div>
        <aside className="space-y-6">
          <CustomerCard order={order} />
          <PaymentCard {...shared} problem={problemFor('payment')} onRefund={() => setRefunding(true)} />
          {can('cancel') && <CancelCard {...shared} problem={problemFor('cancel')} />}
        </aside>
      </div>

      {isMock && refunding && (
        <RefundDialog
          order={order}
          onClose={() => setRefunding(false)}
          onDone={(message) => {
            setRefunding(false)
            push(message)
            reload()
          }}
          onError={(message) => push(message, { tone: 'error' })}
        />
      )}
    </div>
  )
}

function Progress({ order }) {
  if (order.orderState === 'cancelled') {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-xs border border-line bg-sunken/60 p-4 text-[14px] text-muted">
        <Icon name="close" size={16} />
        This order was cancelled{order.cancelledAt ? ` on ${dateTime(order.cancelledAt)}` : ''}. There is nothing left to do.
      </div>
    )
  }
  const steps = progressSteps(order)
  const next = steps.find((s) => !s.done)
  return (
    <ol aria-label="Order progress" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {steps.map((step, i) => (
        <li
          key={step.id}
          aria-current={step === next ? 'step' : undefined}
          className={`rounded-xs border p-3 ${step.done ? 'border-line bg-surface' : 'border-dashed border-line'}`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] tabular-nums ${
                step.done ? 'bg-ink text-page' : 'border border-line text-faint'
              }`}
            >
              {step.done ? <Icon name="check" size={11} /> : i + 1}
            </span>
            <span className={`text-[13px] ${step.done ? 'text-ink' : 'text-muted'}`}>{step.label}</span>
          </div>
          <p className="mt-1.5 pl-7 text-[11px] text-faint">{step.at ? dateTime(step.at) : step.done ? '' : 'Not yet'}</p>
        </li>
      ))}
    </ol>
  )
}

function Card({ title, aside, children }) {
  return (
    <section className="rounded-xs border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="eyebrow">{title}</h2>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[14px]">
      <dt className="shrink-0 text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-ink">{children}</dd>
    </div>
  )
}

function Field({ id, label, invalid, ...rest }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12px] font-medium">{label}</label>
      <input id={id} className={`field h-9 text-[13px] ${invalid ? 'border-sale' : ''}`} aria-invalid={invalid || undefined} {...rest} />
    </div>
  )
}

function Alert({ children }) {
  return children ? <p role="alert" className="mt-3 text-[13px] text-sale">{children}</p> : null
}

function Confirm({ message, confirmLabel, danger = false, busy, problem, onConfirm, onCancel }) {
  return (
    <div className="mt-5 rounded-xs border border-line bg-sunken/40 p-4">
      <p className="text-[13px] leading-relaxed">{message}</p>
      <Alert>{problem}</Alert>
      <div className="mt-3 flex flex-wrap gap-2">
        {danger ? (
          <DangerButton onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</DangerButton>
        ) : (
          <Button size="sm" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</Button>
        )}
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Not now</Button>
      </div>
    </div>
  )
}

function DangerButton({ children, ...rest }) {
  return (
    <button
      type="button"
      className="inline-flex h-9 items-center justify-center rounded-xs border border-sale/40 px-3.5 text-[13px] font-medium text-sale transition-colors hover:bg-sale hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
      {...rest}
    >
      {children}
    </button>
  )
}

function DeliveryCard({ order, can, busy, run, problem }) {
  const delivery = order.delivery || {}
  const [mode, setMode] = useState(null) // 'ship' | 'tracking' | 'deliver'
  const [form, setForm] = useState({ carrier: '', code: '', url: '' })
  const [invalid, setInvalid] = useState(null)

  const open = (next) => {
    setInvalid(null)
    setForm({ carrier: delivery.carrier || '', code: delivery.trackingCode || '', url: delivery.trackingUrl || '' })
    setMode(next)
  }
  const set = (key) => (e) => {
    const value = e.target.value
    setInvalid(null)
    setForm((f) => ({ ...f, [key]: value }))
  }

  const submit = async (e) => {
    e.preventDefault()
    const tracking = { carrier: form.carrier.trim(), code: form.code.trim(), url: form.url.trim() }
    const message = trackingProblem(tracking)
    if (message) {
      setInvalid(message)
      return
    }
    const action = mode === 'ship' ? 'ship' : 'update_tracking'
    const done = action === 'ship' ? 'Marked as shipped' : 'Tracking updated'
    if (await run(action, { tracking }, { area: 'delivery', done })) setMode(null)
  }

  const deliver = async () => {
    if (await run('deliver', {}, { area: 'delivery', done: 'Marked as delivered' })) setMode(null)
  }

  const shipNote = [
    order.orderState === 'quotation' && 'This confirms the order first; record the cash under Payment once it is collected.',
    'Carrier, tracking number and link are all optional — you can add them later.',
    !isMock && 'Odoo validates the delivery order, so the stock leaves the warehouse.',
  ].filter(Boolean).join(' ')

  const hasTracking = delivery.trackingCode || delivery.trackingUrl

  return (
    <Card
      title="Delivery"
      aside={<StatusPill tone={DELIVERY_TONES[delivery.status]}>{DELIVERY_LABELS[delivery.status] || delivery.status}</StatusPill>}
    >
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        <Row label="Method">{delivery.method || '—'}</Row>
        {delivery.references?.length > 0 && (
          <Row label="Delivery order"><span className="font-mono text-[13px]">{delivery.references.join(', ')}</span></Row>
        )}
        {delivery.shippedAt && <Row label="Shipped">{dateTime(delivery.shippedAt)}</Row>}
        {delivery.deliveredAt && <Row label="Delivered">{dateTime(delivery.deliveredAt)}</Row>}
        <Row label="Tracking">
          {hasTracking ? (
            <>
              {delivery.carrier && <span className="text-muted">{delivery.carrier} · </span>}
              {delivery.trackingCode && <span className="font-mono text-[13px]">{delivery.trackingCode}</span>}
              {delivery.trackingUrl && (
                <>
                  {' '}
                  <a href={delivery.trackingUrl} target="_blank" rel="noreferrer" className="text-accent link-underline">Track</a>
                </>
              )}
            </>
          ) : (
            <span className="text-faint">None yet</span>
          )}
        </Row>
      </dl>

      {mode === 'ship' || mode === 'tracking' ? (
        <form onSubmit={submit} className="mt-5 rounded-xs border border-line bg-sunken/40 p-4" noValidate>
          <p className="text-[13px] font-medium">{mode === 'ship' ? 'Mark as shipped' : 'Update tracking'}</p>
          {mode === 'ship' && <p className="mt-1 text-[12px] leading-relaxed text-muted">{shipNote}</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field id="t-carrier" label="Carrier" placeholder="Delhivery" value={form.carrier} onChange={set('carrier')} autoFocus />
            <Field id="t-code" label="Tracking number" placeholder="AWB 1234 5678" value={form.code} onChange={set('code')} />
            <Field
              id="t-url"
              label="Tracking link"
              placeholder="https://…"
              inputMode="url"
              invalid={Boolean(invalid)}
              value={form.url}
              onChange={set('url')}
            />
          </div>
          <Alert>{invalid || problem}</Alert>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button as="button" type="submit" size="sm" icon={mode === 'ship' ? 'truck' : undefined} disabled={Boolean(busy)}>
              {busy ? 'Saving…' : mode === 'ship' ? 'Confirm shipment' : 'Save tracking'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)} disabled={Boolean(busy)}>Cancel</Button>
          </div>
        </form>
      ) : mode === 'deliver' ? (
        <Confirm
          message={
            delivery.status === 'to_ship'
              ? 'Mark as delivered? It has not been marked as shipped yet, so this does both.'
              : 'Mark as delivered? The customer’s order page will say it has arrived.'
          }
          confirmLabel="Mark as delivered"
          busy={busy === 'deliver'}
          problem={problem}
          onConfirm={deliver}
          onCancel={() => setMode(null)}
        />
      ) : (
        <>
          <Alert>{problem}</Alert>
          {(can('ship') || can('deliver') || can('update_tracking')) && (
            <div className="mt-5 flex flex-wrap gap-2">
              {can('ship') && (
                <Button size="sm" icon="truck" onClick={() => open('ship')} disabled={Boolean(busy)}>Mark as shipped</Button>
              )}
              {can('deliver') && (
                <Button size="sm" variant={can('ship') ? 'quiet' : 'primary'} onClick={() => setMode('deliver')} disabled={Boolean(busy)}>
                  Mark as delivered
                </Button>
              )}
              {can('update_tracking') && (
                <Button size="sm" variant="quiet" onClick={() => open('tracking')} disabled={Boolean(busy)}>
                  {hasTracking ? 'Update tracking' : 'Add tracking'}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  )
}

function ItemsCard({ order }) {
  const lines = order.lines || []
  const count = lines.reduce((n, line) => n + (line.quantity || 1), 0)
  const totals = [
    ['Subtotal', order.subtotal],
    order.discount?.amount ? ['Discount', order.discount] : null,
    ['Shipping', order.shipping],
    ['Tax', order.tax],
  ].filter((row) => row && row[1])

  return (
    <Card title={`Items · ${count}`}>
      <ul className="divide-y divide-line">
        {lines.map((line, i) => {
          const image = typeof line.image === 'string' ? line.image : line.image?.url
          const unit = line.price || line.unitPrice
          return (
            <li key={line.id || i} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
              <div className="w-12 shrink-0">
                <div className="shot rounded-xs">{image && <img src={image} alt="" loading="lazy" />}</div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px]">{line.title}</p>
                <p className="mt-0.5 truncate text-[12px] text-faint">
                  {Object.values(line.options || {}).join(' · ')}
                  {line.sku ? ` · ${line.sku}` : ''}
                </p>
              </div>
              <p className="hidden text-[13px] tabular-nums text-muted sm:block">
                {line.quantity} × {unit ? formatMoney(unit) : '—'}
              </p>
              <p className="w-24 text-right text-[14px] tabular-nums">
                {line.lineTotal ? formatMoney(line.lineTotal) : ''}
                <span className="block text-[11px] text-faint sm:hidden">Qty {line.quantity}</span>
              </p>
            </li>
          )
        })}
      </ul>
      <dl className="mt-4 space-y-1.5 border-t border-line pt-4">
        {totals.map(([label, money]) => (
          <Row key={label} label={label}>{formatMoney(money)}</Row>
        ))}
        <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2.5 text-[15px]">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatMoney(order.total)}</dd>
        </div>
      </dl>
    </Card>
  )
}

function CustomerCard({ order }) {
  const customer = order.customer || {}
  const address = order.shippingAddress || {}
  return (
    <Card title="Customer">
      <p className="text-[14px] font-medium">{customer.name || address.name || '—'}</p>
      {customer.email && (
        <a href={`mailto:${customer.email}`} className="mt-1 block break-all text-[13px] text-accent link-underline">{customer.email}</a>
      )}
      {customer.phone && (
        <a href={`tel:${customer.phone}`} className="mt-0.5 block text-[13px] text-muted">{customer.phone}</a>
      )}
      {address.line1 && (
        <>
          <h3 className="eyebrow mt-5">Ship to</h3>
          <address className="mt-2 not-italic text-[13px] leading-relaxed text-muted">
            {address.name}
            <br />
            {address.line1}{address.line2 ? `, ${address.line2}` : ''}
            <br />
            {[address.city, address.region, address.postalCode].filter(Boolean).join(', ')}
            <br />
            {address.country}
          </address>
        </>
      )}
    </Card>
  )
}

function PaymentCard({ order, can, busy, run, problem, onRefund }) {
  const payment = order.payment
  const [confirming, setConfirming] = useState(false)
  const refundable = (order.total?.amount ?? 0) - (order.refundedTotal?.amount ?? 0)

  const record = async () => {
    if (await run('record_payment', {}, { area: 'payment', done: 'Payment recorded' })) setConfirming(false)
  }

  return (
    <Card
      title="Payment"
      aside={<StatusPill tone={PAYMENT_TONES[order.paymentStatus]}>{PAYMENT_LABELS[order.paymentStatus] || order.paymentStatus}</StatusPill>}
    >
      <dl className="space-y-2.5">
        <Row label="Method">{payment?.method || payment?.provider || '—'}</Row>
        <Row label="Amount"><span className="tabular-nums">{formatMoney(payment?.amount || order.total)}</span></Row>
        {payment?.capturedAt && <Row label="Received">{dateTime(payment.capturedAt)}</Row>}
        {order.refundedTotal?.amount > 0 && (
          <Row label="Refunded"><span className="tabular-nums">{formatMoney(order.refundedTotal)}</span></Row>
        )}
      </dl>

      {can('record_payment') &&
        (confirming ? (
          <Confirm
            message={`Record ${formatMoney(order.total)} as received? Do this once the courier has collected the cash.`}
            confirmLabel="Record payment"
            busy={busy === 'record_payment'}
            problem={problem}
            onConfirm={record}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          <>
            <Alert>{problem}</Alert>
            <Button className="mt-5" size="sm" onClick={() => setConfirming(true)} disabled={Boolean(busy)}>
              Record cash received
            </Button>
          </>
        ))}

      {isMock ? (
        order.paymentStatus === 'paid' && refundable > 0 && (
          <Button className="mt-4" size="sm" variant="quiet" onClick={onRefund} disabled={Boolean(busy)}>Refund</Button>
        )
      ) : (
        <p className="mt-4 text-[12px] leading-relaxed text-faint">
          Refunds are issued in Odoo
          {order.backendUrl && (
            <>
              {' — '}
              <a href={order.backendUrl} target="_blank" rel="noreferrer" className="link-underline">open this order there</a>
            </>
          )}
          .
        </p>
      )}
    </Card>
  )
}

function CancelCard({ order, busy, run, problem }) {
  const [confirming, setConfirming] = useState(false)
  const paid = ['paid', 'authorized'].includes(order.paymentStatus)

  const cancel = async () => {
    if (await run('cancel', {}, { area: 'cancel', done: 'Order cancelled' })) setConfirming(false)
  }

  return (
    <section className="rounded-xs border border-line p-5">
      <h2 className="eyebrow">Cancel order</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        Until it ships, an order can be cancelled and its stock goes back on sale
        {isMock ? '.' : ' — Odoo cancels the order and its delivery.'}
      </p>
      {confirming ? (
        <Confirm
          danger
          message={`Cancel ${order.number}?${paid ? ` It was paid — issue the refund ${isMock ? 'under Payment' : 'in Odoo'} as well.` : ''}`}
          confirmLabel="Cancel order"
          busy={busy === 'cancel'}
          problem={problem}
          onConfirm={cancel}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <>
          <Alert>{problem}</Alert>
          <div className="mt-4">
            <DangerButton onClick={() => setConfirming(true)} disabled={Boolean(busy)}>Cancel order</DangerButton>
          </div>
        </>
      )}
    </section>
  )
}

/**
 * Refund some or all of an order — demo only. Against a real backend refunds go
 * through the payment provider from the back office.
 *
 * Defaults to the outstanding amount, because that is what "Refund" means when
 * nobody has typed a number, and shows what has already gone back so a second
 * refund is not issued from memory. Only a full refund offers to restock:
 * guessing which line a partial refund refers to would put the wrong variant
 * back on the shelf, and a phantom unit in stock is worse than a missing one.
 */
function RefundDialog({ order, onClose, onDone, onError }) {
  const already = order.refundedTotal?.amount ?? 0
  const remaining = order.total.amount - already
  const currency = order.total.currency

  const [amount, setAmount] = useState((remaining / 100).toFixed(2))
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(true)
  const [busy, setBusy] = useState(false)

  const minor = Math.round(Number(amount) * 100)
  const full = minor === remaining
  const invalid = !Number.isFinite(minor) || minor <= 0 || minor > remaining

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.adminRefundOrder(order.id, { amount: minor, reason, restock: restock && full })
      onDone(full ? 'Refunded in full' : `Refunded ${formatMoney({ amount: minor, currency })}`)
    } catch (err) {
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Refund order">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-xs border border-line bg-page p-5">
        <h2 className="text-[15px] font-medium">Refund {order.number}</h2>
        <p className="mt-1.5 text-[12px] text-faint">
          {formatMoney(order.total)} paid
          {already > 0 && ` · ${formatMoney(order.refundedTotal)} already refunded`}
        </p>

        <label htmlFor="refund-amount" className="mb-1.5 mt-4 block text-[13px] font-medium">Amount</label>
        <input
          id="refund-amount"
          type="number"
          step="0.01"
          min="0.01"
          max={(remaining / 100).toFixed(2)}
          className="field tabular-nums"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <p className={`mt-1 text-[11px] ${invalid ? 'text-sale' : 'text-faint'}`}>
          {invalid
            ? `Enter between 0.01 and ${(remaining / 100).toFixed(2)}`
            : `${formatMoney({ amount: remaining, currency })} outstanding`}
        </p>

        <label htmlFor="refund-reason" className="mb-1.5 mt-4 block text-[13px] font-medium">
          Reason <span className="font-normal text-faint">— for your records</span>
        </label>
        <input
          id="refund-reason"
          className="field"
          placeholder="Returned, wrong size"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <label className={`mt-4 flex items-center gap-2.5 text-[13px] ${full ? '' : 'text-faint'}`}>
          <input
            type="checkbox"
            checked={restock && full}
            disabled={!full}
            onChange={(e) => setRestock(e.target.checked)}
            className="h-4 w-4 accent-[rgb(var(--accent))]"
          />
          Put the stock back
        </label>
        {!full && (
          <p className="mt-1 text-[11px] text-faint">
            Only on a full refund — a partial one does not say which item came back.
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="quiet" onClick={onClose}>Cancel</Button>
          <Button as="button" type="submit" disabled={invalid || busy}>
            {busy ? 'Refunding…' : 'Refund'}
          </Button>
        </div>
      </form>
    </div>
  )
}
