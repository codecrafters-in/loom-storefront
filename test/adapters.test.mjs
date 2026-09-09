import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import '../test/helpers/browser.mjs'

/**
 * Both adapters must implement the same surface.
 *
 * `index.js` asserts this at boot — but only for the adapter that is
 * configured, so a gap in `http.js` is discovered by whoever first switches to
 * `api` mode, which is to say in production. Checking both here moves that to
 * the build.
 *
 * The list is read out of `index.js` rather than copied. A copy was written
 * first and was missing fifteen names, which is the whole argument: a
 * hand-maintained duplicate of a list is a list that is wrong.
 */
const src = fs.readFileSync(new URL('../src/lib/api/index.js', import.meta.url), 'utf8')
const start = src.indexOf('const SURFACE = [')
const SURFACE = [...src.slice(start, src.indexOf(']', start)).matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1])

const mock = await import('../src/lib/api/mock.js')
const http = await import('../src/lib/api/http.js')

test('the surface was actually found', () => {
  assert.ok(SURFACE.length > 40, `only parsed ${SURFACE.length} names — the parser has drifted from the file`)
  assert.equal(new Set(SURFACE).size, SURFACE.length, 'the surface list has a duplicate')
})

for (const [name, adapter] of [['mock', mock], ['http', http]]) {
  test(`the ${name} adapter implements every endpoint`, () => {
    const missing = SURFACE.filter((fn) => typeof adapter[fn] !== 'function')
    assert.deepEqual(missing, [], `${name} is missing: ${missing.join(', ')}`)
  })
}

test('neither adapter exports an endpoint the other lacks', () => {
  const exported = (m) => Object.keys(m).filter((k) => typeof m[k] === 'function' && !k.startsWith('_'))
  const onlyMock = exported(mock).filter((k) => !exported(http).includes(k) && SURFACE.includes(k))
  const onlyHttp = exported(http).filter((k) => !exported(mock).includes(k) && SURFACE.includes(k))
  assert.deepEqual([onlyMock, onlyHttp], [[], []])
})
