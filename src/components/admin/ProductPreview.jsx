import { useEffect, useMemo } from 'react'
import ProductView from '../product/ProductView.jsx'
import { ProductDetails } from '../product/Enrichment.jsx'
import ProductCard from '../product/ProductCard.jsx'
import { Icon } from '../ui/index.jsx'

/**
 * What this product will look like, from the draft in front of you.
 *
 * Two things make it honest rather than decorative:
 *
 *  - It renders `ProductView`, the same component the storefront renders. A
 *    preview built from its own markup drifts within a release or two and then
 *    shows something that will not happen.
 *  - It reads the **draft**, not the saved record, so it works before the first
 *    save and shows unsaved edits. A preview that opens the live page is a
 *    "view published version" button wearing the wrong label.
 *
 * The card is included because that is where most shoppers meet a product, and
 * a shot that works in the gallery can still be wrong at 240px.
 */
export default function ProductPreview({ draft, charts = [], open, onClose }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  /**
   * The editor holds a chart *reference*; the storefront receives it resolved.
   * Resolving here is what the API does on read, so the preview sees exactly
   * what a shopper would.
   */
  const product = useMemo(() => {
    if (!draft) return null
    return {
      ...draft,
      slug: draft.slug || 'preview',
      images: draft.images?.length ? draft.images : [{ id: 'none', url: '', alt: '' }],
      options: draft.options || [],
      variants: draft.variants || [],
      rating: draft.rating || { average: 0, count: 0 },
      sizeChart: draft.sizeChartId ? charts.find((c) => c.id === draft.sizeChartId) || null : null,
    }
  }, [draft, charts])

  if (!open || !product) return null

  const problems = []
  if (!product.images.some((i) => i.url)) problems.push('No image — the card will render an empty well.')
  if (product.images.some((i) => i.url && !i.alt)) problems.push('An image has no alt text.')
  if (!product.variants.length) problems.push('No variants — there is nothing to add to a bag.')
  else if (!product.variants.some((v) => v.available)) problems.push('Every variant is out of stock.')
  if (!product.categories?.length) problems.push('No category — it will not appear on any category page.')
  if (draft.published === false) problems.push('This is a draft. Shoppers will not see it.')

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-page">
      <header className="flex shrink-0 items-center gap-4 border-b border-line px-5 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Preview</span>
        <p className="min-w-0 flex-1 truncate text-[14px] font-medium">{product.title || 'Untitled'}</p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-xs border border-line px-3 py-1.5 text-[13px] text-muted transition-colors hover:border-ink hover:text-ink"
        >
          <Icon name="close" size={14} />
          Back to editing
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {problems.length > 0 && (
          <div className="border-b border-line bg-accent-soft/50">
            <div className="wrap wrap-tight py-3">
              <ul className="flex flex-wrap gap-x-6 gap-y-1.5">
                {problems.map((p) => (
                  <li key={p} className="flex items-center gap-1.5 text-[12px] text-accent">
                    <Icon name="info" size={13} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* The site's own container, so the preview is the real geometry
            rather than an approximation of it. */}
        <div className="wrap wrap-tight py-8">
          <ProductView product={product} preview />

          <div className="-mx-5 mt-4">
            <ProductDetails product={product} />
          </div>

          <section className="mt-4 border-t border-line pt-10">
            <p className="eyebrow">On a listing page</p>
            <div className="mt-5 max-w-[16rem]">
              <ProductCard product={product} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
