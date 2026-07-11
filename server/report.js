import { database, getElementSequence, getSummary, listSessions } from './database.js'

function formatElements(elementIndices) {
  return `[${elementIndices.map((index) => `#${index + 1}`).join(', ')}]`
}

function formatSequence(sessionId, style) {
  const sequence = getElementSequence(sessionId)
  if (!sequence) return '—'

  const displays = [style === 'abstract'
    ? 'Initial [base layers]'
    : `Initial ${formatElements(sequence.initialElementIndices)}`]
  sequence.refreshes.forEach((refresh) => {
    const elements = formatElements(refresh.visibleElementIndices)
    displays.push(style === 'abstract'
      ? `R${refresh.refreshNumber} [base + ${elements.slice(1)}`
      : `R${refresh.refreshNumber} ${elements}`)
  })
  return displays.join(' → ')
}

const summary = getSummary()
const sessions = listSessions(50).map((session) => ({
  started: session.startedAt,
  device: session.deviceId.slice(0, 8),
  deviceSessions: session.sessionsOnDevice,
  portrait: session.portraitId,
  style: session.style,
  mode: session.mode,
  response: session.submittedAnswer || '—',
  result: session.outcome || 'in progress',
  refreshes: session.refreshCount,
  steps: session.stepCount || '—',
  displayedElements: formatSequence(session.sessionId, session.style),
}))

console.log('\nFace by Pieces activity summary')
console.table(summary)
console.log('\nMost recent sessions (device is a shortened pseudonymous ID)')
console.table(sessions)

database.close()
