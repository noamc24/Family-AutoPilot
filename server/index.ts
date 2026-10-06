import 'dotenv/config'
import express from 'express'
import { askLIA } from './lia/liaService.js'
import { GroqConfigurationError, GroqRequestError } from './lia/groqClient.js'
import type { LiaReadContext } from '../src/liaReadContext.js'

const app = express()
const port = Number(process.env.PORT) || 3001

app.use(express.json({ limit: '16kb' }))

app.post('/api/lia/chat', async (request, response) => {
  const message = typeof request.body?.message === 'string' ? request.body.message.trim() : ''
  if (!message) {
    response.status(400).json({ error: 'Message is required' })
    return
  }

  try {
    const context = request.body?.context as LiaReadContext | undefined
    if (context && (!context.family || !Array.isArray(context.family.people) || !Array.isArray(context.events) || !Array.isArray(context.tasks) || !Array.isArray(context.transportationRequests) || typeof context.today !== 'string')) {
      response.status(400).json({ error: 'Invalid family context' })
      return
    }
    const { reply, toolTrace } = await askLIA(message, context)
    if (toolTrace.length) console.log('LIA read tools:', JSON.stringify(toolTrace))
    response.json({ reply })
  } catch (error) {
    if (error instanceof GroqConfigurationError) {
      console.error('LIA AI is not configured')
      response.status(503).json({ error: 'LIA AI is not configured' })
      return
    }
    if (error instanceof GroqRequestError) {
      console.error('Groq request failed:', error.message)
      response.status(502).json({ error: 'LIA AI is temporarily unavailable' })
      return
    }
    console.error('Unexpected LIA chat error')
    response.status(500).json({ error: 'Unexpected server error' })
  }
})

app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
  if (error instanceof SyntaxError) {
    response.status(400).json({ error: 'Request body must be valid JSON' })
    return
  }
  next(error)
})

app.listen(port, () => {
  console.log(`Family Autopilot API listening on http://localhost:${port}`)
})
