import ProductCard from './ProductCard.jsx'
import { Skeleton } from '../ui/index.jsx'

export default function ProductGrid({ products = [], loading = false, skeletonCount = 8, columns = 4, className = '' }) {
  const cols = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
  }[columns]

  if (loading) {
    return (
      <div className={`grid gap-x-5 gap-y-10 ${cols} ${className}`}>
        {Array.from({ length: skeletonCount }, (_, i) => (
          <div key={i}>
            <Skeleton className="aspect-[4/5] w-full" />
            <Skeleton className="mt-4 h-4 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`grid gap-x-5 gap-y-10 ${cols} ${className}`}>
      {products.map((p, i) => (
        <ProductCard key={p.id || p.slug} product={p} priority={i < 4} />
      ))}
    </div>
  )
}
