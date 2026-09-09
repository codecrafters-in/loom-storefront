/**
 * Fails the build on a colour pairing nobody can read.
 *
 *   npm run check:contrast
 *
 * Accessibility is the one quality that degrades without anybody noticing: a
 * token is nudged half a shade for a rebrand, and a hundred and forty elements
 * quietly drop below the legibility floor. Nothing goes red, nothing looks
 * broken, and the people it excludes do not file bug reports.
 *
 * This found `--faint` at 4.28:1 on the page background the first time it ran.
 *
 * Two rules decide which pairings are checked, and both are stated here rather
 * than inferred, because a gate whose reasoning is invisible is a gate people
 * add exceptions to instead of fixing:
 *
 *   1. Within one `className` string, every `text-*` is paired with every
 *      `bg-*` beside it. Those pairs are exact.
 *   2. Every `text-*` is also paired with the three surfaces a page is actually
 *      built from — `page`, `surface`, `sunken`. Anything else would mean
 *      resolving ancestors, which needs a DOM.
 *
 * Whole-file co-occurrence is the obvious third rule and is deliberately not
 * used: pairing a footer's colour with a card's background invents failures,
 * and a gate that cries wolf earns an allowlist rather than a fix.
 *
 * Rule 2 skips the inverse tokens — `page`, `surface`, `accent-ink` and the
 * rest. Those exist *to* sit on a dark or coloured ground, so measuring them
 * against a light surface invents a failure for text that is never there. Where
 * they actually land is only knowable from rule 1.
 *
 * Text over a photograph cannot be checked this way at all, by anyone: the
 * contrast depends on the pixels. The hero copy in `home/sections.jsx` is the
 * case here, and it carries its own scrim.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseTokens, ratio, composite, parseUtility } from './lib/contrast.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** The floor for body text. */
const MIN = 4.5

/**
 * WCAG allows 3:1 for large text — 24px, or 18.66px bold. Nothing in this
 * theme's small type qualifies: every `text-faint` use is 9–13px metadata. So
 * there is no size exemption, which is both stricter and simpler than trying to
 * infer a font size from a class list.
 */
const SURFACES = ['page', 'surface', 'sunken']

/**
 * Pairings that are decorative rather than text, excused by name.
 *
 * Named exceptions with a stated reason are honest; lowering the threshold to
 * make them pass is not, because it lowers it for everything else too.
 */
const ALLOW = [
  ['line', 'page', 'the unfilled half of a star rating — a shape, not text'],
  ['line', 'surface', 'the same star rating on a raised card'],
  ['line', 'sunken', 'a breadcrumb chevron between links'],
]

const allowed = (fg, bg) => ALLOW.some(([f, b]) => f === fg && b === bg)

/* ── gather ────────────────────────────────────────────────────────────── */

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(full)
  }
  return out
}

/**
 * Which names are colours, read from the theme rather than guessed.
 *
 * `text-display-xl` is a font size and `text-center` is alignment; a regex
 * trying to tell those apart from a colour will always be one utility behind.
 * Taking the list from `tailwind.config.js` also means a token declared there
 * with no CSS variable behind it — which is how `accent-deep` was found — shows
 * up as unresolvable rather than being silently skipped.
 */
function themeColours() {
  const config = fs.readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8')
  const start = config.indexOf('colors: {')
  if (start < 0) return new Set()
  let depth = 0
  let end = start
  for (let i = config.indexOf('{', start); i < config.length; i += 1) {
    if (config[i] === '{') depth += 1
    else if (config[i] === '}') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  return new Set([...config.slice(start, end).matchAll(/^\s*'?([a-z][a-z0-9-]*)'?:/gm)].map((m) => m[1]))
}

/**
 * Foregrounds that live on dark or coloured grounds by design.
 *
 * Excluded from rule 2 only — rule 1 still checks them wherever a real pairing
 * appears.
 */
const INVERSE = new Set(['page', 'surface', 'raised', 'sunken', 'accent-ink', 'accent-soft'])

const tokens = parseTokens(fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8'))
const COLOURS = themeColours()
const files = sourceFiles(path.join(ROOT, 'src'))

/** token name → where it is used, so a failure can name a file. */
const seen = new Map()
const pairs = new Map()
const unresolved = new Map()

const note = (map, key, where) => {
  if (!map.has(key)) map.set(key, { count: 0, where })
  map.get(key).count += 1
}

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  const rel = path.relative(ROOT, file)

  // Every string literal that could be a class list.
  for (const match of source.matchAll(/(?:className|class)\s*=\s*[{"'`]([^"'`}]*)[}"'`]/g)) {
    const classes = match[1].split(/\s+/).filter(Boolean)
    const line = source.slice(0, match.index).split('\n').length

    const fgs = classes.filter((c) => c.startsWith('text-')).map(parseUtility).filter(Boolean)
    const bgs = classes.filter((c) => c.startsWith('bg-')).map(parseUtility).filter(Boolean)

    for (const fg of fgs) {
      if (!COLOURS.has(fg.token)) continue
      if (!tokens[fg.token]) {
        note(unresolved, fg.token, `${rel}:${line}`)
        continue
      }
      note(seen, fg.token, `${rel}:${line}`)
      for (const bg of bgs) {
        if (!COLOURS.has(bg.token) || !tokens[bg.token]) continue
        note(pairs, `${fg.token}|${fg.alpha}|${bg.token}|${bg.alpha}`, `${rel}:${line}`)
      }
    }
    for (const bg of bgs) {
      if (COLOURS.has(bg.token) && !tokens[bg.token]) note(unresolved, bg.token, `${rel}:${line}`)
    }
  }
}

/* ── judge ─────────────────────────────────────────────────────────────── */

const failures = []

const check = (fgName, fgAlpha, bgName, bgAlpha, where, count) => {
  if (allowed(fgName, bgName)) return
  const page = tokens.page || [255, 255, 255]
  const bg = composite(tokens[bgName], page, bgAlpha)
  const fg = composite(tokens[fgName], bg, fgAlpha)
  const value = ratio(fg, bg)
  if (value >= MIN) return
  failures.push({
    label: `text-${fgName}${fgAlpha < 1 ? `/${fgAlpha * 100}` : ''} on bg-${bgName}${bgAlpha < 1 ? `/${bgAlpha * 100}` : ''}`,
    value,
    where,
    count,
  })
}

// Rule 1 — exact pairs found side by side.
for (const [key, { where, count }] of pairs) {
  const [fgName, fgAlpha, bgName, bgAlpha] = key.split('|')
  check(fgName, Number(fgAlpha), bgName, Number(bgAlpha), where, count)
}

// Rule 2 — every foreground against the surfaces a page is built from, except
// the ones whose whole job is sitting on something darker.
for (const [fgName, { where, count }] of seen) {
  if (INVERSE.has(fgName)) continue
  for (const surface of SURFACES) {
    if (tokens[surface]) check(fgName, 1, surface, 1, where, count)
  }
}

/* ── report ────────────────────────────────────────────────────────────── */

for (const [token, { where }] of unresolved) {
  failures.push({
    label: `${token} resolves to no CSS variable`,
    value: 0,
    where,
    count: 0,
    reason: 'a class that compiles to rgb(var(--undefined)) renders as nothing',
  })
}

if (failures.length) {
  console.error('[contrast] below the 4.5:1 floor for body text:\n')
  for (const f of failures.sort((a, b) => a.value - b.value)) {
    const measured = f.value ? `${f.value.toFixed(2)}` : '—'
    console.error(`  ${f.label.padEnd(42)} ${measured.padStart(5)}   ${f.count ? `${f.count} uses, ` : ''}e.g. ${f.where}`)
    if (f.reason) console.error(`  ${''.padEnd(42)}         ${f.reason}`)
  }
  console.error(`\n  ${failures.length} pairing(s). Darken the token, or add a reasoned entry to ALLOW.`)
  process.exit(1)
}

console.log(
  `[contrast] ${pairs.size} exact pairs + ${seen.size} colours across ${SURFACES.length} surfaces — all clear ${MIN}:1`,
)
