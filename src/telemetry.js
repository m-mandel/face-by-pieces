const DEVICE_STORAGE_KEY = 'face-by-pieces-device-id'

function createId() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

export function getOrCreateDeviceId() {
  const existingId = localStorage.getItem(DEVICE_STORAGE_KEY)
  if (existingId) return existingId

  const deviceId = createId()
  localStorage.setItem(DEVICE_STORAGE_KEY, deviceId)
  return deviceId
}

export function createSessionId() {
  return createId()
}

let requestQueue = Promise.resolve()

function queueRequest(url, options) {
  requestQueue = requestQueue
    .then(() => fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      keepalive: true,
    }))
    .then((response) => {
      if (!response.ok) throw new Error(`Activity request failed with ${response.status}`)
      return response
    })
    .catch(() => null)

  return requestQueue
}

export function startGameSession({ sessionId, deviceId, portraitId, mode }) {
  return queueRequest('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ sessionId, deviceId, portraitId, mode }),
  })
}

export function recordSessionEvent(sessionId, eventType, metadata = {}) {
  return queueRequest(`/api/sessions/${encodeURIComponent(sessionId)}/events`, {
    method: 'POST',
    body: JSON.stringify({ eventType, metadata }),
  })
}

export function recordInitialElements(sessionId, visibleElementIndices) {
  return queueRequest(`/api/sessions/${encodeURIComponent(sessionId)}/initial-elements`, {
    method: 'PUT',
    body: JSON.stringify({ visibleElementIndices }),
  })
}

export function completeGameSession(sessionId, details) {
  return queueRequest(`/api/sessions/${encodeURIComponent(sessionId)}/complete`, {
    method: 'POST',
    body: JSON.stringify(details),
  })
}
