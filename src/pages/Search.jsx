import { useSearchParams, Link } from 'react-router-dom'
import api from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import ProductGrid from '../components/product/ProductGrid.jsx'
import { Button, Empty, ErrorState } from '../components/ui/index.jsx'
import { useBootstrap } from '../store/StorefrontContext.jsx'

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

  return (
    <div className="wrap py-12 pb-20">
      <p className="eyebrow">Search</p>
      <h1 className="mt-3 text-display-lg">
        {q ? <>“{q}”</> : 'What are you after?'}
      </h1>
      {q && (
        <p className="mt-3 text-[15px] text-muted">
          {loading ? 'Looking…' : `${data?.total ?? 0} ${data?.total === 1 ? 'result' : 'results'}`}
        </p>
      )}

      <div className="mt-10">
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !q ? (
          <div>
            <p className="text-[15px] text-muted">Try a category:</p>
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
            title={`Nothing for “${q}”`}
            body="Try a fabric, a category, or something broader — “linen”, “wool”, “shirt”."
            action={<Button to="/shop" size="lg">Browse everything</Button>}
          />
        ) : (
          <ProductGrid products={data?.items || []} loading={loading} skeletonCount={8} />
        )}
      </div>
    </div>
  )
}
