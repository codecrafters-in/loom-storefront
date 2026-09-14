import manifest from '../data/responsive.js'

/**
 * Which narrower copies exist for a bundled photograph.
 *
 * Driven by a manifest rather than by guessing at filenames. A `srcset`
 * pointing at a file that is not there is worse than no `srcset` at all: the
 * browser picks the candidate it wants, gets a 404, and shows a broken image
 * where the product used to be. Only sources `scripts/responsive.mjs` actually
 * wrote are listed, so anything it did not touch — an uploaded file, a remote
 * CDN URL, an SVG — falls back to a plain `<img>` untouched.
 */
export function responsive(src) {
  const widths = manifest[src]
  if (!widths?.length) return null

  const base = src.replace(/\.jpg$/, '')
  return {
    type: 'image/webp',
    srcSet: widths.map((w) => `${base}-${w}.webp ${w}w`).join(', '),
  }
}

/**
 * How wide the image will actually be, per breakpoint.
 *
 * `sizes` is the half everyone forgets, and without it `srcset` does nothing
 * useful: the browser assumes the image fills the viewport and picks the
 * largest candidate every time. These are measured against the real layout —
 * `.wrap` is 1440 with a 1320 inner, the product grid is 2/3/4 up, and the
 * product page is a `[1fr 30rem]` split.
 */
export const SIZES = {
  /** A card in the shop grid: two up on a phone, four up on a wide screen. */
  card: '(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 45vw',
  /** The main product photograph, beside a 30rem buy column. */
  hero: '(min-width: 1024px) 46vw, 100vw',
  /** Category and collection tiles, three up. */
  tile: '(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw',
  /** Gallery thumbnails and cart lines — small and fixed. */
  thumb: '96px',
  /** Full-bleed editorial bands. */
  full: '100vw',
}

/* ── images from the backend ─────────────────────────────────────────────── */

let imageTemplate = ''

/** The store's image CDN (`storefront.media.imageUrlTemplate`), set by the storefront provider before anything renders. */
export function setImageTemplate(value) {
  imageTemplate = typeof value === 'string' && value.startsWith('https://') && value.includes('{url}') ? value : ''
}

/** An image's address through the store's image CDN at `width`; unchanged without one, and for relative addresses. */
export function viaCdn(url, width) {
  if (!imageTemplate || !/^https?:\/\//.test(url || '')) return url
  return imageTemplate.replaceAll('{width}', String(width)).replaceAll('{url}', url)
}

/**
 * `srcset` for the sizes the backend keeps of an image (`[{width, url}]`, 256 to 1920 px), or null.
 *
 * A phone showing a two-up grid downloads the 512 px copy rather than the 1024 px one; `sizes` (from `SIZES`) is what
 * lets the browser choose.
 */
export function srcsetOf(sizes) {
  const usable = (Array.isArray(sizes) ? sizes : []).filter((size) => size?.url && Number(size.width) > 0)
  return usable.length ? usable.map((size) => `${viaCdn(size.url, size.width)} ${size.width}w`).join(', ') : null
}
