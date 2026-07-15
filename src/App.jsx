import { useEffect, useMemo, useRef, useState } from 'react'
import albertEinsteinSvg from '../data/vector-lines/albert_einstein/sketch.svg?raw'
import barackObamaSvg from '../data/vector-lines/barack_obama/sketch.svg?raw'
import cristianoRonaldoSvg from '../data/vector-lines/cristiano_ronaldo/sketch.svg?raw'
import elvisSvg from '../data/vector-lines/elvis/sketch.svg?raw'
import johnLennonSvg from '../data/vector-lines/john_lennon/sketch.svg?raw'
import lionelMessiSvg from '../data/vector-lines/lionel_messi/sketch.svg?raw'
import abstractAlbertEinsteinSvg from '../data/svg/albert_einstein/abstract.svg?raw'
import abstractBarackObamaSvg from '../data/svg/barack_obama/abstract.svg?raw'
import abstractCristianoRonaldoSvg from '../data/svg/cristiano_ronaldo/abstract.svg?raw'
import abstractElvisSvg from '../data/svg/elvis/abstract.svg?raw'
import abstractLionelMessiSvg from '../data/svg/messi/abstract.svg?raw'
import abstractMarilynMonroeSvg from '../data/svg/marilyn_monroe/abstract.svg?raw'
import abstractStevenSpielbergSvg from '../data/svg/steven_spielberg/abstract.svg?raw'
import abstractTomHanksSvg from '../data/svg/tom_hanks/abstract.svg?raw'
import {
  completeGameSession,
  createSessionId,
  getOrCreateDeviceId,
  recordInitialElements,
  recordSessionEvent,
  startGameSession,
} from './telemetry'

const PORTRAITS = [
  {
    id: 'albert-einstein',
    name: 'Albert Einstein',
    aliases: ['Albert Einstein', 'Einstein'],
    styles: {
      'vector-lines': albertEinsteinSvg,
      abstract: abstractAlbertEinsteinSvg,
    },
  },
  {
    id: 'barack-obama',
    name: 'Barack Obama',
    aliases: ['Barack Obama', 'Obama', 'President Obama'],
    styles: {
      'vector-lines': barackObamaSvg,
      abstract: abstractBarackObamaSvg,
    },
  },
  {
    id: 'cristiano-ronaldo',
    name: 'Cristiano Ronaldo',
    aliases: ['Cristiano Ronaldo', 'Christiano Ronaldo', 'Ronaldo', 'CR7'],
    styles: {
      'vector-lines': cristianoRonaldoSvg,
      abstract: abstractCristianoRonaldoSvg,
    },
  },
  {
    id: 'elvis-presley',
    name: 'Elvis Presley',
    aliases: ['Elvis Presley', 'Elvis'],
    styles: {
      'vector-lines': elvisSvg,
      abstract: abstractElvisSvg,
    },
  },
  {
    id: 'john-lennon',
    name: 'John Lennon',
    aliases: ['John Lennon', 'Lennon'],
    styles: {
      'vector-lines': johnLennonSvg,
    },
  },
  {
    id: 'lionel-messi',
    name: 'Lionel Messi',
    aliases: ['Lionel Messi', 'Leo Messi', 'Messi'],
    styles: {
      'vector-lines': lionelMessiSvg,
      abstract: abstractLionelMessiSvg,
    },
  },
  {
    id: 'marilyn-monroe',
    name: 'Marilyn Monroe',
    aliases: ['Marilyn Monroe', 'Marilyn', 'Monroe'],
    styles: {
      abstract: abstractMarilynMonroeSvg,
    },
  },
  {
    id: 'steven-spielberg',
    name: 'Steven Spielberg',
    aliases: ['Steven Spielberg', 'Spielberg'],
    styles: {
      abstract: abstractStevenSpielbergSvg,
    },
  },
  {
    id: 'tom-hanks',
    name: 'Tom Hanks',
    aliases: ['Tom Hanks', 'Tom', 'Hanks'],
    styles: {
      abstract: abstractTomHanksSvg,
    },
  },
]

const STYLES = [
  {
    id: 'abstract',
    label: 'Abstract color',
    shortLabel: 'Color',
    description: 'Layered color portraits that begin with their base silhouette.',
  },
  {
    id: 'vector-lines',
    label: 'Vector lines',
    shortLabel: 'Lines',
    description: 'Minimal line portraits with clues that shuffle independently.',
  },
]

const MODES = [
  {
    id: 'one',
    label: '1 clue',
    shortLabel: '1 clue',
    headerLabel: '1 clue',
    count: 1,
    description: 'Hard mode. One random piece at a time.',
  },
  {
    id: 'two',
    label: '2 clues',
    shortLabel: '2 clues',
    headerLabel: '2 clues',
    count: 2,
    description: 'A balanced pair of clues.',
  },
  {
    id: 'four',
    label: '4 clues',
    shortLabel: '4 clues',
    headerLabel: '4 clues',
    count: 4,
    description: 'More of the face, right from the start.',
  },
  {
    id: 'progressive',
    label: 'Progressive',
    shortLabel: 'Progressive',
    headerLabel: 'Progress',
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

function getAbstractDetailElements(root) {
  const detailGroups = [
    ['face-details', 'face_details'],
    ['clothing-details', 'clothing_details'],
  ]

  // Group order only provides stable indices for replay. Every child enters one
  // shared pool and has the same chance of being selected on each reveal.
  return detailGroups.flatMap((groupIds) => {
    const group = groupIds
      .map((groupId) => root.querySelector(`#${groupId}`))
      .find(Boolean)
    return group ? Array.from(group.children) : []
  })
}

function getElementCount(svgText, styleId) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  return styleId === 'abstract'
    ? getAbstractDetailElements(doc.documentElement).length
    : getRevealableElements(doc.documentElement).length
}

function renderSvg(svgText, visibleIndices = null, styleId = 'vector-lines') {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const root = doc.documentElement

  root.removeAttribute('width')
  root.removeAttribute('height')
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  root.setAttribute('aria-hidden', 'true')
  root.setAttribute('focusable', 'false')

  if (visibleIndices) {
    const visible = new Set(visibleIndices)
    const revealableElements = styleId === 'abstract'
      ? getAbstractDetailElements(root)
      : getRevealableElements(root)
    revealableElements.forEach((element, index) => {
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

function getAvailablePortraitIndices(styleId) {
  return PORTRAITS
    .map((portrait, index) => (portrait.styles[styleId] ? index : null))
    .filter((index) => index !== null)
}

function getRandomPortraitIndex(currentIndex = -1, styleId = 'vector-lines') {
  const availableIndices = getAvailablePortraitIndices(styleId)
    .filter((index) => index !== currentIndex)
  if (availableIndices.length === 0) return currentIndex >= 0 ? currentIndex : 0
  return availableIndices[Math.floor(Math.random() * availableIndices.length)]
}

function getNextUnviewedPortraitIndex(currentIndex, viewedPortraits, styleId) {
  const stylePortraitIndices = getAvailablePortraitIndices(styleId)
  let availableIndices = stylePortraitIndices
    .filter((index) => !viewedPortraits.has(index))

  if (availableIndices.length === 0) {
    viewedPortraits.clear()
    availableIndices = stylePortraitIndices.filter((index) => index !== currentIndex)
  }

  if (availableIndices.length === 0) return currentIndex

  const nextIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)]
  viewedPortraits.add(nextIndex)
  return nextIndex
}

function normalizeAnswer(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function GameModeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.2 7.5h7.6c2.8 0 4.8 2.1 5.1 5.3l.3 3.2c.2 2.1-2.2 3.3-3.7 1.8l-1.7-1.7H8.2l-1.7 1.7C5 19.3 2.6 18.1 2.8 16l.3-3.2c.3-3.2 2.3-5.3 5.1-5.3Z" />
      <path d="M7.5 10.5v3M6 12h3M16.5 11.1h.01M18.1 12.7h.01" />
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

function TimelineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h10M4 17h16M14 7l3-3m-3 3 3 3" />
      <circle cx="8" cy="17" r="2.5" />
    </svg>
  )
}

function PaletteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 0 18h1.2a1.7 1.7 0 0 0 1.2-2.9 1.7 1.7 0 0 1 1.2-2.9H18a3 3 0 0 0 3-3A9.2 9.2 0 0 0 12 3Z" />
      <circle cx="7.5" cy="10" r="1" />
      <circle cx="10" cy="6.8" r="1" />
      <circle cx="15" cy="7.2" r="1" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
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
            <span className="eyebrow">Game mode</span>
            <h2 id="settings-title">Choose a mode</h2>
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

function StyleSheet({ currentStyle, open, onClose, onSave }) {
  const [draftStyle, setDraftStyle] = useState(currentStyle)
  const closeButtonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    setDraftStyle(currentStyle)
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
  }, [currentStyle, onClose, open])

  if (!open) return null

  return (
    <div className="settings-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-sheet style-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="style-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="settings-heading">
          <div>
            <span className="eyebrow">Portrait style</span>
            <h2 id="style-title">Choose a style</h2>
          </div>
          <button ref={closeButtonRef} className="icon-button close-button" onClick={onClose} aria-label="Close style chooser">
            <CloseIcon />
          </button>
        </div>

        <div className="style-list" role="radiogroup" aria-label="Portrait style">
          {STYLES.map((option) => {
            const portraitCount = PORTRAITS.filter((portrait) => portrait.styles[option.id]).length
            return (
              <button
                type="button"
                role="radio"
                aria-checked={draftStyle === option.id}
                className={`style-option ${draftStyle === option.id ? 'selected' : ''}`}
                key={option.id}
                onClick={() => setDraftStyle(option.id)}
              >
                <span className={`style-preview ${option.id}`} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="mode-copy">
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                  <small className="portrait-count">{portraitCount} portraits available</small>
                </span>
                <span className="radio-mark" />
              </button>
            )
          })}
        </div>

        <button className="primary-button settings-save" onClick={() => onSave(draftStyle)}>
          Use this style
          <ArrowIcon />
        </button>
      </section>
    </div>
  )
}

function TimelineReplay({ elementHistory, isCorrect, onBack, onPlayAgain, portraitSvg, styleId }) {
  const [currentStep, setCurrentStep] = useState(0)
  const timelineTrackRef = useRef(null)
  const stepButtonRefs = useRef([])
  const currentElements = elementHistory[currentStep] || []
  const currentSvg = useMemo(
    () => renderSvg(portraitSvg, currentElements, styleId),
    [currentElements, portraitSvg, styleId],
  )
  const uniqueElementsSeen = useMemo(
    () => new Set(elementHistory.slice(0, currentStep + 1).flat()).size,
    [currentStep, elementHistory],
  )
  const stepLabel = currentStep === 0 ? 'Initial clues' : `Refresh ${currentStep}`

  useEffect(() => {
    const track = timelineTrackRef.current
    const activeStep = stepButtonRefs.current[currentStep]
    if (!track || !activeStep) return

    const centeredPosition = activeStep.offsetLeft - ((track.clientWidth - activeStep.offsetWidth) / 2)
    track.scrollTo({
      left: Math.max(0, centeredPosition),
      behavior: 'smooth',
    })
  }, [currentStep])

  return (
    <main className={`result-screen timeline-screen ${isCorrect ? 'correct' : 'incorrect'}`}>
      <div className="result-decoration result-decoration-one" />
      <div className="result-decoration result-decoration-two" />
      <div className="result-decoration result-decoration-three" />

      <div className="timeline-content">
        <button className="timeline-back" onClick={onBack}>
          <ChevronIcon />
          Result
        </button>

        <span className="result-kicker">Round replay</span>
        <h1>Your clue trail.</h1>
        <p className="timeline-intro">Step through exactly what you saw during the round.</p>

        <div className="timeline-portrait-card">
          <div
            className="timeline-portrait"
            aria-label={`${stepLabel}, showing ${currentElements.length} portrait elements`}
            dangerouslySetInnerHTML={{ __html: currentSvg }}
          />
          <span className="timeline-frame-label">{stepLabel}</span>
        </div>

        <div className="timeline-summary" aria-live="polite">
          <span>Step {currentStep + 1} of {elementHistory.length}</span>
          <strong>
            {uniqueElementsSeen} unique {styleId === 'abstract' ? 'details' : uniqueElementsSeen === 1 ? 'element' : 'elements'} seen
          </strong>
        </div>

        <div ref={timelineTrackRef} className="timeline-track" aria-label="Clue timeline">
          {elementHistory.map((_elements, index) => (
            <button
              key={index}
              ref={(element) => { stepButtonRefs.current[index] = element }}
              className={`${index === currentStep ? 'active' : ''} ${index < currentStep ? 'visited' : ''}`}
              onClick={() => setCurrentStep(index)}
              aria-label={index === 0 ? 'Show initial clues' : `Show refresh ${index}`}
              aria-current={index === currentStep ? 'step' : undefined}
            >
              {index === 0 ? 'S' : index}
            </button>
          ))}
        </div>

        <div className="timeline-navigation">
          <button
            onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
            disabled={currentStep === 0}
          >
            <ChevronIcon />
            Previous
          </button>
          <button
            onClick={() => setCurrentStep((step) => Math.min(elementHistory.length - 1, step + 1))}
            disabled={currentStep === elementHistory.length - 1}
          >
            Next
            <span className="chevron-next"><ChevronIcon /></span>
          </button>
        </div>

        <button className="primary-button timeline-play-again" onClick={onPlayAgain}>
          Play another face
          <ArrowIcon />
        </button>
      </div>
    </main>
  )
}

function ResultScreen({ elementHistory, mode, portrait, portraitSvg, refreshCount, result, styleId, submittedAnswer, onPlayAgain }) {
  const fullPortrait = useMemo(() => renderSvg(portraitSvg, null, styleId), [portraitSvg, styleId])
  const [timelineOpen, setTimelineOpen] = useState(false)
  const isCorrect = result === 'correct'

  if (timelineOpen) {
    return (
      <TimelineReplay
        elementHistory={elementHistory}
        isCorrect={isCorrect}
        onBack={() => setTimelineOpen(false)}
        onPlayAgain={onPlayAgain}
        portraitSvg={portraitSvg}
        styleId={styleId}
      />
    )
  }

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
            <strong>{refreshCount + 1}</strong>
            <span>{refreshCount + 1 === 1 ? 'step' : 'steps'}</span>
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
        <button className="secondary-button replay-button" onClick={() => setTimelineOpen(true)}>
          <TimelineIcon />
          Retrace your clues
        </button>
      </div>
    </main>
  )
}

export default function App() {
  const [styleId, setStyleId] = useState(() => {
    const savedStyle = localStorage.getItem('face-by-pieces-style')
    return STYLES.some((style) => style.id === savedStyle) ? savedStyle : 'abstract'
  })
  const [portraitIndex, setPortraitIndex] = useState(() => getRandomPortraitIndex(-1, styleId))
  const viewedPortraitsRef = useRef(new Set([portraitIndex]))
  const [modeId, setModeId] = useState(() => localStorage.getItem('face-by-pieces-mode') || 'two')
  const [deviceId] = useState(getOrCreateDeviceId)
  const [sessionId, setSessionId] = useState(createSessionId)
  const [visibleIndices, setVisibleIndices] = useState([])
  const [elementHistory, setElementHistory] = useState([])
  const [refreshCount, setRefreshCount] = useState(0)
  const [answer, setAnswer] = useState('')
  const [answerError, setAnswerError] = useState('')
  const [answerFocused, setAnswerFocused] = useState(false)
  const [viewportHeight, setViewportHeight] = useState(
    () => Math.round(window.visualViewport?.height || window.innerHeight),
  )
  const [viewportOffset, setViewportOffset] = useState(
    () => Math.round(window.visualViewport?.offsetTop || 0),
  )
  const [result, setResult] = useState(null)
  const [submittedAnswer, setSubmittedAnswer] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [styleOpen, setStyleOpen] = useState(false)

  const portrait = PORTRAITS[portraitIndex]
  const mode = MODES.find((option) => option.id === modeId) || MODES[1]
  const style = STYLES.find((option) => option.id === styleId) || STYLES[0]
  const portraitSvg = portrait.styles[style.id]
  const totalElements = useMemo(
    () => getElementCount(portraitSvg, style.id),
    [portraitSvg, style.id],
  )
  const visibleSvg = useMemo(
    () => renderSvg(portraitSvg, visibleIndices, style.id),
    [portraitSvg, style.id, visibleIndices],
  )
  const progressiveComplete = mode.id === 'progressive' && visibleIndices.length >= totalElements
  const usesOnScreenKeyboard = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  const keyboardLayoutActive = answerFocused && usesOnScreenKeyboard

  useEffect(() => {
    const viewport = window.visualViewport
    const updateViewportHeight = () => {
      setViewportHeight(Math.round(viewport?.height || window.innerHeight))
      setViewportOffset(Math.round(viewport?.offsetTop || 0))
    }

    updateViewportHeight()
    viewport?.addEventListener('resize', updateViewportHeight)
    viewport?.addEventListener('scroll', updateViewportHeight)
    window.addEventListener('resize', updateViewportHeight)

    return () => {
      viewport?.removeEventListener('resize', updateViewportHeight)
      viewport?.removeEventListener('scroll', updateViewportHeight)
      window.removeEventListener('resize', updateViewportHeight)
    }
  }, [])

  useEffect(() => {
    document.body.classList.toggle('answer-input-focused', keyboardLayoutActive)
    return () => document.body.classList.remove('answer-input-focused')
  }, [keyboardLayoutActive])

  useEffect(() => {
    startGameSession({
      sessionId,
      deviceId,
      portraitId: portrait.id,
      mode: mode.id,
      style: style.id,
    })
  }, [deviceId, mode.id, portrait.id, sessionId, style.id])

  useEffect(() => {
    const initialIndices = style.id === 'abstract'
      ? []
      : sampleIndices(totalElements, mode.count)
    setVisibleIndices(initialIndices)
    setElementHistory([initialIndices])
    recordInitialElements(sessionId, initialIndices)
    setRefreshCount(0)
    setAnswer('')
    setAnswerError('')
    setResult(null)
    setSubmittedAnswer('')
  }, [mode.id, mode.count, portraitIndex, sessionId, style.id, totalElements])

  const handleRefresh = () => {
    if (progressiveComplete) return

    let nextVisibleIndices
    if (mode.id === 'progressive') {
      const hidden = Array.from({ length: totalElements }, (_, index) => index).filter(
        (index) => !visibleIndices.includes(index),
      )
      const nextIndex = hidden[Math.floor(Math.random() * hidden.length)]
      nextVisibleIndices = [...visibleIndices, nextIndex]
    } else {
      nextVisibleIndices = sampleIndices(totalElements, mode.count, visibleIndices)
    }

    recordSessionEvent(sessionId, 'clue_refreshed', {
      refreshNumber: refreshCount + 1,
      visibleElements: nextVisibleIndices.length,
      visibleElementIndices: nextVisibleIndices,
    })
    setVisibleIndices(nextVisibleIndices)
    setElementHistory((history) => [...history, nextVisibleIndices])
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
    setAnswerFocused(false)
  }

  const handleSaveMode = (nextMode) => {
    localStorage.setItem('face-by-pieces-mode', nextMode)
    if (nextMode !== mode.id) {
      recordSessionEvent(sessionId, 'mode_changed', { from: mode.id, to: nextMode })
      viewedPortraitsRef.current = new Set([portraitIndex])
      setSessionId(createSessionId())
    }
    setModeId(nextMode)
    setSettingsOpen(false)
  }

  const handlePlayAgain = () => {
    const nextPortraitIndex = getNextUnviewedPortraitIndex(
      portraitIndex,
      viewedPortraitsRef.current,
      style.id,
    )
    setSessionId(createSessionId())
    setPortraitIndex(nextPortraitIndex)
  }

  const handleOpenSettings = () => {
    recordSessionEvent(sessionId, 'settings_opened')
    setSettingsOpen(true)
  }

  const handleSaveStyle = (nextStyle) => {
    localStorage.setItem('face-by-pieces-style', nextStyle)
    if (nextStyle !== style.id) {
      recordSessionEvent(sessionId, 'style_changed', { from: style.id, to: nextStyle })
      const nextPortraitIndex = getRandomPortraitIndex(portraitIndex, nextStyle)
      viewedPortraitsRef.current = new Set([nextPortraitIndex])
      setSessionId(createSessionId())
      setPortraitIndex(nextPortraitIndex)
      setStyleId(nextStyle)
    }
    setStyleOpen(false)
  }

  const handleOpenStyle = () => {
    recordSessionEvent(sessionId, 'style_opened')
    setStyleOpen(true)
  }

  if (result) {
    return (
      <ResultScreen
        elementHistory={elementHistory}
        mode={mode}
        portrait={portrait}
        portraitSvg={portraitSvg}
        refreshCount={refreshCount}
        result={result}
        styleId={style.id}
        submittedAnswer={submittedAnswer}
        onPlayAgain={handlePlayAgain}
      />
    )
  }

  return (
    <main
      className={`game-shell ${keyboardLayoutActive ? 'answer-focused' : ''}`}
      style={{
        '--viewport-height': `${viewportHeight}px`,
        '--viewport-offset': `${viewportOffset}px`,
      }}
    >
      <header className="game-header">
        <div className="header-actions">
          <button className="style-button mode-button settings-button" onClick={handleOpenSettings} aria-label={`Choose game mode. Current mode: ${mode.label}`}>
            <GameModeIcon />
            <span>{mode.headerLabel}</span>
          </button>
          <button className="style-button" onClick={handleOpenStyle} aria-label={`Choose portrait style. Current style: ${style.label}`}>
            <PaletteIcon />
            <span>{style.shortLabel}</span>
          </button>
        </div>
        <div className="refresh-counter" aria-label={`${refreshCount} steps used`}>
          <span>{refreshCount}</span>
          steps
        </div>
        <h1 className="game-prompt" id="game-prompt">Who’s hiding here?</h1>
      </header>

      <section className="game-area" aria-labelledby="game-prompt">
        <div className="portrait-card">
          <div
            className="portrait-svg"
            aria-label={`A partially revealed portrait with ${visibleIndices.length} visible ${visibleIndices.length === 1 ? 'element' : 'elements'}`}
            dangerouslySetInnerHTML={{ __html: visibleSvg }}
          />
        </div>
      </section>

      <div className="clue-action">
        <p>{progressiveComplete ? 'All clues revealed' : 'tap for another clue'}</p>
        <button
          className="refresh-button"
          onPointerDown={(event) => {
            if (answerFocused) event.preventDefault()
          }}
          onClick={handleRefresh}
          disabled={progressiveComplete}
          aria-label={progressiveComplete
            ? 'All portrait elements revealed'
            : mode.id === 'progressive'
              ? 'Reveal the next portrait clue'
              : 'Refresh portrait clues'}
        >
          {mode.id === 'progressive' ? <ArrowIcon /> : <RefreshIcon />}
        </button>
      </div>

      <section className="answer-panel">
        <form onSubmit={handleSubmit} noValidate>
          <label className="visually-hidden" htmlFor="famous-person">Enter the famous person’s name</label>
          <div className={`answer-control ${answerError ? 'has-error' : ''}`}>
            <input
              id="famous-person"
              type="text"
              value={answer}
              onFocus={() => {
                setAnswerFocused(true)
                if (usesOnScreenKeyboard) {
                  requestAnimationFrame(() => window.scrollTo(0, 0))
                }
              }}
              onBlur={() => setAnswerFocused(false)}
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
      <StyleSheet
        currentStyle={style.id}
        open={styleOpen}
        onClose={() => setStyleOpen(false)}
        onSave={handleSaveStyle}
      />
    </main>
  )
}
