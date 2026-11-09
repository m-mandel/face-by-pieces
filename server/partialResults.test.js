import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import Database from 'better-sqlite3'

test('inaccurate results and photo recognition survive migration, reporting and restart', { timeout: 30000 }, async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'face-partial-test-'))
  let server
  const stopServer = async () => {
    if (!server || server.exitCode !== null) return
    const exited = once(server, 'exit')
    server.kill('SIGTERM')
    await exited
  }
  t.after(async () => {
    await stopServer()
    await rm(directory, { recursive: true, force: true })
  })

  // An existing installation has a binary CHECK constraint and no partial flag.
  const filename = path.join(directory, 'game-activity.sqlite')
  const legacy = new Database(filename)
  legacy.exec(`
    CREATE TABLE devices (
      device_id TEXT PRIMARY KEY, first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL, user_agent TEXT
    );
    CREATE TABLE sessions (
      session_id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(device_id),
      portrait_id TEXT NOT NULL, mode TEXT NOT NULL, style TEXT NOT NULL DEFAULT 'vector-lines',
      started_at TEXT NOT NULL, completed_at TEXT,
      outcome TEXT CHECK (outcome IN ('correct', 'incorrect')), submitted_answer TEXT,
      refresh_count INTEGER NOT NULL DEFAULT 0, step_count INTEGER NOT NULL DEFAULT 0,
      initial_elements_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      event_type TEXT NOT NULL, event_at TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    INSERT INTO devices VALUES ('old-device', '2026-01-01', '2026-01-01', 'test browser');
    INSERT INTO sessions (session_id, device_id, portrait_id, mode, started_at, completed_at, outcome, submitted_answer, step_count)
      VALUES ('old-correct', 'old-device', 'albert-einstein', 'progressive', '2026-01-01', '2026-01-01', 'correct', 'Einstein', 1),
             ('old-incorrect', 'old-device', 'albert-einstein', 'progressive', '2026-01-01', '2026-01-01', 'incorrect', 'someone else', 1),
             ('old-pending', 'old-device', 'albert-einstein', 'progressive', '2026-01-01', NULL, NULL, NULL, 0);
    INSERT INTO events (session_id, event_type, event_at, metadata_json)
      VALUES ('old-correct', 'guess_submitted', '2026-01-01', '{"outcome":"correct"}');
  `)
  const originalRows = legacy.prepare('SELECT * FROM sessions ORDER BY session_id').all()
  const originalEvents = legacy.prepare('SELECT * FROM events').all()
  legacy.close()

  const env = { ...process.env, DATA_DIR: directory, ADMIN_TOKEN: 'test-admin-token' }
  let baseUrl
  const startServer = async () => {
    const reservation = net.createServer()
    reservation.listen(0, '127.0.0.1')
    await once(reservation, 'listening')
    const port = reservation.address().port
    await new Promise((resolve) => reservation.close(resolve))
    baseUrl = `http://127.0.0.1:${port}`
    server = spawn(process.execPath, ['server/index.js'], { env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
    await new Promise((resolve, reject) => {
      let output = ''
      server.stdout.on('data', (chunk) => {
        output += chunk
        if (output.includes('server listening')) resolve()
      })
      server.stderr.on('data', (chunk) => { output += chunk })
      server.once('error', reject)
      server.once('exit', (code) => reject(new Error(`Server exited (${code}): ${output}`)))
    })
  }
  const api = async (pathname, body, expectedStatus = 200) => {
    const response = await fetch(`${baseUrl}/api/${pathname}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-admin-token' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await response.json()
    assert.equal(response.status, expectedStatus, JSON.stringify(data))
    return data
  }
  await startServer()

  for (const outcome of ['correct', 'inaccurate', 'incorrect']) {
    const sessionId = `new-${outcome}-session`
    await api('sessions', { sessionId, deviceId: 'new-device', portraitId: 'novak-djokovic', mode: 'progressive', style: 'line-art' }, 201)
    await api(`sessions/${sessionId}/events`, { eventType: 'clue_refreshed', metadata: { visibleElementIndices: [0, 1] } }, 201)
    const submittedAnswer = outcome === 'inaccurate' ? 'Jokoviz' : outcome === 'correct' ? 'Djokovic' : 'wrong answer'
    const { session } = await api(`sessions/${sessionId}/complete`, { outcome, submittedAnswer, visibleElements: 2 })
    assert.equal(session.outcome, outcome)
    assert.equal(session.submittedAnswer, submittedAnswer)
    assert.equal(session.stepCount, 2)
    await api(`sessions/${sessionId}/complete`, { outcome: 'correct', submittedAnswer: 'Djokovic' }, 404)
    const { events } = await api(`admin/sessions/${sessionId}/events`)
    assert.equal(events.filter(({ eventType }) => eventType === 'guess_submitted').length, 1)
    assert.equal(events.at(-1).metadata.outcome, outcome)
  }
  for (const recognized of [true, false, null]) {
    const sessionId = `photo-${recognized}-session`
    await api('sessions', { sessionId, deviceId: 'new-device', portraitId: 'novak-djokovic', mode: 'progressive', style: 'line-art' }, 201)
    await api(`sessions/${sessionId}/events`, { eventType: 'photo_requested', metadata: { available: true } }, 201)
    await api(`sessions/${sessionId}/complete`, { outcome: 'incorrect', submittedAnswer: '', photoRecognized: 'yes' }, 400)
    const { session } = await api(`sessions/${sessionId}/complete`, { outcome: 'incorrect', submittedAnswer: '', photoRecognized: recognized })
    assert.equal(session.photoRecognized, recognized)
    assert.equal(session.submittedAnswer, '', 'skipped photos retain an empty answer, distinct from a submitted wrong name')
    assert.equal(session.answeredFromPhoto, false)
    assert.equal(session.outcome, 'incorrect', 'recognizing the photo does not change the skipped answer')
    assert.equal(session.photoOutcome, recognized === null ? null : 'incorrect')
    assert.equal(session.resultCategory, recognized === null ? null : 'incorrect sketch-incorrect photo')
    const { events } = await api(`admin/sessions/${sessionId}/events`)
    assert.equal(events.at(-1).metadata.photoRecognized, recognized)
  }
  for (const version of ['old', 'new']) {
    for (const [photoOutcome, submittedAnswer] of [['correct', 'Djokovic'], ['inaccurate', 'Jokoviz'], ['incorrect', 'someone else']]) {
      const sessionId = `photo-guess-${version}-${photoOutcome}`
      await api('sessions', { sessionId, deviceId: 'new-device', portraitId: 'novak-djokovic', mode: 'progressive', style: 'line-art' }, 201)
      await api(`sessions/${sessionId}/complete`, { outcome: 'incorrect', submittedAnswer, photoRecognized: true, photoOutcome: 'unknown' }, 400)
      const { session } = await api(`sessions/${sessionId}/complete`, {
        outcome: version === 'old' ? photoOutcome : 'incorrect', submittedAnswer, photoRecognized: true,
        ...(version === 'new' && { photoOutcome }),
      })
      assert.equal(session.outcome, 'incorrect')
      assert.equal(session.photoOutcome, photoOutcome)
      assert.equal(session.resultCategory, photoOutcome === 'correct' ? 'incorrect sketch-correct photo' : 'incorrect sketch-incorrect photo')
      assert.equal(session.answeredFromPhoto, true)
      assert.equal(session.submittedAnswer, submittedAnswer)
      const { events } = await api(`admin/sessions/${sessionId}/events`)
      assert.equal(events.at(-1).metadata.outcome, 'incorrect')
      assert.equal(events.at(-1).metadata.photoOutcome, photoOutcome)
      assert.equal(events.at(-1).metadata.resultCategory, session.resultCategory)
      await api(`sessions/${sessionId}/complete`, { outcome: 'correct', submittedAnswer: 'Djokovic' }, 404)
    }
  }
  // A browser with the previous bundle may still send the old outcome name.
  await api('sessions', { sessionId: 'cached-client-session', deviceId: 'new-device', portraitId: 'novak-djokovic', mode: 'progressive', style: 'line-art' }, 201)
  assert.equal((await api('sessions/cached-client-session/complete', { outcome: 'partial', submittedAnswer: 'Jokoviz' })).session.outcome, 'inaccurate')
  await api('sessions/new-inaccurate-session/complete', { outcome: 'unsupported', submittedAnswer: 'Jokoviz' }, 400)
  const { summary } = await api('admin/summary')
  assert.deepEqual(summary, {
    totalSessions: 16, completedSessions: 15, distinctDevices: 2,
    averageSteps: 1.2, correctSessions: 2, inaccurateSessions: 2, incorrectSessions: 11,
    incorrectSketchCorrectPhotoSessions: 2, incorrectSketchIncorrectPhotoSessions: 6,
  })
  const { sessions } = await api('admin/sessions')
  assert.equal(sessions.find(({ sessionId }) => sessionId === 'old-pending').outcome, null)
  assert.equal(sessions.find(({ sessionId }) => sessionId === 'new-inaccurate-session').outcome, 'inaccurate')
  const { stdout } = await promisify(execFile)(process.execPath, ['server/report.js'], { env })
  assert.match(stdout, /inaccurate/)
  assert.match(stdout, /inaccurateSessions/)
  assert.match(stdout, /Jokoviz/)
  assert.match(stdout, /recognizedPhoto/)
  assert.match(stdout, /incorrect sketch-correct photo/)
  assert.match(stdout, /incorrect sketch-incorrect photo/)
  await stopServer()

  const migrated = new Database(filename)
  try {
    const oldRows = migrated.prepare("SELECT * FROM sessions WHERE session_id LIKE 'old-%' ORDER BY session_id").all()
    assert.deepEqual(oldRows.map(({ partial_match, photo_recognized, photo_outcome, result_category, ...row }) => {
      assert.equal(partial_match, 0)
      assert.equal(photo_recognized, null)
      assert.equal(photo_outcome, null)
      assert.equal(result_category, null)
      return row
    }), originalRows, 'historical results are untouched')
    assert.deepEqual(migrated.prepare("SELECT * FROM events WHERE session_id LIKE 'old-%'").all(), originalEvents)
    assert.deepEqual(migrated.pragma('foreign_key_check'), [])
    // Simulate already recorded photo rounds from the previous release.
    // Startup must preserve the original photo grade while fixing the sketch score.
    migrated.exec(`
      UPDATE sessions SET photo_outcome = NULL, result_category = NULL,
        outcome = CASE WHEN session_id = 'photo-guess-old-correct' THEN 'correct' ELSE 'incorrect' END,
        partial_match = CASE WHEN session_id = 'photo-guess-old-inaccurate' THEN 1 ELSE 0 END
      WHERE session_id LIKE 'photo-guess-old-%' OR session_id = 'photo-false-session';
    `)
  } finally {
    migrated.close()
  }
  await startServer()
  assert.deepEqual((await api('admin/summary')).summary, summary, 'migration is safe to run again and partial results persist')
  const persisted = (await api('admin/sessions')).sessions
  for (const recognized of [true, false, null]) {
    assert.equal(persisted.find(({ sessionId }) => sessionId === `photo-${recognized}-session`).photoRecognized, recognized)
  }
  for (const photoOutcome of ['correct', 'inaccurate', 'incorrect']) {
    const session = persisted.find(({ sessionId }) => sessionId === `photo-guess-old-${photoOutcome}`)
    assert.equal(session.outcome, 'incorrect')
    assert.equal(session.photoOutcome, photoOutcome)
    assert.equal(session.resultCategory, photoOutcome === 'correct' ? 'incorrect sketch-correct photo' : 'incorrect sketch-incorrect photo')
  }
  await stopServer()
  await startServer()
  assert.deepEqual((await api('admin/summary')).summary, summary, 'restarting again does not overwrite photo grades')
})
