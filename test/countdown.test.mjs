import { test } from 'node:test'
import assert from 'node:assert/strict'
import { endTime, pad, timeLeft } from '../src/lib/countdown.js'

/*
 * The home page's countdown band. The server renders the time left at its own clock and the browser counts it down;
 * both must agree on when the promotion ends, and nothing shows once it has.
 */

const now = Date.parse('2026-10-01T12:00:00Z')

test('days, hours, minutes and seconds left', () => {
  const left = timeLeft('2026-10-02T14:03:04Z', now)
  assert.deepEqual({ ...left, total: undefined }, { total: undefined, days: 1, hours: 2, minutes: 3, seconds: 4 })
  assert.equal(left.total, ((26 * 60 + 3) * 60 + 4) * 1000)
  assert.deepEqual(timeLeft('2026-10-01T12:00:59Z', now), { total: 59_000, days: 0, hours: 0, minutes: 0, seconds: 59 })
  assert.equal(timeLeft('2026-12-01T12:00:00Z', now).days, 61)
})

test('the last half second still counts as a second; at the end, and after it, there is nothing to show', () => {
  assert.deepEqual(timeLeft(now + 500, now), { total: 500, days: 0, hours: 0, minutes: 0, seconds: 1 })
  assert.equal(timeLeft(now + 1000, now).seconds, 1)
  assert.equal(timeLeft(now, now), null)
  assert.equal(timeLeft('2026-09-30T23:59:59Z', now), null)
})

test('a date-time without an offset is UTC on the server and in every browser; offsets are kept', () => {
  assert.equal(endTime('2026-10-01T18:00:00'), Date.parse('2026-10-01T18:00:00Z'))
  assert.equal(endTime('2026-10-01T18:00'), Date.parse('2026-10-01T18:00:00Z'))
  assert.equal(endTime('2026-10-01 18:00:00'), Date.parse('2026-10-01T18:00:00Z'), "Odoo's own format")
  assert.equal(endTime('2026-10-01T18:00:00+05:30'), Date.parse('2026-10-01T12:30:00Z'))
  assert.equal(endTime('2026-10-01T18:00:00.250Z'), Date.parse('2026-10-01T18:00:00.250Z'))
  assert.equal(endTime('2026-10-02'), Date.parse('2026-10-02T00:00:00Z'))
})

test('no date, or nonsense, never counts down', () => {
  for (const value of [undefined, null, '', '   ', 'next Friday', {}, [], NaN, Infinity, true]) {
    assert.equal(endTime(value), null, String(value))
    assert.equal(timeLeft(value, now), null, String(value))
  }
  assert.equal(timeLeft('2026-10-02T00:00:00Z', NaN), null)
})

test('numbers keep their width', () => {
  assert.equal(pad(7), '07')
  assert.equal(pad(0), '00')
  assert.equal(pad(42), '42')
  assert.equal(pad(120), '120')
  assert.equal(pad(undefined), '00')
})
