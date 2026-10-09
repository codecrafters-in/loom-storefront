/**
 * The store's layout style (`storefront.theme.style`): how the header, product cards, buttons, spacing, headings and
 * footer are drawn. Each part's first choice is the theme's own layout, so a backend that sends no style, or one this
 * build does not know, changes nothing.
 */
import { hexRgb, luminance as rgbLuminance, paletteVars } from './colour.js'

export const STYLE_CHOICES = {
  header: ['classic', 'centered', 'minimal', 'bold'],
  card: ['portrait', 'square', 'framed', 'overlay'],
  buttons: ['solid', 'pill', 'outline'],
  spacing: ['balanced', 'airy', 'compact'],
  headings: ['normal', 'uppercase'],
  footer: ['light', 'dark', 'accent'],
}

/** `{header, card, buttons, spacing, headings, footer}`, each a known choice. */
export function themeStyle(theme) {
  const given = theme?.style || {}
  return Object.fromEntries(Object.entries(STYLE_CHOICES).map(([part, choices]) => [part, choices.includes(given[part]) ? given[part] : choices[0]]))
}

/** The attributes the layout's root carries, which src/index.css reads for buttons, spacing and headings. */
export function styleAttributes(theme) {
  const style = themeStyle(theme)
  return { 'data-buttons': style.buttons, 'data-spacing': style.spacing, 'data-headings': style.headings, 'data-card': style.card }
}

// The storefront's shipped palette (src/index.css), for a store without a theme.
const SHIPPED = { page: '#FAF8F5', surface: '#FFFFFF', ink: '#1A1815', muted: '#6B645A', accent: '#7C4A2D', accentInk: '#FFFFFF', sale: '#A3341F' }

const luminance = (hex) => rgbLuminance(hexRgb(hex))

/** The colour an area is painted in for `tone` ('accent', 'dark'), or null for the page's own: where a logo sits. */
export function toneGround(theme, tone) {
  const c = { ...SHIPPED, ...(theme?.colors || {}) }
  if (tone === 'accent') return c.accent
  if (tone === 'dark') return luminance(c.ink) <= luminance(c.page) ? c.ink : c.page
  return null
}

/**
 * CSS custom properties that repaint one area (the bold header, a dark or accent footer) in other colours. Every token
 * inside it — text, secondary text, lines, fields, buttons, badges — is worked out again for the new ground by
 * themeVars, so what sits there stays readable without its own styles. `null` for the theme's own colours.
 */
export function toneVars(theme, tone) {
  const c = { ...SHIPPED, ...(theme?.colors || {}) }
  let colors
  if (tone === 'accent') {
    colors = { page: c.accent, surface: c.accent, ink: c.accentInk, muted: c.accentInk, accent: c.accentInk, accentInk: c.accent, sale: c.accentInk }
  } else if (tone === 'dark') {
    const [dark, light] = luminance(c.ink) <= luminance(c.page) ? [c.ink, c.page] : [c.page, c.ink]
    // The store's accent is not known to read on this ground, so buttons and links there use the light colour.
    colors = { page: dark, surface: dark, ink: light, muted: light, accent: light, accentInk: dark, sale: light }
  } else {
    return null
  }
  const vars = paletteVars(colors)
  if (!vars) return null
  vars.color = `rgb(${vars['--ink']})`
  vars.background = `rgb(${vars['--page']})`
  return vars
}
