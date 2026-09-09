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

const STATUSES = ['placed', 'paid', 'fulfilled', 'delivered', 'cancelled']

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
        a catalogue quietly loses inventory nobody can account for.
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
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
