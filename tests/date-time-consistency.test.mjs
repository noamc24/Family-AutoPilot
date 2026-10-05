import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { existsSync, readFileSync } from 'node:fs'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const dates = await load('src/dateTime.ts')
const data = await load('src/data.ts')

test('date display and parsing are strict DD/MM/YYYY with ISO storage', () => {
  assert.equal(dates.formatDate('2026-10-05'), '05/10/2026')
  assert.equal(dates.parseDisplayDate('08/10/2026'), '2026-10-08')
  assert.equal(dates.parseDisplayDate('10/08/2026'), '2026-08-10')
  assert.equal(dates.parseDisplayDate('31/02/2026'), null)
  assert.equal(dates.parseDisplayDate('05/13/2026'), null)
  assert.equal(data.dateLabel('2026-10-07T20:00'), '07/10/2026 · 20:00')
})

test('time formatting stays padded and rejects impossible values', () => {
  assert.equal(dates.formatTime('08:05'), '08:05')
  assert.equal(dates.formatTime('24:05'), '')
  assert.equal(dates.formatTime('8:05'), '')
})

test('onboarding and member editors use controlled localized date entry', () => {
  const app = readFileSync('src/App.tsx', 'utf8')
  if (existsSync('src/components/FirstTimeExperience.tsx')) assert.match(readFileSync('src/components/FirstTimeExperience.tsx', 'utf8'), /<DateInput required max=\{localDate\(\)\}/)
  assert.match(app, /parseDisplayDate\(dateText\)/)
  assert.match(app, /validBirthDate\(birthDate\)/)
})

test('Presentation seed keeps shopping as Orel task and Mor submission at the requested deadline', () => {
  const shopping = data.initialData.tasks.find(task => task.title === 'קניות בסופר')
  const presentation = data.initialData.tasks.find(task => task.title === 'פרזנטציה של עבודה על FamPilot')
  assert.equal(data.initialData.events.some(event => event.title === 'קניות בסופר'), false)
  assert.equal(shopping?.ownerId, 'Orel')
  assert.equal(presentation?.ownerId, 'Mor')
  assert.equal(presentation?.due, '2026-10-07T20:00')
  assert.equal(data.dateLabel(presentation.due), '07/10/2026 · 20:00')
})
