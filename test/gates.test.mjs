import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const ROOT = new URL('../', import.meta.url).pathname
const { parseTokens, luminance, ratio, composite, parseUtility } = await import('../scripts/lib/contrast.mjs')

describe('contrast', () => {
  test('the WCAG worked example', () => {
    // Black on white is 21:1 exactly. If this drifts, the formula is wrong and
    // every other number here is decoration.
    assert.equal(Math.round(ratio([0, 0, 0], [255, 255, 255]) * 100) / 100, 21)
    assert.equal(ratio([255, 255, 255], [255, 255, 255]), 1)
    assert.equal(luminance([255, 255, 255]), 1)
    assert.equal(luminance([0, 0, 0]), 0)
  })

  test('contrast is symmetric', () => {
    // Which is the point of sorting by luminance rather than assuming an order.
    assert.equal(ratio([26, 24, 21], [250, 248, 245]), ratio([250, 248, 245], [26, 24, 21]))
  })

  test('a translucent colour is flattened onto what is behind it', () => {
    // Without this, white text on a 35% dark overlay measures against solid
    // dark and passes, when what a shopper sees is white on near-white.
    assert.deepEqual(composite([0, 0, 0], [255, 255, 255], 1), [0, 0, 0])
    assert.deepEqual(composite([0, 0, 0], [255, 255, 255], 0), [255, 255, 255])
    assert.deepEqual(composite([0, 0, 0], [255, 255, 255], 0.5), [128, 128, 128])
  })

  test('utilities parse, including the opacity modifier', () => {
    assert.deepEqual(parseUtility('text-faint'), { token: 'faint', alpha: 1 })
    assert.deepEqual(parseUtility('bg-ink/35'), { token: 'ink', alpha: 0.35 })
    assert.deepEqual(parseUtility('text-[13px]'), null)
    assert.equal(parseUtility('rounded-xs'), null)
  })

  test('tokens are read out of the real stylesheet', () => {
    const tokens = parseTokens(fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8'))
    for (const name of ['page', 'ink', 'muted', 'faint', 'accent']) {
      assert.ok(Array.isArray(tokens[name]), `--${name} did not parse`)
    }
  })

  test('the shipped palette clears the floor', () => {
    // The regression guard: a rebrand that lightens a token goes red on
    // `npm test`, not only on a build somebody might skip.
    const tokens = parseTokens(fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8'))
    for (const fg of ['ink', 'muted', 'faint', 'accent', 'sale', 'good']) {
      for (const bg of ['page', 'surface', 'sunken']) {
        const value = ratio(tokens[fg], tokens[bg])
        assert.ok(value >= 4.5, `text-${fg} on bg-${bg} is ${value.toFixed(2)}`)
      }
    }
  })

  test('the gate itself passes on the current source', () => {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['scripts/contrast.mjs'], { cwd: ROOT, stdio: 'pipe' }))
  })
})

describe('bundle budget', { skip: fs.existsSync(`${ROOT}dist/.vite/manifest.json`) ? false : 'run `npm run build` first' }, () => {
  test('the initial download is measured from the manifest, not a filename', () => {
    // Matching `dist/assets/index-*.js` breaks the first time the entry is
    // renamed, and silently — it would report 0 KB and pass.
    const manifest = JSON.parse(fs.readFileSync(`${ROOT}dist/.vite/manifest.json`, 'utf8'))
    const entry = Object.values(manifest).find((chunk) => chunk.isEntry)
    assert.ok(entry, 'no entry chunk in the manifest')
    assert.ok(entry.imports?.length, 'the entry imports nothing — the vendor split is broken')
  })

  test('no chunk is an empty orphan', () => {
    // A 30-byte `react` chunk is what a misconfigured manualChunks produces:
    // a wasted request, and a split that is not splitting anything.
    const manifest = JSON.parse(fs.readFileSync(`${ROOT}dist/.vite/manifest.json`, 'utf8'))
    for (const chunk of Object.values(manifest)) {
      if (!chunk.file?.endsWith('.js')) continue
      const size = fs.statSync(`${ROOT}dist/${chunk.file}`).size
      assert.ok(size > 200, `${chunk.file} is ${size} bytes — nothing needs it`)
    }
  })

  test('it is inside budget', () => {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['scripts/budget.mjs'], { cwd: ROOT, stdio: 'pipe' }))
  })
})
