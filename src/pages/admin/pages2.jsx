import { useState } from 'react'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { Button, Empty, Icon, Skeleton, Badge } from '../../components/ui/index.jsx'
import { useToast } from '../../store/ToastContext.jsx'
import { formatMoney } from '../../lib/money.js'

/* ── categories ────────────────────────────────────────────────────────── */

export function Categories() {
  const { data, loading, reload } = useAsync(() => api.listCategories(), [])
  const [editing, setEditing] = useState(null)
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

  const roots = data?.items || []
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
              {roots.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
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
        <ul className="mt-8 space-y-3">
          {roots.map((r) => (
            <li key={r.slug} className="rounded-xs border border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{r.name} <span className="ml-1.5 text-[12px] text-faint">{r.count}</span></p>
                  <p className="font-mono text-[11px] text-faint">{r.slug}</p>
                </div>
                <button type="button" onClick={() => setEditing(r)} className="text-[13px] text-accent link-underline">Edit</button>
              </div>
              {r.children?.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                  {r.children.map((c) => (
                    <li key={c.slug} className="flex items-center justify-between gap-3 pl-4 text-[13px]">
                      <span className="text-muted">
                        {c.name} <span className="ml-1 text-faint">{c.count}</span>
                      </span>
                      <button type="button" onClick={() => setEditing(c)} className="text-accent link-underline">Edit</button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/* ── size charts ───────────────────────────────────────────────────────── */

export function SizeCharts() {
  const { data, loading, reload } = useAsync(() => api.listSizeCharts(), [])
  const [editing, setEditing] = useState(null)
  const { push } = useToast()

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

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {(data?.items || []).map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => setEditing(structuredClone(c))}
              className="w-full rounded-xs border border-line bg-surface p-5 text-left transition-colors hover:border-ink">
              <p className="font-mono text-[13px] text-ink">{c.id}</p>
              <p className="mt-1.5 text-[12px] text-faint">
                {c.rows.length} sizes · {c.columns.slice(1).join(', ')} · {c.unit}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

/* ── orders ────────────────────────────────────────────────────────────── */

export function Orders() {
  const { data, loading } = useAsync(() => api.listOrders(), [])
  if (loading) return <Skeleton className="h-64 w-full" />
  if (!data?.items.length) {
    return <Empty icon="truck" title="No orders yet" body="Place one from the storefront and it will appear here." />
  }
  return (
    <>
      <h1 className="text-display-md">Orders</h1>
      <div className="mt-8 overflow-x-auto rounded-xs border border-line bg-surface">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="p-3 font-medium">Order</th>
              <th className="p-3 font-medium">Placed</th>
              <th className="p-3 font-medium">Customer</th>
              <th className="p-3 font-medium">Items</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((o) => (
              <tr key={o.id} className="border-b border-line last:border-0">
                <td className="p-3 font-mono text-[12px]">{o.number}</td>
                <td className="p-3 text-muted">{new Date(o.placedAt).toLocaleDateString()}</td>
                <td className="p-3 text-muted">{o.email}</td>
                <td className="p-3 tabular-nums">{o.lines.length}</td>
                <td className="p-3"><Badge kind="bestseller">{o.status}</Badge></td>
                <td className="p-3 text-right tabular-nums">{formatMoney(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
