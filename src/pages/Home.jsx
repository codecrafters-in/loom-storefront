import { Link } from 'react-router-dom'
import api from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import ProductGrid from '../components/product/ProductGrid.jsx'
import Promises from '../components/layout/Promises.jsx'
import { Button, Icon, ErrorState } from '../components/ui/index.jsx'

export default function Home() {
  const featured = useAsync(() => api.listProducts({ sort: 'newest', perPage: 4 }), [])
  const best = useAsync(() => api.listProducts({ sort: 'featured', perPage: 8 }), [])
  const cats = useAsync(() => api.listCategories(), [])
  const cols = useAsync(() => api.listCollections(), [])

  return (
    <>
      {/* hero */}
      <section className="relative">
        <div className="relative h-[68vh] min-h-[26rem] w-full overflow-hidden bg-sunken md:h-[78vh]">
          <img
            src="/images/editorial/hero.jpg"
            alt="Two models in neutral autumn layers against a plain wall"
            width={2400}
            height={1350}
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover object-[50%_35%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-ink/10 to-transparent" />
          <div className="wrap absolute inset-x-0 bottom-0 pb-12 md:pb-16">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-page/80">Autumn 2026</p>
            <h1 className="mt-4 max-w-2xl text-display-xl text-page">Made to be kept.</h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-page/85">
              Twenty-four pieces. Real fabric weights, honest construction, and nothing
              designed to be replaced next season.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button to="/shop" size="lg" variant="accent">Shop everything</Button>
              <Button to="/collections/new-season" size="lg" variant="outline" className="border-page text-page hover:bg-page hover:text-ink">
                New season
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* categories */}
      <section className="wrap py-16 md:py-20">
        <div className="flex items-end justify-between gap-6">
          <h2 className="text-display-md">Shop by category</h2>
          <Link to="/shop" className="hidden shrink-0 items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink sm:inline-flex">
            All products <Icon name="arrow-right" size={15} />
          </Link>
        </div>
        <ul className="no-scrollbar mt-8 flex snap-x gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-6 lg:overflow-visible">
          {(cats.data?.items || []).map((c) => (
            <li key={c.slug} className="w-40 shrink-0 snap-start lg:w-auto">
              <Link to={`/shop/${c.slug}`} className="group block">
                <div className="shot rounded-xs">
                  <img
                    src={c.image.url}
                    alt={c.image.alt}
                    loading="lazy"
                    decoding="async"
                    className="transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                </div>
                <p className="mt-3 text-sm font-medium">{c.name}</p>
                <p className="text-[12px] text-faint">{c.count} pieces</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* new in */}
      <section className="wrap pb-16 md:pb-20">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Just landed</p>
            <h2 className="mt-3 text-display-md">New this season</h2>
          </div>
          <Link to="/shop?sort=newest" className="hidden shrink-0 items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink sm:inline-flex">
            See all <Icon name="arrow-right" size={15} />
          </Link>
        </div>
        <div className="mt-8">
          {featured.error ? (
            <ErrorState error={featured.error} onRetry={featured.reload} />
          ) : (
            <ProductGrid products={featured.data?.items || []} loading={featured.loading} skeletonCount={4} />
          )}
        </div>
      </section>

      {/* editorial */}
      <section className="border-y border-line bg-surface">
        <div className="wrap grid items-center gap-10 py-16 md:grid-cols-2 md:py-20">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xs bg-sunken">
            <img
              src="/images/editorial/craft.jpg"
              alt="A tailor working at a sewing machine"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="md:pl-6">
            <p className="eyebrow">How we make things</p>
            <h2 className="mt-4 text-display-md">
              A garment is mostly decisions you cannot see.
            </h2>
            <p className="mt-6 text-[15px] leading-relaxed text-muted">
              Fabric weight, seam construction, whether the collar is fused or unlined, whether the
              knit panels are cut from a sheet or knitted to shape. None of it photographs well and
              all of it decides whether a piece is still worth wearing in three years.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              So every product page here lists the things a maker would actually care about — gsm,
              mill, construction, and what will happen to it in the wash.
            </p>
            <Button to="/collections/built-to-last" variant="outline" className="mt-8">
              See what that looks like
            </Button>
          </div>
        </div>
      </section>

      {/* collections */}
      <section className="wrap py-16 md:py-20">
        <h2 className="text-display-md">Collections</h2>
        <ul className="mt-8 grid gap-5 md:grid-cols-3">
          {(cols.data?.items || []).map((c) => (
            <li key={c.slug}>
              <Link to={`/collections/${c.slug}`} className="group block">
                <div className="relative aspect-[3/2] overflow-hidden rounded-xs bg-sunken">
                  <img
                    src={c.image.url}
                    alt={c.image.alt}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  />
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

      {/* bestsellers */}
      <section className="wrap pb-20">
        <div className="flex items-end justify-between gap-6">
          <h2 className="text-display-md">People keep buying these</h2>
          <Link to="/shop" className="hidden shrink-0 items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink sm:inline-flex">
            All products <Icon name="arrow-right" size={15} />
          </Link>
        </div>
        <div className="mt-8">
          <ProductGrid products={best.data?.items || []} loading={best.loading} skeletonCount={8} />
        </div>
      </section>

      <Promises />
    </>
  )
}
