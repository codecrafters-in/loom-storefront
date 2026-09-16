import test from 'node:test'
import assert from 'node:assert/strict'
import { THEME_PRESETS, presetTheme } from '../src/data/theme-presets.js'
import { contrast, themeVars } from '../src/lib/theme.js'
import { hexRgb, isDarkTheme } from '../src/lib/colour.js'

// The same pairs the Odoo module checks on a store's colours (services/theme.py CHECKS), plus the accent on the page.
const CHECKS = [['ink', 'page'], ['muted', 'page'], ['ink', 'surface'], ['accentInk', 'accent'], ['sale', 'page'], ['accent', 'page']]
const FONTS = new Set(['system', 'Inter', 'DM Sans', 'Manrope', 'Poppins', 'Work Sans', 'Noto Sans', 'Fraunces', 'Playfair Display',
  'Lora', 'Libre Baskerville', 'Cormorant Garamond'])
const tri = (value) => value.split(' ').map(Number)

test('there are twelve looks, light and dark, each complete', () => {
  assert.equal(THEME_PRESETS.length, 12)
  assert.equal(new Set(THEME_PRESETS.map((p) => p.id)).size, 12)
  assert.ok(THEME_PRESETS.some((p) => p.dark) && THEME_PRESETS.some((p) => !p.dark))
  for (const preset of THEME_PRESETS) {
    assert.deepEqual(Object.keys(preset.colors).sort(), ['accent', 'accentInk', 'ink', 'muted', 'page', 'sale', 'surface'], preset.id)
    assert.ok(FONTS.has(preset.fonts.heading) && FONTS.has(preset.fonts.body), preset.id)
    assert.ok([0, 2, 8, 16].includes(preset.radius), preset.id)
    assert.ok(preset.name && preset.description && preset.industries, preset.id)
  }
})

test('every look is readable, as set and as the storefront derives it', () => {
  for (const preset of THEME_PRESETS) {
    const c = Object.fromEntries(Object.entries(preset.colors).map(([k, v]) => [k, hexRgb(v)]))
    for (const [fg, bg] of CHECKS) {
      assert.ok(contrast(c[fg], c[bg]) >= 4.5, `${preset.id}: ${fg} on ${bg} is ${contrast(c[fg], c[bg]).toFixed(2)}`)
    }
    const vars = themeVars(presetTheme(preset))
    for (const token of ['--muted', '--faint']) {
      for (const ground of ['--page', '--sunken']) {
        const ratio = contrast(tri(vars[token]), tri(vars[ground]))
        assert.ok(ratio >= 4.5, `${preset.id}: ${token} on ${ground} is ${ratio.toFixed(2)}`)
      }
    }
    assert.equal(isDarkTheme(presetTheme(preset)), preset.dark, `${preset.id}: dark flag`)
  }
})

test("a preset becomes the storefront document's theme", () => {
  const noir = THEME_PRESETS.find((p) => p.id === 'noir')
  const theme = presetTheme(noir)
  assert.deepEqual(theme, { preset: 'noir', presetChanged: false, colors: noir.colors, fonts: noir.fonts, radius: 0 })
  theme.colors.accent = '#000000'
  assert.equal(noir.colors.accent, '#C9A45C', 'the list is not changed through a theme')
})

test('photographs keep light text on a dark wash, in light and dark looks', () => {
  for (const preset of THEME_PRESETS) {
    const vars = themeVars(presetTheme(preset))
    const scrim = tri(vars['--scrim'])
    const text = tri(vars['--on-scrim'])
    assert.ok(contrast(scrim, text) >= 7, `${preset.id}: ${contrast(scrim, text).toFixed(2)}`)
    assert.ok(scrim.reduce((a, b) => a + b) < text.reduce((a, b) => a + b), `${preset.id}: the wash is the dark one`)
  }
})
