import { isDarkTheme } from './colour.js'

/**
 * Which logo artwork to show, and how tall. Pure, so Logo.jsx stays a drawing and the choice is tested.
 */

/** The height when the store does not set `store.logo.height`. */
export const DEFAULT_LOGO_HEIGHT = 26

/**
 * The store's logo image: the version for dark backgrounds (`theme.logoDarkUrl`) on a dark theme, when the store
 * uploaded one. The header, the phone menu, the footer and the closed-store screen all sit on the page colour, so the
 * page colour decides. A dark logo on a dark page is invisible; without a dark version the usual one is still shown.
 */
export function logoImage(config) {
  const usual = config?.store?.logo?.imageUrl || null
  const dark = config?.theme?.logoDarkUrl || null
  return (dark && isDarkTheme(config?.theme)) ? dark : usual
}

/**
 * The logo's height from the store's own `store.logo.height`, scaled for where it sits.
 *
 * The footer shows it a little larger and the phone menu a little smaller than the header. Those were fixed 26 and
 * 20 px, so a store that set a tall logo got a small one in both; scaling keeps its proportions, and `max` keeps a
 * very tall logo inside the phone menu's bar. With the default height of 22 the sizes are the same as before.
 */
export function logoHeight(logo, { scale = 1, max = Infinity } = {}) {
  const own = Number(logo?.height)
  const base = Number.isFinite(own) && own > 0 ? own : DEFAULT_LOGO_HEIGHT
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1
  return Math.min(Math.round(base * factor), max)
}
