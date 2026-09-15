import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { baseFontsHref, fontsHref, themeColour, themeHead, themeVars } from '../src/lib/theme.js'
import { assemble, withoutReplacedHead } from '../server/handler.mjs'

/*
 * The store's look in the server-rendered head: favicon, colour bar and fonts.
 *
 * The favicon was set only by JavaScript after the page loaded, the colour bar was index.html's own, and every page
 * downloaded Fraunces and Inter whatever fonts the store used. "System font" for headings came out as Georgia.
 */

const TEMPLATE = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const LIGHT = { page: '#FAF8F5', ink: '#1A1815' }
const DARK = { page: '#121212', ink: '#F2F2F2' }

test('"System font" for headings is the system sans-serif, not a serif', () => {
  const vars = themeVars({ colors: LIGHT, fonts: { heading: 'system', body: 'system' } })
  assert.equal(vars['--font-display'], 'ui-sans-serif, system-ui, sans-serif')
  assert.equal(vars['--font-body'], vars['--font-display'])
  assert.match(themeVars({ colors: LIGHT, fonts: { heading: 'Lora' } })['--font-display'], /^"Lora", ui-serif/)
})

test("the head has the store's favicon as a PNG for tabs and home screens, and the colour bar in its page colour", () => {
  const head = themeHead({ colors: LIGHT, faviconUrl: 'https://odoo.test/web/image/loom.store/1/favicon' })
  assert.match(head, /<link rel="icon" href="https:\/\/odoo\.test\/web\/image\/loom\.store\/1\/favicon" type="image\/png">/)
  assert.match(head, /<link rel="apple-touch-icon" href="https:\/\/odoo\.test\/web\/image\/loom\.store\/1\/favicon">/)
  assert.doesNotMatch(head, /sizes=|svg/)
  assert.match(head, /<meta name="theme-color" content="#FAF8F5">/)
  assert.match(head, /<meta name="color-scheme" content="light">/)
  assert.match(themeHead({ colors: DARK }), /content="#121212">.*content="dark">/)
  assert.equal(themeColour({ colors: { page: 'faf8f5' } }), '#FAF8F5')
})

test('nothing to say writes nothing; icon addresses are http(s) or the site, and escaped', () => {
  assert.equal(themeHead(null), '')
  assert.equal(themeHead({ faviconUrl: 'javascript:alert(1)' }), '')
  assert.equal(themeHead({ faviconUrl: '//elsewhere.test/icon.png' }), '')
  assert.match(themeHead({ faviconUrl: '/icon.png?a=1&b="2"' }), /href="\/icon\.png\?a=1&amp;b=&quot;2&quot;"/)
})

test('the base stylesheet keeps Fraunces and Inter only while the theme uses them', () => {
  assert.equal(baseFontsHref(null), null, "no theme: index.html's fonts, which are the defaults")
  assert.equal(baseFontsHref({ colors: LIGHT, fonts: { heading: 'Fraunces', body: 'Inter' } }), null)
  const other = baseFontsHref({ colors: LIGHT, fonts: { heading: 'Lora', body: 'system' } })
  assert.doesNotMatch(other, /Fraunces|Inter/)
  assert.match(other, /family=JetBrains\+Mono/, 'the monospace labels are in every theme')
  const one = baseFontsHref({ colors: LIGHT, fonts: { heading: 'Fraunces', body: 'Work Sans' } })
  assert.match(one, /family=Fraunces/)
  assert.doesNotMatch(one, /family=Inter/)
  // In the browser, a family the base stylesheet no longer has is loaded by the theme's own stylesheet.
  assert.equal(fontsHref({ fonts: { heading: 'Fraunces' } }), null)
  assert.match(fontsHref({ fonts: { heading: 'Fraunces' } }, new Set(['Inter'])), /family=Fraunces/)
})

test("the template's icons, colour bar and base fonts give way to the store's", () => {
  const theme = { colors: DARK, fonts: { heading: 'Lora', body: 'system' }, faviconUrl: 'https://odoo.test/favicon.png' }
  const head = `<title>Shop</title>${themeHead(theme)}<link rel="stylesheet" id="loom-fonts" href="${baseFontsHref(theme)}" />`
  const html = assemble(TEMPLATE, { head, html: '<main>Shop</main>' })
  assert.equal(html.match(/rel="icon"/g).length, 1)
  assert.equal(html.match(/rel="apple-touch-icon"/g).length, 1)
  assert.doesNotMatch(html, /favicon\.svg|favicon-32\.png|apple-touch-icon\.png/)
  assert.equal(html.match(/name="theme-color"/g).length, 1)
  assert.match(html, /<meta name="theme-color" content="#121212">/)
  assert.equal(html.match(/name="color-scheme"/g).length, 1)
  assert.equal(html.match(/id="loom-fonts"/g).length, 1)
  assert.doesNotMatch(html, /family=Fraunces/)
  assert.match(html, /rel="manifest"/, 'the rest of the template stays')
})

test('a page without a theme keeps the template as it is', () => {
  assert.match(TEMPLATE, /<link rel="stylesheet" id="loom-fonts"/, 'index.html marks its font stylesheet')
  assert.equal(withoutReplacedHead(TEMPLATE, '<title>Shop</title>'), TEMPLATE)
})
