import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Badge, Button, Icon, Price, QuantityStepper, Rating,
} from '../ui/index.jsx'
import Media from '../ui/Media.jsx'
import { SIZES } from '../../lib/images.js'
import { formatMoney } from '../../lib/money.js'
import { useCart } from '../../store/CartContext.jsx'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { useWishlist } from '../../store/WishlistContext.jsx'
import { FitBlock, FabricBlock, SizeChartModal } from './FitBlock.jsx'
import Lightbox from './Lightbox.jsx'
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
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
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
  const [color, setColor] = useState(null)
  const [size, setSize] = useState(null)
  const [qty, setQty] = useState(1)
  const [shot, setShot] = useState(0)
  const [chartOpen, setChartOpen] = useState(false)
  const [showAllThumbs, setShowAllThumbs] = useState(false)
  const [showSticky, setShowSticky] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const buyRef = useRef(null)

  const { add, busy } = useCart()
  const { has, toggle } = useWishlist()

  const colors = useMemo(
    () => product?.options.find((o) => o.name === 'Color')?.values || [],
    [product],
  )
  const sizes = useMemo(
    () => product?.options.find((o) => o.name === 'Size')?.values || [],
    [product],
  )
  /**
   * Default to the first colour that is actually buyable.
   *
   * Falling back to `colors[0]` looks harmless until the first colourway sells
   * out, at which point every visitor lands on a product where every size is
   * struck through and concludes the whole thing is gone.
   */
  const firstInStock = useMemo(() => {
    if (!product) return null
    return (
      colors.find((c) => product.variants.some((v) => v.options.Color === c && v.available)) ||
      colors[0] ||
      null
    )
  }, [product, colors])
  const activeColor = color ?? firstInStock

  /**
   * The state of every size in the chosen colour.
   *
   * Three states, not two. "Sold out" and "we never made it in this colour" look
   * identical if you only track stock, and they are different answers to the
   * question a shopper is asking — one is worth waiting for, the other is not.
   * A white shirt offered only in S and M is ordinary, and the picker should say
   * so rather than implying the large sold out.
   */
  const sizeState = useMemo(() => {
    if (!product) return {}
    return Object.fromEntries(
      sizes.map((s) => {
        const v = product.variants.find((x) => x.options.Color === activeColor && x.options.Size === s)
        if (!v) return [s, { state: 'absent', inventory: 0 }]
        return [s, { state: v.available ? 'available' : 'sold-out', inventory: v.inventory }]
      }),
    )
  }, [product, sizes, activeColor])

  const variant = product?.variants.find(
    (v) => v.options.Color === activeColor && v.options.Size === size,
  )

  /**
   * The price for what is currently chosen, which is not always a variant.
   *
   * `variant` needs a colour *and* a size, so a shopper who has picked a colour
   * and nothing else was being shown `product.price` — the same number for
   * every colourway, whatever the variants actually cost, and it then jumped
   * when they chose a size. With per-variant pricing that reads as the page
   * ignoring the picker, which is exactly what it was doing.
   *
   * So: the exact price once a variant is settled, and the range across the
   * chosen colour before that. A range is the honest answer to "what does this
   * cost" when the answer still depends on a choice not yet made.
   */
  const shown = useMemo(() => {
    if (!product) return null
    if (variant) return { price: variant.price, compareAt: variant.compareAtPrice ?? product.compareAtPrice }

    const pool = product.variants.filter((v) => v.options.Color === activeColor)
    const prices = (pool.length ? pool : product.variants).map((v) => v.price).filter(Boolean)
    if (!prices.length) return { price: product.price, compareAt: product.compareAtPrice }

    const low = prices.reduce((a, b) => (b.amount < a.amount ? b : a))
    const high = prices.reduce((a, b) => (b.amount > a.amount ? b : a))
    return low.amount === high.amount
      ? { price: low, compareAt: product.compareAtPrice }
      : { price: low, to: high }
  }, [product, variant, activeColor])

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

  /** Which colours have nothing left at all — struck through rather than hidden. */
  const colorSoldOut = useMemo(() => {
    if (!product) return {}
    return Object.fromEntries(
      colors.map((c) => [c, !product.variants.some((v) => v.options.Color === c && v.available)]),
    )
  }, [product, colors])

  /**
   * Changing colour keeps the size when that size still exists in the new
   * colour. Clearing it every time makes the picker feel like it is fighting
   * you, and it is the most common thing to get wrong in a variant selector.
   */
  const pickColor = (c) => {
    setColor(c)
    const stillThere = product.variants.find(
      (v) => v.options.Color === c && v.options.Size === size && v.available,
    )
    if (!stillThere) setSize(null)
  }

  // The selected variant lives in the URL, so a shared link, an ad or a
  // back button all land on the exact colour and size that was chosen. In the
  // editor there is no product route to sync with, so this stays off.
  useEffect(() => {
    if (preview || !variant) return
    const next = new URLSearchParams(params)
    if (next.get('variant') === variant.id) return
    next.set('variant', variant.id)
    setParams(next, { replace: true })
  }, [preview, variant, params, setParams])

  // Restore from the URL on first load.
  useEffect(() => {
    if (preview || !product || color || size) return
    const wanted = params.get('variant')
    const found = product.variants.find((v) => v.id === wanted)
    if (found) {
      setColor(found.options.Color)
      setSize(found.options.Size)
    }
  }, [preview, product, params, color, size])

  /**
   * The gallery is scoped to the chosen colour.
   *
   * Showing every shot of every colourway under a pink jacket is noise — the
   * thumbnails stop being a way to see this product and become a contact sheet
   * of the whole range. Images tagged with the active colour, plus any untagged
   * ones (packshots, fabric details, the size guide) which belong to all of
   * them. A store that tags nothing sees exactly what it saw before.
   */
  const gallery = useMemo(() => {
    if (!product?.images?.length) return []
    const tagged = product.images.filter((img) => img.color === activeColor)
    const shared = product.images.filter((img) => !img.color)
    const scoped = [...tagged, ...shared]
    return scoped.length ? scoped : product.images
  }, [product, activeColor])

  // Changing colour resets to that colour's first shot rather than leaving the
  // index pointing at whatever happened to be in that slot before.
  useEffect(() => {
    setShot(0)
  }, [activeColor])

  useEffect(() => {
    if (!variant?.imageId) return
    const i = gallery.findIndex((img) => img.id === variant.imageId)
    if (i >= 0) setShot(i)
  }, [variant, gallery])

  useEffect(() => {
    if (!sheetOpen) return undefined
    const onKey = (e) => e.key === 'Escape' && setSheetOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen])

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
  const lowStock = variant && variant.inventory > 0 && variant.inventory <= 3

  return (
    <>
      {/*
        Two unequal columns, not two halves.
        A 50/50 split gives the buy box a 600px measure — twice the comfortable
        reading width — so every line of trust copy runs the full track and the
        page reads as two walls of content. Every apparel storefront worth
        copying pins the right column at 24–28rem and gives the rest to the
        image. `min-w-0` on both is load-bearing: a grid item defaults to
        min-width:auto, so one long unbreakable string pushes the track wider
        than its share and the column overflows the page.
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
            is the one you have to scroll for. Beside it, both stay in view and
            the image can be as tall as the screen allows.
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
                      aria-label={`View image ${i + 1} of ${gallery.length}`}
                      aria-current={i === shot}
                      className={`shot w-full rounded-xs ring-1 transition-shadow ${
                        i === shot ? 'ring-ink' : 'ring-line hover:ring-muted'
                      }`}
                    >
                      <Media src={img.url} type={img.type} alt="" loading="lazy" sizes={SIZES.thumb} className="h-full w-full object-cover" />
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
                it.
                Sizing the image itself meant any surplus became page background
                beside it — a gap. Sizing the panel means the surplus is inside
                the frame, so a short viewport crops a few pixels off a
                full-bleed shot instead of leaving a hole in the layout.

                4:5 rather than square, deliberately. Square is right for shoes,
                which are wider than they are tall; on a garment it takes the
                head and the hem. 4:5 is what Zara, COS, Uniqlo and Everlane all
                shoot to, and every image in this theme is produced at 900×1125.
              */}
              {/*
                The frame is a button on a photograph and a plain box on a
                video. Tapping a product photo to see it bigger is the
                most-tried gesture on a page like this and until now it did
                nothing — but a `<video controls>` inside a `<button>` is
                invalid markup and, worse, a scrub bar that cannot be scrubbed.
              */}
              <Frame
                zoomable={gallery[shot]?.type !== 'video'}
                onZoom={() => setZoomOpen(true)}
                label={`View ${product.title} full screen`}
              >
                {/* A short viewport crops the panel. Biasing the crop above
                    centre keeps the collar and the face; a centred crop takes
                    from both ends and a garment loses the half that identifies
                    it. Costs nothing on a screen tall enough not to crop. */}
                <Media
                  src={gallery[shot]?.url}
                  type={gallery[shot]?.type}
                  alt={gallery[shot]?.alt}
                  width={gallery[shot]?.width}
                  height={gallery[shot]?.height}
                  controls={gallery[shot]?.type === 'video'}
                  fetchPriority="high"
                  decoding="async"
                  sizes={SIZES.hero}
                  className="h-full w-full object-cover"
                  style={{ objectPosition: '50% 38%' }}
                />

                {/* Only over the first shot — the rest are detail crops, and
                    the crop is the answer somebody opened them for. */}
                {shot === 0 && <ImageSpecs enrichment={product.enrichment} />}

                {gallery[shot]?.type !== 'video' && (
                  <span
                    aria-hidden="true"
                    className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-page/80 text-ink backdrop-blur-sm"
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

          {/* A lede, not the whole description. The rest lives in Details,
              where someone who wants it will look for it. */}
          <p className="mt-5 text-[15px] leading-relaxed text-muted">{product.description}</p>

          <ProductHighlights enrichment={product.enrichment} />

          {/*
            Straight after the highlights, and above the picker.

            This sat under the buy button, which put the whole reason a shopper
            trusts the piece — what it is made of, how it is finished, who wove
            it — a screen and a half below where they start reading. Detail that
            arrives after the decision is detail that did not help make it.

            The cost is that "Add to bag" moves down, and that is the right
            trade here: the sticky bar already covers it, and the observer that
            drives it fires on "not visible" rather than "was visible and left",
            so a button below the fold on arrival means the bar is there from
            the first paint. There is never a moment with no way to buy.

            Tab order is the order the questions arrive: what is it made of,
            what are the numbers, what is different about it, how is it built,
            who made it.
          */}
          <DetailTabs
            tabs={[
              {
                id: 'fabric',
                label: 'Fabric & care',
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
                label: 'Specifications',
                when: Object.keys(product.enrichment?.specs || {}).length > 0,
                render: () => <SpecCarousel specs={product.enrichment.specs} />,
              },
              {
                id: 'features',
                label: 'Features',
                when: product.enrichment?.features?.length > 0,
                render: () => <FeatureCarousel items={product.enrichment.features} />,
              },
              {
                id: 'details',
                label: 'Construction',
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
                label: 'Manufacturer info',
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


          {/* colour */}
          <fieldset className="mt-8">
            <legend className="text-[13px] font-medium">
              Colour: <span className="text-muted">{activeColor}</span>
            </legend>
            <ColorSwatches
              colors={colors}
              active={activeColor}
              swatches={product.swatches}
              soldOut={colorSoldOut}
              onPick={pickColor}
            />
          </fieldset>

          {/* size */}
          <fieldset className="mt-8">
            <div className="flex items-baseline justify-between">
              <legend className="text-[13px] font-medium">Size</legend>
              {product.sizeChart ? (
                <button type="button" onClick={() => (onOpenChart ? onOpenChart() : setChartOpen(true))} className="text-[12px] text-accent link-underline">
                  Size chart
                </button>
              ) : (
                <Link to="/pages/size-guide" className="text-[12px] text-muted link-underline">Size guide</Link>
              )}
            </div>
            <SizeChips
              sizes={sizes}
              size={size}
              sizeState={sizeState}
              activeColor={activeColor}
              onPick={setSize}
            />
            {size && lowStock && (
              <p className="mt-3 text-[13px] text-sale">Only {variant.inventory} left in {activeColor}, size {size}.</p>
            )}
            {sizes.some((s) => sizeState[s]?.state === 'absent') && (
              <p className="mt-3 text-[12px] text-faint">
                Dashed sizes are not made in {activeColor}.
              </p>
            )}
          </fieldset>

          {/* add */}
          {/*
            One row on a wide column, two on a narrow one — and the wrap is
            explicit rather than whatever `flex-wrap` happens to do.

            Left to itself it wrapped the *heart* onto the second line on its
            own, which reads as a stray button rather than a save control. The
            grid puts quantity and heart side by side and gives the whole width
            to the thing the shopper came to press.
          */}
          <div
            ref={buyRef}
            className="mt-8 grid grid-cols-[auto_1fr] items-center gap-3 sm:grid-cols-[auto_1fr_auto]"
          >
            <QuantityStepper value={qty} onChange={setQty} max={variant?.inventory || 10} />
            <Button
              size="lg"
              className="order-last col-span-2 w-full sm:order-none sm:col-span-1"
              disabled={preview || !variant || busy}
              onClick={() => !preview && add(variant.id, qty, `${product.title} added to your bag`)}
            >
              {!size ? 'Select a size' : !variant?.available ? 'Out of stock' : busy ? 'Adding…' : 'Add to bag'}
            </Button>
            {config.features?.wishlist !== false && (
            <Button
              variant="quiet"
              size="lg"
              square
              aria-pressed={saved}
              aria-label={saved ? 'Remove from saved' : 'Save for later'}
              onClick={() => !preview && toggle(product.slug, product.title)}
              className="justify-self-end sm:justify-self-auto"
            >
              <Icon name="heart" size={19} filled={saved} className={saved ? 'text-sale' : ''} />
            </Button>
            )}
          </div>

          <TrustRow flat />
          {config.trust?.showSocialProof !== false && <SocialProof product={product} />}

          {/* Store-wide promises above (TrustRow), per-product ones here. The
              split matters: shipping and returns are the same on everything, so
              they belong to the store; a repair guarantee on a coat and not on
              a t-shirt belongs to the product. */}
          <ProductAssurances product={product} />

          {/*
            Fit stays an accordion and stays open: it is the field that decides
            whether an apparel order gets kept, and it carries a size chart and
            a distribution rather than a paragraph.
          */}
          <div className="mt-8 border-t border-line">
            <Accordion title="Fit & sizing" defaultOpen>
              <FitBlock
                product={product}
                flat
                onOpenChart={() => (onOpenChart ? onOpenChart() : setChartOpen(true))}
              />
            </Accordion>

            <Accordion title="Delivery & returns">
              {/* Copy from settings, numbers from the commerce config. Three
                  paragraphs used to be hardcoded here, so a store could change
                  its returns window in one place and go on promising something
                  else four lines below it. */}
              <div className="space-y-3 text-[14px] leading-relaxed text-muted">
                {deliveryPolicy.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </Accordion>
          </div>

          {/* Last, not fourth. "Secure checkout" answers a question a shopper
              has once they have decided, so it closes the column rather than
              interrupting the part where they are still deciding. */}
          <PaymentsRow />
        </div>
      </div>

      {/* Sticky buy bar. Appears only once the real one has scrolled away, so
          it never competes with itself, and it repeats the selection so the bar
          is never ambiguous about what it is about to add. Never in a preview:
          a fixed bar inside a dialog is a bar stuck to the browser window. */}
      {!preview && (
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-page/95 backdrop-blur transition-transform duration-300 ${
          showSticky ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="wrap wrap-tight flex items-center gap-3 py-3">
          <div className="hidden w-12 shrink-0 sm:block">
            <div className="shot rounded-xs">
              <Media src={product.images[shot]?.url} type={product.images[shot]?.type} alt="" loading="lazy" sizes={SIZES.thumb} className="h-full w-full object-cover" />
            </div>
          </div>
          {/*
            The selection is a button, not a caption.

            On a phone the picker is most of a screen above this bar, so the
            only way to change colour or size was to scroll back up, change it,
            and scroll down again — twice, if you were comparing two colours.
            Tapping the selection opens the same choices in a sheet over the
            page, which is what every apparel app does and for this reason.
          */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate text-[13px] font-medium">{product.title}</p>
            <p className="flex items-center gap-1 truncate text-[12px] text-faint">
              <span className="truncate">
                {activeColor}
                {size ? ` · ${size}` : ' · select a size'}
              </span>
              <Icon name="chevron-down" size={12} className="shrink-0 rotate-180" />
            </p>
          </button>
          <Price price={shown.price} to={shown.to} compareAt={shown.compareAt} size="sm" className="hidden shrink-0 sm:inline-flex" />
          <Button
            size="md"
            className="shrink-0"
            disabled={!variant || busy}
            onClick={() =>
              variant
                ? add(variant.id, qty, `${product.title} added to your bag`)
                : setSheetOpen(true)
            }
          >
            {!size ? 'Choose size' : !variant?.available ? 'Out of stock' : 'Add to bag'}
          </Button>
        </div>
      </div>
      )}

      {!preview && zoomOpen && (
        <Lightbox images={gallery} index={shot} onIndex={setShot} onClose={() => setZoomOpen(false)} />
      )}

      {!preview && sheetOpen && (
        <VariantSheet
          product={product}
          colors={colors}
          sizes={sizes}
          activeColor={activeColor}
          size={size}
          sizeState={sizeState}
          colorSoldOut={colorSoldOut}
          variant={variant}
          shown={shown}
          busy={busy}
          onColor={pickColor}
          onSize={setSize}
          onClose={() => setSheetOpen(false)}
          onAdd={() => {
            add(variant.id, qty, `${product.title} added to your bag`)
            setSheetOpen(false)
          }}
          onOpenChart={() => {
            setSheetOpen(false)
            if (onOpenChart) onOpenChart()
            else setChartOpen(true)
          }}
        />
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

/* ── pickers ───────────────────────────────────────────────────────────── */

/**
 * Shared by the buy box and the sheet the sticky bar opens.
 *
 * Extracted the moment there were two places to choose a colour. A second copy
 * of a variant picker is how "sold out" ends up struck through in one place and
 * greyed in the other, and how one of them quietly stops handling the sparse
 * matrix at all.
 */
function ColorSwatches({ colors, active, swatches, soldOut, onPick }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2.5">
      {colors.map((c) => {
        const out = soldOut[c]
        return (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            aria-pressed={c === active}
            title={out ? `${c} — sold out` : c}
            className={`relative grid h-11 w-11 place-items-center rounded-full ring-1 ring-inset transition-shadow ${
              c === active ? 'ring-2 ring-ink ring-offset-2 ring-offset-page' : 'ring-ink/15 hover:ring-muted'
            } ${out ? 'opacity-45' : ''}`}
            style={{ background: swatches?.[c] || '#ddd' }}
          >
            <span className="sr-only">
              {c}
              {out ? ' (sold out)' : ''}
            </span>
            {out && <span aria-hidden="true" className="absolute h-[1.5px] w-8 -rotate-45 bg-ink/60" />}
          </button>
        )
      })}
    </div>
  )
}

/** Three states, not two — see the comment on the strike below. */
function SizeChips({ sizes, size, sizeState, activeColor, onPick }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {sizes.map((s) => {
        const { state } = sizeState[s] || { state: 'absent' }
        const unavailable = state !== 'available'
        return (
          <button
            key={s}
            type="button"
            disabled={unavailable}
            onClick={() => onPick(s)}
            aria-pressed={s === size}
            title={
              state === 'sold-out'
                ? `${s} is sold out in ${activeColor}`
                : state === 'absent'
                  ? `${s} is not made in ${activeColor}`
                  : undefined
            }
            className={`relative h-12 min-w-[3.5rem] rounded-xs border px-3.5 text-sm transition-colors ${
              state === 'absent'
                ? 'cursor-not-allowed border-dashed border-line text-faint/60'
                : state === 'sold-out'
                  ? 'cursor-not-allowed border-line text-faint'
                  : s === size
                    ? 'border-ink bg-ink text-page'
                    : 'border-line text-ink hover:border-ink'
            }`}
          >
            {s}
            <span className="sr-only">
              {state === 'sold-out' ? ' — sold out' : state === 'absent' ? ' — not available in this colour' : ''}
            </span>
            {/* A struck-through size reads as "gone"; a dashed outline reads as
                "not offered". Only the first gets the line. */}
            {state === 'sold-out' && (
              <span aria-hidden="true" className="absolute inset-x-2 top-1/2 h-px -rotate-[18deg] bg-line" />
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The picker, over the page, reachable from the sticky bar.
 *
 * The problem it solves is specific to phones: the buy box is one column, so by
 * the time a shopper has read the detail the colour swatches are most of a
 * screen above them. Comparing two colourways meant scrolling up, tapping,
 * scrolling back down — twice — and the second comparison is the one nobody
 * makes.
 *
 * A sheet rather than a modal because it is anchored to the bar that opened it,
 * and it stops short of full height so the photograph stays visible behind it —
 * which is the whole point when the thing being changed is the colour.
 */
function VariantSheet({
  product, colors, sizes, activeColor, size, sizeState, colorSoldOut,
  variant, shown, busy, onColor, onSize, onClose, onAdd, onOpenChart,
}) {
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Choose colour and size">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />

      <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-lg border-t border-line bg-page">
        {/* A grab handle is the only affordance that says "this came from the
            bottom and goes back there" without any words. */}
        <div className="sticky top-0 flex justify-center bg-page pb-1 pt-2.5">
          <span aria-hidden="true" className="h-1 w-9 rounded-full bg-line" />
        </div>

        <div className="px-5 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium">{product.title}</p>
              <Price price={shown.price} to={shown.to} compareAt={shown.compareAt} size="sm" className="mt-1 flex-wrap" />
            </div>
            <Button variant="quiet" size="sm" square aria-label="Close" onClick={onClose}>
              <Icon name="close" size={16} />
            </Button>
          </div>

          <fieldset className="mt-5">
            <legend className="text-[13px] font-medium">
              Colour: <span className="text-muted">{activeColor}</span>
            </legend>
            <ColorSwatches
              colors={colors}
              active={activeColor}
              swatches={product.swatches}
              soldOut={colorSoldOut}
              onPick={onColor}
            />
          </fieldset>

          <fieldset className="mt-6">
            <div className="flex items-baseline justify-between">
              <legend className="text-[13px] font-medium">Size</legend>
              <button type="button" onClick={onOpenChart} className="link-underline text-[12px] text-accent">
                Size chart
              </button>
            </div>
            <SizeChips
              sizes={sizes}
              size={size}
              sizeState={sizeState}
              activeColor={activeColor}
              onPick={onSize}
            />
          </fieldset>

          <Button
            size="lg"
            full
            className="mt-6"
            disabled={!variant || !variant.available || busy}
            onClick={onAdd}
          >
            {!size ? 'Select a size' : !variant?.available ? 'Out of stock' : busy ? 'Adding…' : 'Add to bag'}
          </Button>
        </div>
      </div>
    </div>
  )
}
