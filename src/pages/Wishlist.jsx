import api from '../lib/api/index.js'
import Seo from '../components/Seo.jsx'
import useAsync from '../hooks/useAsync.js'
import ProductGrid from '../components/product/ProductGrid.jsx'
import Promises from '../components/layout/Promises.jsx'
import { Button, Empty, ErrorState } from '../components/ui/index.jsx'
import { useWishlist } from '../store/WishlistContext.jsx'
import { t, plural } from '../i18n/index.js'

export default function Wishlist() {
  const { slugs } = useWishlist()
  // Keyed on the slug list so removing a heart refetches and the grid updates.
  const { data, error, loading, reload } = useAsync(() => api.getWishlist(), [slugs.join(',')])

  return (
    <>
      <Seo title={t('Saved')} noindex />
      <div className="wrap py-10">
        <h1 className="text-display-lg">{t('Saved')}</h1>
        <p className="mt-3 text-[15px] text-muted">
          {loading ? t('Loading…') : plural(data?.total ?? 0, '{count} item you came back to.', '{count} items you came back to.')}
        </p>
      </div>

      <div className="wrap pb-20">
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !loading && !data?.items.length ? (
          <Empty
            icon="heart"
            title={t('Nothing saved yet')}
            body={t('Tap the heart on anything you want to think about. It will be here when you come back.')}
            action={<Button to="/shop" size="lg">{t('Browse the shop')}</Button>}
          />
        ) : (
          <ProductGrid products={data?.items || []} loading={loading} skeletonCount={4} />
        )}
      </div>

      <Promises />
    </>
  )
}
