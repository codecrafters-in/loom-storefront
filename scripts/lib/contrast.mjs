/**
 * WCAG contrast, without a browser.
 *
 * Split from the runner for the same reason `check-docs.mjs` lifts its parser
 * out of the component it checks: these are pure functions and can be tested,
 * while the runner does file IO and exit codes and cannot.
 */

/** `--name: R G B;` out of a CSS custom-property block. */
export function parseTokens(css) {
  const start = css.indexOf(':root')
  if (start < 0) return {}
  const block = css.slice(start, css.indexOf('}', start))
  const tokens = {}
  for (const m of block.matchAll(/--([\w-]+):\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*;/g)) {
    tokens[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
  }
  return tokens
}

/** WCAG 2.x relative luminance. */
export function luminance([r, g, b]) {
  const channel = (value) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function ratio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/**
 * Flatten a translucent colour onto what is behind it.
 *
 * Without this an overlay reads as a false pass: `text-page` on `bg-ink/35` is
 * measured against solid ink and looks fine, when what a shopper actually sees
 * is white text on 35% ink over a near-white page.
 */
export function composite(foreground, background, alpha = 1) {
  if (alpha >= 1) return foreground
  return foreground.map((c, i) => Math.round(c * alpha + background[i] * (1 - alpha)))
}

/** `text-faint/60` → `{ token: 'faint', alpha: 0.6 }`. */
export function parseUtility(className) {
  const m = /^(?:text|bg)-([a-z][a-z0-9-]*?)(?:\/(\d{1,3}))?$/.exec(className)
  if (!m) return null
  return { token: m[1], alpha: m[2] === undefined ? 1 : Number(m[2]) / 100 }
}
