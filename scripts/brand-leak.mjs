/**
 * Fails a live-store build that still carries the demo's brand or copy.
 *
 *   node scripts/brand-leak.mjs      # after `vite build`, api mode only
 *
 * A merchant's shop must never say "LOOM", show a demo discount code or promise
 * a prepaid return label it does not offer. Everything a shopper reads on a
 * live store comes from its backend; this reads the shipped JavaScript and the
 * page template and names any demo string that is still in them. (Prerendered
 * pages are not scanned: their words are the store's own, from the API.)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

export const PATTERNS = [
  // "LOOM Storefront" is the backend module's own menu, named in admin help text.
  [/\bLOOM\b(?! Storefront)/, 'the demo brand name'],
  [/loom\.example/i, 'a demo email address'],
  [/codecrafters/i, 'the theme vendor'],
  [/considered clothing/i, 'the demo tagline'],
  [/made to be kept/i, 'the demo tagline'],
  [/demo store/i, 'demo store wording'],
  [/nothing here ships/i, 'demo store wording'],
  [/LM-\d{4,}/, 'a demo order number'],
  [/\b(LOOM10|WELCOME15|FREESHIP)\b/, 'a demo discount code'],
  [/prepaid (return )?label/i, 'a returns promise the store may not make'],
  [/tags attached|unworn/i, 'clothing returns wording'],
  [/open-source storefront theme/i, 'theme marketing copy'],
]

/** `[{ file, label, excerpt }]` for every demo string in `text`. */
export function findLeaks(text, file) {
  const found = []
  for (const [pattern, label] of PATTERNS) {
    const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
    for (const match of text.matchAll(global)) {
      const start = Math.max(0, match.index - 40)
      found.push({ file, label, excerpt: text.slice(start, match.index + match[0].length + 40).replace(/\s+/g, ' ') })
    }
  }
  return found
}

/**
 * The store's own settings end up in the bundle (the API address, the site address, a store name). They are the
 * merchant's words, not demo copy: an Odoo on `shop.codecrafters.in` must not read as the theme vendor's name.
 */
export function configuredValues(env) {
  const values = Object.entries(env)
    .filter(([key, value]) => (key.startsWith('VITE_') || key === 'SITE_URL') && typeof value === 'string' && value.length >= 4)
    .map(([, value]) => value)
  return [...new Set(values)].sort((a, b) => b.length - a.length)
}

/** `text` without the configured values, longest first, so a leak next to one is still found. */
export function withoutConfigured(text, values) {
  return values.reduce((out, value) => out.split(value).join(''), text)
}

/**
 * Whether a built asset is scanned. Developer documentation (`doc-*` chunks, see vite.config.js) is read by the
 * store's team at /admin/docs, never offered to shoppers, and describes the theme with its demo on purpose.
 */
export function scans(name) {
  return name.endsWith('.js') && !name.startsWith('doc-')
}

function main() {
  const env = loadEnv('production', ROOT, 'VITE_')
  if ((env.VITE_DATA_SOURCE || 'mock').toLowerCase() !== 'api') {
    console.log('[brand-leak] demo build: skipped')
    return
  }
  const files = [path.join(ROOT, 'index.html'), path.join(DIST, 'manifest.webmanifest')]
  const assets = path.join(DIST, 'assets')
  if (fs.existsSync(assets)) {
    for (const name of fs.readdirSync(assets)) if (scans(name)) files.push(path.join(assets, name))
  }
  const configured = configuredValues({ ...env, SITE_URL: process.env.SITE_URL })
  const leaks = files
    .filter((file) => fs.existsSync(file))
    .flatMap((file) => findLeaks(withoutConfigured(fs.readFileSync(file, 'utf8'), configured), path.relative(ROOT, file)))
  if (!leaks.length) {
    console.log(`[brand-leak] ${files.length} files, no demo brand or copy`)
    return
  }
  for (const leak of leaks) console.error(`[brand-leak] ${leak.file}: ${leak.label}: …${leak.excerpt}…`)
  console.error(`[brand-leak] ${leaks.length} demo strings in a live-store build`)
  process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main()
