import { Link } from 'react-router-dom'
import api from '../lib/api/index.js'
import Seo from '../components/Seo.jsx'
import useAsync from '../hooks/useAsync.js'
import Promises from '../components/layout/Promises.jsx'
import { Button, Empty, ErrorState, Skeleton } from '../components/ui/index.jsx'
import { t, plural } from '../i18n/index.js'

/**
 * Every brand the store sells, each linking to its own page (`/brands/:slug`).
 *
 * Only brands with a product on the store are listed — the API leaves out the
 * rest — so a card never leads to an empty page.
 */
export default function Brands() {
  const { data, error, loading, reload } = useAsync(() => api.listBrands(), [])
  const brands = data?.items || []

  return (
    <>
      <Seo title={t('Brands')} description={t('Shop by brand.')} />
      <div className="wrap py-10">
        <h1 className="text-display-lg">{t('Brands')}</h1>
        <p className="mt-3 text-[15px] text-muted">
          {loading ? t('Loading…') : plural(brands.length, '{count} brand', '{count} brands')}
        </p>
      </div>

      <div className="wrap pb-20">
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : !brands.length ? (
          <Empty icon="package" title={t('No brands yet')} body={t('Products will show their brand here once they have one.')} action={<Button to="/shop" size="lg">{t('Browse the shop')}</Button>} />
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {brands.map((b) => (
              <li key={b.slug}>
                <Link to={`/brands/${b.slug}`} className="block h-full rounded-xs border border-line bg-surface p-5 transition-colors hover:border-ink">
                  {b.logo ? (
                    <img src={b.logo.url} alt="" loading="lazy" className="h-10 w-auto max-w-full object-contain" />
                  ) : (
                    <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-sunken font-display text-lg">{b.name.slice(0, 1)}</span>
                  )}
                  <p className="mt-3 text-[15px] font-medium">{b.name}</p>
                  <p className="mt-1 text-[12px] text-muted">{plural(b.count, '{count} product', '{count} products')}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Promises />
    </>
  )
}
