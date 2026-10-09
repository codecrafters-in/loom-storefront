import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

/*
 * Odoo's portal fixes the tax ID and an address's country once orders or invoices were issued (`can_edit_vat`,
 * `_can_edit_country`); the API says so with `vatLocked` and `countryLocked`, and the forms show them read-only.
 * Node cannot mount the pages, so this reads them.
 */
const account = fs.readFileSync(new URL('../src/pages/Account.jsx', import.meta.url), 'utf8')
const checkout = fs.readFileSync(new URL('../src/pages/Checkout.jsx', import.meta.url), 'utf8')

test('the account shows a locked tax ID read-only, and says why', () => {
  assert.match(account, /id="vat"[^\n]*readOnly=\{customer\.vatLocked\}/)
  assert.match(account, /customer\.vatLocked && <p id="vat-locked"/)
})

test('an address whose country is locked cannot pick another', () => {
  assert.match(account, /disabled=\{editing\.countryLocked\}/)
  assert.match(account, /editing\.countryLocked && <p id="country-locked"/)
})

test('checkout does not offer to change a locked tax ID', () => {
  assert.match(checkout, /value=\{business\.vat\}\s+readOnly=\{customer\?\.vatLocked\}/)
})
