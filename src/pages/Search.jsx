import { useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import Seo from '../components/Seo.jsx'
import api from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import { search as trackSearch } from '../lib/analytics.js'
import ProductGrid from '../components/product/ProductGrid.jsx'
import { Button, Empty, ErrorState, Pagination } from '../components/ui/index.jsx'
import { isMock } from '../lib/config.js'
import { useBootstrap } from '../store/StorefrontContext.jsx'
import { t, plural } from '../i18n/index.js'

const PER_PAGE = 24

export default function Search() {
  const [params, setParams] = useSearchParams()
  const { categories: booted } = useBootstrap()
  const catTree = useAsync(() => api.listCategories(), [], { skip: !!booted })
  const categories = booted || catTree.data?.items || []
  const q = params.get('q') || ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const { data, error, loading, reload } = useAsync(
    () => api.listProducts({ q, perPage: PER_PAGE, page }),
    [q, page],
    { skip: !q },
  )
  // What other shoppers search for and find, for an empty search page (a live store's search log).
  const popular = useAsync(() => api.popularSearches(), [], { skip: Boolean(q) || isMock })

  // Reported once the results are in, so the count is real. Firing on keystroke
  // would report a dozen searches for one, and every one of them with a total
  // of zero. The merchant's search log counts the first page only.
  useEffect(() => {
    if (!q || loading || !data) return
    trackSearch(q, data.total)
    if (!isMock && page === 1) api.logSearch(q).catch(() => {})
  }, [q, loading, data]) // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (next) => {
    const p = new URLSearchParams(params)
    if (next > 1) p.set('page', String(next))
    else p.delete('page')
    setParams(p)
  }

  return (
    <>
      <Seo title={q ? `“${q}”` : t('Search')} noindex />
      <div className="wrap py-12 pb-20">
      <p className="eyebrow">{t('Search')}</p>
      <h1 className="mt-3 text-display-lg">
        {q ? <>“{q}”</> : t('What are you after?')}
      </h1>
      {q && (
        <p className="mt-3 text-[15px] text-muted">
          {loading ? t('Looking…') : plural(data?.total ?? 0, '{count} result', '{count} results')}
        </p>
      )}
      {q && data?.fuzzy && (
        <p className="mt-2 text-[14px] text-muted">{t('No exact match for “{q}”. Showing similar names.', { q })}</p>
      )}

      <div className="mt-10">
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !q ? (
          <div>
            {popular.data?.length > 0 && (
              <div className="mb-10">
                <p className="text-[15px] text-muted">{t('Popular searches')}</p>
                <ul className="mt-5 flex flex-wrap gap-2.5">
                  {popular.data.map((term) => (
                    <li key={term}>
                      <Link
                        to={`/search?q=${encodeURIComponent(term)}`}
                        className="inline-block rounded-xs border border-line px-3.5 py-2 text-[14px] text-muted transition-colors hover:border-ink hover:text-ink"
                      >
                        {term}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[15px] text-muted">{t('Try a category:')}</p>
            <ul className="mt-5 flex flex-wrap gap-2.5">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    to={`/shop/${c.slug}`}
                    className="inline-block rounded-xs border border-line px-3.5 py-2 text-[14px] text-muted transition-colors hover:border-ink hover:text-ink"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : !loading && !data?.items.length ? (
          <Empty
            icon="search"
            title={t('Nothing for “{q}”', { q })}
            body={t('Try a category, a brand, or something broader.')}
            action={<Button to="/shop" size="lg">{t('Browse everything')}</Button>}
          />
        ) : (
          <>
            <ProductGrid products={data?.items || []} loading={loading} skeletonCount={8} />
            <div className="mt-12">
              <Pagination page={page} perPage={PER_PAGE} total={data?.total || 0} onPage={goTo} />
            </div>
          </>
        )}
      </div>
      </div>
    </>
  )
}
