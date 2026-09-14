import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Badge, Button, Icon, Price, QuantityStepper, Rating,
} from '../ui/index.jsx'
import Media from '../ui/Media.jsx'
import { SIZES } from '../../lib/images.js'
import { formatMoney } from '../../lib/money.js'
import { stockNote } from '../../lib/quantity.js'
import { selectionLabel } from '../../lib/variants.js'
import useProductChoice from '../../hooks/useProductChoice.js'
import { useCart } from '../../store/CartContext.jsx'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { useWishlist } from '../../store/WishlistContext.jsx'
import { ChartTable, FitBlock, FabricBlock, SizeChartModal } from './FitBlock.jsx'
import { isMock } from '../../lib/config.js'
import { ExtraOptions, OptionPicker } from './VariantPicker.jsx'
import { CompareToggle } from './CompareTray.jsx'
import TrustRow, { PaymentsRow, SocialProof } from './TrustRow.jsx'
import {
  ProductHighlights,
  ImageSpecs,
  ProductAssurances,
  DetailTabs,
  FeatureCarousel,
  SpecCarousel,
  ManufacturerRows,
} from './Enrichment.jsx'
import { t, plural } from '../../i18n/index.js'

/*
 * Everything here that only exists after a tap is its own chunk: the zoom, the
 * sheet the sticky bar opens, the offer of optional products, and the set
 * picker only a combo needs. The product page is the heaviest first paint in
 * the theme, and none of these is part of it.
 */
const Lightbox = lazy(() => import('./Lightbox.jsx'))
const VariantSheet = lazy(() => import('./VariantSheet.jsx'))
const OptionalOffer = lazy(() => import('./OptionalOffer.jsx'))
const ComboPicker = lazy(() => import('./ComboPicker.jsx'))

/**
 * The gallery and the buy box — everything above the reviews on a product page.
 *
 * Extracted so the admin preview renders *this*, not a lookalike. A preview
 * built from its own markup drifts from the real page within a release or two,
 * and then it is worse than no preview: it shows something that will not
 * happen.
 *
 * `preview` makes it inert. The cart, the wishlist, the URL sync and the sticky
 * bar are all real-page concerns; in the editor they would either fail (there is
 * no route to sync) or do something genuinely wrong (adding an unsaved product
 * to a shopper's bag).
 *
 * It knows no option by name. What a product can be chosen by, what that
 * costs and what is still missing all come from `useProductChoice`, so a shirt,
 * a phone, a notebook with no options and a set are the same page.
 */
/** One row of the details stack. Hairline dividers, no box. */
function Accordion({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-4 text-start"
      >
        <span className="text-[14px] font-medium">{title}</span>
        <Icon
          name="chevron-down"
          size={16}
          className={`shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="pb-6">{children}</div>}
    </div>
  )
}

export default function ProductView({ product, preview = false, onOpenChart }) {
  const config = useStorefront()
  const [params, setParams] = useSearchParams()
  const choice = useProductChoice(product, { live: !preview })
  const { model, selection, variant, gallery, shown } = choice
  const [shot, setShot] = useState(0)
  const [chartOpen, setChartOpen] = useState(false)
  const [showAllThumbs, setShowAllThumbs] = useState(false)
  const [showSticky, setShowSticky] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  // The request waiting on the optional-products dialog, while it is open.
  const [offer, setOffer] = useState(null)
  const buyRef = useRef(null)

  const { add, busy } = useCart()
  const { has, toggle } = useWishlist()

  /**
   * The delivery paragraphs, with the numbers filled in from the same settings
   * the cart and the checkout read. An unrecognised token is left visible: a
   * `{typo}` on the page is findable, a silently blanked one is not.
   */
  const deliveryPolicy = useMemo(() => {
    const currency = config.pricing?.currency || 'USD'
    const values = {
      shipping: formatMoney({
        amount: config.commerce?.shippingMethods?.[0]?.price ?? 0,
        currency,
      }),
      freeOver: formatMoney({ amount: config.commerce?.freeShippingOver ?? 0, currency }),
      returnsDays: String(config.commerce?.returnsWindowDays ?? 30),
    }
    return (config.deliveryPolicy || []).map((line) =>
      line.replace(/\{(\w+)\}/g, (whole, key) => values[key] ?? whole),
    )
  }, [config])

  // The selected variant lives in the URL, so a shared link, an ad or a
  // back button all land on the exact choices that were made. In the editor
  // there is no product route to sync with, so this stays off.
  useEffect(() => {
    if (preview || !variant) return
    const next = new URLSearchParams(params)
    if (next.get('variant') === variant.id) return
    next.set('variant', variant.id)
    setParams(next, { replace: true })
  }, [preview, variant, params, setParams])

  // Restore from the URL once, after the first render. The prerendered HTML has
  // no query string, and a first render that disagreed with it would throw the
  // server's markup away.
  const restored = useRef(false)
  useEffect(() => {
    if (preview || restored.current) return
    restored.current = true
    const wanted = params.get('variant')
    if (wanted) choice.restore(wanted)
  }, [preview, params, choice])

  /**
   * The gallery is scoped to the choice the photographs follow.
   *
   * Showing every shot of every colourway under a pink jacket is noise — the
   * thumbnails stop being a way to see this product and become a contact sheet
   * of the whole range. Changing that choice resets to its first shot rather
   * than leaving the index pointing at whatever happened to be in that slot.
   */
  const follow = model.options.find((o) => o.imagesFollow)
  const followed = follow ? selection[follow.id] : null
  useEffect(() => {
    setShot(0)
  }, [followed])

  useEffect(() => {
    if (!variant?.imageId) return
    const i = gallery.findIndex((img) => img.id === variant.imageId)
    if (i >= 0) setShot(i)
  }, [variant?.imageId, gallery])

  // A sticky buy bar once the real one scrolls away — on a long product page
  // the decision often happens next to the reviews, and walking back up to a
  // button is where a phone shopper leaves.
  useEffect(() => {
    const el = buyRef.current
    if (preview || !el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(([e]) => setShowSticky(!e.isIntersecting), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [preview, product])

  const saved = has(product.slug)
  const note = stockNote(product, variant, config.commerce?.stock)
  const summary = selectionLabel(model, selection)
  const labels = product.enrichment?.labels || {}
  const specList = product.enrichment?.specList
  const isCombo = product.type === 'combo'
  const current = gallery[shot]
  const openChart = () => (onOpenChart ? onOpenChart() : setChartOpen(true))

  // Beside the option whose role is size. A product with a chart but no size to
  // choose (a sofa's dimensions, a ring-size table) shows it as its own panel below.
  const hasSizeOption = model.options.some((o) => o.role === 'size')
  const sizeAside = (option, onClick = openChart) =>
    option.role !== 'size' ? null : product.sizeChart ? (
      <button type="button" onClick={onClick} className="text-[12px] text-accent link-underline">
        {product.sizeChart.name || t('Size chart')}
      </button>
    ) : isMock ? (
      <Link to="/pages/size-guide" className="text-[12px] text-muted link-underline">{t('Size guide')}</Link>
    ) : null

  const submit = (request) =>
    add(request, request.quantity, t('{title} added to your bag', { title: product.title })).catch(() => {
      /* the bag has already said why, in a toast */
    })

  const buy = () => {
    if (preview || !choice.ready) return
    const request = choice.request()
    if (product.optionalProducts?.length) setOffer(request)
    else submit(request)
  }

  const scrollToBuy = () => buyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })

  return (
    <>
      {/*
        Two unequal columns, not two halves.
        A 50/50 split gives the buy box a 600px measure — twice the comfortable
        reading width — so every line of trust copy runs the full track and the
        page reads as two walls of content. Pinning the right column at
        24–28rem gives the rest to the image. `min-w-0` on both is
        load-bearing: a grid item defaults to min-width:auto, so one long
        unbreakable string pushes the track wider than its share and the column
        overflows the page.
      */}
      <div
        className={`grid gap-10 pb-16 lg:grid-cols-[minmax(0,1fr)_30rem] lg:gap-12 ${
          preview ? '' : 'wrap wrap-tight mt-8'
        }`}
      >
        {/* gallery */}
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          {/*
            Thumbnails beside the image on desktop, underneath on mobile.
            Stacked below, they sit under a shot that is already most of the
            viewport, so the one control that changes what you are looking at
            is the one you have to scroll for.
          */}
          <div className="flex flex-col-reverse gap-3 lg:flex-row">
            {gallery.length > 1 && (
              <ul className="flex gap-3 overflow-x-auto no-scrollbar lg:w-[4.5rem] lg:shrink-0 lg:flex-col lg:overflow-visible">
                {/* Five, then a count. A rail longer than the image it sits
                    beside stops looking like a control and starts looking like
                    a second gallery. */}
                {gallery.slice(0, showAllThumbs ? gallery.length : 5).map((img, i) => (
                  <li key={img.id || img.url} className="w-[4.5rem] shrink-0">
                    <button
                      type="button"
                      onClick={() => setShot(i)}
                      aria-label={img.type === 'video' ? t('View video {index} of {total}', { index: i + 1, total: gallery.length }) : t('View image {index} of {total}', { index: i + 1, total: gallery.length })}
                      aria-current={i === shot}
                      className={`shot relative w-full rounded-xs ring-1 transition-shadow ${
                        i === shot ? 'ring-ink' : 'ring-line hover:ring-muted'
                      }`}
                    >
                      <Media src={img.url} type={img.type} provider={img.provider} alt="" loading="lazy" sizes={SIZES.thumb} className="h-full w-full object-cover" />
                      {img.type === 'video' && (
                        <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
                          <span className="grid h-6 w-6 place-items-center rounded-full bg-page/90 text-[9px] text-ink">▶</span>
                        </span>
                      )}
                    </button>
                  </li>
                ))}
                {!showAllThumbs && gallery.length > 5 && (
                  <li className="w-[4.5rem] shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowAllThumbs(true)}
                      className="shot grid w-full place-items-center rounded-xs border border-line text-[12px] text-muted transition-colors hover:border-ink hover:text-ink"
                    >
                      +{gallery.length - 5}
                    </button>
                  </li>
                )}
              </ul>
            )}

            <div className="min-w-0 flex-1">
              {/*
                A tinted panel that always fills the column, with the shot inside
                it, at 4:5 — every image in this theme is produced at 900×1125.
                The frame is a button on a photograph and a plain box on a
                video: a player inside a `<button>` is invalid markup and a
                scrub bar that cannot be scrubbed.
              */}
              <Frame
                zoomable={current?.type !== 'video'}
                onZoom={() => setZoomOpen(true)}
                label={t('View {title} full screen', { title: product.title })}
              >
                {/* A short viewport crops the panel. Biasing the crop above
                    centre keeps the collar and the face. */}
                <Media
                  src={current?.url}
                  type={current?.type}
                  provider={current?.provider}
                  embedUrl={current?.embedUrl}
                  alt={current?.alt}
                  width={current?.width}
                  height={current?.height}
                  controls={current?.type === 'video'}
                  fetchpriority="high"
                  decoding="async"
                  sizes={SIZES.hero}
                  className="h-full w-full object-cover"
                  style={{ objectPosition: '50% 38%' }}
                />

                {/* Only over the first shot — the rest are detail crops, and
                    the crop is the answer somebody opened them for. */}
                {shot === 0 && current?.type !== 'video' && <ImageSpecs enrichment={product.enrichment} />}

                {current?.type !== 'video' && (
                  <span
                    aria-hidden="true"
                    className="absolute end-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-page/80 text-ink backdrop-blur-sm"
                  >
                    <Icon name="search" size={16} />
                  </span>
                )}
              </Frame>
            </div>
          </div>
        </div>

        {/* buy box */}
        <div className="min-w-0">
          {product.badges?.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {product.badges.map((b) => <Badge key={b} kind={b} />)}
            </div>
          )}

          {product.brand && (
            <Link to={`/brands/${product.brand.slug}`} className="mb-3 inline-flex items-center text-muted transition-colors hover:text-ink">
              {product.brand.logo?.url ? (
                <img src={product.brand.logo.url} alt={product.brand.logo.alt || product.brand.name} className="h-6 w-auto" />
              ) : (
                <span className="font-mono text-[11px] uppercase tracking-[0.16em]">{product.brand.name}</span>
              )}
            </Link>
          )}

          {/* display-md, not display-lg. The larger step tops out around 52px,
              which in a 26rem column is three words a line and a title taller
              than the price, the picker and the button put together. */}
          <h1 className="text-display-md">{product.title}</h1>
          <p className="mt-2 text-[15px] leading-snug text-muted">{product.subtitle}</p>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Price price={shown.price} to={shown.to} compareAt={shown.compareAt} size="lg" />
            <a href="#reviews" className="shrink-0">
              <Rating value={product.rating.average} count={product.rating.count} />
            </a>
          </div>
          {!isMock && product.priceTiers?.length > 0 && (
            <table className="mt-3 text-[13px]">
              <caption className="sr-only">{t('Price per item by quantity')}</caption>
              <tbody>
                {product.priceTiers.map((tier) => (
                  <tr key={tier.minQuantity}>
                    <td className="pe-4 text-muted">{plural(tier.minQuantity, '{count}+ items', '{count}+ items')}</td>
                    <td className="tabular-nums">{t('{price} each', { price: formatMoney(tier.price) })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* A lede, not the whole description. The rest lives in Details,
              where someone who wants it will look for it. */}
          <p className="mt-5 text-[15px] leading-relaxed text-muted">{product.description}</p>

          <ProductHighlights enrichment={product.enrichment} />

          {/*
            Straight after the highlights, and above the picker: detail that
            arrives after the decision is detail that did not help make it. The
            sticky bar covers the button this pushes down.

            Tab names come from the store (`enrichment.labels`). "Fabric & care"
            and "Construction" are the words for a shirt; a phone's details are
            what is in the box.
          */}
          <DetailTabs
            tabs={[
              {
                id: 'fabric',
                label: labels.fabric || t('Materials & care'),
                when: Boolean(product.fabric) || product.care?.length > 0,
                render: () => (
                  <>
                    <FabricBlock product={product} flat />
                    {product.care?.length > 0 && (
                      <ul className="mt-5 space-y-2.5">
                        {product.care.map((c) => (
                          <li key={c} className="flex gap-2.5 text-[14px] leading-relaxed text-muted">
                            <Icon name="sparkle" size={15} className="mt-0.5 shrink-0 text-accent" />
                            {c}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ),
              },
              {
                id: 'specs',
                label: labels.specs || t('Specifications'),
                when: specList?.length > 0 || Object.keys(product.enrichment?.specs || {}).length > 0,
                render: () => <SpecCarousel specs={product.enrichment.specs} specList={specList} />,
              },
              {
                id: 'features',
                label: labels.features || t('Features'),
                when: product.enrichment?.features?.length > 0,
                render: () => <FeatureCarousel items={product.enrichment.features} />,
              },
              {
                id: 'details',
                label: labels.details || t('Details'),
                when: product.details?.length > 0,
                render: () => (
                  <ul className="space-y-2.5">
                    {product.details.map((d) => (
                      <li key={d} className="flex gap-2.5 text-[14px] leading-relaxed text-muted">
                        <Icon name="check" size={15} className="mt-0.5 shrink-0 text-accent" />
                        {d}
                      </li>
                    ))}
                  </ul>
                ),
              },
              {
                id: 'manufacturer',
                label: labels.manufacturer || t('Manufacturer info'),
                when: Boolean(product.enrichment?.manufacturer),
                render: () => (
                  <ManufacturerRows
                    info={product.enrichment.manufacturer}
                    maker={product.enrichment.maker}
                  />
                ),
              },
            ]}
          />

          {isCombo ? (
            <Suspense fallback={<div className="skeleton mt-8 h-40 rounded-xs" />}>
              <ComboPicker groups={product.combo || []} picks={choice.combo} onPick={choice.pickCombo} total={shown.price} />
            </Suspense>
          ) : (
            <OptionPicker choice={choice} aside={(o) => sizeAside(o)} />
          )}
          <ExtraOptions choice={choice} />

          {note && (
            <p className={`mt-3 text-[13px] ${note.low ? 'text-sale' : 'text-muted'}`}>
              {note.text}
              {note.low && summary ? ` ${t('in {summary}', { summary })}` : ''}.
            </p>
          )}

          {/*
            One row on a wide column, two on a narrow one — and the wrap is
            explicit rather than whatever `flex-wrap` happens to do, which put
            the heart on a line of its own where it reads as a stray button.
          */}
          <div
            ref={buyRef}
            className="mt-8 grid grid-cols-[auto_1fr] items-center gap-3 sm:grid-cols-[auto_1fr_auto]"
          >
            <QuantityStepper value={choice.qty} onChange={choice.setQty} {...choice.stepper} />
            <Button
              size="lg"
              className="order-last col-span-2 w-full sm:order-none sm:col-span-1"
              disabled={preview || !choice.ready || busy}
              onClick={buy}
            >
              {choice.blocker || (busy ? t('Adding…') : t('Add to bag'))}
            </Button>
            {config.features?.wishlist !== false && (
            <Button
              variant="quiet"
              size="lg"
              square
              aria-pressed={saved}
              aria-label={saved ? t('Remove from saved') : t('Save for later')}
              onClick={() => !preview && toggle(product.slug, product.title)}
              className="justify-self-end sm:justify-self-auto"
            >
              <Icon name="heart" size={19} filled={saved} className={saved ? 'text-sale' : ''} />
            </Button>
            )}
          </div>
          {!preview && <CompareToggle slug={product.slug} className="mt-4" />}

          <TrustRow flat />
          {config.trust?.showSocialProof !== false && <SocialProof product={product} />}

          {/* Store-wide promises above (TrustRow), per-product ones here. */}
          <ProductAssurances product={product} />

          <div className="mt-8 border-t border-line">
            {/* Fit stays open, and only where there is a size to choose: it
                decides whether an apparel order gets kept, and it means nothing
                under a notebook. */}
            {model.options.some((o) => o.role === 'size') && product.fit && (
              <Accordion title={t('Fit & sizing')} defaultOpen>
                <FitBlock product={product} flat onOpenChart={openChart} />
              </Accordion>
            )}

            {product.sizeChart && !hasSizeOption && (
              <Accordion title={product.sizeChart.name || t('Measurements')}>
                <ChartTable chart={product.sizeChart} />
              </Accordion>
            )}

            <Accordion title={t('Delivery & returns')}>
              {/* Copy from settings, numbers from the commerce config. */}
              <div className="space-y-3 text-[14px] leading-relaxed text-muted">
                {deliveryPolicy.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </Accordion>
          </div>

          {/* Last: "Secure checkout" answers a question a shopper has once they
              have decided, so it closes the column. */}
          <PaymentsRow />
        </div>
      </div>

      {/* Sticky buy bar. Appears only once the real one has scrolled away, and
          repeats the selection so it is never ambiguous about what it is about
          to add. Never in a preview: a fixed bar inside a dialog is a bar stuck
          to the browser window. */}
      {!preview && (
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-page/95 backdrop-blur transition-transform duration-300 ${
          showSticky ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="wrap wrap-tight flex items-center gap-3 py-3">
          <div className="hidden w-12 shrink-0 sm:block">
            <div className="shot rounded-xs">
              <Media src={gallery[0]?.url} type={gallery[0]?.type} provider={gallery[0]?.provider} alt="" loading="lazy" sizes={SIZES.thumb} className="h-full w-full object-cover" />
            </div>
          </div>
          {/*
            The selection is a button, not a caption. On a phone the picker is
            most of a screen above this bar; tapping the selection opens the
            same choices in a sheet over the page.
          */}
          <button
            type="button"
            onClick={() => (model.options.length ? setSheetOpen(true) : scrollToBuy())}
            className="min-w-0 flex-1 text-start"
          >
            <p className="truncate text-[13px] font-medium">{product.title}</p>
            {model.options.length > 0 && (
              <p className="flex items-center gap-1 truncate text-[12px] text-faint">
                <span className="truncate">
                  {[summary, choice.missing && t('select {option}', { option: choice.missing.name.toLowerCase() })].filter(Boolean).join(' · ')}
                </span>
                <Icon name="chevron-down" size={12} className="shrink-0 rotate-180" />
              </p>
            )}
          </button>
          <Price price={shown.price} to={shown.to} compareAt={shown.compareAt} size="sm" className="hidden shrink-0 sm:inline-flex" />
          <Button
            size="md"
            className="shrink-0"
            disabled={busy || choice.stuck}
            onClick={() => (choice.ready ? buy() : choice.missing ? setSheetOpen(true) : scrollToBuy())}
          >
            {choice.missing ? t('Choose {option}', { option: choice.missing.name.toLowerCase() }) : choice.blocker || t('Add to bag')}
          </Button>
        </div>
      </div>
      )}

      {!preview && zoomOpen && (
        <Suspense fallback={null}>
          <Lightbox images={gallery} index={shot} onIndex={setShot} onClose={() => setZoomOpen(false)} />
        </Suspense>
      )}

      {!preview && sheetOpen && (
        <Suspense fallback={null}>
          <VariantSheet
            product={product}
            choice={choice}
            busy={busy}
            aside={(o) =>
              sizeAside(o, () => {
                setSheetOpen(false)
                openChart()
              })
            }
            onClose={() => setSheetOpen(false)}
            onAdd={() => {
              setSheetOpen(false)
              buy()
            }}
          />
        </Suspense>
      )}

      {offer && (
        <Suspense fallback={null}>
          <OptionalOffer
            product={product}
            busy={busy}
            onClose={() => setOffer(null)}
            onConfirm={(optionalProducts) => {
              setOffer(null)
              submit(optionalProducts.length ? { ...offer, optionalProducts } : offer)
            }}
          />
        </Suspense>
      )}

      <SizeChartModal product={product} open={chartOpen} onClose={() => setChartOpen(false)} />
    </>
  )
}

/** The gallery frame: a zoom button over a photograph, a plain box over video. */
function Frame({ zoomable, onZoom, label, children }) {
  const shared = 'relative block w-full overflow-hidden rounded-xs bg-sunken'
  const style = { aspectRatio: '4 / 5', maxHeight: '78vh' }

  if (!zoomable) {
    return (
      <div className={shared} style={style}>
        {children}
      </div>
    )
  }
  return (
    <button type="button" onClick={onZoom} aria-label={label} className={`${shared} cursor-zoom-in`} style={style}>
      {children}
    </button>
  )
}
