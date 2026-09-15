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
