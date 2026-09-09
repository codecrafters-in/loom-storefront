import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { Button, Empty, Icon, Skeleton, Badge } from '../../components/ui/index.jsx'
import { useToast } from '../../store/ToastContext.jsx'
import { formatMoney } from '../../lib/money.js'
import Tour, { Hint } from '../../components/admin/Tour.jsx'
import Media from '../../components/ui/Media.jsx'

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
  const { data, loading } = useAsync(() => api.adminListProducts({ q, perPage: 200 }), [q])
  const navigate = useNavigate()

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-display-md">Products</h1>
        <div className="flex gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products"
            className="field h-10 max-w-xs"
          />
          <Button size="md" icon="plus" to="/admin/products/new" className="shrink-0">New</Button>
        </div>
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
                  // The whole row opens the record. An Edit link at the end of a
                  // row is a small target for something that is the only thing
                  // anyone comes to this table to do.
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/admin/products/${p.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigate(`/admin/products/${p.id}`)
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Edit ${p.title}`}
                    className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-sunken/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 shrink-0">
                          <div className="shot rounded-xs"><Media src={p.images[0]?.url} type={p.images[0]?.type} alt="" loading="lazy" className="h-full w-full object-cover" /></div>
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
                      <span className="flex flex-wrap gap-1.5">
                        {p.published === false && <Badge kind="low-stock">Draft</Badge>}
                        {(p.badges || []).slice(0, 2).map((b) => <Badge key={b} kind={b} />)}
                        {p.published !== false && !p.badges?.length && <span className="text-faint">—</span>}
                      </span>
                    </td>
                    <td className="p-3 text-right text-faint">
                      <Icon name="chevron-right" size={16} />
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
