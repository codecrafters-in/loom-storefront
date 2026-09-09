import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * robots.txt and the sitemap are generated from settings, because both encode
 * decisions that are the merchant's rather than the theme's — most obviously
 * whether an AI crawler may read the catalogue.
 *
 * The script is run for real against a temporary settings file rather than its
 * logic being reimplemented here, which would only prove the copy agrees with
 * itself.
 */
const ROOT = new URL('../', import.meta.url).pathname
const SETTINGS = path.join(ROOT, 'src/data/storefront.js')

function robotsWith(seo) {
  const original = fs.readFileSync(SETTINGS, 'utf8')
  const patched = original.replace(/ {2}seo: \{[\s\S]*?\n {2}\},\n/, `  seo: ${JSON.stringify(seo)},\n`)
  assert.notEqual(patched, original, 'the seo block was not found in storefront.js')
  try {
    fs.writeFileSync(SETTINGS, patched)
    execFileSync(process.execPath, ['scripts/robots.mjs'], { cwd: ROOT, stdio: 'pipe' })
    return fs.readFileSync(path.join(ROOT, 'dist/robots.txt'), 'utf8')
  } finally {
    fs.writeFileSync(SETTINGS, original)
  }
}

/** Generated here rather than read from a `dist/` some other step may have wiped. */
function sitemap() {
  execFileSync(process.execPath, ['scripts/sitemap.mjs'], { cwd: ROOT, stdio: 'pipe' })
  return fs.readFileSync(path.join(ROOT, 'dist/sitemap.xml'), 'utf8')
}

const BASE = { siteUrl: 'https://shop.example', indexable: true, disallow: ['/checkout'], sitemapImages: true }

test('allowing AI crawlers writes no rules for them', () => {
  // An absent rule already means "allowed". Writing one would be noise.
  const robots = robotsWith({ ...BASE, aiCrawlers: 'allow', crawlers: { GPTBot: true } })
  assert.match(robots, /User-agent: \*\nAllow: \//)
  assert.ok(!robots.includes('GPTBot'))
})

test('blocking them names every bot, so the file is checkable', () => {
  const robots = robotsWith({ ...BASE, aiCrawlers: 'block', crawlers: { GPTBot: true, ClaudeBot: true } })
  assert.match(robots, /User-agent: GPTBot\nDisallow: \//)
  assert.match(robots, /User-agent: ClaudeBot\nDisallow: \//)
  // Blocking overrides a bot's own flag — otherwise "block all" would not.
  assert.ok(!/User-agent: GPTBot\nAllow/.test(robots))
})

test('custom honours each decision separately', () => {
  const robots = robotsWith({ ...BASE, aiCrawlers: 'custom', crawlers: { GPTBot: true, CCBot: false } })
  assert.match(robots, /User-agent: GPTBot\nAllow: \//)
  assert.match(robots, /User-agent: CCBot\nDisallow: \//)
})

test('switching indexing off takes the whole shop out', () => {
  // A staging deployment that is indexed competes with production for its own
  // keywords.
  const robots = robotsWith({ ...BASE, indexable: false })
  assert.match(robots, /User-agent: \*\nDisallow: \//)
  assert.ok(!robots.includes('Allow: /'))
})

test('the sitemap is absolute, because a relative one is ignored', () => {
  const robots = robotsWith({ ...BASE, aiCrawlers: 'allow', crawlers: {} })
  assert.match(robots, /Sitemap: https:\/\/shop\.example\/sitemap\.xml/)
})

test('per-visitor paths stay out of the index', () => {
  const robots = robotsWith({ ...BASE, disallow: ['/checkout', '/account', '/orders/lookup'] })
  for (const p of ['/checkout', '/account', '/orders/lookup']) {
    assert.ok(robots.includes(`Disallow: ${p}`), `${p} is crawlable`)
  }
})

test('the sitemap lists product photographs', () => {
  // Google Images is a shopping surface of its own and will not find pictures
  // that exist only inside a JavaScript gallery.
  const xml = sitemap()
  assert.match(xml, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/)
  assert.ok((xml.match(/<image:loc>/g) || []).length >= 20)
  assert.match(xml, /<image:loc>https?:\/\/[^<]+\/images\/products\/[^<]+<\/image:loc>/)
})

test('the sitemap is well-formed XML', () => {
  const xml = sitemap()
  // A stray & in a caption or a filename would break the document silently —
  // search consoles report "could not read" and nothing else.
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xml), 'an unescaped ampersand')
  assert.equal((xml.match(/<url>/g) || []).length, (xml.match(/<\/url>/g) || []).length)
})
