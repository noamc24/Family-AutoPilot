import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const data = await load('src/data.ts')
const birthdays = await load('src/birthdays.ts')
const family = (birthDate) => ({ id: 'family', name: 'משפחה', people: [{ id: 'person', name: 'דנה', role: 'בת', color: 'sage', age: 0, birthDate, hasLicense: false, hasCar: false, availableForPickup: false }] })

test('תאריך לידה מלא מחשב גיל מדויק ואינו מקבל תאריך לא תקין או עתידי', () => {
  assert.equal(data.ageFromBirthDate('2000-09-29', '2026-09-22'), 25)
  assert.equal(data.ageFromBirthDate('2000-09-29', '2026-09-29'), 26)
  assert.equal(data.validBirthDate('2025-02-29', '2026-09-22'), false)
  assert.equal(data.validBirthDate('2027-01-01', '2026-09-22'), false)
})

test('תזכורת מתחילה בדיוק שבוע לפני יום ההולדת ומתגלגלת בין שנים', () => {
  assert.equal(birthdays.upcomingBirthdays(family('2000-09-29'), '2026-09-22')[0].daysUntil, 7)
  assert.deepEqual(birthdays.upcomingBirthdays(family('2000-09-30'), '2026-09-22'), [])
  assert.deepEqual(birthdays.upcomingBirthdays(family(undefined), '2026-09-22'), [])
  const reminder = birthdays.upcomingBirthdays(family('2000-01-02'), '2026-12-27')[0]
  assert.equal(reminder.date, '2027-01-02')
  assert.equal(reminder.daysUntil, 6)
  assert.equal(reminder.turningAge, 27)
})

test('יום הולדת ב־29 בפברואר מוצג ב־28 בפברואר בשנה שאינה מעוברת', () => {
  const reminder = birthdays.upcomingBirthdays(family('2000-02-29'), '2026-02-21')[0]
  assert.equal(reminder.date, '2026-02-28')
  assert.equal(reminder.daysUntil, 7)
  assert.equal(data.ageFromBirthDate('2000-02-29', '2026-02-28'), 26)
})
