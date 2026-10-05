import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const result = await build({ entryPoints: ['src/dateTime.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const dates = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const normalize = (value, max = '2026-10-05') => dates.normalizeDateEntry(value, max)

test('numeric typing and paste create one DD/MM/YYYY mask without duplicate separators', () => {
  assert.equal(normalize('0').display, '0')
  assert.equal(normalize('05').display, '05/')
  assert.equal(normalize('0510').display, '05/10/')
  assert.equal(normalize('05101998').display, '05/10/1998')
  assert.equal(normalize('05///10//1998').display, '05/10/1998')
  assert.equal(normalize('a05b10c1998').display, '05/10/1998')
  assert.equal(normalize('05101998').iso, '1998-10-05')
})

test('day and month are clamped when their segment is complete', () => {
  assert.equal(normalize('00052000').display, '01/05/2000')
  assert.equal(normalize('05002000').display, '05/01/2000')
  assert.equal(normalize('05152000').display, '05/12/2000')
  assert.equal(normalize('45052000').display, '31/05/2000')
  assert.equal(normalize('31042000').display, '30/04/2000')
})

test('February waits for a complete year and then respects leap years', () => {
  assert.equal(normalize('3102').display, '31/02/')
  assert.equal(normalize('31022000').display, '29/02/2000')
  assert.equal(normalize('31022001').display, '28/02/2001')
})

test('future birth dates clamp only when complete', () => {
  assert.equal(normalize('2012202').display, '20/12/202')
  assert.equal(normalize('20122026').display, '05/10/2026')
  assert.equal(normalize('05102030').display, '05/10/2026')
})

test('backspace crosses an inserted separator and middle edits keep digit order', () => {
  const removed = dates.backspaceDateEntry('05/10/1998', 3, '2026-10-05')
  assert.ok(removed)
  assert.equal(removed.digitOffset, 1)
  assert.equal(removed.entry.display, '01/01/998')
  assert.equal(normalize('06/10/1998').display, '06/10/1998')
  assert.equal(dates.caretAfterDigits('05/10/1998', 2), 3)
  assert.equal(dates.caretAfterDigits('05/10/1998', 4), 6)
})

test('ISO display and persistence roundtrip stay canonical', () => {
  const entry = normalize('05101998')
  assert.equal(entry.iso, '1998-10-05')
  assert.equal(dates.formatDate(entry.iso), '05/10/1998')
  assert.equal(dates.parseDisplayDate(dates.formatDate(entry.iso)), entry.iso)
})

test('shared DateInput exposes year to month to day flow and back navigation', () => {
  const source = readFileSync('src/components/DateInput.tsx', 'utf8')
  assert.match(source, /setView\('month'\)/)
  assert.match(source, /setView\('day'\)/)
  assert.match(source, /onClick=\{\(\) => setView\('year'\)\}/)
  assert.match(source, /onClick=\{\(\) => setView\('month'\)\}/)
  assert.match(source, /onChange\(iso\)/)
  assert.match(source, /inputMode="numeric"/)
  assert.doesNotMatch(source, /type="date"/)
})
