import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const profile = mkdtempSync(join(tmpdir(), 'fampilot-first-use-'))
const debuggingPort = 9400 + Math.floor(Math.random() * 400)
const browser = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debuggingPort}`, `--user-data-dir=${profile}`, 'http://localhost:5174/'], { stdio: 'ignore' })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

let socket
let sequence = 0
const pending = new Map()
async function connect() {
  let target
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { target = (await (await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)).json()).find(item => item.type === 'page' && item.url.includes('localhost:5174')) }
    catch { /* browser is still starting */ }
    if (target) break
    await sleep(100)
  }
  assert.ok(target, 'Edge did not expose the FamPilot page')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    message.error ? reject(new Error(message.error.message)) : resolve(message.result)
  }
}
function command(method, params = {}) {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
async function waitFor(expression, label) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await evaluate(expression)) return
    await sleep(100)
  }
  assert.fail(`Timed out waiting for ${label}`)
}
const click = text => evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(item => item.textContent.trim().includes(${JSON.stringify(text)})); if (!el) return false; el.click(); return true })()`)
const setInput = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true })); return true })()`)
const bodyHas = text => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`)
const stored = () => evaluate(`JSON.parse(localStorage.getItem('fampilot-production-v1:data'))`)

try {
  await connect()
  await command('Page.enable')
  await command('Runtime.enable')
  await waitFor('document.readyState === "complete"', 'initial page')
  await evaluate('localStorage.clear(); location.reload()')
  await waitFor('document.body.innerText.includes("המשפחה שלך")', 'landing')

  assert.equal(await click('התחלה'), true)
  await waitFor('document.body.innerText.includes("נתחיל בהיכרות קצרה")', 'onboarding step 1')
  assert.equal(await setInput('input[placeholder="איך קוראים לך?"]', 'נועה'), true)
  assert.equal(await setInput('.onboarding-form-grid select', 'אם'), true)
  assert.equal(await setInput('.onboarding-form-grid input[type="date"]', '1990-05-12'), true)
  assert.equal(await click('המשך'), true)

  await waitFor('document.body.innerText.includes("מי במשפחה שלך")', 'onboarding step 2')
  assert.equal(await setInput('input[placeholder="למשל, משפחת לוי"]', 'משפחת בדיקה'), true)
  assert.equal(await click('לסיכום'), true)
  await waitFor('document.body.innerText.includes("הכול מוכן להתחלה")', 'onboarding step 3')
  assert.equal(await click('כניסה ל־FamPilot'), true)
  await waitFor('document.body.innerText.includes("התוכנית המשפחתית עדיין פנויה")', 'empty Home')

  let data = await stored()
  assert.equal(data.families.length, 1)
  assert.equal(data.families[0].people[0].name, 'נועה')
  assert.deepEqual([data.events.length, data.tasks.length, data.activity.length, data.transportationRequests.length, data.integrationLogs.length], [0, 0, 0, 0, 0])
  assert.ok(data.families[0].people[0].personalSettings.integrations.every(item => item.connectionStatus === 'disconnected'))
  assert.equal(await bodyHas('משפחת אברהמי'), false)

  assert.equal(await click('הוספת אירוע'), true)
  await waitFor('document.body.innerText.includes("אירוע חדש")', 'event dialog')
  assert.equal(await setInput('input[placeholder="למשל, חוג שחייה"]', 'ארוחת ערב משפחתית'), true)
  assert.equal(await click('שמירה'), true)
  await waitFor('document.body.innerText.includes("ארוחת ערב משפחתית")', 'event on Home')
  data = await stored()
  assert.equal(data.events.length, 1)
  assert.equal(data.tasks.length, 0)
  assert.equal(await bodyHas('התוכנית המשפחתית עדיין פנויה'), false)
  assert.equal(await bodyHas('הכול שקט כרגע'), true)

  assert.equal(await click('יומן'), true)
  await waitFor('document.querySelector(".calendar-v2") !== null', 'Calendar')
  assert.equal(await bodyHas('ארוחת ערב משפחתית'), true)
  assert.equal(await bodyHas('עדיין אין אירועים'), false)

  assert.equal(await click('בית'), true)
  assert.equal(await click('הוספת משימה'), true)
  await waitFor('document.body.innerText.includes("משימה חדשה")', 'task dialog')
  assert.equal(await setInput('input[placeholder="מה צריך לעשות?"]', 'לקנות חלב'), true)
  assert.equal(await click('שמירה'), true)
  await waitFor('document.body.innerText.includes("לקנות חלב")', 'task on Home')
  data = await stored()
  assert.equal(data.tasks.length, 1)

  assert.equal(await click('משימות'), true)
  await waitFor('document.querySelector(".tasks-v2") !== null', 'Tasks')
  assert.equal(await bodyHas('לקנות חלב'), true)
  assert.equal(await bodyHas('אין משימות פתוחות'), false)

  await command('Page.reload', { ignoreCache: true })
  await waitFor('document.querySelector(".app-shell") !== null', 'reload')
  data = await stored()
  assert.equal(data.families[0].name, 'משפחת בדיקה')
  assert.equal(data.events[0].title, 'ארוחת ערב משפחתית')
  assert.equal(data.tasks[0].title, 'לקנות חלב')
  assert.equal(await bodyHas('לקנות חלב'), true)
  console.log('first-use integration: onboarding, empty states, event, task and reload persistence passed')
} finally {
  if (socket?.readyState === WebSocket.OPEN) await command('Browser.close').catch(() => {})
  socket?.close()
  browser.kill()
  if (browser.exitCode === null) await Promise.race([once(browser, 'exit'), sleep(2_000)])
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { rmSync(profile, { recursive: true, force: true }); break }
    catch { if (attempt < 4) await sleep(250) }
  }
}
