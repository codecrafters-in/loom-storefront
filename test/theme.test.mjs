import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contrast, themeCss, themeVars } from '../src/lib/theme.js'

const rgb = (triplet) => triplet.split(' ').map(Number)
const sunkenOver = (vars) => rgb(vars['--sunken']).map((v, i) => Math.round((v + rgb(vars['--page'])[i]) / 2))

const DEFAULT = { page: '#FAF8F5', surface: '#FFFFFF', ink: '#1A1815', muted: '#6B645A', accent: '#7C4A2D', accentInk: '#FFFFFF', sale: '#A3341F' }

for (const [name, colors] of [
  ['the default palette', DEFAULT],
  ['a pale secondary text colour', { ...DEFAULT, muted: '#9A9A9A' }],
  ['a dark store', { page: '#121212', surface: '#1C1C1C', ink: '#F2F2F2', muted: '#8A8A8A', accent: '#E0B050', accentInk: '#121212' }],
]) {
  test(`secondary and faint text stay readable with ${name}`, () => {
    const vars = themeVars({ colors, fonts: { heading: 'Lora', body: 'system' }, radius: 8 })
    for (const token of ['--muted', '--faint']) {
      for (const bg of [rgb(vars['--page']), rgb(vars['--sunken']), sunkenOver(vars)]) {
        assert.ok(contrast(rgb(vars[token]), bg) >= 4.5, `${token} ${vars[token]} on ${bg} is ${contrast(rgb(vars[token]), bg).toFixed(2)}`)
      }
    }
  })
}

test('a theme becomes CSS variables, fonts and radius', () => {
  const css = themeCss({ colors: DEFAULT, fonts: { heading: 'Lora', body: 'system' }, radius: 8 })
  assert.match(css, /--accent:124 74 45/)
  assert.match(css, /--font-display:"Lora", /)
  assert.match(css, /--font-body:ui-sans-serif/)
  assert.match(css, /--radius:8px/)
  assert.equal(themeCss(null), '')
  assert.equal(themeCss({ colors: { page: 'nope' } }), '')
})
