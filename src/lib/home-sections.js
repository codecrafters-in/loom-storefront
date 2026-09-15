/**
 * The newer home section types, as what each one can draw.
 *
 * The backend sends these as a merchant filled them in: a tile without its photo, a question without an answer, a
 * rating of 7. Each function here keeps what can be drawn and drops the rest, so a half-filled section shows its good
 * items, or nothing, instead of an empty card or a crash. Unknown fields are ignored. Pure, so the rules are tested
 * without a browser; src/components/home/sections-more.jsx draws the result.
 *
 * Tailwind only sees class names written out in full, hence the tables.
 */

import { perRow } from './rows.js'
import { paragraphs } from './page-blocks.js'

export { paragraphs }

const text = (value) => (typeof value === 'string' ? value.trim() : '')
const list = (value) => (Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [])
const whole = (count) => Math.max(0, Math.floor(Number(count) || 0))

/** `{url, alt, srcset?}` with an address, or null. */
export function imageOf(image) {
  const url = text(image?.url)
  if (!url) return null
  return { url, alt: text(image.alt), srcset: Array.isArray(image.srcset) ? image.srcset : undefined }
}

/** An address on another site (or a mail or phone link) opens as a plain link, not through the router. */
export const isExternal = (to) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(text(to))

const VARIANTS = ['accent', 'primary', 'outline', 'ghost', 'quiet']

/**
 * Buttons with a label and somewhere to go, `max` at most. Without a known variant the first is `accent` and the rest
 * `outline`: two accent buttons side by side ask the shopper to choose between equals.
 */
export function actionsOf(actions, max = 2) {
  return list(actions)
    .map((action) => ({ label: text(action.label), to: text(action.to), variant: VARIANTS.includes(action.variant) ? action.variant : '' }))
    .filter((action) => action.label && action.to)
    .slice(0, max)
    .map((action, index) => ({ ...action, variant: action.variant || (index === 0 ? 'accent' : 'outline') }))
}

/**
 * A button over a photograph or on a dark band.
 *
 * The variants are drawn for a light page: `primary` is dark on dark there and `ghost` has no edge at all. Solid ones
 * become the light `quiet` button, line ones a light outline. The outline's colours carry `!` because Tailwind emits
 * `hover:text-page` after `hover:text-ink`, so without it the label turns the colour of its background on hover.
 */
export function onDark(variant) {
  if (variant === 'accent') return { variant: 'accent', className: '' }
  if (variant === 'outline' || variant === 'ghost') {
    return { variant: 'outline', className: '!border-page !text-page hover:!bg-page hover:!text-ink' }
  }
  return { variant: 'quiet', className: '' }
}

/* ── image-tiles ───────────────────────────────────────────────────────── */

/** Tiles with a title, a photo and somewhere to go; four at most. */
export function tilesOf(items) {
  return list(items)
    .map((item) => ({ title: text(item.title), body: text(item.body), label: text(item.label), to: text(item.to), image: imageOf(item.image) }))
    .filter((item) => item.title && item.to && item.image)
    .slice(0, 4)
}

/**
 * Columns, photo shape and image `sizes` for 1 to 4 tiles, or null for none.
 *
 * As many columns as tiles on a computer. On a phone they stack, except four, which make two by two (`compact`: too
 * narrow for the tile's text, so only the title shows). The photo gets shorter as the tiles get wider, or two tiles on
 * a laptop would each be taller than the screen.
 */
const TILES = [
  null,
  { grid: 'grid-cols-1', shot: 'aspect-[4/3] md:aspect-[21/9]', sizes: '100vw', compact: false },
  { grid: 'grid-cols-1 sm:grid-cols-2', shot: 'aspect-[4/3] sm:aspect-[4/5] lg:aspect-[4/3]', sizes: '(min-width: 640px) 50vw, 100vw', compact: false },
  { grid: 'grid-cols-1 md:grid-cols-3', shot: 'aspect-[4/3] md:aspect-[3/4]', sizes: '(min-width: 768px) 33vw, 100vw', compact: false },
  { grid: 'grid-cols-2 lg:grid-cols-4', shot: 'aspect-[3/4]', sizes: '(min-width: 1024px) 25vw, 50vw', compact: true },
]

export function tilesLayout(count) {
  return TILES[Math.min(whole(count), 4)]
}

/* ── features ──────────────────────────────────────────────────────────── */

/** Features with a title; six at most. `body` is paragraphs; the icon name is checked where it is drawn. */
export function featuresOf(items) {
  return list(items)
    .map((item) => ({
      icon: text(item.icon),
      image: imageOf(item.image),
      title: text(item.title),
      body: paragraphs(item.body),
      label: text(item.label),
      to: text(item.to),
    }))
    .filter((item) => item.title)
    .slice(0, 6)
}

const FEATURES_TABLET = ['', 'sm:grid-cols-1', 'sm:grid-cols-2', 'sm:grid-cols-3']
const FEATURES_LAPTOP = ['', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4']

/** One per row on a phone, up to three on a tablet and four on a laptop, in even rows: four make two by two, then one row. */
export function featuresGrid(count) {
  const n = whole(count)
  if (!n) return ''
  return `${FEATURES_TABLET[perRow(n, 3)]} ${FEATURES_LAPTOP[perRow(n, 4)]}`
}

/* ── testimonials ──────────────────────────────────────────────────────── */

/** Quotes with an author. A rating outside 1 to 5 shows no stars; a product link needs both its slug and its title. */
export function testimonialsOf(items) {
  return list(items)
    .map((item) => {
      const rating = Math.round(Number(item.rating))
      const slug = text(item.product?.slug)
      const title = text(item.product?.title)
      return {
        quote: paragraphs(item.quote),
        author: text(item.author),
        detail: text(item.detail),
        rating: rating >= 1 && rating <= 5 ? rating : null,
        image: imageOf(item.image),
        product: slug && title ? { slug, title } : null,
      }
    })
    .filter((item) => item.quote.length > 0 && item.author)
}

const TESTIMONIALS_LAPTOP = ['', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3']

/** Columns once the cards stop scrolling sideways: up to three, in even rows (four make two by two). */
export function testimonialsGrid(count) {
  const n = whole(count)
  return n ? TESTIMONIALS_LAPTOP[perRow(n, 3)] : ''
}

/* ── logo-bar ──────────────────────────────────────────────────────────── */

/** Logos with a name (or at least an image described by its alt text). */
export function logosOf(items) {
  return list(items)
    .map((item) => {
      const image = imageOf(item.image)
      return { name: text(item.name) || image?.alt || '', image, to: text(item.to) }
    })
    .filter((item) => item.name)
}

const LOGOS_TABLET = ['', 'md:basis-full', 'md:basis-1/2', 'md:basis-1/3', 'md:basis-1/4']
const LOGOS_LAPTOP = ['', 'lg:basis-full', 'lg:basis-1/2', 'lg:basis-1/3', 'lg:basis-1/4', 'lg:basis-1/5', 'lg:basis-1/6']

/** Each logo's share of a row once they wrap: up to four a row on a tablet and six on a laptop, in even rows. */
export function logoRow(count) {
  const n = whole(count)
  if (!n) return ''
  return `${LOGOS_TABLET[perRow(n, 4)]} ${LOGOS_LAPTOP[perRow(n, 6)]}`
}

/* ── faq ───────────────────────────────────────────────────────────────── */

/** Questions with an answer; the answer as paragraphs. */
export function faqOf(items) {
  return list(items)
    .map((item) => ({ question: text(item.question), answer: paragraphs(item.answer) }))
    .filter((item) => item.question && item.answer.length > 0)
}

/* ── featured-product ──────────────────────────────────────────────────── */

const money = (value) => (value && typeof value === 'object' && Number.isFinite(Number(value.amount)) ? value : null)

/**
 * The product a `featured-product` section shows, or null without a slug and a title. Its first photo (or the single
 * `image` of a summary), its brand as a name whether the backend sent a string or `{name}`, and prices only when they
 * are amounts.
 */
export function featuredProductOf(product) {
  const slug = text(product?.slug)
  const title = text(product?.title)
  if (!slug || !title) return null
  const price = money(product.price)
  return {
    slug,
    title,
    subtitle: text(product.subtitle),
    brand: typeof product.brand === 'string' ? text(product.brand) : text(product.brand?.name),
    price,
    compareAtPrice: price ? money(product.compareAtPrice) : null,
    image: list(product.images).map(imageOf).find(Boolean) || imageOf(product.image),
  }
}
