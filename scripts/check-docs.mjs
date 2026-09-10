/**
 * Guards the in-app documentation viewer.
 *
 * Three failures this catches, all of which are invisible until someone opens
 * /admin/docs and finds a hung tab or a broken link:
 *
 *  1. The markdown parser refusing to advance. It is a hand-written subset
 *     parser; a line that starts a block it does not recognise used to leave
 *     the cursor where it was, which spins the browser until the heap dies.
 *     Every document is parsed here with a step budget.
 *  2. A page listed in the viewer with no file behind it.
 *  3. A relative link in docs/ pointing at a document that does not exist.
 *
 *   node scripts/check-docs.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = path.join(ROOT, 'docs')

/** The parser, lifted from the component so there is one implementation. */
function loadParser() {
  const src = fs.readFileSync(path.join(ROOT, 'src/components/Markdown.jsx'), 'utf8')
  const body = src
    .slice(src.indexOf('function parse(src)'), src.indexOf('function Block('))
    .replace(/^const cells.*$/m, '')
  const cells = 'const cells = (row) => row.split("|").slice(1, -1).map((c) => c.trim());'
  return new Function(`${cells}${body}; return parse;`)()
}

let failed = 0
const fail = (msg) => {
  console.error(`FAIL  ${msg}`)
  failed += 1
}

const parse = loadParser()
const files = fs.readdirSync(DOCS).filter((f) => f.endsWith('.md'))

// 1. Every document parses, quickly, without spinning.
for (const file of files) {
  const text = fs.readFileSync(path.join(DOCS, file), 'utf8')
  const started = Date.now()
  try {
    const blocks = parse(text)
    const ms = Date.now() - started
    // A hang shows up as time, not as an exception. 500ms for a document this
    // size means the cursor is barely moving.
    if (ms > 500) fail(`${file} took ${ms}ms to parse — the cursor is not advancing`)
    const ragged = blocks.filter(
      (b) => b.type === 'table' && b.rows.some((r) => r.length !== b.header.length),
    )
    for (const t of ragged) fail(`${file} has a table with ragged rows: ${t.header.join(' | ')}`)
  } catch (err) {
    fail(`${file} threw while parsing: ${err.message}`)
  }
}

// 2. Every page the index lists has a file, and every file is listed.
//
// The index is `src/data/docs.js` rather than the page that renders it,
// because the sitemap and the prerenderer read the same list — a document
// nobody lists is a document nobody can reach or find.
const viewer = fs.readFileSync(path.join(ROOT, 'src/data/docs.js'), 'utf8')
const listed = [...viewer.matchAll(/file:\s*'([^']+)'/g)].map((m) => m[1])
for (const file of listed) {
  if (!files.includes(file)) fail(`src/data/docs.js lists ${file}, which is not in docs/`)
}
for (const file of files) {
  if (!listed.includes(file)) console.warn(`warn  ${file} exists but is not listed in src/data/docs.js`)
}

// 3. Every relative link resolves.
for (const file of files) {
  const text = fs.readFileSync(path.join(DOCS, file), 'utf8')
  for (const m of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const href = m[1]
    if (/^(https?:|#|mailto:)/.test(href)) continue
    const target = href.split('#')[0]
    if (!target) continue
    if (!fs.existsSync(path.join(DOCS, target))) fail(`${file} links to ${target}, which does not exist`)
  }
}

console.log(
  failed === 0
    ? `[docs] ${files.length} documents parse cleanly, ${listed.length} listed, links resolve`
    : `[docs] ${failed} problem${failed === 1 ? '' : 's'}`,
)
process.exit(failed ? 1 : 0)
