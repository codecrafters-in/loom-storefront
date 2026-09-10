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

/**
 * The scripts resolve their origin from the environment first, then from
 * settings — SITE_URL is how a staging build overrides a production domain.
 * That means these tests, which assert what a *settings* file produces, have
 * to run with those variables cleared.
 *
 * Found on a real deployment: SITE_URL was set in the project, the build ran
 * the suite, and the fixture's origin lost to the environment. A test that
 * passes or fails depending on the machine it runs on has stopped testing the
 * thing it names.
 */
const ENV = { ...process.env }
delete ENV.SITE_URL
delete ENV.VERCEL_PROJECT_PRODUCTION_URL

function robotsWith(seo, env = {}) {
  const original = fs.readFileSync(SETTINGS, 'utf8')
  const patched = original.replace(/ {2}seo: \{[\s\S]*?\n {2}\},\n/, `  seo: ${JSON.stringify(seo)},\n`)
  assert.notEqual(patched, original, 'the seo block was not found in storefront.js')
  try {
    fs.writeFileSync(SETTINGS, patched)
    execFileSync(process.execPath, ['scripts/robots.mjs'], { cwd: ROOT, stdio: 'pipe', env: { ...ENV, ...env } })
    return fs.readFileSync(path.join(ROOT, 'dist/robots.txt'), 'utf8')
  } finally {
    fs.writeFileSync(SETTINGS, original)
  }
}

/** Generated here rather than read from a `dist/` some other step may have wiped. */
function sitemap() {
  execFileSync(process.execPath, ['scripts/sitemap.mjs'], { cwd: ROOT, stdio: 'pipe', env: ENV })
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

test('SITE_URL overrides the setting, which is what a staging build needs', () => {
  const robots = robotsWith({ ...BASE, aiCrawlers: 'allow', crawlers: {} }, {
    SITE_URL: 'https://staging.shop.example',
  })
  assert.match(robots, /Sitemap: https:\/\/staging\.shop\.example\/sitemap\.xml/)
})

test("a host's own production domain is used when nothing else says", () => {
  // Vercel sets this during the build. Without the fallback, a fork that just
  // clicks Deploy canonicalises its whole catalogue to an example domain.
  const robots = robotsWith({ ...BASE, siteUrl: '', aiCrawlers: 'allow', crawlers: {} }, {
    VERCEL_PROJECT_PRODUCTION_URL: 'loom-studio.codecrafters.in',
  })
  assert.match(robots, /Sitemap: https:\/\/loom-studio\.codecrafters\.in\/sitemap\.xml/)
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
