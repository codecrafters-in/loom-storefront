/**
 * The store's look from Odoo (`storefront.theme`), applied as the CSS custom
 * properties every component already reads (src/index.css). Tokens the store
 * does not set are derived from the ones it does, so a merchant picks seven
 * colours, not fifteen.
 */
import { hexRgb as rgb, isDarkTheme, luminance } from './colour.js'

const PRELOADED = new Set(['Inter', 'Fraunces']) // index.html loads these already
const SYSTEM = 'ui-sans-serif, system-ui, sans-serif'
const FALLBACK = { body: SYSTEM, heading: 'ui-serif, Georgia, serif' }

const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t))
const tri = (c) => c.join(' ')

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
 * A font stack. `system` is the device's own sans-serif for headings too: the heading fallback is a serif, so a
 * merchant who picked "System font" for headings got Georgia.
 */
const family = (name, fallback) => (!name ? fallback : name === 'system' ? SYSTEM : `"${name}", ${fallback}`)

/** `{ '--page': 'R G B', … }`, or null when the theme has no usable colours. */
export function themeVars(theme) {
  const c = Object.fromEntries(Object.entries(theme?.colors || {}).map(([k, v]) => [k, rgb(v)]))
  if (!c.page || !c.ink) return null
  const surface = c.surface || c.page
  const sunken = mix(c.page, c.ink, 0.05)
  // Secondary and faint text sit on the page and on the sunken footer and panels; both stay readable.
  const muted = readable(c.muted || mix(c.ink, c.page, 0.4), sunken, c.ink)
  const faint = readable(mix(muted, c.page, 0.1), sunken, c.ink)
  const accent = c.accent || c.ink
  const vars = {
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
    '--font-body': family(theme.fonts?.body, FALLBACK.body),
    '--font-display': family(theme.fonts?.heading, FALLBACK.heading),
  }
  if (Number.isFinite(theme.radius)) vars['--radius'] = `${theme.radius}px`
  return vars
}

export function themeCss(theme) {
  const vars = themeVars(theme)
  return vars ? `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}` : ''
}

/** A Google Fonts stylesheet for the theme's fonts the page does not load already (`preloaded`). */
export function fontsHref(theme, preloaded = PRELOADED) {
  const names = [...new Set([theme?.fonts?.heading, theme?.fonts?.body])].filter(
    (n) => n && n !== 'system' && !preloaded.has(n) && /^[A-Za-z0-9 ]+$/.test(n),
  )
  if (!names.length) return null
  return `https://fonts.googleapis.com/css2?${names.map((n) => `family=${n.replace(/ /g, '+')}:wght@400;500;600`).join('&')}&display=swap`
}

// The families index.html's stylesheet (`id="loom-fonts"`) asks for; the monospace one is used by every theme.
const BASE_FAMILIES = {
  Fraunces: 'family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600',
  Inter: 'family=Inter:wght@400;500;600',
}
const MONO_FAMILY = 'family=JetBrains+Mono:wght@400;500'

/**
 * The page's base font stylesheet for this theme, keeping Fraunces and Inter only while the theme uses them, or null
 * to keep index.html's as it is (no theme colours, so the default fonts apply; or both fonts in use).
 *
 * index.html asks for both on every page, so a store in two other fonts downloaded font files it never showed. The
 * server-rendered head writes this in place of the template's link, with the same id, so the browser (`applyTheme`)
 * can see which families the page really has.
 */
export function baseFontsHref(theme) {
  const vars = themeVars(theme)
  if (!vars) return null
  const stacks = [vars['--font-body'], vars['--font-display']]
  const used = Object.keys(BASE_FAMILIES).filter((name) => stacks.some((stack) => stack.includes(`"${name}"`)))
  if (used.length === Object.keys(BASE_FAMILIES).length) return null
  return `https://fonts.googleapis.com/css2?${[...used.map((name) => BASE_FAMILIES[name]), MONO_FAMILY].join('&')}&display=swap`
}

/** The theme's page colour as `#RRGGBB`, for the browser's colour bar; null without one. */
export function themeColour(theme) {
  const page = rgb(theme?.colors?.page)
  return page ? `#${page.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}` : null
}

const escapeAttr = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** An address a `<link>` may point at: http(s), or a path on the site itself. */
const linkUrl = (value) => (typeof value === 'string' && /^(?:https?:\/\/|\/(?!\/))/i.test(value.trim()) ? value.trim() : '')

/**
 * The store's icon and browser colours for the server-rendered head, as HTML ('' when the theme has neither).
 *
 * Both were set only by JavaScript after the page loaded, so link previews, bookmarks and the first moments of every
 * visit showed the template's icon. Odoo sends the favicon as a PNG, so it goes out as `image/png` with no `sizes`
 * (the template's SVG type and 32 px size describe other files), and the home-screen icon is the same image. The
 * colour bar follows the page colour, and a dark page says `color-scheme: dark` so scrollbars and form controls
 * match it. The render handler drops the template's own tags when these are present.
 */
export function themeHead(theme) {
  const tags = []
  const icon = linkUrl(theme?.faviconUrl)
  if (icon) tags.push(`<link rel="icon" href="${escapeAttr(icon)}" type="image/png">`, `<link rel="apple-touch-icon" href="${escapeAttr(icon)}">`)
  const colour = themeColour(theme)
  if (colour) tags.push(`<meta name="theme-color" content="${colour}">`, `<meta name="color-scheme" content="${isDarkTheme(theme) ? 'dark' : 'light'}">`)
  return tags.join('')
}

export function applyTheme(theme) {
  if (typeof document === 'undefined' || !theme) return
  const css = themeCss(theme)
  let style = document.getElementById('loom-theme')
  if (css) {
    if (!style) {
      style = document.createElement('style')
      style.id = 'loom-theme'
      document.head.appendChild(style)
    }
    if (style.textContent !== css) style.textContent = css
  }
  // What the base stylesheet really loads: a server-rendered page leaves Fraunces and Inter out when the theme has neither.
  const base = document.getElementById('loom-fonts')?.getAttribute('href')
  const preloaded = base ? new Set([...PRELOADED].filter((name) => base.includes(`family=${name}`))) : PRELOADED
  const href = fontsHref(theme, preloaded)
  if (href && ![...document.querySelectorAll('link[data-loom-fonts]')].some((l) => l.href === href)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.loomFonts = '1'
    document.head.appendChild(link)
  }
  if (theme.faviconUrl) {
    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((l) => {
      if (l.getAttribute('href') !== theme.faviconUrl) l.setAttribute('href', theme.faviconUrl)
      // The store's icon is a PNG: the template's SVG type and 32 px size would describe the wrong file.
      if (l.getAttribute('rel') === 'icon') {
        l.setAttribute('type', 'image/png')
        l.removeAttribute('sizes')
      }
    })
  }
  const colour = themeColour(theme)
  if (colour) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute('content', colour)
      m.removeAttribute('media')
    })
  }
}
