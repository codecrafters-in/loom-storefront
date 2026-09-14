/**
 * The Content-Security-Policy for one built HTML file.
 *
 * Pure, so the test can run it on a string. scripts/csp.mjs applies it to
 * everything in dist/.
 *
 * Why a <meta> and not a header: vercel.json and public/_headers are static
 * files, and the policy depends on the build — which API this bundle talks to,
 * and the hash of every inline script the prerenderer wrote. A meta tag written
 * next to those scripts cannot drift from them. The one directive a meta tag
 * cannot carry, `frame-ancestors`, is a real header in both files.
 */
import { createHash } from 'node:crypto'

/**
 * Third parties the theme itself uses. Add a domain here when you add a script,
 * an iframe or an API call to a new one — the browser console names the
 * directive that refused it.
 */
export const THIRD_PARTY = {
  // Razorpay Checkout, Stripe.js (its card form and 3-D Secure frames), Cloudflare Turnstile, Google reCAPTCHA (and its gstatic half). The captcha hosts are
  // narrowed to their captcha paths: www.google.com and www.gstatic.com serve other scripts too, some of them
  // known ways around a policy.
  script: ['https://checkout.razorpay.com', 'https://js.stripe.com', 'https://challenges.cloudflare.com/turnstile/', 'https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/',
    // Analytics and ad tags the merchant switches on in Odoo (src/lib/tags.js): Google, Meta, TikTok, Pinterest.
    'https://www.googletagmanager.com', 'https://connect.facebook.net', 'https://analytics.tiktok.com', 'https://s.pinimg.com'],
  connect: ['https://api.razorpay.com', 'https://lumberjack.razorpay.com', 'https://api.stripe.com',
    'https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com',
    'https://www.facebook.com', 'https://connect.facebook.net', 'https://analytics.tiktok.com', 'https://*.tiktokw.us', 'https://ct.pinterest.com'],
  // Product films play from the privacy-enhanced hosts only, and only after a press of play (Media.jsx).
  frame: ['https://api.razorpay.com', 'https://checkout.razorpay.com', 'https://js.stripe.com', 'https://hooks.stripe.com', 'https://challenges.cloudflare.com', 'https://www.google.com/recaptcha/', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com'],
  style: ['https://fonts.googleapis.com'],
  font: ['https://fonts.gstatic.com'],
}

export const META_NAME = 'Content-Security-Policy'

const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
/** Types a browser executes. JSON-LD and other data blocks are never run, so they need no hash. */
const EXECUTABLE = new Set(['', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript', 'module'])

function attribute(attrs, name) {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return match ? (match[1] ?? match[2] ?? match[3]) : null
}

/** `'sha256-…'` for every inline script the browser would execute, in document order, without repeats. */
export function inlineScriptHashes(html) {
  const hashes = new Set()
  for (const [, attrs, body] of html.matchAll(SCRIPT_TAG)) {
    if (attribute(attrs, 'src') !== null) continue
    const type = (attribute(attrs, 'type') || '').trim().toLowerCase()
    if (!EXECUTABLE.has(type)) continue
    // The browser hashes the text exactly as written between the tags.
    hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`)
  }
  return [...hashes]
}

/**
 * The API's origin when this build talks to one, else ''.
 *
 * Read from the same VITE_ variables the bundle was built with. A relative base
 * URL is the site's own origin, which `'self'` already covers.
 */
export function apiOriginFrom(env = {}) {
  if ((env.VITE_DATA_SOURCE || '').toLowerCase() !== 'api' || !env.VITE_API_BASE_URL) return ''
  try {
    return new URL(env.VITE_API_BASE_URL).origin
  } catch {
    return ''
  }
}

/**
 * The policy string.
 *
 * No `'unsafe-eval'`, and no `'unsafe-inline'` for scripts: an injected
 * `<script>` in a product description is exactly what this is here to stop.
 * Styles do allow inline — React writes `style` attributes, and a style
 * injection is a defacement, not a credential theft.
 *
 * Images and video allow any https origin because merchants host them on CDNs
 * the theme cannot know about, and the API origin is added so a store on plain
 * http (Odoo on localhost:8069) still shows its pictures.
 */
export function buildPolicy({ hashes = [], apiOrigin = '' } = {}) {
  const api = apiOrigin ? [apiOrigin] : []
  const directives = [
    ['default-src', "'self'"],
    ['base-uri', "'self'"],
    ['object-src', "'none'"],
    ['script-src', "'self'", ...hashes, ...THIRD_PARTY.script],
    ['connect-src', "'self'", ...api, ...THIRD_PARTY.connect],
    ['img-src', "'self'", 'data:', 'blob:', 'https:', ...api],
    ['media-src', "'self'", 'data:', 'blob:', 'https:', ...api],
    ['style-src', "'self'", "'unsafe-inline'", ...THIRD_PARTY.style],
    ['font-src', "'self'", 'data:', ...THIRD_PARTY.font],
    ['frame-src', ...THIRD_PARTY.frame],
    ['form-action', "'self'", ...api],
  ]
  return directives.map((d) => [...new Set(d)].join(' ')).join('; ')
}

const EXISTING = /\s*<meta http-equiv="Content-Security-Policy"[^>]*>/gi

/**
 * The HTML with its policy in the head. Running it twice gives the same file.
 *
 * The tag goes straight after the charset: a policy governs only what the
 * parser reaches after it, so it must come before the first script, and the
 * charset has to stay within the first kilobyte.
 */
export function applyCsp(html, { apiOrigin = '' } = {}) {
  const clean = html.replace(EXISTING, '')
  const policy = buildPolicy({ hashes: inlineScriptHashes(clean), apiOrigin })
  const tag = `<meta http-equiv="${META_NAME}" content="${policy}" />`

  const charset = clean.match(/<meta charset[^>]*>/i)
  if (charset) return clean.replace(charset[0], `${charset[0]}\n    ${tag}`)
  const head = clean.match(/<head[^>]*>/i)
  if (head) return clean.replace(head[0], `${head[0]}\n    ${tag}`)
  throw new Error('no <head> to put the Content-Security-Policy in')
}

/** Inline event handlers (`onclick="…"`) would need `'unsafe-hashes'`. The theme has none; say so if one appears. */
export const inlineHandlers = (html) => html.match(/<[a-z][^>]*\son[a-z]+\s*=\s*["'][^>]*>/gi) || []
