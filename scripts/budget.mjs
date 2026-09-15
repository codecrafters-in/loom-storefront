/**
 * Fails the build when the initial download grows past its budget.
 *
 *   npm run check:budget      # after `vite build`
 *
 * A theme whose pitch is speed does not get slow in one commit. It gains four
 * kilobytes per feature, nobody looks, and a year later the thing that sold it
 * is gone. A number in a file somebody has to edit — in a diff somebody has to
 * approve — is the whole mechanism.
 *
 * Measured from `dist/.vite/manifest.json`: the entry chunk plus everything it
 * statically imports, which is what a first-time visitor actually downloads
 * before anything renders. Lazy routes are excluded on purpose; that is what
 * splitting them was for.
 *
 * Gzip rather than brotli, deliberately. It is the conservative figure, most
 * CDNs serve brotli about 15% smaller, and gzip is stable across Node versions.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

/**
 * Budgets in gzipped bytes.
 *
 * Raise one only with a reason in the commit message. That sentence is the
 * point of the whole file.
 *
 * Two JavaScript budgets, because two different things get built, read from the
 * setting the build was made with (dist/.vite/loom-build.json, written by vite.config.js). A live store (`VITE_DATA_SOURCE=api`) is
 * what shoppers download, so it has the tight number: about 6% over its build
 * when this was split. The demo also carries the whole demo backend (`mock.js`)
 * in its first download, which no live store ships; it had crept up to the old
 * shared 125 KB, so it gets 130 KB, and the live number came down from 125 to 115.
 */
const BUILD_INFO = path.join(DIST, '.vite/loom-build.json')
const LIVE = fs.existsSync(BUILD_INFO)
  ? JSON.parse(fs.readFileSync(BUILD_INFO, 'utf8')).dataSource === 'api'
  : (loadEnv('production', ROOT, 'VITE_').VITE_DATA_SOURCE || 'mock').toLowerCase() === 'api'
const BUDGET = {
  // Phase 9 (accounts, orders after purchase, returns, reviews, questions, alerts) added about 35 calls to the API
  // surface and nine routes that every page carries; their pages, forms and calls load on use. +1.5 KB each.
  js: (LIVE ? 116.5 : 131.5) * 1024,
  css: 12 * 1024,
}

const manifestPath = path.join(DIST, '.vite/manifest.json')
if (!fs.existsSync(manifestPath)) {
  console.error('[budget] no dist/.vite/manifest.json — run `vite build` first')
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const entry = Object.values(manifest).find((chunk) => chunk.isEntry)
if (!entry) {
  console.error('[budget] the manifest has no entry chunk')
  process.exit(1)
}

/** The entry and everything it statically imports, transitively. */
const walk = (name, seen = new Set()) => {
  if (seen.has(name)) return seen
  seen.add(name)
  const chunk = manifest[name]
  for (const next of chunk?.imports || []) walk(next, seen)
  return seen
}

const byName = Object.fromEntries(Object.entries(manifest).map(([name, chunk]) => [name, chunk]))
const entryName = Object.keys(byName).find((name) => byName[name] === entry)
const initial = [...walk(entryName)].map((name) => manifest[name]).filter(Boolean)

const gzip = (file) => zlib.gzipSync(fs.readFileSync(path.join(DIST, file))).length

const js = initial.map((chunk) => ({ file: chunk.file, size: gzip(chunk.file) }))
const css = [...new Set(initial.flatMap((chunk) => chunk.css || []))].map((file) => ({ file, size: gzip(file) }))

const total = (rows) => rows.reduce((sum, row) => sum + row.size, 0)
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

// Always print, not only on failure. A budget that says nothing while it passes
// teaches nobody where the headroom went.
console.log(`[budget] the initial download (${LIVE ? 'live store' : 'demo'} build):`)
for (const row of [...js, ...css].sort((a, b) => b.size - a.size)) {
  console.log(`  ${row.file.padEnd(42)} ${kb(row.size).padStart(9)}`)
}

let failed = false
for (const [label, rows, limit] of [['js', js, BUDGET.js], ['css', css, BUDGET.css]]) {
  const used = total(rows)
  const percent = Math.round((used / limit) * 100)
  const line = `  ${label} ${kb(used)} / ${kb(limit)} (${percent}%)`
  if (used > limit) {
    console.error(`${line}  OVER by ${kb(used - limit)}`)
    failed = true
  } else {
    console.log(line)
  }
}

if (failed) {
  console.error('\n  Split it, drop it, or raise the budget in scripts/budget.mjs with a reason.')
  process.exit(1)
}
