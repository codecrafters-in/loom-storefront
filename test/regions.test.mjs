import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadApp } from './helpers/browser.mjs'

const { api } = await loadApp()

/*
 * The address forms show a state dropdown when `getCountry` lists states and a
 * text box otherwise. The demo adapter answers from a copy of Odoo's country
 * data, so both adapters hand the form the same shape and the same codes.
 */

test('a country with states lists them with the codes a backend validates', async () => {
  const india = await api.getCountry('in')
  assert.equal(india.code, 'IN')
  assert.equal(india.stateRequired, true)
  assert.ok(india.states.some((s) => s.code === 'GJ' && s.name === 'Gujarat'))

  const us = await api.getCountry('US')
  assert.ok(us.states.some((s) => s.code === 'NY'))
})

test('a country without states gets an empty list, so the form keeps a text box', async () => {
  const france = await api.getCountry('FR')
  assert.deepEqual(france.states, [])
  assert.equal(france.stateRequired, false)
})

test('an unknown country is a 404, which the form treats as "no list"', async () => {
  await assert.rejects(() => api.getCountry('ZZ'), (err) => err.status === 404 && err.code === 'not_found')
})
