import { useEffect, useMemo, useRef, useState } from 'react'
import albertEinsteinSvg from '../data/albert_einstein/sketch.svg?raw'
import barackObamaSvg from '../data/barack_obama/sketch.svg?raw'
import cristianoRonaldoSvg from '../data/christiano_ronaldo/sketch.svg?raw'
import elvisSvg from '../data/elvis/sketch.svg?raw'
import johnLennonSvg from '../data/john_lennon/sketch.svg?raw'
import lionelMessiSvg from '../data/lionel_messi/sketch.svg?raw'
import {
  completeGameSession,
  createSessionId,
  getOrCreateDeviceId,
  recordSessionEvent,
  startGameSession,
} from './telemetry'

const PORTRAITS = [
  {
    id: 'albert-einstein',
    name: 'Albert Einstein',
    aliases: ['Albert Einstein', 'Einstein'],
    svg: albertEinsteinSvg,
  },
  {
    id: 'barack-obama',
    name: 'Barack Obama',
    aliases: ['Barack Obama', 'Obama', 'President Obama'],
    svg: barackObamaSvg,
  },
  {
    id: 'cristiano-ronaldo',
    name: 'Cristiano Ronaldo',
    aliases: ['Cristiano Ronaldo', 'Christiano Ronaldo', 'Ronaldo', 'CR7'],
    svg: cristianoRonaldoSvg,
  },
  {
    id: 'elvis-presley',
    name: 'Elvis Presley',
    aliases: ['Elvis Presley', 'Elvis'],
    svg: elvisSvg,
  },
  {
    id: 'john-lennon',
    name: 'John Lennon',
    aliases: ['John Lennon', 'Lennon'],
    svg: johnLennonSvg,
  },
  {
    id: 'lionel-messi',
    name: 'Lionel Messi',
    aliases: ['Lionel Messi', 'Leo Messi', 'Messi'],
    svg: lionelMessiSvg,
  },
]

const MODES = [
  {
    id: 'one',
    label: '1 element',
    shortLabel: '1 clue',
    count: 1,
    description: 'Hard mode. One random piece at a time.',
  },
  {
    id: 'two',
    label: '2 elements',
    shortLabel: '2 clues',
    count: 2,
    description: 'A balanced pair of clues.',
  },
  {
    id: 'four',
    label: '4 elements',
    shortLabel: '4 clues',
    count: 4,
    description: 'More of the face, right from the start.',
  },
  {
    id: 'progressive',
    label: 'Progressive',
    shortLabel: 'Progressive',
    count: 1,
    description: 'Start with one piece and add another each refresh.',
  },
]

const NON_REVEALABLE_TAGS = new Set(['defs', 'title', 'desc', 'metadata', 'style'])

function getRevealableElements(root) {
  return Array.from(root.children).filter(
    (child) => !NON_REVEALABLE_TAGS.has(child.tagName.toLowerCase()),
  )
}

function getElementCount(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  return getRevealableElements(doc.documentElement).length
}

function renderSvg(svgText, visibleIndices = null) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const root = doc.documentElement

  root.removeAttribute('width')
  root.removeAttribute('height')
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  root.setAttribute('aria-hidden', 'true')
  root.setAttribute('focusable', 'false')

  if (visibleIndices) {
    const visible = new Set(visibleIndices)
    getRevealableElements(root).forEach((element, index) => {
      if (!visible.has(index)) element.setAttribute('visibility', 'hidden')
    })
  }

  return new XMLSerializer().serializeToString(root)
}

function sampleIndices(total, count, previous = []) {
  const safeCount = Math.min(count, total)
  const previousKey = [...previous].sort((a, b) => a - b).join(',')
  let selection = []

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const pool = Array.from({ length: total }, (_, index) => index)
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1))
      ;[pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]]
    }
    selection = pool.slice(0, safeCount)
    if (selection.sort((a, b) => a - b).join(',') !== previousKey) break
  }

  return selection
}

function getRandomPortraitIndex(currentIndex = -1) {
  if (PORTRAITS.length === 1) return 0
  let nextIndex = currentIndex
  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * PORTRAITS.length)
  }
  return nextIndex
}

function normalizeAnswer(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15.35A3.35 3.35 0 1 0 12 8.65a3.35 3.35 0 0 0 0 6.7Z" />
      <path d="m19.3 13.5 1.22 1-.02 2.02-1.62.93-1.47-.55a7.3 7.3 0 0 1-1.66.96l-.25 1.55-1.76.99-1.25-.98a7.72 7.72 0 0 1-1.94 0l-1.24.98-1.76-.99-.25-1.55a7.3 7.3 0 0 1-1.67-.96l-1.46.55-1.63-.93-.02-2.02 1.23-1a7.72 7.72 0 0 1 0-1.92l-1.23-1 .02-2.02 1.63-.93 1.46.55c.5-.4 1.06-.72 1.67-.97l.25-1.55 1.76-.99 1.24.98a7.72 7.72 0 0 1 1.94 0l1.25-.98 1.76.99.25 1.55c.6.25 1.16.57 1.66.97l1.47-.55 1.62.93.02 2.02-1.22 1c.08.31.12.63.12.96s-.04.65-.12.96Z" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.1 8.2A8 8 0 1 0 20 13" />
      <path d="M19.1 3.8v4.4h-4.4" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  )
}

function SettingsSheet({ currentMode, open, onClose, onSave }) {
  const [draftMode, setDraftMode] = useState(currentMode)
  const closeButtonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    setDraftMode(currentMode)
    closeButtonRef.current?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.classList.add('modal-open')

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.classList.remove('modal-open')
    }
  }, [currentMode, onClose, open])

  if (!open) return null

  return (
    <div className="settings-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="settings-heading">
          <div>
            <span className="eyebrow">Game settings</span>
            <h2 id="settings-title">Choose your clues</h2>
          </div>
          <button ref={closeButtonRef} className="icon-button close-button" onClick={onClose} aria-label="Close settings">
            <CloseIcon />
          </button>
        </div>

        <div className="mode-list" role="radiogroup" aria-label="Reveal mode">
          {MODES.map((option) => (
            <button
              type="button"
              role="radio"
              aria-checked={draftMode === option.id}
              className={`mode-option ${draftMode === option.id ? 'selected' : ''}`}
              key={option.id}
              onClick={() => setDraftMode(option.id)}
            >
              <span className="mode-number">{option.id === 'progressive' ? '+' : option.count}</span>
              <span className="mode-copy">
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
              <span className="radio-mark" />
            </button>
          ))}
        </div>

        <button className="primary-button settings-save" onClick={() => onSave(draftMode)}>
          Use this mode
          <ArrowIcon />
        </button>
        <p className="tracking-note">
          Anonymous game activity is saved using a random ID for this browser.
        </p>
      </section>
    </div>
  )
}

function ResultScreen({ mode, portrait, refreshCount, result, submittedAnswer, onPlayAgain }) {
  const fullPortrait = useMemo(() => renderSvg(portrait.svg), [portrait])
  const isCorrect = result === 'correct'

  return (
    <main className={`result-screen ${isCorrect ? 'correct' : 'incorrect'}`}>
      <div className="result-decoration result-decoration-one" />
      <div className="result-decoration result-decoration-two" />
      <div className="result-decoration result-decoration-three" />

      <div className="result-content">
        <span className="result-kicker">{isCorrect ? 'Spot on!' : 'Mystery solved'}</span>
        <h1>{isCorrect ? 'You got it.' : 'Not this time.'}</h1>

        <div className="result-portrait-shell">
          <div className="result-portrait" dangerouslySetInnerHTML={{ __html: fullPortrait }} />
          <span className="reveal-label">{portrait.name}</span>
        </div>

        <p className="result-message">
          {isCorrect
            ? `That famous face is ${portrait.name}. Nicely spotted.`
            : `You guessed “${submittedAnswer}”. The famous face was ${portrait.name}.`}
        </p>

        <div className="round-stats" aria-label="Round statistics">
          <div>
            <strong>{refreshCount}</strong>
            <span>{refreshCount === 1 ? 'refresh' : 'refreshes'}</span>
          </div>
          <div>
            <strong>{mode.shortLabel}</strong>
            <span>mode</span>
          </div>
        </div>

        <button className="primary-button play-again" onClick={onPlayAgain}>
          Play another face
          <ArrowIcon />
        </button>
      </div>
    </main>
  )
}

export default function App() {
  const [portraitIndex, setPortraitIndex] = useState(() => getRandomPortraitIndex())
  const [modeId, setModeId] = useState(() => localStorage.getItem('face-by-pieces-mode') || 'two')
  const [deviceId] = useState(getOrCreateDeviceId)
  const [sessionId, setSessionId] = useState(createSessionId)
  const [visibleIndices, setVisibleIndices] = useState([])
  const [refreshCount, setRefreshCount] = useState(0)
  const [answer, setAnswer] = useState('')
  const [answerError, setAnswerError] = useState('')
  const [result, setResult] = useState(null)
  const [submittedAnswer, setSubmittedAnswer] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const portrait = PORTRAITS[portraitIndex]
  const mode = MODES.find((option) => option.id === modeId) || MODES[1]
  const totalElements = useMemo(() => getElementCount(portrait.svg), [portrait])
  const visibleSvg = useMemo(
    () => renderSvg(portrait.svg, visibleIndices),
    [portrait, visibleIndices],
  )
  const progressiveComplete = mode.id === 'progressive' && visibleIndices.length >= totalElements

  useEffect(() => {
    startGameSession({
      sessionId,
      deviceId,
      portraitId: portrait.id,
      mode: mode.id,
    })
  }, [deviceId, mode.id, portrait.id, sessionId])

  useEffect(() => {
    setVisibleIndices(sampleIndices(totalElements, mode.count))
    setRefreshCount(0)
    setAnswer('')
    setAnswerError('')
    setResult(null)
    setSubmittedAnswer('')
  }, [mode.id, mode.count, portraitIndex, totalElements])

  const handleRefresh = () => {
    if (progressiveComplete) return

    const resultingVisibleElements = mode.id === 'progressive'
      ? Math.min(visibleIndices.length + 1, totalElements)
      : Math.min(mode.count, totalElements)

    recordSessionEvent(sessionId, 'clue_refreshed', {
      visibleElements: resultingVisibleElements,
    })

    setVisibleIndices((current) => {
      if (mode.id !== 'progressive') {
        return sampleIndices(totalElements, mode.count, current)
      }

      const hidden = Array.from({ length: totalElements }, (_, index) => index).filter(
        (index) => !current.includes(index),
      )
      const nextIndex = hidden[Math.floor(Math.random() * hidden.length)]
      return [...current, nextIndex]
    })
    setRefreshCount((count) => count + 1)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmedAnswer = answer.trim()
    if (!trimmedAnswer) {
      setAnswerError('Type a name before you guess.')
      return
    }

    const normalizedGuess = normalizeAnswer(trimmedAnswer)
    const correct = portrait.aliases.some((alias) => normalizeAnswer(alias) === normalizedGuess)
    const outcome = correct ? 'correct' : 'incorrect'

    completeGameSession(sessionId, {
      outcome,
      submittedAnswer: trimmedAnswer,
      visibleElements: visibleIndices.length,
    })
    setSubmittedAnswer(trimmedAnswer)
    setResult(outcome)
    setAnswerError('')
  }

  const handleSaveMode = (nextMode) => {
    localStorage.setItem('face-by-pieces-mode', nextMode)
    if (nextMode !== mode.id) {
      recordSessionEvent(sessionId, 'mode_changed', { from: mode.id, to: nextMode })
      setSessionId(createSessionId())
    }
    setModeId(nextMode)
    setSettingsOpen(false)
  }

  const handlePlayAgain = () => {
    setSessionId(createSessionId())
    setPortraitIndex((current) => getRandomPortraitIndex(current))
  }

  const handleOpenSettings = () => {
    recordSessionEvent(sessionId, 'settings_opened')
    setSettingsOpen(true)
  }

  if (result) {
    return (
      <ResultScreen
        mode={mode}
        portrait={portrait}
        refreshCount={refreshCount}
        result={result}
        submittedAnswer={submittedAnswer}
        onPlayAgain={handlePlayAgain}
      />
    )
  }

  return (
    <main className="game-shell">
      <header className="game-header">
        <button className="icon-button settings-button" onClick={handleOpenSettings} aria-label="Open settings">
          <GearIcon />
        </button>
        <div className="wordmark" aria-label="Face by Pieces">
          <span>Face</span>
          <span>by pieces</span>
        </div>
        <div className="refresh-counter" aria-label={`${refreshCount} refreshes used`}>
          <span>{refreshCount}</span>
          refresh
        </div>
      </header>

      <section className="game-area" aria-labelledby="game-prompt">
        <div className="game-intro">
          <span className="mode-pill">{mode.shortLabel}</span>
          <h1 id="game-prompt">Who’s hiding here?</h1>
          <p>Study the pieces. Refresh if you need a new clue.</p>
        </div>

        <div className="portrait-card">
          <div className="card-corner card-corner-top" />
          <div className="card-corner card-corner-bottom" />
          <div
            className="portrait-svg"
            aria-label={`A partially revealed portrait with ${visibleIndices.length} visible ${visibleIndices.length === 1 ? 'element' : 'elements'}`}
            dangerouslySetInnerHTML={{ __html: visibleSvg }}
          />
        </div>

        <div className="refresh-wrap">
          <button
            className="refresh-button"
            onClick={handleRefresh}
            disabled={progressiveComplete}
            aria-label={progressiveComplete ? 'All portrait elements revealed' : 'Refresh portrait clues'}
          >
            <RefreshIcon />
          </button>
          {mode.id === 'progressive' && (
            <span>{progressiveComplete ? 'All clues revealed' : 'Add a clue'}</span>
          )}
        </div>
      </section>

      <section className="answer-panel">
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="famous-person">Know the face?</label>
          <div className={`answer-control ${answerError ? 'has-error' : ''}`}>
            <input
              id="famous-person"
              type="text"
              value={answer}
              onChange={(event) => {
                setAnswer(event.target.value)
                if (answerError) setAnswerError('')
              }}
              placeholder="Type their name"
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="go"
              aria-describedby={answerError ? 'answer-error' : undefined}
            />
            <button type="submit" aria-label="Submit guess">
              <ArrowIcon />
            </button>
          </div>
          <p id="answer-error" className="answer-error" aria-live="polite">{answerError}</p>
        </form>
      </section>

      <SettingsSheet
        currentMode={mode.id}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveMode}
      />
    </main>
  )
}
