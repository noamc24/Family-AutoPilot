import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const built = await build({
  stdin: { contents: `export { createGroqChatCompletion, GroqRequestError } from './server/lia/groqClient.ts'`, resolveDir: process.cwd(), sourcefile: 'lia-ai-reliability-entry.ts', loader: 'ts' },
  bundle: true, write: false, format: 'cjs', platform: 'node',
})
const module = { exports: {} }
new Function('module', 'exports', 'require', built.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url))
const { createGroqChatCompletion, GroqRequestError } = module.exports
const originalKey = process.env.GROQ_API_KEY
process.env.GROQ_API_KEY = 'test-key'

const success = () => new Response(JSON.stringify({ choices: [{ message: { content: 'תשובה תקינה' } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
const failure = (status, retryAfter) => new Response(JSON.stringify({ error: { message: 'safe provider detail', code: `code_${status}` } }), { status, headers: { 'content-type': 'application/json', ...(retryAfter ? { 'retry-after': retryAfter } : {}) } })

test.after(() => { if (originalKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = originalKey })

test('429 retries exactly once, respects a short Retry-After, and can recover', async () => {
  let calls = 0
  const delays = []
  const result = await createGroqChatCompletion([{ role: 'user', content: 'שלום' }], undefined, {
    fetchImpl: async () => ++calls === 1 ? failure(429, '1') : success(),
    sleep: async value => { delays.push(value) },
    phase: 'initial response',
  })
  assert.equal(result.content, 'תשובה תקינה')
  assert.equal(calls, 2)
  assert.deepEqual(delays, [1000])
})

test('a repeated 429 stops after one retry', async () => {
  let calls = 0
  await assert.rejects(() => createGroqChatCompletion([{ role: 'user', content: 'שלום' }], undefined, {
    fetchImpl: async () => { calls += 1; return failure(429) },
    sleep: async () => {},
  }), error => error instanceof GroqRequestError && error.status === 429)
  assert.equal(calls, 2)
})

test('400 is not retried and logs only safe diagnostics with the LIA phase', async () => {
  let calls = 0
  const logged = []
  const originalError = console.error
  console.error = (...args) => { logged.push(args) }
  try {
    await assert.rejects(() => createGroqChatCompletion([{ role: 'user', content: 'שלום' }], undefined, {
      fetchImpl: async () => { calls += 1; return failure(400) },
      sleep: async () => { throw new Error('400 must not sleep') },
      phase: 'proposal correction',
    }), error => error instanceof GroqRequestError && error.status === 400)
  } finally { console.error = originalError }
  assert.equal(calls, 1)
  assert.deepEqual(logged[0], ['Groq request rejected', { status: 400, code: 'code_400', message: 'safe provider detail', phase: 'proposal correction' }])
})
