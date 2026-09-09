import { useMemo, useState } from 'react'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { Button, Empty, Icon, Skeleton, Badge } from '../../components/ui/index.jsx'
import { useToast } from '../../store/ToastContext.jsx'
import RecordRow, { RowAction } from '../../components/admin/RecordRow.jsx'
import ListToolbar, { matches } from '../../components/admin/ListToolbar.jsx'
import { formatMoney } from '../../lib/money.js'

/* ── categories ────────────────────────────────────────────────────────── */

export function Categories() {
  const { data, loading, reload } = useAsync(() => api.listCategories(), [])
  const [editing, setEditing] = useState(null)
  const [q, setQ] = useState('')
  const { push } = useToast()

  const save = async (e) => {
    e.preventDefault()
    try {
      await api.adminSaveCategory(editing)
      push('Category saved')
      setEditing(null)
      reload()
    } catch (err) {
      push(err.message, { tone: 'error' })
    }
  }

  const allRoots = useMemo(() => data?.items || [], [data])
  const roots = useMemo(() => {
    if (!q.trim()) return allRoots
    // A search that hides a matching child because its parent did not match is
    // a search that appears broken. Keep the parent as context.
    return allRoots
      .map((r) => {
        const rootHit = matches(q, r.name, r.slug)
        const kids = (r.children || []).filter((c) => matches(q, c.name, c.slug))
        if (!rootHit && !kids.length) return null
        return { ...r, children: rootHit ? r.children : kids }
      })
      .filter(Boolean)
  }, [allRoots, q])
  const set = (k) => (e) => setEditing((c) => ({ ...c, [k]: e.target.value }))

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-display-md">Categories</h1>
        {!editing && (
          <Button size="sm" icon="plus" onClick={() => setEditing({ slug: '', name: '', parent: null, blurb: '' })}>
            New
          </Button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-8 max-w-md space-y-4">
          <Row label="Slug" value={editing.slug} onChange={set('slug')} mono required />
          <Row label="Name" value={editing.name} onChange={set('name')} required />
          <div>
            <label htmlFor="parent" className="mb-1.5 block text-[13px] font-medium">Parent</label>
            <select
              id="parent"
              className="field"
              value={editing.parent || ''}
              onChange={(e) => setEditing((c) => ({ ...c, parent: e.target.value || null }))}
            >
              <option value="">— top level —</option>
              {allRoots.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
            </select>
            <p className="mt-1.5 text-[12px] text-faint">
              A parent&rsquo;s product count and filters include everything under it.
            </p>
          </div>
          <Row label="Blurb" value={editing.blurb} onChange={set('blurb')} />
          <div className="flex gap-3 pt-2">
            <Button as="button" type="submit">Save</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </form>
      ) : loading ? (
        <Skeleton className="mt-8 h-64 w-full" />
      ) : (
        <>
        <ListToolbar
          className="mt-6"
          query={q}
          onQuery={setQ}
          placeholder="Search category name or slug"
          count={roots.reduce((a, r) => a + 1 + (r.children?.length || 0), 0)}
          total={allRoots.reduce((a, r) => a + 1 + (r.children?.length || 0), 0)}
        />
        <ul className="mt-6 space-y-2">
          {roots.map((r) => (
            <li key={r.slug} className="space-y-2">
              <RecordRow onOpen={() => setEditing({ ...r })} label={`Edit ${r.name}`}>
                <p className="font-medium">
                  {r.name} <span className="ml-1.5 text-[12px] text-faint tabular-nums">{r.count}</span>
                </p>
                <p className="font-mono text-[11px] text-faint">{r.slug}</p>
              </RecordRow>
              {r.children?.map((c) => (
                <RecordRow key={c.slug} indent onOpen={() => setEditing({ ...c })} label={`Edit ${c.name}`}>
                  <p className="text-[14px] text-muted">
                    {c.name} <span className="ml-1.5 text-[12px] text-faint tabular-nums">{c.count}</span>
                  </p>
                  <p className="font-mono text-[11px] text-faint">{c.slug}</p>
                </RecordRow>
              ))}
            </li>
          ))}
        </ul>
        </>
      )}
    </>
  )
}

/* ── size charts ───────────────────────────────────────────────────────── */

export function SizeCharts() {
  const { data, loading, reload } = useAsync(() => api.listSizeCharts(), [])
  const [editing, setEditing] = useState(null)
  const [q, setQ] = useState('')
  const { push } = useToast()

  const rows = useMemo(
    () => (data?.items || []).filter((c) => matches(q, c.id, c.columns.join(' '), c.note)),
    [data, q],
  )

  const save = async (e) => {
    e.preventDefault()
    try {
      await api.adminSaveSizeChart(editing)
      push('Size chart saved — every product using it updates')
      setEditing(null)
      reload()
    } catch (err) {
      push(err.message, { tone: 'error' })
    }
  }

  const setCell = (r, c, v) =>
    setEditing((ch) => ({
      ...ch,
      rows: ch.rows.map((row, i) => (i === r ? row.map((cell, k) => (k === c ? v : cell)) : row)),
    }))

  if (loading) return <Skeleton className="h-64 w-full" />

  if (editing) {
    return (
      <form onSubmit={save} className="max-w-3xl">
        <button type="button" onClick={() => setEditing(null)} className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted link-underline">
          <Icon name="chevron-left" size={14} /> All charts
        </button>
        <h1 className="text-display-md">{editing.id}</h1>
        <p className="mt-2 text-[13px] text-muted">
          Garment measurements laid flat, not body measurements. Shared — every product pointing at
          this chart shows the change.
        </p>

        <div className="mt-8 overflow-x-auto rounded-xs border border-line">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line bg-sunken/40 text-left">
                {editing.columns.map((c, i) => (
                  <th key={i} className="p-2">
                    <input
                      className="field h-8 font-medium"
                      value={c}
                      onChange={(e) => setEditing((ch) => ({ ...ch, columns: ch.columns.map((x, k) => (k === i ? e.target.value : x)) }))}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {editing.rows.map((row, r) => (
                <tr key={r} className="border-b border-line last:border-0">
                  {row.map((cell, c) => (
                    <td key={c} className="p-2">
                      <input className="field h-8 tabular-nums" value={cell} onChange={(e) => setCell(r, c, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex gap-3">
          <Button size="sm" variant="quiet" icon="plus"
            onClick={() => setEditing((ch) => ({ ...ch, rows: [...ch.rows, ch.columns.map(() => '')] }))}>
            Add size
          </Button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="unit" className="mb-1.5 block text-[13px] font-medium">Unit</label>
            <select id="unit" className="field max-w-[10rem]" value={editing.unit}
              onChange={(e) => setEditing((ch) => ({ ...ch, unit: e.target.value }))}>
              <option value="cm">cm</option>
              <option value="in">in</option>
            </select>
          </div>
          <div>
            <label htmlFor="note" className="mb-1.5 block text-[13px] font-medium">Note</label>
            <textarea id="note" rows={2} className="field" value={editing.note}
              onChange={(e) => setEditing((ch) => ({ ...ch, note: e.target.value }))} />
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <Button as="button" type="submit">Save chart</Button>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
        </div>
      </form>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-display-md">Size charts</h1>
        <Button size="sm" icon="plus"
          onClick={() => setEditing({ id: '', unit: 'cm', note: '', columns: ['Size', 'Chest', 'Length'], rows: [['S', '', ''], ['M', '', '']] })}>
          New chart
        </Button>
      </div>
      <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-muted">
        Shared across products. Editing one here fixes it everywhere it is used, rather than nine
        copies of the same table drifting apart.
      </p>

      <ListToolbar
        className="mt-6"
        query={q}
        onQuery={setQ}
        placeholder="Search chart name or column"
        count={rows.length}
        total={data?.items?.length ?? 0}
      />

      <ul className="mt-6 space-y-2">
        {rows.map((c) => (
          <li key={c.id}>
            <RecordRow onOpen={() => setEditing(structuredClone(c))} label={`Edit ${c.id}`}>
              <p className="font-mono text-[14px] text-ink">{c.id}</p>
              <p className="mt-1 text-[12px] text-faint">
                {c.rows.length} sizes · {c.columns.slice(1).join(', ')} · {c.unit}
              </p>
            </RecordRow>
          </li>
        ))}
      </ul>
    </>
  )
}

/* ── orders ────────────────────────────────────────────────────────────── */

const STATUSES = ['placed', 'paid', 'fulfilled', 'delivered', 'cancelled', 'refunded']

export function Orders() {
  const { data, loading, reload } = useAsync(() => api.listOrders(), [])
  const { push } = useToast()
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort] = useState('newest')

  const rows = useMemo(() => {
    let items = (data?.items || []).filter((o) =>
      matches(q, o.number, o.email, o.shippingAddress?.name, o.tracking?.code),
    )
    if (statusFilter !== 'all') items = items.filter((o) => o.status === statusFilter)
    const by = {
      newest: (a, b) => (a.placedAt < b.placedAt ? 1 : -1),
      oldest: (a, b) => (a.placedAt > b.placedAt ? 1 : -1),
      'total-desc': (a, b) => b.total.amount - a.total.amount,
      'total-asc': (a, b) => a.total.amount - b.total.amount,
    }
    return items.slice().sort(by[sort] || by.newest)
  }, [data, q, statusFilter, sort])

  const [refunding, setRefunding] = useState(null)

  const setStatus = async (id, status) => {
    try {
      await api.adminUpdateOrder(id, { status })
      push(status === 'cancelled' ? 'Cancelled — stock returned' : `Marked ${status}`)
      reload()
    } catch (err) {
      push(err.message, { tone: 'error' })
    }
  }
  if (loading) return <Skeleton className="h-64 w-full" />
  if (!data?.items.length) {
    return <Empty icon="truck" title="No orders yet" body="Place one from the storefront and it will appear here." />
  }
  return (
    <>
      <h1 className="text-display-md">Orders</h1>
      <p className="mt-3 text-[13px] text-muted">
        Cancelling returns the stock. An order that disappears without giving its units back is how
        a catalogue quietly loses inventory nobody can account for. Refunds are recorded per order,
        because a partial refund is the common case and a flag cannot express one.
      </p>

      <ListToolbar
        className="mt-6"
        query={q}
        onQuery={setQ}
        placeholder="Search order number, email or tracking"
        filters={[
          {
            label: 'Status',
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: 'all', label: 'All statuses' },
              ...STATUSES.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })),
            ],
          },
        ]}
        sorts={[
          { value: 'newest', label: 'Newest first' },
          { value: 'oldest', label: 'Oldest first' },
          { value: 'total-desc', label: 'Highest value' },
          { value: 'total-asc', label: 'Lowest value' },
        ]}
        sort={sort}
        onSort={setSort}
        count={rows.length}
        total={data?.items?.length ?? 0}
      />

      <div className="mt-6 overflow-x-auto rounded-xs border border-line bg-surface">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="p-3 font-medium">Order</th>
              <th className="p-3 font-medium">Placed</th>
              <th className="p-3 font-medium">Customer</th>
              <th className="p-3 font-medium">Items</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Tracking</th>
              <th className="p-3 font-medium text-right">Total</th>
              <th className="p-3 font-medium text-right">Refunded</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-b border-line last:border-0">
                <td className="p-3 font-mono text-[12px]">{o.number}</td>
                <td className="p-3 text-muted">{new Date(o.placedAt).toLocaleDateString()}</td>
                <td className="p-3 text-muted">{o.email}</td>
                <td className="p-3 tabular-nums">{o.lines.length}</td>
                <td className="p-3">
                  <select
                    aria-label={`Status for ${o.number}`}
                    value={o.status}
                    onChange={(e) => setStatus(o.id, e.target.value)}
                    className="field h-8 py-0 text-[12px]"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="p-3 font-mono text-[11px] text-faint">{o.tracking?.code || '—'}</td>
                <td className="p-3 text-right tabular-nums">{formatMoney(o.total)}</td>
                <td className="p-3 text-right tabular-nums text-muted">
                  {o.refundedTotal?.amount ? formatMoney(o.refundedTotal) : '—'}
                </td>
                <td className="p-3 text-right">
                  {(o.refundedTotal?.amount ?? 0) < o.total.amount && (
                    <Button size="sm" variant="quiet" onClick={() => setRefunding(o)}>
                      Refund
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {refunding && (
        <RefundDialog
          order={refunding}
          onClose={() => setRefunding(null)}
          onDone={(message) => {
            setRefunding(null)
            push(message)
            reload()
          }}
          onError={(message) => push(message, { tone: 'error' })}
        />
      )}
    </>
  )
}

/**
 * Refund some or all of an order.
 *
 * Defaults to the outstanding amount, because that is what "Refund" means when
 * nobody has typed a number, and shows what has already gone back so a second
 * refund is not issued from memory.
 *
 * Only a full refund offers to restock. Guessing which line a partial refund
 * refers to would put the wrong variant back on the shelf, and a phantom unit
 * in stock is worse than a missing one — it sells.
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

/* ── discounts ─────────────────────────────────────────────────────────── */

export function Discounts() {
  const { data, loading, reload } = useAsync(() => api.adminListDiscounts(), [])
  const [editing, setEditing] = useState(null)
  const [q, setQ] = useState('')
  const [state, setState] = useState('all')
  const { push } = useToast()

  const rows = useMemo(() => {
    let items = (data?.items || []).filter((d) => matches(q, d.code, d.label, d.kind))
    if (state === 'active') items = items.filter((d) => d.active !== false)
    if (state === 'inactive') items = items.filter((d) => d.active === false)
    return items
  }, [data, q, state])

  const save = async (e) => {
    e.preventDefault()
    try {
      await api.adminSaveDiscount(editing)
      push('Code saved')
      setEditing(null)
      reload()
    } catch (err) {
      push(err.message, { tone: 'error' })
    }
  }

  const remove = async (code) => {
    await api.adminDeleteDiscount(code)
    push('Code removed')
    reload()
  }

  if (loading) return <Skeleton className="h-64 w-full" />

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-display-md">Discounts</h1>
        {!editing && (
          <Button size="sm" icon="plus"
            onClick={() => setEditing({ code: '', label: '', kind: 'percent', value: 10, active: true })}>
            New code
          </Button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-8 max-w-md space-y-4">
          <Row label="Code" mono required value={editing.code}
            onChange={(e) => setEditing((d) => ({ ...d, code: e.target.value.toUpperCase() }))} />
          <Row label="Label shown to the shopper" value={editing.label}
            onChange={(e) => setEditing((d) => ({ ...d, label: e.target.value }))} />
          <div>
            <label htmlFor="kind" className="mb-1.5 block text-[13px] font-medium">Type</label>
            <select id="kind" className="field" value={editing.kind}
              onChange={(e) => setEditing((d) => ({ ...d, kind: e.target.value }))}>
              <option value="percent">Percentage off</option>
              <option value="fixed">Fixed amount off (minor units)</option>
              <option value="shipping">Free shipping</option>
            </select>
          </div>
          {editing.kind !== 'shipping' && (
            <Row label={editing.kind === 'percent' ? 'Percent' : 'Amount (minor units)'} type="number"
              value={editing.value}
              onChange={(e) => setEditing((d) => ({ ...d, value: Number(e.target.value) }))} />
          )}
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
            <input type="checkbox" checked={editing.active !== false}
              onChange={(e) => setEditing((d) => ({ ...d, active: e.target.checked }))}
              className="h-4 w-4 accent-[rgb(var(--accent))]" />
            Active
          </label>
          <div className="flex gap-3 pt-2">
            <Button as="button" type="submit">Save</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <>
        <ListToolbar
          className="mt-6"
          query={q}
          onQuery={setQ}
          placeholder="Search code or label"
          filters={[
            {
              label: 'State',
              value: state,
              onChange: setState,
              options: [
                { value: 'all', label: 'All codes' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ],
            },
          ]}
          count={rows.length}
          total={data?.items?.length ?? 0}
        />
        <ul className="mt-6 space-y-2">
          {rows.map((d) => (
            <li key={d.code}>
              <RecordRow
                onOpen={() => setEditing({ ...d })}
                label={`Edit ${d.code}`}
                actions={<RowAction label={`Delete ${d.code}`} onClick={() => remove(d.code)} />}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <code className="font-mono text-[14px] text-ink">{d.code}</code>
                  <Badge kind={d.active === false ? 'sold-out' : 'bestseller'}>
                    {d.active === false
                      ? 'inactive'
                      : d.kind === 'percent'
                        ? `${d.value}% off`
                        : d.kind === 'fixed'
                          ? 'fixed amount'
                          : 'free shipping'}
                  </Badge>
                </div>
                <p className="mt-1 text-[13px] text-muted">{d.label}</p>
              </RecordRow>
            </li>
          ))}
        </ul>
        </>
      )}
    </>
  )
}

/* ── storefront settings ───────────────────────────────────────────────── */

export function Storefront() {
  const { data, loading, reload } = useAsync(() => api.getStorefront(), [])
  const [draft, setDraft] = useState(null)
  const { push } = useToast()

  const cfg = draft ?? data
  if (loading || !cfg) return <Skeleton className="h-96 w-full" />

  const patch = (path, value) => {
    const next = structuredClone(cfg)
    let node = next
    const keys = path.split('.')
    keys.slice(0, -1).forEach((k) => { node[k] = node[k] || {}; node = node[k] })
    node[keys.at(-1)] = value
    setDraft(next)
  }

  const save = async () => {
    try {
      await api.adminUpdateSettings(draft)
      push('Settings saved — the storefront picks them up on next load')
      setDraft(null)
      reload()
    } catch (err) {
      push(err.message, { tone: 'error' })
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-display-md">Storefront</h1>
        {draft && (
          <div className="flex gap-3">
            <Button size="sm" onClick={save}>Save changes</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Discard</Button>
          </div>
        )}
      </div>

      <div className="mt-8 max-w-2xl space-y-8">
        <Group title="Company profile" note="Shown in the header, footer, page titles and the Open Graph card.">
          <Row label="Store name" value={cfg.store?.name || ''} onChange={(e) => patch('store.name', e.target.value)} />
          <Row label="Tagline" value={cfg.store?.tagline || ''} onChange={(e) => patch('store.tagline', e.target.value)} />
          <Row label="Support email" value={cfg.store?.email || ''} onChange={(e) => patch('store.email', e.target.value)} />
          <Row label="Logo image URL" value={cfg.store?.logo?.imageUrl || ''} onChange={(e) => patch('store.logo.imageUrl', e.target.value || null)} placeholder="Leave empty to use the built-in mark" />
        </Group>

        <Group title="Pricing" note="Prices arrive from the API already in the store currency — nothing is converted in the browser.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cur" className="mb-1.5 block text-[13px] font-medium">Currency</label>
              <select id="cur" className="field" value={cfg.pricing?.currency} onChange={(e) => patch('pricing.currency', e.target.value)}>
                {(cfg.pricing?.currencies || []).map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
              </select>
            </div>
            <Row label="Locale" value={cfg.pricing?.locale || ''} onChange={(e) => patch('pricing.locale', e.target.value)} mono />
          </div>
          <Row
            label="Free shipping over (minor units)"
            type="number"
            value={cfg.commerce?.freeShippingOver ?? 0}
            onChange={(e) => patch('commerce.freeShippingOver', Number(e.target.value))}
          />
          <Row
            label="Returns window (days)"
            type="number"
            value={cfg.commerce?.returnsWindowDays ?? 30}
            onChange={(e) => patch('commerce.returnsWindowDays', Number(e.target.value))}
          />
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
            <input type="checkbox" checked={!!cfg.pricing?.showTaxNote}
              onChange={(e) => patch('pricing.showTaxNote', e.target.checked)}
              className="h-4 w-4 accent-[rgb(var(--accent))]" />
            Show a tax note in the cart
          </label>
          {cfg.pricing?.showTaxNote && (
            <Row label="Tax note" value={cfg.pricing?.taxNote || ''} onChange={(e) => patch('pricing.taxNote', e.target.value)} />
          )}
          <p className="text-[12px] text-faint">
            {formatMoney({ amount: cfg.commerce?.freeShippingOver || 0, currency: cfg.pricing?.currency || 'USD' })}
          </p>
        </Group>

        <Group
          title="Delivery &amp; returns"
          note="The panel on every product page. Numbers come from the settings above — write {shipping}, {freeOver} or {returnsDays} and they fill themselves in, so the prose cannot drift from what the cart charges."
        >
          <ul className="space-y-3">
            {(cfg.deliveryPolicy || []).map((line, i) => (
              <li key={i} className="flex items-start gap-2">
                <textarea
                  rows={2}
                  className="field text-[13px]"
                  value={line}
                  onChange={(e) =>
                    patch('deliveryPolicy', (cfg.deliveryPolicy || []).map((l, k) => (k === i ? e.target.value : l)))
                  }
                />
                <button
                  type="button"
                  aria-label="Remove paragraph"
                  onClick={() => patch('deliveryPolicy', (cfg.deliveryPolicy || []).filter((_, k) => k !== i))}
                  className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xs text-faint transition-colors hover:bg-sale/10 hover:text-sale"
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="quiet"
            icon="plus"
            onClick={() => patch('deliveryPolicy', [...(cfg.deliveryPolicy || []), ''])}
          >
            Add paragraph
          </Button>
          <p className="text-[12px] leading-relaxed text-faint">
            Preview:{' '}
            {(cfg.deliveryPolicy || [])
              .join(' ')
              .replace(/\{shipping\}/g, formatMoney({ amount: cfg.commerce?.shippingMethods?.[0]?.price ?? 0, currency: cfg.pricing?.currency || 'USD' }))
              .replace(/\{freeOver\}/g, formatMoney({ amount: cfg.commerce?.freeShippingOver ?? 0, currency: cfg.pricing?.currency || 'USD' }))
              .replace(/\{returnsDays\}/g, String(cfg.commerce?.returnsWindowDays ?? 30))
              .slice(0, 260) || 'Nothing set — the panel will not render.'}
          </p>
        </Group>

        <Group title="Features" note="Turning one off removes its entry points. Routes stay reachable so old bookmarks do not 404.">
          <ul className="space-y-2.5">
            {Object.entries(cfg.features || {}).map(([k, v]) => (
              <li key={k}>
                <label className="flex cursor-pointer items-center gap-2.5 text-[14px]">
                  <input
                    type="checkbox"
                    checked={!!v}
                    onChange={(e) => patch(`features.${k}`, e.target.checked)}
                    className="h-4 w-4 accent-[rgb(var(--accent))]"
                  />
                  <span className="capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                </label>
              </li>
            ))}
          </ul>
        </Group>

        <Group title="Recommendations" note="How “You might also like” is chosen.">
          <div>
            <label htmlFor="strategy" className="mb-1.5 block text-[13px] font-medium">Strategy</label>
            <select id="strategy" className="field" value={cfg.recommendations?.strategy} onChange={(e) => patch('recommendations.strategy', e.target.value)}>
              {['automatic', 'same-category', 'best-sellers', 'manual', 'api', 'off'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <Row label="How many" type="number" value={cfg.recommendations?.limit ?? 4} onChange={(e) => patch('recommendations.limit', Number(e.target.value))} />
        </Group>

        <SeoGroup cfg={cfg} patch={patch} />
        <PaymentsGroup cfg={cfg} patch={patch} />
        <EmailGroup cfg={cfg} patch={patch} />
        <CredentialsGroup />

        <Group title="Checkout" note="redirect hands off to a payment provider — no card data ever enters the storefront.">
          <div>
            <label htmlFor="mode" className="mb-1.5 block text-[13px] font-medium">Mode</label>
            <select id="mode" className="field" value={cfg.checkout?.mode} onChange={(e) => patch('checkout.mode', e.target.value)}>
              {['demo', 'redirect', 'api'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <Row label="Create URL" value={cfg.checkout?.createUrl || ''} onChange={(e) => patch('checkout.createUrl', e.target.value)} mono />
        </Group>
      </div>
    </>
  )
}

/* ── data ──────────────────────────────────────────────────────────────── */

export function Data() {
  const { push } = useToast()
  const [busy, setBusy] = useState(false)

  const exportJson = async () => {
    const payload = await api.adminExport()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `catalog-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const payload = JSON.parse(await file.text())
      const result = await api.adminImport({ ...payload, mode: 'merge' })
      push(`Imported ${result.products} products, ${result.categories} categories`)
    } catch (err) {
      push(err.message || 'That file could not be read.', { tone: 'error' })
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  const reset = async () => {
    setBusy(true)
    try {
      await api.adminReset()
      push('Reset to the seeded demo catalogue')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1 className="text-display-md">Import and export</h1>
      <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted">
        The same payload the bulk endpoint takes. A nightly ERP dump posts this shape to
        <code className="mx-1 rounded-xs bg-sunken px-1.5 py-0.5 font-mono text-[12px]">POST /admin/import</code>
        rather than issuing a thousand individual writes.
      </p>

      <div className="mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
        <Card title="Export" body="Everything — products, categories, collections and settings — as one JSON file.">
          <Button size="sm" onClick={exportJson} icon="package">Download JSON</Button>
        </Card>

        <Card title="Import" body="Merged by slug. Existing products are updated, new ones added, nothing is deleted.">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xs border border-line bg-surface px-3.5 text-[13px] transition-colors hover:border-ink">
            <Icon name="refresh" size={15} />
            {busy ? 'Working…' : 'Choose a file'}
            <input type="file" accept="application/json" onChange={importJson} className="sr-only" />
          </label>
        </Card>
      </div>

      <div className="mt-8 max-w-2xl rounded-xs border border-sale/25 bg-surface p-5">
        <h2 className="text-[14px] font-medium text-sale">Reset</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Discards every change and reseeds the demo catalogue. Local data only — this never touches
          a real backend.
        </p>
        <Button size="sm" variant="quiet" className="mt-4" onClick={reset} disabled={busy}>
          Reset to demo data
        </Button>
      </div>
    </>
  )
}

/* ── bits ──────────────────────────────────────────────────────────────── */

/**
 * Search engines and crawlers.
 *
 * Every line here is policy rather than engineering, which is exactly why it is
 * a screen and not a file. Whether an AI crawler may read your catalogue is a
 * decision about your business — some stores want the traffic an assistant
 * sends, some do not want their photography in a training set — and a theme
 * that picks for you has picked wrong for half its users.
 */
function SeoGroup({ cfg, patch }) {
  const seo = cfg.seo || {}
  const mode = seo.aiCrawlers || 'allow'

  return (
    <Group
      title="Search engines"
      note="Written into robots.txt and the sitemap at build time. Nothing here changes what a shopper sees."
    >
      <Row
        label="Site URL"
        mono
        placeholder="https://yourshop.com"
        value={seo.siteUrl || ''}
        onChange={(e) => patch('seo.siteUrl', e.target.value)}
      />
      <p className="-mt-2 text-[12px] leading-relaxed text-faint">
        Required, and the one setting with no sensible default. A sitemap, a canonical tag and an
        Open Graph image all need absolute URLs — a relative one is ignored by every scraper that
        reads it.
      </p>

      <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
        <input
          type="checkbox"
          checked={seo.indexable !== false}
          onChange={(e) => patch('seo.indexable', e.target.checked)}
          className="h-4 w-4 accent-[rgb(var(--accent))]"
        />
        Allow search engines to index this shop
      </label>
      {seo.indexable === false && (
        <p className="-mt-2 rounded-xs border border-sale/30 bg-sale/5 p-3 text-[12px] leading-relaxed text-muted">
          <strong className="text-ink">Nothing here will appear in search.</strong> Right for a
          staging deployment — a staging site that is indexed competes with production for its own
          keywords — and wrong for anything you are selling from.
        </p>
      )}

      <div>
        <label htmlFor="ai-crawlers" className="mb-1.5 block text-[13px] font-medium">
          AI crawlers
        </label>
        <select
          id="ai-crawlers"
          className="field"
          value={mode}
          onChange={(e) => patch('seo.aiCrawlers', e.target.value)}
        >
          <option value="allow">Allow — assistants can read and cite the shop</option>
          <option value="block">Block all of them</option>
          <option value="custom">Decide one at a time</option>
        </select>
        <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
          Assistants increasingly answer &ldquo;where can I buy a linen shirt&rdquo;, and a shop
          they cannot read is not in the answer. Against that, your photography and product copy end
          up in a training set. Both are defensible; this is your call, not the theme&rsquo;s.
        </p>
      </div>

      {mode === 'custom' && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.entries(seo.crawlers || {}).map(([bot, allowed]) => (
            <li key={bot}>
              <label className="flex cursor-pointer items-center gap-2.5 font-mono text-[12px]">
                <input
                  type="checkbox"
                  checked={Boolean(allowed)}
                  onChange={(e) => patch(`seo.crawlers.${bot}`, e.target.checked)}
                  className="h-4 w-4 accent-[rgb(var(--accent))]"
                />
                {bot}
              </label>
            </li>
          ))}
        </ul>
      )}

      <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
        <input
          type="checkbox"
          checked={seo.sitemapImages !== false}
          onChange={(e) => patch('seo.sitemapImages', e.target.checked)}
          className="h-4 w-4 accent-[rgb(var(--accent))]"
        />
        List product photographs in the sitemap
      </label>
      <p className="-mt-2 text-[12px] leading-relaxed text-faint">
        Google Images is a shopping surface of its own, and it will not find pictures that exist
        only inside a gallery. This is the entire cost of appearing there.
      </p>
    </Group>
  )
}

/* ── payments, email and the things that must never reach a browser ────── */

const MODES = [
  ['demo', 'Demo — fake orders, no money'],
  ['redirect', 'Redirect — the provider hosts the payment page'],
  ['razorpay', 'Razorpay — their modal, over your page'],
  ['api', 'Your endpoint — you settle payment elsewhere'],
]

function PaymentsGroup({ cfg, patch }) {
  const mode = cfg.checkout?.mode || 'demo'
  return (
    <Group
      title="Payments"
      note="Which of these runs is configuration, not code — you can move from a demo to a live provider without a rebuild."
    >
      <div>
        <label htmlFor="pay-mode" className="mb-1.5 block text-[13px] font-medium">Mode</label>
        <select id="pay-mode" className="field" value={mode} onChange={(e) => patch('checkout.mode', e.target.value)}>
          {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {mode === 'demo' && (
        <p className="rounded-xs border border-line bg-surface p-3 text-[12px] leading-relaxed text-muted">
          Orders are placed against the bundled demo backend. Nothing is charged and no email is
          sent. Fine for a preview; switch before anyone can reach the shop.
        </p>
      )}

      {mode !== 'demo' && (
        <>
          <Row
            label={mode === 'razorpay' ? 'Razorpay key_id' : 'Publishable key'}
            mono
            placeholder="rzp_live_…"
            value={cfg.checkout?.publicKey || ''}
            onChange={(e) => patch('checkout.publicKey', e.target.value)}
          />
          <p className="-mt-2 text-[12px] leading-relaxed text-faint">
            Public by design — it ships in the page and is meant to. Its secret counterpart goes
            below and is never stored here.
          </p>

          <Row
            label="Create-order endpoint"
            mono
            placeholder="/carts/:cartId/checkout"
            value={cfg.checkout?.createUrl || ''}
            onChange={(e) => patch('checkout.createUrl', e.target.value)}
          />
          {mode === 'razorpay' && (
            <Row
              label="Verify endpoint"
              mono
              placeholder="/payments/verify"
              value={cfg.checkout?.verifyUrl || ''}
              onChange={(e) => patch('checkout.verifyUrl', e.target.value)}
            />
          )}
          <p className="-mt-2 text-[12px] leading-relaxed text-faint">
            {mode === 'razorpay'
              ? 'Your server creates the Razorpay order with its secret and verifies the signature afterwards. The browser only ever holds the key_id — a browser that could create the order could create one for a penny.'
              : 'Your server returns { "url": "…" } and the browser is sent there.'}
          </p>
        </>
      )}

      <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
        <input
          type="checkbox"
          checked={cfg.checkout?.restockOnRefund !== false}
          onChange={(e) => patch('checkout.restockOnRefund', e.target.checked)}
          className="h-4 w-4 accent-[rgb(var(--accent))]"
        />
        Put stock back on a full refund
      </label>
    </Group>
  )
}

function EmailGroup({ cfg, patch }) {
  const notifications = cfg.notifications || {}
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const { push } = useToast()

  const sendTest = async () => {
    setSending(true)
    try {
      setResult(await api.adminSendTestNotification({ event: 'orderPlaced' }))
    } catch (err) {
      push(err.message, { tone: 'error' })
    } finally {
      setSending(false)
    }
  }

  return (
    <Group
      title="Email"
      note="A store that takes money and sends nothing is broken. The storefront decides when to send; your server does the sending — SMTP needs a socket, and an app password needs somewhere to hide."
    >
      <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
        <input
          type="checkbox"
          checked={notifications.enabled !== false}
          onChange={(e) => patch('notifications.enabled', e.target.checked)}
          className="h-4 w-4 accent-[rgb(var(--accent))]"
        />
        Send transactional email
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Row label="From" mono placeholder="orders@yourshop.com" value={notifications.from || ''} onChange={(e) => patch('notifications.from', e.target.value)} />
        <Row label="Reply-to" mono placeholder="help@yourshop.com" value={notifications.replyTo || ''} onChange={(e) => patch('notifications.replyTo', e.target.value)} />
      </div>

      <div>
        <label htmlFor="mail-transport" className="mb-1.5 block text-[13px] font-medium">Transport</label>
        <select
          id="mail-transport"
          className="field"
          value={notifications.transport || 'smtp'}
          onChange={(e) => patch('notifications.transport', e.target.value)}
        >
          <option value="smtp">SMTP — Gmail, Fastmail, your own</option>
          <option value="endpoint">Endpoint — POST it somewhere else</option>
          <option value="none">Off</option>
        </select>
      </div>

      {notifications.transport === 'endpoint' ? (
        <Row label="Endpoint" mono placeholder="https://…/notify" value={notifications.endpoint || ''} onChange={(e) => patch('notifications.endpoint', e.target.value)} />
      ) : notifications.transport !== 'none' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Row label="Host" mono value={notifications.smtp?.host || ''} onChange={(e) => patch('notifications.smtp.host', e.target.value)} />
            <Row label="Port" type="number" value={notifications.smtp?.port ?? 465} onChange={(e) => patch('notifications.smtp.port', Number(e.target.value))} />
            <Row label="Username" mono value={notifications.smtp?.user || ''} onChange={(e) => patch('notifications.smtp.user', e.target.value)} />
          </div>
          <p className="-mt-2 text-[12px] leading-relaxed text-faint">
            For Gmail: <code className="font-mono">smtp.gmail.com</code>, port 465, your full address
            as the username, and a 16-character <strong>app password</strong> below — not your
            account password, which Google will refuse.
          </p>
        </>
      ) : null}

      <ul className="grid gap-2 sm:grid-cols-2">
        {[
          ['orderPlaced', 'Order confirmed'],
          ['paymentCaptured', 'Payment received'],
          ['shipped', 'Shipped, with tracking'],
          ['refunded', 'Refunded'],
          ['cancelled', 'Cancelled'],
        ].map(([key, label]) => (
          <li key={key}>
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
              <input
                type="checkbox"
                checked={notifications.events?.[key] !== false}
                onChange={(e) => patch(`notifications.events.${key}`, e.target.checked)}
                className="h-4 w-4 accent-[rgb(var(--accent))]"
              />
              {label}
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="quiet" onClick={sendTest} disabled={sending}>
          {sending ? 'Sending…' : 'Send a test'}
        </Button>
        {result && (
          <span className={`text-[12px] ${result.delivered ? 'text-good' : 'text-muted'}`}>
            {result.delivered
              ? `Sent to ${result.preview?.to}`
              : `Not sent — ${result.message}`}
          </span>
        )}
      </div>
    </Group>
  )
}

const CREDENTIAL_LABELS = {
  razorpayKeySecret: 'Razorpay key_secret',
  razorpayWebhookSecret: 'Razorpay webhook secret',
  stripeSecretKey: 'Stripe secret key',
  smtpPassword: 'SMTP / Gmail app password',
}

/**
 * Secrets go in; nothing comes out.
 *
 * These fields post to a write-only endpoint and the page never reads a value
 * back — it shows whether each one is set and when. A secret that can be read
 * back is a secret in every log, cache and browser history between here and the
 * server, and one served by `GET /storefront` is a secret published to every
 * shopper.
 */
function CredentialsGroup() {
  const { data, reload } = useAsync(() => api.adminGetCredentials(), [])
  const [drafts, setDrafts] = useState({})
  const { push } = useToast()

  const save = async (key) => {
    try {
      await api.adminSaveCredentials({ [key]: drafts[key] })
      setDrafts((d) => ({ ...d, [key]: '' }))
      push(drafts[key] ? 'Stored' : 'Cleared')
      reload()
    } catch (err) {
      push(err.message, { tone: 'error' })
    }
  }

  return (
    <Group
      title="Secrets"
      note="Written, never read back. These never appear in storefront settings, because those are served to every visitor — a key_secret there is not a weak setting, it is the whole secret published."
    >
      {data?.storesSecrets === false && (
        <p className="rounded-xs border border-sale/30 bg-sale/5 p-3 text-[12px] leading-relaxed text-muted">
          <strong className="text-ink">This demo has no server, so nothing is stored.</strong> The
          field records that you set something and discards the value. Do not paste a live key into
          a preview — point <code className="font-mono">VITE_DATA_SOURCE</code> at a real backend
          first.
        </p>
      )}

      <ul className="space-y-3">
        {(data?.items || []).map((item) => (
          <li key={item.key} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1">
              <label htmlFor={`cred-${item.key}`} className="mb-1.5 block text-[13px] font-medium">
                {CREDENTIAL_LABELS[item.key] || item.key}
              </label>
              <input
                id={`cred-${item.key}`}
                type="password"
                autoComplete="off"
                className="field font-mono text-[13px]"
                placeholder={item.set ? '•••••••••••• — set, type to replace' : 'Not set'}
                value={drafts[item.key] || ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [item.key]: e.target.value }))}
              />
              {item.set && (
                <p className="mt-1 text-[11px] text-faint">
                  Set {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}
                </p>
              )}
            </div>
            <Button size="sm" variant="quiet" onClick={() => save(item.key)} disabled={!drafts[item.key]}>
              Save
            </Button>
          </li>
        ))}
      </ul>
    </Group>
  )
}

function Group({ title, note, children }) {
  return (
    <section className="rounded-xs border border-line bg-surface p-5">
      <h2 className="text-[14px] font-medium">{title}</h2>
      {note && <p className="mt-1.5 text-[12px] leading-relaxed text-faint">{note}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function Row({ label, mono, ...rest }) {
  const id = label.toLowerCase().replace(/\W+/g, '-')
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">{label}</label>
      <input id={id} className={`field ${mono ? 'font-mono text-[13px]' : ''}`} {...rest} />
    </div>
  )
}

function Card({ title, body, children }) {
  return (
    <div className="rounded-xs border border-line bg-surface p-5">
      <h2 className="text-[14px] font-medium">{title}</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">{body}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}
