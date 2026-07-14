import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import {
  addSessionEvent,
  completeSession,
  createSession,
  database,
  getElementSequence,
  getSession,
  getSummary,
  listSessionEvents,
  listSessions,
  setInitialElements,
} from './database.js'

const app = express()
const port = Number(process.env.PORT) || 8080
const adminToken = process.env.ADMIN_TOKEN || ''
const idPattern = /^[a-zA-Z0-9-]{8,80}$/
const portraitStyles = new Map([
  ['albert-einstein', new Set(['vector-lines', 'abstract'])],
  ['barack-obama', new Set(['vector-lines', 'abstract'])],
  ['cristiano-ronaldo', new Set(['vector-lines', 'abstract'])],
  ['elvis-presley', new Set(['vector-lines', 'abstract'])],
  ['john-lennon', new Set(['vector-lines'])],
  ['lionel-messi', new Set(['vector-lines', 'abstract'])],
  ['marilyn-monroe', new Set(['abstract'])],
  ['tom-hanks', new Set(['abstract'])],
])
const modes = new Set(['one', 'two', 'four', 'progressive'])
const activityEvents = new Set(['clue_refreshed', 'settings_opened', 'mode_changed', 'style_opened', 'style_changed'])

app.disable('x-powered-by')
app.use(express.json({ limit: '16kb' }))

function isValidId(value) {
  return typeof value === 'string' && idPattern.test(value)
}

function isValidElementIndices(value) {
  return Array.isArray(value)
    && value.length <= 100
    && new Set(value).size === value.length
    && value.every((index) => Number.isInteger(index) && index >= 0 && index < 100)
}

function isAuthorized(request) {
  if (!adminToken) return false
  const suppliedToken = request.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  const expected = Buffer.from(adminToken)
  const supplied = Buffer.from(suppliedToken)
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied)
}

function requireAdmin(request, response, next) {
  if (!adminToken) {
    return response.status(503).json({ error: 'Admin reporting is disabled until ADMIN_TOKEN is configured.' })
  }
  if (!isAuthorized(request)) return response.status(401).json({ error: 'Unauthorized' })
  return next()
}

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.post('/api/sessions', (request, response) => {
  const { sessionId, deviceId, portraitId, mode, style } = request.body || {}
  if (!isValidId(sessionId) || !isValidId(deviceId)) {
    return response.status(400).json({ error: 'Invalid session or device ID.' })
  }
  if (!portraitStyles.get(portraitId)?.has(style) || !modes.has(mode)) {
    return response.status(400).json({ error: 'Invalid portrait, style, or mode.' })
  }

  const created = createSession({
    sessionId,
    deviceId,
    portraitId,
    mode,
    style,
    userAgent: request.get('user-agent')?.slice(0, 500) || null,
  })
  return response.status(created ? 201 : 200).json({ sessionId })
})

app.post('/api/sessions/:sessionId/events', (request, response) => {
  const { sessionId } = request.params
  const { eventType, metadata } = request.body || {}
  if (!isValidId(sessionId) || !activityEvents.has(eventType)) {
    return response.status(400).json({ error: 'Invalid session ID or event type.' })
  }
  if (metadata !== undefined && (typeof metadata !== 'object' || Array.isArray(metadata))) {
    return response.status(400).json({ error: 'Event metadata must be an object.' })
  }
  if (eventType === 'clue_refreshed' && !isValidElementIndices(metadata?.visibleElementIndices)) {
    return response.status(400).json({ error: 'Refresh events require valid element indices.' })
  }

  const recorded = addSessionEvent({ sessionId, eventType, metadata })
  if (!recorded) return response.status(404).json({ error: 'Active session not found.' })
  return response.status(201).json({ recorded: true })
})

app.put('/api/sessions/:sessionId/initial-elements', (request, response) => {
  const { sessionId } = request.params
  const { visibleElementIndices } = request.body || {}

  if (!isValidId(sessionId) || !isValidElementIndices(visibleElementIndices)) {
    return response.status(400).json({ error: 'Invalid session ID or element indices.' })
  }

  const recorded = setInitialElements(sessionId, visibleElementIndices)
  if (!recorded) return response.status(404).json({ error: 'Active session not found.' })
  return response.json({ recorded: true })
})

app.post('/api/sessions/:sessionId/complete', (request, response) => {
  const { sessionId } = request.params
  const { outcome, submittedAnswer, visibleElements } = request.body || {}
  if (!isValidId(sessionId) || !['correct', 'incorrect'].includes(outcome)) {
    return response.status(400).json({ error: 'Invalid session ID or outcome.' })
  }
  if (typeof submittedAnswer !== 'string' || submittedAnswer.length > 200) {
    return response.status(400).json({ error: 'Invalid submitted answer.' })
  }

  const completed = completeSession({
    sessionId,
    outcome,
    submittedAnswer: submittedAnswer.trim(),
    metadata: {
      visibleElements: Number.isInteger(visibleElements) ? visibleElements : null,
    },
  })
  if (!completed) return response.status(404).json({ error: 'Active session not found.' })
  return response.json({ session: getSession(sessionId) })
})

app.get('/api/admin/summary', requireAdmin, (_request, response) => {
  response.json({ summary: getSummary() })
})

app.get('/api/admin/sessions', requireAdmin, (request, response) => {
  const requestedLimit = Number.parseInt(request.query.limit, 10)
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100
  const sessions = listSessions(limit).map((session) => ({
    ...session,
    elementSequence: getElementSequence(session.sessionId),
  }))
  response.json({ sessions })
})

app.get('/api/admin/sessions/:sessionId/events', requireAdmin, (request, response) => {
  if (!isValidId(request.params.sessionId)) {
    return response.status(400).json({ error: 'Invalid session ID.' })
  }
  return response.json({ events: listSessionEvents(request.params.sessionId) })
})

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const distDirectory = path.resolve(currentDirectory, '../dist')
app.use(express.static(distDirectory, { index: false, maxAge: '1h' }))

app.use((request, response, next) => {
  if (request.method === 'GET' && request.accepts('html') && !request.path.startsWith('/api/')) {
    return response.sendFile(path.join(distDirectory, 'index.html'))
  }
  return next()
})

app.use((_request, response) => {
  response.status(404).json({ error: 'Not found' })
})

app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({ error: 'Internal server error' })
})

const server = app.listen(port, () => {
  console.log(`Face by Pieces server listening on http://localhost:${port}`)
})

function shutdown() {
  server.close(() => {
    database.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
