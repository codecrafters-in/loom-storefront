import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { apiOriginFrom, applyCsp, buildPolicy, inlineScriptHashes } from '../scripts/lib/csp.mjs'

/*
 * The Content-Security-Policy the build writes into every page.
 *
 * The failure this guards against is silent: a policy that misses one inline
 * script blocks it without a sound, and the page renders with no data seeded —
 * which looks like a slow API rather than a security header.
 */

const ROOT = new URL('../', import.meta.url).pathname
const SEED = 'window.__LOOM_CACHE__={"getProduct":{"name":"Linen \\u003cshirt\\u003e"}}'
const sample = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
    <script type="application/ld+json" id="seo-jsonld">{"@type":"Product"}</script>
    <script>${SEED}</script>
  </head>
  <body><div id="root"></div></body>
</html>`

const sha = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`
const policyOf = (html) => html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1] ?? ''
const directive = (policy, name) => policy.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? ''

test('only inline scripts the browser runs are hashed', () => {
  assert.deepEqual(inlineScriptHashes(sample), [sha(SEED)])
})

test('scripts: self, the page’s own inline scripts, the known third parties — and no unsafe anything', () => {
  const policy = policyOf(applyCsp(sample))
  const scripts = directive(policy, 'script-src')
  for (const source of ["'self'", sha(SEED), 'https://checkout.razorpay.com', 'https://challenges.cloudflare.com/turnstile/', 'https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/']) {
    assert.ok(scripts.includes(source), `script-src is missing ${source}`)
  }
  assert.ok(!scripts.includes("'unsafe-inline'"))
  assert.ok(!policy.includes("'unsafe-eval'"))
  assert.equal(directive(policy, 'object-src'), "object-src 'none'")
  assert.equal(directive(policy, 'base-uri'), "base-uri 'self'")
})

test('the API origin is allowed where the storefront needs it, and only in api mode', () => {
  const withApi = policyOf(applyCsp(sample, { apiOrigin: 'http://localhost:8069' }))
  for (const name of ['connect-src', 'img-src', 'media-src', 'form-action']) {
    assert.ok(directive(withApi, name).includes('http://localhost:8069'), `${name} is missing the API origin`)
  }
  assert.ok(directive(withApi, 'connect-src').includes('https://api.razorpay.com'))
  assert.ok(directive(withApi, 'frame-src').includes('https://challenges.cloudflare.com'))

  const demo = policyOf(applyCsp(sample))
  assert.ok(!demo.includes('localhost:8069'))
})

test('the API origin comes from the variables the bundle was built with', () => {
  assert.equal(apiOriginFrom({ VITE_DATA_SOURCE: 'api', VITE_API_BASE_URL: 'http://localhost:8069/loom/api/v1/loom' }), 'http://localhost:8069')
  assert.equal(apiOriginFrom({ VITE_DATA_SOURCE: 'mock', VITE_API_BASE_URL: 'http://localhost:8069/loom/api/v1/loom' }), '')
  assert.equal(apiOriginFrom({ VITE_DATA_SOURCE: 'api', VITE_API_BASE_URL: '/api' }), '', 'a relative API is this origin')
})

test('the policy sits before the first script, and applying it twice changes nothing', () => {
  const once = applyCsp(sample, { apiOrigin: 'http://localhost:8069' })
  assert.ok(once.indexOf('Content-Security-Policy') < once.indexOf('<script'))
  assert.ok(once.indexOf('<meta charset') < once.indexOf('Content-Security-Policy'), 'the charset stays first')
  assert.equal(applyCsp(once, { apiOrigin: 'http://localhost:8069' }), once)
  assert.equal(once.match(/http-equiv="Content-Security-Policy"/g).length, 1)
})

test('a page whose seed changed gets the new hash, not the old one', () => {
  const first = applyCsp(sample)
  const changed = applyCsp(first.replace('Linen', 'Wool'))
  assert.ok(policyOf(changed).includes(sha(SEED.replace('Linen', 'Wool'))))
  assert.ok(!policyOf(changed).includes(sha(SEED)))
})

test('every host refuses to be framed', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'))
  const all = vercel.headers.find((h) => h.source === '/(.*)').headers
  const header = (key) => all.find((h) => h.key === key)?.value
  assert.equal(header('Content-Security-Policy'), "frame-ancestors 'none'")
  assert.equal(header('X-Frame-Options'), 'DENY')

  const netlify = fs.readFileSync(path.join(ROOT, 'public/_headers'), 'utf8')
  assert.match(netlify, /^\s+Content-Security-Policy: frame-ancestors 'none'$/m)
  assert.match(netlify, /^\s+X-Frame-Options: DENY$/m)
})

/* ── what the build wrote ──────────────────────────────────────────────── */

const DIST = path.join(ROOT, 'dist')
const built = fs.existsSync(path.join(DIST, 'index.html'))

describe('built output', { skip: built ? false : 'run `npm run build` first' }, () => {
  test('every page carries a policy that allows each of its own inline scripts', () => {
    const files = []
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith('.html')) files.push(full)
      }
    }
    walk(DIST)
    assert.ok(files.length > 0)
    for (const file of files) {
      const html = fs.readFileSync(file, 'utf8')
      const policy = policyOf(html)
      const rel = path.relative(DIST, file)
      assert.ok(policy, `${rel} has no Content-Security-Policy — did scripts/csp.mjs run?`)
      for (const hash of inlineScriptHashes(html)) assert.ok(policy.includes(hash), `${rel} blocks one of its own inline scripts`)
    }
  })
})

test('the policy string is stable for the same input', () => {
  assert.equal(buildPolicy({ hashes: ["'sha256-a'"] }), buildPolicy({ hashes: ["'sha256-a'"] }))
})
