import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DARK_BELOW, hexRgb, isDarkTheme, luminance } from '../src/lib/colour.js'
import { DEFAULT_LOGO_HEIGHT, logoHeight, logoImage } from '../src/lib/logo.js'

/*
 * The logo on a dark theme, and its height in the footer and the phone menu.
 *
 * Odoo sent `theme.logoDarkUrl` and nothing read it, so a store with a dark page showed its usual dark logo on it,
 * which cannot be seen. The footer and the phone menu forced 26 and 20 px whatever height the store had set.
 */

const DARK = { colors: { page: '#121212', ink: '#F2F2F2' }, logoDarkUrl: 'https://shop.test/logo-dark.png' }
const LIGHT = { colors: { page: '#FAF8F5', ink: '#1A1815' }, logoDarkUrl: 'https://shop.test/logo-dark.png' }
const settings = (logo, theme) => ({ store: { name: 'Shop', logo }, theme })

test('a page colour is dark below a relative luminance of 0.35', () => {
  assert.equal(DARK_BELOW, 0.35)
  assert.equal(luminance(hexRgb('#FFFFFF')), 1)
  assert.equal(luminance(hexRgb('#000000')), 0)
  assert.equal(isDarkTheme(DARK), true)
  assert.equal(isDarkTheme(LIGHT), false)
  assert.equal(isDarkTheme({ colors: { page: '#808080' } }), true, 'a mid-grey page (0.22) already needs the light logo')
  assert.equal(isDarkTheme({ colors: { page: '#A8A8A8' } }), false, 'a light grey (0.39) does not')
  for (const theme of [null, {}, { colors: { page: 'navy' } }]) assert.equal(isDarkTheme(theme), false)
})

test('the dark-background logo on a dark theme, the usual one otherwise', () => {
  const logo = { imageUrl: 'https://shop.test/logo.png', height: 22 }
  assert.equal(logoImage(settings(logo, DARK)), 'https://shop.test/logo-dark.png')
  assert.equal(logoImage(settings(logo, LIGHT)), 'https://shop.test/logo.png')
  assert.equal(logoImage(settings(logo, { ...DARK, logoDarkUrl: null })), 'https://shop.test/logo.png', 'without a dark version the usual one still shows')
  assert.equal(logoImage(settings({ imageUrl: null }, DARK)), 'https://shop.test/logo-dark.png', 'only a dark version, on a dark theme')
  assert.equal(logoImage(settings({ imageUrl: null }, LIGHT)), null, 'the wordmark')
  assert.equal(logoImage(null), null)
})

test("the footer and the phone menu scale the store's logo height", () => {
  // The default height keeps the sizes they had: 26 in the footer, 20 in the menu.
  assert.equal(logoHeight({ height: 22 }, { scale: 1.2 }), 26)
  assert.equal(logoHeight({ height: 22 }, { scale: 0.9 }), 20)
  assert.equal(logoHeight({ height: 40 }, { scale: 1.2, max: 72 }), 48, 'a taller logo is taller in the footer too')
  assert.equal(logoHeight({ height: 60 }, { scale: 0.9, max: 40 }), 40, 'and stays inside the menu bar')
  assert.equal(logoHeight({}), DEFAULT_LOGO_HEIGHT)
  assert.equal(logoHeight({ height: 'x' }, { scale: -1 }), DEFAULT_LOGO_HEIGHT)
  assert.equal(logoHeight(null, { scale: 1.2 }), 31)
})
