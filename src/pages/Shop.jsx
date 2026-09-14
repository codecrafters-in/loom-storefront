import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import api, { peek } from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import ProductGrid from '../components/product/ProductGrid.jsx'
import FilterPanel from '../components/shop/FilterPanel.jsx'
import Promises from '../components/layout/Promises.jsx'
import Seo from '../components/Seo.jsx'
import { useBootstrap, useStorefront } from '../store/StorefrontContext.jsx'
import { categoryTrail, flattenCategories } from '../lib/categories.js'
import { Breadcrumbs, Button, Empty, ErrorState, Icon, Pagination } from '../components/ui/index.jsx'

const SORTS = [
  ['featured', 'Featured'],
  ['newest', 'Newest'],
  ['price-asc', 'Price, low to high'],
  ['price-desc', 'Price, high to low'],
  ['rating', 'Best rated'],
]

const PER_PAGE = 12

/**
 * The query this page makes, with no filters applied unless `extra` says so.
 *
 * Exported so the prerenderer can seed the exact same cache key — and used by
 * the page itself, so there is one spelling of it. Writing it out a second time
 * in the build script is how a `maxPrice: null` crept in against this page's
 * `undefined` — different key, no match, and every category page silently
 * prerendered an empty grid while looking fine locally.
 */
export const listingQuery = (extra = {}) => ({
  sizes: [],
  colors: [],
  tags: [],
  attr: [],
  spec: [],
  brand: [],
  inStock: false,
  minPrice: undefined,
  maxPrice: undefined,
  sort: 'featured',
  page: 1,
  perPage: PER_PAGE,
  ...extra,
})

const csv = (params, key) => params.get(key)?.split(',').filter(Boolean) || []
const price = (params, key) => (params.get(key) ? Number(params.get(key)) : undefined)

/**
 * Filter state lives in the URL, not in React.
 *
 * That is what makes a filtered grid shareable, bookmarkable and survivable
 * across a back button — all three of which shoppers expect and none of which
 * you get from useState.
 *
 * `attr` and `spec` repeat (`?attr=Color:Navy&attr=Size:M`) rather than join
 * with commas: their values are names a merchant typed, and a comma in one
 * would split it in two.
 */
function useFilters() {
  const [params, setParams] = useSearchParams()

  const value = useMemo(
    () => ({
      sizes: csv(params, 'sizes'),
      colors: csv(params, 'colors'),
      tags: csv(params, 'tags'),
      attr: params.getAll('attr').filter(Boolean),
      spec: params.getAll('spec').filter(Boolean),
      brand: csv(params, 'brand'),
      inStock: params.get('in_stock') === '1',
      minPrice: price(params, 'min_price'),
      maxPrice: price(params, 'max_price'),
      sort: params.get('sort') || 'featured',
      page: Number(params.get('page') || 1),
    }),
    [params],
  )

  const set = useCallback(
    (next) => {
      const p = new URLSearchParams()
      for (const key of ['sizes', 'colors', 'tags', 'brand']) if (next[key]?.length) p.set(key, next[key].join(','))
      for (const key of ['attr', 'spec']) (next[key] || []).forEach((item) => p.append(key, item))
      if (next.inStock) p.set('in_stock', '1')
      if (next.minPrice != null) p.set('min_price', String(next.minPrice))
      if (next.maxPrice != null) p.set('max_price', String(next.maxPrice))
      if (next.sort && next.sort !== 'featured') p.set('sort', next.sort)
      if (next.page && next.page > 1) p.set('page', String(next.page))
      setParams(p, { replace: true })
    },
    [setParams],
  )

  return [value, set]
}

export default function Shop({ mode = 'category' }) {
  const { slug } = useParams()
  const [filters, setFilters] = useFilters()
  const [drawer, setDrawer] = useState(false)
  const config = useStorefront()

  const category = mode === 'category' ? slug : undefined
  const collection = mode === 'collection' ? slug : undefined
  const brand = mode === 'brand' ? slug : undefined

  // Category metadata comes from the API, not from a bundled catalogue —
  // importing the demo data here shipped it to every visitor in api mode too.
  // Flattened to any depth: a third-level category is a page like any other.
  const { categories: booted } = useBootstrap()
  const catTree = useAsync(() => api.listCategories(), [], { skip: !!booted })
  const flatCats = useMemo(() => flattenCategories(booted || catTree.data?.items || []), [booted, catTree.data])
  const meta = flatCats.find((c) => c.slug === category)
  const trail = category ? categoryTrail(category, flatCats) : []

  // On a brand's page the brand is the scope, not a filter the shopper set.
  const query = listingQuery({
    category,
    collection,
    sizes: filters.sizes,
    colors: filters.colors,
    tags: filters.tags,
    attr: filters.attr,
    spec: filters.spec,
    brand: filters.brand,
    inBrand: brand,
    inStock: filters.inStock,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    sort: filters.sort,
    page: filters.page,
  })

  const { data, error, loading, reload } = useAsync(
    () => api.listProducts(query),
    [category, collection, brand, JSON.stringify(filters)],
    // Seeded by the prerenderer for the default, unfiltered view — the one a
    // crawler and a first-time visitor both land on. Any filter is a cache miss
    // and fetches as before.
    { initial: peek.listProducts(query) },
  )

  const collectionMeta = useAsync(() => api.listCollections(), [], {
    skip: mode !== 'collection',
    // The heading and the page title come from this record, so without it a
    // prerendered collection page ships titled "All products".
    initial: peek.listCollections(),
  })
  const col = collectionMeta.data?.items.find((c) => c.slug === collection)
  const brandMeta = useAsync(() => api.getBrand(brand), [brand], { skip: !brand })
  const maker = brandMeta.data

  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawer])

  const title = brand ? maker?.name || '' : col?.title || meta?.name || 'All products'
  const blurb = brand ? maker?.description || '' : col?.blurb || meta?.blurb || 'Everything we make, in one place.'
  const clear = () => setFilters({ sort: filters.sort, page: 1 })
  const count = data?.total ?? 0

  const panel = (
    <FilterPanel
      facets={data?.facets}
      value={filters}
      onChange={setFilters}
      onClear={clear}
      currency={config.pricing?.currency}
      hideBrands={Boolean(brand)}
    />
  )

  return (
    <>
      <Seo title={maker?.seo?.title || title} description={maker?.seo?.description || blurb} />
      <div className="wrap pt-8">
        <Breadcrumbs
          trail={[
            { label: 'Home', to: '/' },
            { label: mode === 'collection' ? 'Collections' : 'Shop', to: '/shop' },
            // Every ancestor by name, linked; the page itself last, unlinked.
            ...trail.slice(0, -1).map((c) => ({ label: c.name, to: `/shop/${c.slug}` })),
            ...(slug ? [{ label: title || slug }] : []),
          ]}
        />
        <header className="mt-6 max-w-2xl">
          {maker?.logo?.url && <img src={maker.logo.url} alt="" className="mb-5 h-10 w-auto" />}
          <h1 className="text-display-lg">{title}</h1>
          {blurb && <p className="mt-4 text-[15px] leading-relaxed text-muted">{blurb}</p>}
        </header>
      </div>

      <div className="wrap mt-10 grid gap-10 pb-20 lg:grid-cols-[15rem_1fr]">
        <aside className="hidden lg:block">
          {/* Scrolls on its own once the store has more facets than a screen
              holds, so the last group is never out of reach. */}
          <div className="no-scrollbar sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pb-6">{panel}</div>
        </aside>

        <div>
          <div className="mb-6 flex items-center justify-between gap-4 border-b border-line pb-4">
            <p className="text-[13px] text-faint tabular-nums">
              {loading ? 'Loading…' : `${count} ${count === 1 ? 'product' : 'products'}`}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="quiet" size="sm" icon="filter" className="lg:hidden" onClick={() => setDrawer(true)}>
                Filter
              </Button>
              <label className="sr-only" htmlFor="sort">Sort by</label>
              <div className="relative">
                <select
                  id="sort"
                  value={filters.sort}
                  onChange={(e) => setFilters({ ...filters, sort: e.target.value, page: 1 })}
                  className="field h-9 appearance-none py-0 pr-8 text-[13px]"
                >
                  {SORTS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <Icon name="chevron-down" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint" />
              </div>
            </div>
          </div>

          {error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : !loading && !data?.items.length ? (
            <Empty
              icon="search"
              title="Nothing matches that"
              body="Try removing a filter, or browse everything."
              action={<Button onClick={clear}>Clear filters</Button>}
            />
          ) : (
            <>
              <ProductGrid products={data?.items || []} loading={loading} skeletonCount={PER_PAGE} />
              <div className="mt-14">
                <Pagination
                  page={filters.page}
                  perPage={PER_PAGE}
                  total={data?.total || 0}
                  onPage={(p) => {
                    setFilters({ ...filters, page: p })
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* mobile filters */}
      <div
        onClick={() => setDrawer(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-ink/35 transition-opacity lg:hidden ${drawer ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        className={`fixed bottom-0 left-0 right-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-xl bg-page p-5 shadow-panel transition-transform lg:hidden ${drawer ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-lg">Filter</h2>
          <button type="button" onClick={() => setDrawer(false)} aria-label="Close filters" className="text-muted">
            <Icon name="close" size={20} />
          </button>
        </div>
        {panel}
        <Button full size="lg" className="mt-8" onClick={() => setDrawer(false)}>
          Show {count} results
        </Button>
      </div>

      <Promises />
    </>
  )
}
