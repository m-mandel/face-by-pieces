import { database, getSummary, listSessions } from './database.js'

const summary = getSummary()
const sessions = listSessions(50).map((session) => ({
  started: session.startedAt,
  device: session.deviceId.slice(0, 8),
  deviceSessions: session.sessionsOnDevice,
  portrait: session.portraitId,
  mode: session.mode,
  response: session.submittedAnswer || '—',
  result: session.outcome || 'in progress',
  refreshes: session.refreshCount,
  steps: session.stepCount || '—',
}))

console.log('\nFace by Pieces activity summary')
console.table(summary)
console.log('\nMost recent sessions (device is a shortened pseudonymous ID)')
console.table(sessions)

database.close()
