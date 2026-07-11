import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const dataDirectory = path.resolve(process.env.DATA_DIR || './storage')
fs.mkdirSync(dataDirectory, { recursive: true })

const databasePath = path.join(dataDirectory, 'game-activity.sqlite')
export const database = new Database(databasePath)

database.pragma('journal_mode = WAL')
database.pragma('foreign_keys = ON')

database.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    user_agent TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(device_id),
    portrait_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    style TEXT NOT NULL DEFAULT 'vector-lines',
    started_at TEXT NOT NULL,
    completed_at TEXT,
    outcome TEXT CHECK (outcome IN ('correct', 'incorrect')),
    submitted_answer TEXT,
    refresh_count INTEGER NOT NULL DEFAULT 0,
    step_count INTEGER NOT NULL DEFAULT 0,
    initial_elements_json TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_at TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS sessions_device_id_idx ON sessions(device_id);
  CREATE INDEX IF NOT EXISTS sessions_started_at_idx ON sessions(started_at DESC);
  CREATE INDEX IF NOT EXISTS events_session_id_idx ON events(session_id);
`)

const sessionColumns = database.prepare('PRAGMA table_info(sessions)').all()
if (!sessionColumns.some((column) => column.name === 'initial_elements_json')) {
  database.exec("ALTER TABLE sessions ADD COLUMN initial_elements_json TEXT NOT NULL DEFAULT '[]'")
}
if (!sessionColumns.some((column) => column.name === 'style')) {
  database.exec("ALTER TABLE sessions ADD COLUMN style TEXT NOT NULL DEFAULT 'vector-lines'")
}

const now = () => new Date().toISOString()

const insertDevice = database.prepare(`
  INSERT INTO devices (device_id, first_seen_at, last_seen_at, user_agent)
  VALUES (@deviceId, @timestamp, @timestamp, @userAgent)
  ON CONFLICT(device_id) DO UPDATE SET
    last_seen_at = excluded.last_seen_at,
    user_agent = COALESCE(excluded.user_agent, devices.user_agent)
`)

const insertSession = database.prepare(`
  INSERT INTO sessions (session_id, device_id, portrait_id, mode, style, started_at)
  VALUES (@sessionId, @deviceId, @portraitId, @mode, @style, @timestamp)
  ON CONFLICT(session_id) DO NOTHING
`)

const insertEvent = database.prepare(`
  INSERT INTO events (session_id, event_type, event_at, metadata_json)
  VALUES (@sessionId, @eventType, @timestamp, @metadataJson)
`)

const touchSessionDevice = database.prepare(`
  UPDATE devices
  SET last_seen_at = @timestamp
  WHERE device_id = (SELECT device_id FROM sessions WHERE session_id = @sessionId)
`)

const incrementRefreshCount = database.prepare(`
  UPDATE sessions
  SET refresh_count = refresh_count + 1
  WHERE session_id = @sessionId AND completed_at IS NULL
`)

const updateInitialElements = database.prepare(`
  UPDATE sessions
  SET initial_elements_json = @elementsJson
  WHERE session_id = @sessionId AND completed_at IS NULL
`)

const finishSession = database.prepare(`
  UPDATE sessions
  SET
    completed_at = @timestamp,
    outcome = @outcome,
    submitted_answer = @submittedAnswer,
    step_count = refresh_count + 1
  WHERE session_id = @sessionId AND completed_at IS NULL
`)

export const createSession = database.transaction((session) => {
  const timestamp = now()
  insertDevice.run({ ...session, timestamp })
  const result = insertSession.run({ ...session, timestamp })

  if (result.changes > 0) {
    insertEvent.run({
      sessionId: session.sessionId,
      eventType: 'session_started',
      timestamp,
      metadataJson: JSON.stringify({ portraitId: session.portraitId, mode: session.mode, style: session.style }),
    })
  }

  return result.changes > 0
})

export const addSessionEvent = database.transaction(({ sessionId, eventType, metadata }) => {
  const timestamp = now()

  if (eventType === 'clue_refreshed') {
    const refreshResult = incrementRefreshCount.run({ sessionId })
    if (refreshResult.changes === 0) return false
  } else {
    const sessionExists = database
      .prepare('SELECT 1 FROM sessions WHERE session_id = ? AND completed_at IS NULL')
      .get(sessionId)
    if (!sessionExists) return false
  }

  insertEvent.run({
    sessionId,
    eventType,
    timestamp,
    metadataJson: JSON.stringify(metadata || {}),
  })
  touchSessionDevice.run({ sessionId, timestamp })
  return true
})

export function setInitialElements(sessionId, elementIndices) {
  return updateInitialElements.run({
    sessionId,
    elementsJson: JSON.stringify(elementIndices),
  }).changes > 0
}

export const completeSession = database.transaction(({ sessionId, outcome, submittedAnswer, metadata }) => {
  const timestamp = now()
  const result = finishSession.run({ sessionId, outcome, submittedAnswer, timestamp })
  if (result.changes === 0) return false

  insertEvent.run({
    sessionId,
    eventType: 'guess_submitted',
    timestamp,
    metadataJson: JSON.stringify({ ...metadata, outcome }),
  })
  touchSessionDevice.run({ sessionId, timestamp })
  return true
})

export function getSession(sessionId) {
  return database.prepare(`
    SELECT
      session_id AS sessionId,
      device_id AS deviceId,
      portrait_id AS portraitId,
      mode,
      style,
      started_at AS startedAt,
      completed_at AS completedAt,
      outcome,
      submitted_answer AS submittedAnswer,
      refresh_count AS refreshCount,
      step_count AS stepCount
    FROM sessions
    WHERE session_id = ?
  `).get(sessionId)
}

export function getSummary() {
  return database.prepare(`
    SELECT
      COUNT(*) AS totalSessions,
      COUNT(completed_at) AS completedSessions,
      COUNT(DISTINCT device_id) AS distinctDevices,
      COALESCE(ROUND(AVG(CASE WHEN completed_at IS NOT NULL THEN step_count END), 2), 0) AS averageSteps,
      COALESCE(SUM(CASE WHEN outcome = 'correct' THEN 1 ELSE 0 END), 0) AS correctSessions,
      COALESCE(SUM(CASE WHEN outcome = 'incorrect' THEN 1 ELSE 0 END), 0) AS incorrectSessions
    FROM sessions
  `).get()
}

export function listSessions(limit = 100) {
  return database.prepare(`
    SELECT
      s.session_id AS sessionId,
      s.device_id AS deviceId,
      s.portrait_id AS portraitId,
      s.mode,
      s.style,
      s.started_at AS startedAt,
      s.completed_at AS completedAt,
      s.outcome,
      s.submitted_answer AS submittedAnswer,
      s.refresh_count AS refreshCount,
      s.step_count AS stepCount,
      d.first_seen_at AS deviceFirstSeenAt,
      d.last_seen_at AS deviceLastSeenAt,
      d.user_agent AS userAgent,
      COUNT(*) OVER (PARTITION BY s.device_id) AS sessionsOnDevice
    FROM sessions s
    JOIN devices d ON d.device_id = s.device_id
    ORDER BY s.started_at DESC
    LIMIT ?
  `).all(limit)
}

export function listSessionEvents(sessionId) {
  return database.prepare(`
    SELECT
      event_id AS eventId,
      event_type AS eventType,
      event_at AS eventAt,
      metadata_json AS metadataJson
    FROM events
    WHERE session_id = ?
    ORDER BY event_id
  `).all(sessionId).map((event) => ({
    ...event,
    metadata: JSON.parse(event.metadataJson),
    metadataJson: undefined,
  }))
}

export function getElementSequence(sessionId) {
  const session = database.prepare(`
    SELECT initial_elements_json AS initialElementsJson
    FROM sessions
    WHERE session_id = ?
  `).get(sessionId)

  if (!session) return null

  const refreshes = database.prepare(`
    SELECT metadata_json AS metadataJson
    FROM events
    WHERE session_id = ? AND event_type = 'clue_refreshed'
    ORDER BY event_id
  `).all(sessionId).map((event, index) => {
    const metadata = JSON.parse(event.metadataJson)
    return {
      refreshNumber: index + 1,
      visibleElementIndices: metadata.visibleElementIndices || [],
    }
  })

  return {
    initialElementIndices: JSON.parse(session.initialElementsJson),
    refreshes,
  }
}
