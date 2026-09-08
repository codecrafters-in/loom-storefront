import { Link } from 'react-router-dom'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import ProductGrid from '../product/ProductGrid.jsx'
import Promises from '../layout/Promises.jsx'
import { Button, ErrorState, Icon } from '../ui/index.jsx'
import { useBootstrap } from '../../store/StorefrontContext.jsx'
import { railKey } from '../../lib/api/railKey.js'

/**
 * The home page is data.
 *
 * `storefront.home` is an ordered list of typed sections; this file maps each
 * type to a component. Anything unrecognised is skipped with a development
 * warning, so an admin panel that emits a section type newer than the deployed
 * build leaves a gap instead of taking the page down.
 */

function Hero({ section }) {
  return (
    <section className="relative">
      <div className="relative h-[68vh] min-h-[26rem] w-full overflow-hidden bg-sunken md:h-[78vh]">
        {section.image?.url && (
          <img
            src={section.image.url}
            alt={section.image.alt || ''}
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover"
            style={{ objectPosition: section.focal || '50% 40%' }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-ink/15 to-transparent" />
        <div className="wrap absolute inset-x-0 bottom-0 pb-12 md:pb-16">
          {section.eyebrow && (
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-page/80">{section.eyebrow}</p>
          )}
          <h1 className="mt-4 max-w-2xl text-display-xl text-page">{section.title}</h1>
          {section.body && <p className="mt-5 max-w-md text-[15px] leading-relaxed text-page/85">{section.body}</p>}
          {section.actions?.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-3">
              {section.actions.map((a) => (
                <Button
                  key={a.label}
                  to={a.to}
                  size="lg"
                  variant={a.variant || 'accent'}
                  className={a.variant === 'outline' ? 'border-page text-page hover:bg-page hover:text-ink' : ''}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function SectionHead({ eyebrow, title, ctaLabel, ctaTo }) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className={`text-display-md ${eyebrow ? 'mt-3' : ''}`}>{title}</h2>
      </div>
      {ctaTo && (
        <Link to={ctaTo} className="hidden shrink-0 items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink sm:inline-flex">
          {ctaLabel || 'See all'} <Icon name="arrow-right" size={15} />
        </Link>
      )}
    </div>
  )
}

function CategoryStrip({ section }) {
  // Already in hand from the bootstrap call on almost every visit.
  const { categories } = useBootstrap()
  const { data } = useAsync(() => api.listCategories(), [], { skip: !!categories })
  const parent = section.source?.parent
  const all = categories || data?.items || []
  const items = (parent ? all.find((c) => c.slug === parent)?.children || [] : all).slice(
    0,
    section.source?.limit || 6,
  )

  return (
    <section className="wrap py-16 md:py-20">
      <SectionHead {...section} />
      <ul className="no-scrollbar mt-8 flex snap-x gap-4 overflow-x-auto pb-2 lg:grid lg:overflow-visible" style={{ gridTemplateColumns: `repeat(${Math.min(items.length || 6, 6)}, minmax(0,1fr))` }}>
        {items.map((c) => (
          <li key={c.slug} className="w-40 shrink-0 snap-start lg:w-auto">
            <Link to={`/shop/${c.slug}`} className="group block">
              <div className="shot rounded-xs">
                <img src={c.image.url} alt={c.image.alt} loading="lazy" decoding="async" className="transition-transform duration-700 group-hover:scale-[1.04]" />
              </div>
              <p className="mt-3 text-sm font-medium">{c.name}</p>
              <p className="text-[12px] text-faint">{c.count} pieces</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ProductRail({ section }) {
  const src = section.source || {}
  const { rails } = useBootstrap()
  const prefetched = rails?.[railKey(src)]

  const { data, error, loading, reload } = useAsync(
    () =>
      api.listProducts({
        sort: src.sort || 'featured',
        category: src.category,
        collection: src.collection,
        tags: src.tags,
        perPage: src.limit || 4,
      }),
    [JSON.stringify(src)],
    { skip: !!prefetched },
  )

  const items = prefetched || data?.items || []

  return (
    <section className="wrap pb-16 md:pb-20">
      <SectionHead {...section} />
      <div className="mt-8">
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <ProductGrid products={items} loading={loading && !prefetched} skeletonCount={src.limit || 4} />
        )}
      </div>
    </section>
  )
}

function Editorial({ section }) {
  const body = Array.isArray(section.body) ? section.body : [section.body].filter(Boolean)
  return (
    <section className="border-y border-line bg-surface">
      <div className="wrap grid items-center gap-10 py-16 md:grid-cols-2 md:py-20">
        {section.image?.url && (
          <div className="relative aspect-[4/3] overflow-hidden rounded-xs bg-sunken">
            <img src={section.image.url} alt={section.image.alt || ''} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          </div>
        )}
        <div className="md:pl-6">
          {section.eyebrow && <p className="eyebrow">{section.eyebrow}</p>}
          <h2 className="mt-4 text-display-md">{section.title}</h2>
          {body.map((p) => (
            <p key={p} className="mt-6 text-[15px] leading-relaxed text-muted first-of-type:mt-6">{p}</p>
          ))}
          {section.action && (
            <Button to={section.action.to} variant="outline" className="mt-8">{section.action.label}</Button>
          )}
        </div>
      </div>
    </section>
  )
}

function CollectionGrid({ section }) {
  const { collections } = useBootstrap()
  const { data } = useAsync(() => api.listCollections(), [], { skip: !!collections })
  const items = ((collections?.items ?? data?.items) || []).slice(0, section.source?.limit || 3)
  return (
    <section className="wrap py-16 md:py-20">
      <SectionHead {...section} />
      <ul className="mt-8 grid gap-5 md:grid-cols-3">
        {items.map((c) => (
          <li key={c.slug}>
            <Link to={`/collections/${c.slug}`} className="group block">
              <div className="relative aspect-[3/2] overflow-hidden rounded-xs bg-sunken">
                <img src={c.image.url} alt={c.image.alt} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <h3 className="font-display text-xl text-page">{c.title}</h3>
                  <p className="mt-1 text-[13px] text-page/80">{c.count} pieces</p>
                </div>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">{c.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function RichText({ section }) {
  return (
    <section className="wrap max-w-3xl py-16 text-center">
      {section.eyebrow && <p className="eyebrow">{section.eyebrow}</p>}
      <h2 className="mt-4 text-display-md">{section.title}</h2>
      {section.body && <p className="mt-5 text-[16px] leading-relaxed text-muted">{section.body}</p>}
      {section.action && <Button to={section.action.to} className="mt-8">{section.action.label}</Button>}
    </section>
  )
}

const REGISTRY = {
  hero: Hero,
  'category-strip': CategoryStrip,
  'product-rail': ProductRail,
  editorial: Editorial,
  'collection-grid': CollectionGrid,
  'rich-text': RichText,
  promises: () => <Promises />,
}

export default function Section({ section }) {
  const Component = REGISTRY[section.type]
  if (!Component) {
    if (import.meta.env.DEV) {
      console.warn(`[home] unknown section type "${section.type}" — skipped. Known: ${Object.keys(REGISTRY).join(', ')}`)
    }
    return null
  }
  return <Component section={section} />
}

export { REGISTRY as sectionTypes }
