/**
 * Finds the storefront's translatable text and reports how much of it each catalog covers.
 *
 *   node scripts/i18n-extract.mjs            # writes src/i18n/source.json and prints coverage
 *   node scripts/i18n-extract.mjs --missing fr   # prints the English strings the French catalog lacks
 *
 * Text is English and is its own key (src/i18n/index.js): `t('Add to bag')`, `plural(n, '{count} item', '{count} items')`
 * and `mark('State')`. The storefront admin and the documentation pages stay in English and are not scanned.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')
const SKIP = [/\/pages\/admin\//, /\/components\/admin\//, /\/i18n\//, /\/data\//, /\/pages\/Docs\.jsx$/, /\/pages\/ApiExplorer\.jsx$/]

const QUOTED = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|\x60((?:[^\x60\\$]|\\.)*)\x60`
const SINGLE = new RegExp(String.raw`\b(?:t|mark)\(\s*(?:${QUOTED})`, 'g')
const PLURAL = new RegExp(String.raw`\bplural\(\s*[^,]+,\s*(?:${QUOTED})\s*,\s*(?:${QUOTED})`, 'g')
const unescape = (text) => text.replace(/\\(['"\x60\\])/g, '$1')

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return files(full)
    return /\.(jsx?|mjs)$/.test(entry.name) && !SKIP.some((re) => re.test(full)) ? [full] : []
  })
}

const strings = new Set()
const plurals = new Map()
for (const file of files(SRC)) {
  const source = fs.readFileSync(file, 'utf8')
  for (const m of source.matchAll(SINGLE)) {
    const text = m[1] ?? m[2] ?? m[3]
    if (text) strings.add(unescape(text))
  }
  for (const m of source.matchAll(PLURAL)) {
    const one = unescape(m[1] ?? m[2] ?? m[3] ?? '')
    const other = unescape(m[4] ?? m[5] ?? m[6] ?? '')
    if (other) plurals.set(other, one)
  }
}

const out = {
  strings: [...strings].sort(),
  plurals: [...plurals].sort(([a], [b]) => a.localeCompare(b)).map(([other, one]) => ({ one, other })),
}
fs.writeFileSync(path.join(SRC, 'i18n/source.json'), `${JSON.stringify(out, null, 2)}\n`)

const { CATALOGS } = await import(pathToFileURL(path.join(SRC, 'i18n/index.js')).href)
const wanted = process.argv.includes('--missing') ? process.argv[process.argv.indexOf('--missing') + 1] : null
console.log(`[i18n] ${out.strings.length} strings and ${out.plurals.length} plurals → src/i18n/source.json`)
for (const code of CATALOGS) {
  const catalog = (await import(pathToFileURL(path.join(SRC, `i18n/catalogs/${code}.js`)).href)).default
  const missing = [...out.strings.filter((s) => typeof catalog[s] !== 'string'), ...out.plurals.map((p) => p.other).filter((s) => !catalog[s])]
  const total = out.strings.length + out.plurals.length
  console.log(`  ${code}: ${total - missing.length}/${total} translated`)
  if (wanted === code) console.log(missing.map((s) => `    ${JSON.stringify(s)}`).join('\n'))
}
