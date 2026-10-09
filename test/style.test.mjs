import test from 'node:test'
import assert from 'node:assert/strict'
import { STYLE_CHOICES, styleAttributes, themeStyle, toneVars } from '../src/lib/style.js'
import { THEME_PRESETS, presetTheme } from '../src/data/theme-presets.js'
import { contrast } from '../src/lib/theme.js'

const tri = (value) => value.split(' ').map(Number)

test("without a style, or with one this build does not know, the theme's own layout", () => {
  assert.deepEqual(themeStyle(null), { header: 'classic', card: 'portrait', buttons: 'solid', spacing: 'balanced', headings: 'normal', footer: 'light' })
  assert.deepEqual(themeStyle({ style: { header: 'sideways', card: 'overlay' } }).header, 'classic')
  assert.equal(themeStyle({ style: { card: 'overlay' } }).card, 'overlay')
  assert.deepEqual(styleAttributes(null), { 'data-buttons': 'solid', 'data-spacing': 'balanced', 'data-headings': 'normal', 'data-card': 'portrait' })
  assert.equal(toneVars(null, 'light'), null, 'a light footer keeps the page colours')
})

test('every look picks a known choice for every part, and the looks differ', () => {
  for (const preset of THEME_PRESETS) {
    for (const [part, choices] of Object.entries(STYLE_CHOICES)) {
      assert.ok(choices.includes(preset.style[part]), `${preset.id}: ${part} ${preset.style[part]}`)
    }
  }
  const signatures = new Set(THEME_PRESETS.map((p) => JSON.stringify(p.style)))
  assert.ok(signatures.size >= 10, `${signatures.size} different layouts among 12 looks`)
})

test('a bold header and a dark or accent footer stay readable in every look, and in the default one', () => {
  for (const theme of [null, ...THEME_PRESETS.map(presetTheme)]) {
    for (const tone of ['dark', 'accent']) {
      const vars = toneVars(theme, tone)
      const ground = tri(vars['--page'])
      for (const token of ['--ink', '--muted', '--faint']) {
        const ratio = contrast(tri(vars[token]), ground)
        assert.ok(ratio >= 4.5, `${theme?.preset || 'default'} ${tone}: ${token} ${ratio.toFixed(2)}`)
      }
      const button = contrast(tri(vars['--accent-ink']), tri(vars['--accent']))
      assert.ok(button >= 4.5, `${theme?.preset || 'default'} ${tone}: a button there ${button.toFixed(2)}`)
    }
  }
})
