import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import api from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import ProductGrid from '../components/product/ProductGrid.jsx'
import FilterPanel from '../components/shop/FilterPanel.jsx'
import Promises from '../components/layout/Promises.jsx'
import { Breadcrumbs, Button, Empty, ErrorState, Icon, Pagination } from '../components/ui/index.jsx'
import { categories } from '../data/catalog.js'

const SORTS = [
  ['featured', 'Featured'],
  ['newest', 'Newest'],
  ['price-asc', 'Price, low to high'],
  ['price-desc', 'Price, high to low'],
  ['rating', 'Best rated'],
]

const PER_PAGE = 12

/**
 * Filter state lives in the URL, not in React.
 *
 * That is what makes a filtered grid shareable, bookmarkable and survivable
 * across a back button — all three of which shoppers expect and none of which
 * you get from useState.
 */
function useFilters() {
  const [params, setParams] = useSearchParams()

  const value = useMemo(
    () => ({
      sizes: params.get('sizes')?.split(',').filter(Boolean) || [],
      colors: params.get('colors')?.split(',').filter(Boolean) || [],
      tags: params.get('tags')?.split(',').filter(Boolean) || [],
      inStock: params.get('in_stock') === '1',
      maxPrice: params.get('max_price') ? Number(params.get('max_price')) : undefined,
      sort: params.get('sort') || 'featured',
      page: Number(params.get('page') || 1),
    }),
    [params],
  )

  const set = useCallback(
    (next) => {
      const p = new URLSearchParams()
      if (next.sizes?.length) p.set('sizes', next.sizes.join(','))
      if (next.colors?.length) p.set('colors', next.colors.join(','))
      if (next.tags?.length) p.set('tags', next.tags.join(','))
      if (next.inStock) p.set('in_stock', '1')
      if (next.maxPrice) p.set('max_price', String(next.maxPrice))
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

  const category = mode === 'category' ? slug : undefined
  const collection = mode === 'collection' ? slug : undefined
  const meta = categories.find((c) => c.slug === category)

  const { data, error, loading, reload } = useAsync(
    () =>
      api.listProducts({
        category,
        collection,
        sizes: filters.sizes,
        colors: filters.colors,
        tags: filters.tags,
        inStock: filters.inStock,
        maxPrice: filters.maxPrice,
        sort: filters.sort,
        page: filters.page,
        perPage: PER_PAGE,
      }),
    [category, collection, JSON.stringify(filters)],
  )

  const collectionMeta = useAsync(() => api.listCollections(), [], { skip: mode !== 'collection' })
  const col = collectionMeta.data?.items.find((c) => c.slug === collection)

  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawer])

  const title = col?.title || meta?.name || 'All products'
  const blurb = col?.blurb || meta?.blurb || 'Everything we make, in one place.'
  const clear = () => setFilters({ sort: filters.sort, page: 1 })

  return (
    <>
      <div className="wrap pt-8">
        <Breadcrumbs
          trail={[
            { label: 'Home', to: '/' },
            { label: mode === 'collection' ? 'Collections' : 'Shop', to: '/shop' },
            ...(slug ? [{ label: title }] : []),
          ]}
        />
        <header className="mt-6 max-w-2xl">
          <h1 className="text-display-lg">{title}</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">{blurb}</p>
        </header>
      </div>

      <div className="wrap mt-10 grid gap-10 pb-20 lg:grid-cols-[15rem_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <FilterPanel facets={data?.facets} value={filters} onChange={setFilters} onClear={clear} />
          </div>
        </aside>

        <div>
          <div className="mb-6 flex items-center justify-between gap-4 border-b border-line pb-4">
            <p className="text-[13px] text-faint tabular-nums">
              {loading ? 'Loading…' : `${data?.total ?? 0} ${data?.total === 1 ? 'piece' : 'pieces'}`}
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
        <FilterPanel facets={data?.facets} value={filters} onChange={setFilters} onClear={clear} />
        <Button full size="lg" className="mt-8" onClick={() => setDrawer(false)}>
          Show {data?.total ?? 0} results
        </Button>
      </div>

      <Promises />
    </>
  )
}
