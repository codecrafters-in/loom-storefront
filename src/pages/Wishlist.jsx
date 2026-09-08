import api from '../lib/api/index.js'
import Seo from '../components/Seo.jsx'
import useAsync from '../hooks/useAsync.js'
import ProductGrid from '../components/product/ProductGrid.jsx'
import Promises from '../components/layout/Promises.jsx'
import { Button, Empty, ErrorState } from '../components/ui/index.jsx'
import { useWishlist } from '../store/WishlistContext.jsx'

export default function Wishlist() {
  const { slugs } = useWishlist()
  // Keyed on the slug list so removing a heart refetches and the grid updates.
  const { data, error, loading, reload } = useAsync(() => api.getWishlist(), [slugs.join(',')])

  return (
    <>
      <Seo title={'Saved'} noindex />
      <div className="wrap py-10">
        <h1 className="text-display-lg">Saved</h1>
        <p className="mt-3 text-[15px] text-muted">
          {loading ? 'Loading…' : `${data?.total ?? 0} ${data?.total === 1 ? 'piece' : 'pieces'} you came back to.`}
        </p>
      </div>

      <div className="wrap pb-20">
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !loading && !data?.items.length ? (
          <Empty
            icon="heart"
            title="Nothing saved yet"
            body="Tap the heart on anything you want to think about. It will be here when you come back."
            action={<Button to="/shop" size="lg">Browse the shop</Button>}
          />
        ) : (
          <ProductGrid products={data?.items || []} loading={loading} skeletonCount={4} />
        )}
      </div>

      <Promises />
    </>
  )
}
