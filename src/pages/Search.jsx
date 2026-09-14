import { useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import Seo from '../components/Seo.jsx'
import api from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import { search as trackSearch } from '../lib/analytics.js'
import ProductGrid from '../components/product/ProductGrid.jsx'
import { Button, Empty, ErrorState } from '../components/ui/index.jsx'
import { useBootstrap } from '../store/StorefrontContext.jsx'
import { t, plural } from '../i18n/index.js'

export default function Search() {
  const [params] = useSearchParams()
  const { categories: booted } = useBootstrap()
  const catTree = useAsync(() => api.listCategories(), [], { skip: !!booted })
  const categories = booted || catTree.data?.items || []
  const q = params.get('q') || ''
  const { data, error, loading, reload } = useAsync(
    () => api.listProducts({ q, perPage: 24 }),
    [q],
    { skip: !q },
  )

  // Reported once the results are in, so the count is real. Firing on keystroke
  // would report a dozen searches for one, and every one of them with a total
  // of zero.
  useEffect(() => {
    if (q && !loading && data) trackSearch(q, data.total)
  }, [q, loading, data])

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

      <div className="mt-10">
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !q ? (
          <div>
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
          <ProductGrid products={data?.items || []} loading={loading} skeletonCount={8} />
        )}
      </div>
      </div>
    </>
  )
}
