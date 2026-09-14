/**
 * The store's look from Odoo (`storefront.theme`), applied as the CSS custom
 * properties every component already reads (src/index.css). Tokens the store
 * does not set are derived from the ones it does, so a merchant picks seven
 * colours, not fifteen.
 */
const HEX = /^#?([0-9a-f]{6})$/i
const PRELOADED = new Set(['Inter', 'Fraunces']) // index.html loads these already
const FALLBACK = { body: 'ui-sans-serif, system-ui, sans-serif', heading: 'ui-serif, Georgia, serif' }

const rgb = (value) => {
  const m = HEX.exec(value || '')
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t))
const tri = (c) => c.join(' ')

const channel = (v) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
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
const family = (name, fallback) => (!name || name === 'system' ? fallback : `"${name}", ${fallback}`)

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

/** A Google Fonts stylesheet for the theme's fonts the page does not load already. */
export function fontsHref(theme) {
  const names = [...new Set([theme?.fonts?.heading, theme?.fonts?.body])].filter(
    (n) => n && n !== 'system' && !PRELOADED.has(n) && /^[A-Za-z0-9 ]+$/.test(n),
  )
  if (!names.length) return null
  return `https://fonts.googleapis.com/css2?${names.map((n) => `family=${n.replace(/ /g, '+')}:wght@400;500;600`).join('&')}&display=swap`
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
  const href = fontsHref(theme)
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
    })
  }
}
