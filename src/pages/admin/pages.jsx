import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { Button, Empty, Icon, Skeleton, Badge } from '../../components/ui/index.jsx'
import { useToast } from '../../store/ToastContext.jsx'
import { formatMoney } from '../../lib/money.js'
import Tour, { Hint } from '../../components/admin/Tour.jsx'
import Media from '../../components/ui/Media.jsx'
import ListToolbar, { matches } from '../../components/admin/ListToolbar.jsx'

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

const PRODUCT_SORTS = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'title', label: 'Name, A–Z' },
  { value: 'price-desc', label: 'Price, high to low' },
  { value: 'price-asc', label: 'Price, low to high' },
  { value: 'stock-asc', label: 'Stock, lowest first' },
]

export function Products() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('updated')
  const { data, loading } = useAsync(() => api.adminListProducts({ perPage: 500 }), [])
  const navigate = useNavigate()

  const stockOf = (p) => p.variants.reduce((a, v) => a + v.inventory, 0)

  const rows = useMemo(() => {
    let items = (data?.items || []).filter((p) =>
      matches(q, p.title, p.slug, (p.tags || []).join(' '), (p.categories || []).join(' ')),
    )
    if (status === 'published') items = items.filter((p) => p.published !== false)
    if (status === 'draft') items = items.filter((p) => p.published === false)
    if (status === 'out') items = items.filter((p) => stockOf(p) === 0)
    if (status === 'low') items = items.filter((p) => stockOf(p) > 0 && stockOf(p) <= 5)
    if (status === 'sale') items = items.filter((p) => p.compareAtPrice)

    const by = {
      updated: (a, b) => ((a.updatedAt || '') < (b.updatedAt || '') ? 1 : -1),
      title: (a, b) => a.title.localeCompare(b.title),
      'price-desc': (a, b) => b.price.amount - a.price.amount,
      'price-asc': (a, b) => a.price.amount - b.price.amount,
      'stock-asc': (a, b) => stockOf(a) - stockOf(b),
    }
    return items.slice().sort(by[sort] || by.updated)
  }, [data, q, status, sort])

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-display-md">Products</h1>
        <Button size="md" icon="plus" to="/admin/products/new" className="shrink-0">New</Button>
      </div>

      <ListToolbar
        className="mt-6"
        query={q}
        onQuery={setQ}
        placeholder="Search name, slug, tag or category"
        filters={[
          {
            label: 'Status',
            value: status,
            onChange: setStatus,
            options: [
              { value: 'all', label: 'All products' },
              { value: 'published', label: 'Published' },
              { value: 'draft', label: 'Drafts' },
              { value: 'low', label: 'Low stock' },
              { value: 'out', label: 'Out of stock' },
              { value: 'sale', label: 'On sale' },
            ],
          },
        ]}
        sorts={PRODUCT_SORTS}
        sort={sort}
        onSort={setSort}
        count={rows.length}
        total={data?.items?.length ?? 0}
      />

      {loading ? (
        <Skeleton className="mt-6 h-64 w-full" />
      ) : rows.length === 0 ? (
        <Empty icon="search" title="Nothing matches" body="Try a different search, or clear the filters." className="mt-6" />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xs border border-line bg-surface">
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
              {rows.map((p) => {
                const stock = stockOf(p)
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
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('stock-asc')
  const { push } = useToast()

  const all = useMemo(
    () => (data?.items || []).flatMap((p) => p.variants.map((v) => ({ product: p, variant: v }))),
    [data],
  )

  const rows = useMemo(() => {
    let items = all.filter((r) =>
      matches(q, r.product.title, r.variant.sku, r.variant.options.Color, r.variant.options.Size),
    )
    if (filter === 'out') items = items.filter((r) => !r.variant.available)
    if (filter === 'low') items = items.filter((r) => r.variant.available && r.variant.inventory <= 2)

    const by = {
      'stock-asc': (a, b) => a.variant.inventory - b.variant.inventory,
      'stock-desc': (a, b) => b.variant.inventory - a.variant.inventory,
      product: (a, b) => a.product.title.localeCompare(b.product.title) || a.variant.sku.localeCompare(b.variant.sku),
      sku: (a, b) => a.variant.sku.localeCompare(b.variant.sku),
    }
    return items.slice().sort(by[sort] || by['stock-asc'])
  }, [all, q, filter, sort])

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
      <h1 className="text-display-md">Inventory</h1>
      <p className="mt-3 text-[13px] text-muted">
        Adjust with + and −, not by typing a number.
        <Hint>
          Two people editing the same SKU at once both land, instead of one silently overwriting
          the other. It is also the only shape a retried webhook cannot double-count.
        </Hint>
      </p>

      <ListToolbar
        className="mt-6"
        query={q}
        onQuery={setQ}
        placeholder="Search product, SKU, colour or size"
        filters={[
          {
            label: 'Availability',
            value: filter,
            onChange: setFilter,
            options: [
              { value: 'all', label: 'All variants' },
              { value: 'low', label: 'Low stock' },
              { value: 'out', label: 'Out of stock' },
            ],
          },
        ]}
        sorts={[
          { value: 'stock-asc', label: 'Stock, lowest first' },
          { value: 'stock-desc', label: 'Stock, highest first' },
          { value: 'product', label: 'Product, A–Z' },
          { value: 'sku', label: 'SKU' },
        ]}
        sort={sort}
        onSort={setSort}
        count={rows.length}
        total={all.length}
      />

      {loading ? (
        <Skeleton className="mt-6 h-64 w-full" />
      ) : rows.length === 0 ? (
        <Empty icon="package" title="Nothing here" body="No variants match that filter." className="mt-6" />
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
