import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { Button, Empty, Icon, Skeleton, Badge } from '../../components/ui/index.jsx'
import { useToast } from '../../store/ToastContext.jsx'
import { formatMoney, toMinor, toMajor } from '../../lib/money.js'
import Tour, { Hint } from '../../components/admin/Tour.jsx'

/* ── overview ──────────────────────────────────────────────────────────── */

export function Overview() {
  const products = useAsync(() => api.adminListProducts({ perPage: 500 }), [])
  const orders = useAsync(() => api.listOrders(), [])

  const stats = useMemo(() => {
    const items = products.data?.items || []
    const variants = items.flatMap((p) => p.variants)
    const revenue = (orders.data?.items || []).reduce((a, o) => a + o.total.amount, 0)
    return {
      products: items.length,
      variants: variants.length,
      outOfStock: variants.filter((v) => !v.available).length,
      lowStock: variants.filter((v) => v.available && v.inventory <= 2).length,
      orders: orders.data?.items.length || 0,
      revenue,
    }
  }, [products.data, orders.data])

  if (products.loading) return <Skeleton className="h-64 w-full" />

  const cards = [
    { label: 'Products', value: stats.products, to: '/admin/products' },
    { label: 'Variants', value: stats.variants, to: '/admin/inventory' },
    { label: 'Out of stock', value: stats.outOfStock, to: '/admin/inventory', tone: stats.outOfStock ? 'sale' : null },
    { label: 'Low stock', value: stats.lowStock, to: '/admin/inventory', tone: stats.lowStock ? 'accent' : null },
    { label: 'Orders', value: stats.orders, to: '/admin/orders' },
    { label: 'Revenue', value: formatMoney({ amount: stats.revenue, currency: 'USD' }), to: '/admin/orders' },
  ]

  return (
    <>
      <Tour />
      <h1 className="text-display-md">Overview</h1>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <li key={c.label}>
            <Link to={c.to} className="block rounded-xs border border-line bg-surface p-5 transition-colors hover:border-ink">
              <p className="eyebrow">{c.label}</p>
              <p className={`mt-2 font-display text-3xl ${c.tone === 'sale' ? 'text-sale' : c.tone === 'accent' ? 'text-accent' : ''}`}>
                {c.value}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-10 rounded-xs border border-line bg-surface p-5">
        <h2 className="text-[14px] font-medium">Try it</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Change a price or set a size to zero, then open the storefront in another tab. The change
          is there — the admin panel and the shop read the same data through the same API, so there
          is no publish step and nothing to sync.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button size="sm" to="/admin/products">Edit a product</Button>
          <Button size="sm" variant="quiet" to="/admin/inventory">Adjust stock</Button>
        </div>
      </div>
    </>
  )
}

/* ── products ──────────────────────────────────────────────────────────── */

export function Products() {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const { data, loading, reload } = useAsync(() => api.adminListProducts({ q, perPage: 200 }), [q])
  const { push } = useToast()

  const save = async (patch) => {
    try {
      await api.adminSaveProduct(patch)
      push('Saved — refresh the storefront to see it')
      setEditing(null)
      reload()
    } catch (err) {
      push(err.message, { tone: 'error' })
    }
  }

  if (editing) return <ProductEditor product={editing} onCancel={() => setEditing(null)} onSave={save} />

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-display-md">Products</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products"
          className="field h-10 max-w-xs"
        />
      </div>

      {loading ? (
        <Skeleton className="mt-8 h-64 w-full" />
      ) : (
        <div className="mt-8 overflow-x-auto rounded-xs border border-line bg-surface">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="p-3 font-medium">Product</th>
                <th className="p-3 font-medium">Price</th>
                <th className="p-3 font-medium">Stock</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {(data?.items || []).map((p) => {
                const stock = p.variants.reduce((a, v) => a + v.inventory, 0)
                return (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 shrink-0">
                          <div className="shot rounded-xs"><img src={p.images[0]?.url} alt="" loading="lazy" /></div>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.title}</p>
                          <p className="truncate font-mono text-[11px] text-faint">{p.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 tabular-nums">{formatMoney(p.price)}</td>
                    <td className={`p-3 tabular-nums ${stock === 0 ? 'text-sale' : ''}`}>{stock}</td>
                    <td className="p-3">
                      {stock === 0 ? <Badge kind="sold-out" /> : p.badges?.[0] ? <Badge kind={p.badges[0]} /> : <span className="text-faint">—</span>}
                    </td>
                    <td className="p-3 text-right">
                      <button type="button" onClick={() => setEditing(p)} className="text-[13px] text-accent link-underline">
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function ProductEditor({ product, onCancel, onSave }) {
  const [form, setForm] = useState({
    slug: product.slug,
    id: product.id,
    title: product.title,
    subtitle: product.subtitle,
    description: product.description,
    price: toMajor(product.price),
    compareAt: product.compareAtPrice ? toMajor(product.compareAtPrice) : '',
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = (e) => {
    e.preventDefault()
    const price = { amount: toMinor(Number(form.price)), currency: product.price.currency }
    onSave({
      id: form.id,
      slug: form.slug,
      title: form.title,
      subtitle: form.subtitle,
      description: form.description,
      price,
      compareAtPrice: form.compareAt ? { amount: toMinor(Number(form.compareAt)), currency: product.price.currency } : null,
      // Variant prices follow the product unless they were overridden. Leaving
      // them behind is how a store ends up selling at last month's price.
      variants: product.variants.map((v) => ({ ...v, price })),
    })
  }

  return (
    <form onSubmit={submit} className="max-w-2xl">
      <button type="button" onClick={onCancel} className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted link-underline">
        <Icon name="chevron-left" size={14} /> All products
      </button>
      <h1 className="text-display-md">{product.title}</h1>

      <div className="mt-8 space-y-4">
        <Field label="Title" value={form.title} onChange={set('title')} />
        <Field label="Subtitle" value={form.subtitle} onChange={set('subtitle')} />
        <div>
          <label htmlFor="desc" className="mb-1.5 block text-[13px] font-medium">Description</label>
          <textarea id="desc" rows={5} className="field" value={form.description} onChange={set('description')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price" type="number" step="0.01" value={form.price} onChange={set('price')} />
          <Field label="Compare at (optional)" type="number" step="0.01" value={form.compareAt} onChange={set('compareAt')} />
        </div>
        <p className="text-[12px] text-faint">
          Stored as {formatMoney({ amount: toMinor(Number(form.price) || 0), currency: product.price.currency })}.
          <Hint>
            Type it the way you say it — 168 for $168.00. It is stored as an integer number of
            cents so a total can never drift by a fraction of a penny. Saving also updates every
            size and colour of this product.
          </Hint>
        </p>
      </div>

      <div className="mt-8 flex gap-3">
        <Button as="button" type="submit">Save</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}

function Field({ label, ...rest }) {
  const id = label.toLowerCase().replace(/\W+/g, '-')
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">{label}</label>
      <input id={id} className="field" {...rest} />
    </div>
  )
}

/* ── inventory ─────────────────────────────────────────────────────────── */

export function Inventory() {
  const { data, loading, reload } = useAsync(() => api.adminListProducts({ perPage: 500 }), [])
  const [filter, setFilter] = useState('all')
  const { push } = useToast()

  const rows = useMemo(() => {
    const all = (data?.items || []).flatMap((p) =>
      p.variants.map((v) => ({ product: p, variant: v })),
    )
    if (filter === 'out') return all.filter((r) => !r.variant.available)
    if (filter === 'low') return all.filter((r) => r.variant.available && r.variant.inventory <= 2)
    return all
  }, [data, filter])

  const adjust = async (variantId, delta) => {
    try {
      await api.adminAdjustInventory(variantId, delta)
      reload()
    } catch (err) {
      push(err.message, { tone: 'error' })
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-display-md">Inventory</h1>
        <div className="flex gap-2">
          {[['all', 'All'], ['low', 'Low'], ['out', 'Out of stock']].map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`rounded-xs border px-3 py-1.5 text-[13px] ${filter === k ? 'border-ink bg-ink text-page' : 'border-line text-muted hover:border-ink'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[13px] text-muted">
        Adjust with + and −, not by typing a number.
        <Hint>
          Two people editing the same SKU at once both land, instead of one silently overwriting
          the other. It is also the only shape a retried webhook cannot double-count.
        </Hint>
      </p>

      {loading ? (
        <Skeleton className="mt-8 h-64 w-full" />
      ) : rows.length === 0 ? (
        <Empty icon="package" title="Nothing here" body="No variants match that filter." />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xs border border-line bg-surface">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="p-3 font-medium">SKU</th>
                <th className="p-3 font-medium">Product</th>
                <th className="p-3 font-medium">Variant</th>
                <th className="p-3 font-medium">On hand</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map(({ product, variant }) => (
                <tr key={variant.id} className="border-b border-line last:border-0">
                  <td className="p-3 font-mono text-[12px] text-faint">{variant.sku}</td>
                  <td className="p-3">{product.title}</td>
                  <td className="p-3 text-muted">{Object.values(variant.options).join(' · ')}</td>
                  <td className={`p-3 tabular-nums ${variant.inventory === 0 ? 'text-sale' : variant.inventory <= 2 ? 'text-accent' : ''}`}>
                    {variant.inventory}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => adjust(variant.id, -1)} className="grid h-8 w-8 place-items-center rounded-xs border border-line hover:border-ink" aria-label="Decrease">
                        <Icon name="minus" size={13} />
                      </button>
                      <button type="button" onClick={() => adjust(variant.id, 1)} className="grid h-8 w-8 place-items-center rounded-xs border border-line hover:border-ink" aria-label="Increase">
                        <Icon name="plus" size={13} />
                      </button>
                      <button type="button" onClick={() => adjust(variant.id, 10)} className="h-8 rounded-xs border border-line px-2.5 text-[12px] hover:border-ink">
                        +10
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
