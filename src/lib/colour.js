/**
 * Colour arithmetic shared by the theme (src/lib/theme.js), the logo (src/lib/logo.js) and the server-rendered head.
 *
 * Its own small module because the logo is on every page, while theme.js is loaded only for a store with a theme.
 */
const HEX = /^#?([0-9a-f]{6})$/i

/** `'#1A1815'` → `[26, 24, 21]`, or null for anything that is not a six-digit hex colour. */
export const hexRgb = (value) => {
  const m = HEX.exec(typeof value === 'string' ? value : '')
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null
}

const channel = (v) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of `[r, g, b]`: 0 is black, 1 is white. */
export const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

/**
 * Below this a page colour counts as dark. Mid-greys around 0.2 already need light text and a light logo; a pale
 * beige page is about 0.9.
 */
export const DARK_BELOW = 0.35

/** Whether the theme's page colour is dark. False without a usable one: the default page is light. */
export function isDarkTheme(theme) {
  const page = hexRgb(theme?.colors?.page)
  return Boolean(page) && luminance(page) < DARK_BELOW
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t))
const tri = (c) => c.join(' ')

/** WCAG contrast ratio of two `[r, g, b]` colours. */
export const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** `fg`, moved towards `towards` just far enough to read at `min`:1 on `bg` (WCAG AA is 4.5). */
export function readable(fg, bg, towards, min = 4.6) {
  let colour = fg
  for (let step = 1; step <= 20 && contrast(colour, bg) < min; step += 1) colour = mix(fg, towards, step / 20)
  return colour
}

/**
 * The colour custom properties (`{ '--page': 'R G B', … }`) for seven hex colours, the in-between shades worked out
 * so text stays readable; null without a usable page and ink. Used for the whole theme (src/lib/theme.js) and for
 * one repainted area such as a bold header (src/lib/style.js), which is why it lives in this small module.
 */
export function paletteVars(colors) {
  const c = Object.fromEntries(Object.entries(colors || {}).map(([k, v]) => [k, hexRgb(v)]))
  if (!c.page || !c.ink) return null
  const surface = c.surface || c.page
  const sunken = mix(c.page, c.ink, 0.05)
  // Secondary and faint text sit on the page and on the sunken footer and panels; both stay readable.
  const muted = readable(c.muted || mix(c.ink, c.page, 0.4), sunken, c.ink)
  const faint = readable(mix(muted, c.page, 0.1), sunken, c.ink)
  const accent = c.accent || c.ink
  const inkIsDark = luminance(c.ink) <= luminance(c.page)
  return {
    '--page': tri(c.page),
    '--surface': tri(surface),
    '--raised': tri(surface),
    '--sunken': tri(sunken),
    '--ink': tri(c.ink),
    '--muted': tri(muted),
    '--faint': tri(faint),
    '--line': tri(mix(c.page, c.ink, 0.12)),
    '--accent': tri(accent),
    '--accent-ink': tri(c.accentInk || c.page),
    '--accent-soft': tri(mix(c.page, accent, 0.12)),
    '--sale': tri(c.sale || accent),
    '--shadow': tri(c.ink),
    // Photographs are darkened and their text is light in every theme: the darker of ink and page is the wash.
    '--scrim': tri(inkIsDark ? c.ink : c.page),
    '--on-scrim': tri(inkIsDark ? c.page : c.ink),
  }
}
