import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { PORTRAITS, getClueIndices } from './portraits'
import PortraitArtwork from './PortraitArtwork'
import {
  completeGameSession,
  createSessionId,
  getOrCreateDeviceId,
  recordInitialElements,
  recordSessionEvent,
  startGameSession,
} from './telemetry'

const STYLES = [
  {
    id: 'line-art',
    label: 'Line art',
    shortLabel: 'Line art',
    description: 'Hand-drawn portraits revealed one layer at a time.',
  },
  {
    id: 'abstract',
    label: 'Abstract color',
    shortLabel: 'Color',
    description:
      'Layered color portraits that begin with their base silhouette.',
  },
  {
    id: 'vector-lines',
    label: 'Vector lines',
    shortLabel: 'Lines',
    description:
      'Minimal line portraits with clues that shuffle independently.',
  },
]

// Apply the new default once to existing browsers, then remember style choices.
const STYLE_STORAGE_KEY = 'face-by-pieces-style-v2'

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
    label: 'Sequence',
    shortLabel: 'Sequence',
    headerLabel: 'Sequence',
    count: 1,
    description: 'Start with one piece and add another each refresh.',
  },
]

function sampleIndices(indices, count, previous = []) {
  const safeCount = Math.min(count, indices.length)
  const previousKey = [...previous].sort((a, b) => a - b).join(',')
  let selection = []

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const pool = [...indices]
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
  return PORTRAITS.map((portrait, index) =>
    portrait.styles[styleId] ? index : null,
  ).filter((index) => index !== null)
}

function getRandomPortraitIndex(currentIndex = -1, styleId = 'line-art') {
  const availableIndices = getAvailablePortraitIndices(styleId).filter(
    (index) => index !== currentIndex,
  )
  if (availableIndices.length === 0) return currentIndex >= 0 ? currentIndex : 0
  return availableIndices[Math.floor(Math.random() * availableIndices.length)]
}

function getNextUnviewedPortraitIndex(currentIndex, viewedPortraits, styleId) {
  const stylePortraitIndices = getAvailablePortraitIndices(styleId)
  let availableIndices = stylePortraitIndices.filter(
    (index) => !viewedPortraits.has(index),
  )

  if (availableIndices.length === 0) {
    viewedPortraits.clear()
    availableIndices = stylePortraitIndices.filter(
      (index) => index !== currentIndex,
    )
  }

  if (availableIndices.length === 0) return currentIndex

  const nextIndex =
    availableIndices[Math.floor(Math.random() * availableIndices.length)]
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

function Icon({ name = 'arrow', ...props }) {
  const paths = {
    arrow: 'M4 12h15m-6-6 6 6-6 6',
    refresh: 'M20 8a8 8 0 1 0 .1 7M20 3v5h-5',
    close: 'm6 6 12 12M18 6 6 18',
    back: 'm14 5-7 7 7 7',
    chevron: 'm7 10 5 5 5-5',
    check: 'm5 12 4 4L19 6',
    replay: 'M5 5v14l14-7Z',
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d={paths[name]} />
    </svg>
  )
}

function FaceMark() {
  return (
    <svg className="face-mark" viewBox="0 0 42 52" aria-hidden="true">
      <path d="M9 18C8 6 17 3 25 5c10 2 13 12 11 24-1 9-8 18-16 18-7 0-13-6-14-15M5 28c-5-9 0-11 4-7M14 19c2-2 5-2 7 0m6-1 5 1M24 21l-3 9 5 1M16 37c4 2 8 2 11-1" />
    </svg>
  )
}

function Masthead({
  caption = 'A little less to see. A little more to imagine.',
}) {
  return (
    <header className="masthead">
      <div className="wordmark">
        <FaceMark />
        <span>
          face <em>by</em> pieces
        </span>
      </div>
      <span className="masthead-caption">{caption}</span>
    </header>
  )
}

function PortraitFrame({
  artwork,
  styleId,
  visibleIndices = null,
  label,
  className = '',
}) {
  return (
    <div className={`portrait-frame ${className}`}>
      <i className="frame-corner top-left" aria-hidden="true" />
      <i className="frame-corner top-right" aria-hidden="true" />
      <i className="frame-corner bottom-left" aria-hidden="true" />
      <i className="frame-corner bottom-right" aria-hidden="true" />
      <PortraitArtwork
        className="portrait-artwork"
        artwork={artwork}
        styleId={styleId}
        visibleIndices={visibleIndices}
        label={label}
        fitToInk
      />
    </div>
  )
}

function SettingsDropdown({
  label,
  options,
  value,
  open,
  onToggle,
  onClose,
  onSelect,
  legacyLink = false,
}) {
  const id = useId()
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const selected = options.find((option) => option.id === value)

  useEffect(() => {
    if (!open) return
    menuRef.current.querySelector('[aria-checked="true"]')?.focus()
    const handleOutsideClick = (event) => {
      if (!rootRef.current.contains(event.target)) onClose()
    }
    document.addEventListener('pointerdown', handleOutsideClick)
    return () => document.removeEventListener('pointerdown', handleOutsideClick)
  }, [open, onClose])

  const closeAndFocus = () => {
    onClose()
    buttonRef.current.focus({ preventScroll: true })
  }

  const handleMenuKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeAndFocus()
      return
    }
    if (event.key === 'Tab') {
      // Continue the page's normal tab order from the menu's trigger.
      closeAndFocus()
      return
    }
    const items = [...menuRef.current.querySelectorAll('[role^="menuitem"]')]
    const index = items.indexOf(document.activeElement)
    let nextIndex
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % items.length
    if (event.key === 'ArrowUp')
      nextIndex = (index - 1 + items.length) % items.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = items.length - 1
    if (nextIndex !== undefined) {
      event.preventDefault()
      items[nextIndex].focus()
    }
  }

  return (
    <div
      ref={rootRef}
      className="settings-dropdown"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onClose()
      }}
    >
      <button
        ref={buttonRef}
        id={`${id}-button`}
        className="settings-dropdown-button"
        aria-label={`${label}: ${selected.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) onToggle()
          }
        }}
      >
        {label}
        <Icon name="chevron" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={`${id}-menu`}
          className="settings-dropdown-menu"
          role="menu"
          aria-labelledby={`${id}-button`}
          onKeyDown={handleMenuKeyDown}
        >
          {options.map((option) => (
            <button
              key={option.id}
              role="menuitemradio"
              aria-checked={value === option.id}
              tabIndex={-1}
              onClick={() => {
                onSelect(option.id)
                closeAndFocus()
              }}
            >
              <span>{option.label}</span>
              {value === option.id && <Icon name="check" />}
            </button>
          ))}
          {legacyLink && (
            <>
              <div role="separator" />
              <a href="?ux=legacy" role="menuitem" tabIndex={-1}>
                Legacy interface <span aria-hidden="true">↗</span>
              </a>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function TimelineReplay({ elementHistory, onBack, artwork, styleId }) {
  const [currentStep, setCurrentStep] = useState(0)
  const buttonRefs = useRef([])
  const titleRef = useRef(null)
  const currentElements = elementHistory[currentStep] || []
  const uniqueClueCount = new Set(
    elementHistory.slice(0, currentStep + 1).flat(),
  ).size
  const stepLabel = `Step ${currentStep + 1} of ${elementHistory.length}`
  const clueLabel = `${uniqueClueCount} unique ${uniqueClueCount === 1 ? 'clue' : 'clues'} shown`

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    buttonRefs.current[currentStep]?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: 'smooth',
    })
  }, [currentStep])

  return (
    <main className="ink-app replay-screen">
      <header className="replay-header">
        <button
          className="replay-icon-button"
          onClick={onBack}
          aria-label="Back to the reveal"
          title="Back to the reveal"
        >
          <Icon name="back" />
        </button>
        <h1 id="replay-title" ref={titleRef} tabIndex={-1}>
          Round Replay
        </h1>
      </header>
      <section
        className="replay-portrait-region"
        aria-labelledby="replay-title"
      >
        <PortraitArtwork
          className="portrait-artwork replay-portrait"
          artwork={artwork}
          styleId={styleId}
          visibleIndices={currentElements}
          label={`${stepLabel}, ${currentElements.length} visible ${currentElements.length === 1 ? 'clue' : 'clues'}, ${clueLabel}`}
          fitToInk
        />
      </section>
      <div className="replay-controls">
        <div className="replay-caption" role="status" aria-atomic="true">
          <span>{stepLabel}</span>
          <span>{clueLabel}</span>
        </div>
        <div className="timeline-navigation">
          <button
            className="replay-icon-button"
            onClick={() => setCurrentStep((step) => step - 1)}
            disabled={currentStep === 0}
            aria-label="Previous step"
            title="Previous step"
          >
            <Icon name="back" />
          </button>
          <div
            className="timeline-track"
            role="group"
            aria-label="Replay steps"
          >
            {elementHistory.map((_elements, index) => (
              <button
                key={index}
                ref={(element) => {
                  buttonRefs.current[index] = element
                }}
                className={index === currentStep ? 'active' : ''}
                onClick={() => setCurrentStep(index)}
                aria-label={`Show step ${index + 1}`}
                aria-current={index === currentStep ? 'step' : undefined}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <button
            className="replay-icon-button"
            onClick={() => setCurrentStep((step) => step + 1)}
            disabled={currentStep === elementHistory.length - 1}
            aria-label="Next step"
            title="Next step"
          >
            <Icon />
          </button>
        </div>
      </div>
    </main>
  )
}

function ResultScreen({
  elementHistory,
  mode,
  portrait,
  artwork,
  refreshCount,
  result,
  styleId,
  submittedAnswer,
  onPlayAgain,
}) {
  const [timelineOpen, setTimelineOpen] = useState(false)
  const isCorrect = result === 'correct'
  const titleRef = useRef(null)
  useEffect(() => {
    if (!timelineOpen) titleRef.current?.focus()
  }, [timelineOpen])

  if (timelineOpen)
    return (
      <TimelineReplay
        elementHistory={elementHistory}
        onBack={() => setTimelineOpen(false)}
        artwork={artwork}
        styleId={styleId}
      />
    )

  return (
    <main
      className={`ink-app result-screen ${isCorrect ? 'correct' : 'incorrect'}`}
    >
      <Masthead caption="The whole picture, at last." />
      <div className="result-layout">
        <div className="result-heading">
          <span className="eyebrow">The reveal</span>
          <h1 ref={titleRef} tabIndex={-1}>
            {isCorrect ? 'Correct' : 'Incorrect'}
          </h1>
        </div>
        <figure className="result-figure">
          <PortraitFrame
            className="result-portrait"
            artwork={artwork}
            styleId={styleId}
            label={`Portrait of ${portrait.name}`}
          />
          <figcaption>
            <span className="eyebrow">The face behind the lines</span>
            <h2>{portrait.name}</h2>
          </figcaption>
        </figure>
        <div className="result-details">
          <p className="result-message">
            {isCorrect ? (
              'A few pieces were all you needed. Nicely spotted.'
            ) : (
              <>
                You guessed <strong>{submittedAnswer}</strong>. There’s always
                another face to discover.
              </>
            )}
          </p>
          <div className="round-stats" aria-label="Round statistics">
            <div>
              <strong>{String(refreshCount + 1).padStart(2, '0')}</strong>
              <span>
                {refreshCount + 1 === 1
                  ? 'step to your guess'
                  : 'steps to your guess'}
              </span>
            </div>
            <div>
              <strong>{mode.shortLabel}</strong>
              <span>reveal mode</span>
            </div>
          </div>
          <button className="primary-button" onClick={onPlayAgain}>
            Play another face
            <Icon />
          </button>
          <button
            className="text-button replay-button"
            onClick={() => setTimelineOpen(true)}
          >
            <Icon name="replay" />
            Retrace your clues
          </button>
        </div>
      </div>
      <footer className="page-footer">
        <span>One face. Many little discoveries.</span>
        <span>Face by Pieces</span>
      </footer>
    </main>
  )
}

export default function App() {
  const [styleId, setStyleId] = useState(() => {
    const savedStyle = localStorage.getItem(STYLE_STORAGE_KEY)
    return STYLES.some((style) => style.id === savedStyle)
      ? savedStyle
      : 'line-art'
  })
  const [portraitIndex, setPortraitIndex] = useState(() =>
    getRandomPortraitIndex(-1, styleId),
  )
  const viewedPortraitsRef = useRef(new Set([portraitIndex]))
  const [modeId, setModeId] = useState(
    () => localStorage.getItem('face-by-pieces-mode') || 'two',
  )
  const [deviceId] = useState(getOrCreateDeviceId)
  const [sessionId, setSessionId] = useState(createSessionId)
  const [visibleIndices, setVisibleIndices] = useState([])
  const [elementHistory, setElementHistory] = useState([])
  const [refreshCount, setRefreshCount] = useState(0)
  const [answer, setAnswer] = useState('')
  const [answerError, setAnswerError] = useState('')
  const [answerFocused, setAnswerFocused] = useState(false)
  const [viewportHeight, setViewportHeight] = useState(() =>
    Math.round(window.visualViewport?.height || window.innerHeight),
  )
  const [viewportOffset, setViewportOffset] = useState(() =>
    Math.round(window.visualViewport?.offsetTop || 0),
  )
  const [result, setResult] = useState(null)
  const [submittedAnswer, setSubmittedAnswer] = useState('')
  const [openMenu, setOpenMenu] = useState(null)

  const portrait = PORTRAITS[portraitIndex]
  const mode = MODES.find((option) => option.id === modeId) || MODES[1]
  const style = STYLES.find((option) => option.id === styleId) || STYLES[0]
  const artwork = portrait.styles[style.id]
  const clueIndices = useMemo(
    () => getClueIndices(artwork, style.id),
    [artwork, style.id],
  )
  const progressiveComplete =
    mode.id === 'progressive' && visibleIndices.length >= clueIndices.length
  const usesOnScreenKeyboard = window.matchMedia(
    '(hover: none) and (pointer: coarse)',
  ).matches
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
    const initialIndices =
      style.id === 'abstract' ? [] : sampleIndices(clueIndices, mode.count)
    setVisibleIndices(initialIndices)
    setElementHistory([initialIndices])
    recordInitialElements(sessionId, initialIndices)
    setRefreshCount(0)
    setAnswer('')
    setAnswerError('')
    setResult(null)
    setSubmittedAnswer('')
  }, [mode.id, mode.count, portraitIndex, sessionId, style.id, clueIndices])

  const handleRefresh = () => {
    if (progressiveComplete) return

    let nextVisibleIndices
    if (mode.id === 'progressive') {
      const hidden = clueIndices.filter(
        (index) => !visibleIndices.includes(index),
      )
      const nextIndex = hidden[Math.floor(Math.random() * hidden.length)]
      nextVisibleIndices = [...visibleIndices, nextIndex]
    } else {
      nextVisibleIndices = sampleIndices(
        clueIndices,
        mode.count,
        visibleIndices,
      )
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
    const correct = portrait.aliases.some(
      (alias) => normalizeAnswer(alias) === normalizedGuess,
    )
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

  const handleChangeSettings = (nextMode, nextStyle) => {
    localStorage.setItem('face-by-pieces-mode', nextMode)
    localStorage.setItem(STYLE_STORAGE_KEY, nextStyle)
    const modeChanged = nextMode !== mode.id
    const styleChanged = nextStyle !== style.id
    if (modeChanged)
      recordSessionEvent(sessionId, 'mode_changed', {
        from: mode.id,
        to: nextMode,
      })
    if (styleChanged)
      recordSessionEvent(sessionId, 'style_changed', {
        from: style.id,
        to: nextStyle,
      })
    if (modeChanged || styleChanged) {
      const nextPortraitIndex = styleChanged
        ? getRandomPortraitIndex(portraitIndex, nextStyle)
        : portraitIndex
      viewedPortraitsRef.current = new Set([nextPortraitIndex])
      setSessionId(createSessionId())
      setPortraitIndex(nextPortraitIndex)
      setModeId(nextMode)
      setStyleId(nextStyle)
    }
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

  const handleToggleMenu = (menu) => {
    if (openMenu !== menu) {
      recordSessionEvent(
        sessionId,
        menu === 'style' ? 'style_opened' : 'settings_opened',
      )
    }
    setOpenMenu((current) => (current === menu ? null : menu))
  }

  const handleCloseMenu = useCallback(() => setOpenMenu(null), [])

  if (result) {
    return (
      <ResultScreen
        elementHistory={elementHistory}
        mode={mode}
        portrait={portrait}
        artwork={artwork}
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
      className={`ink-app game-shell ${keyboardLayoutActive ? 'answer-focused' : ''}`}
      style={{
        '--viewport-height': `${viewportHeight}px`,
        '--viewport-offset': `${viewportOffset}px`,
      }}
    >
      <header className="guess-header">
        <div className="guess-settings">
          <SettingsDropdown
            label="Mode"
            options={MODES}
            value={mode.id}
            open={openMenu === 'mode'}
            onToggle={() => handleToggleMenu('mode')}
            onClose={handleCloseMenu}
            onSelect={(nextMode) => handleChangeSettings(nextMode, style.id)}
          />
          <SettingsDropdown
            label="Style"
            options={STYLES}
            value={style.id}
            open={openMenu === 'style'}
            onToggle={() => handleToggleMenu('style')}
            onClose={handleCloseMenu}
            onSelect={(nextStyle) => handleChangeSettings(mode.id, nextStyle)}
            legacyLink
          />
        </div>
        <h1 id="game-prompt">Guess Who?</h1>
        <p className="guess-step-counter" role="status" aria-atomic="true">
          <span>Step</span> {refreshCount + 1}
        </p>
      </header>
      <section className="guess-sketch" aria-labelledby="game-prompt">
        <PortraitArtwork
          className="portrait-artwork"
          artwork={artwork}
          styleId={style.id}
          visibleIndices={visibleIndices}
          label={`A partially revealed portrait with ${visibleIndices.length} visible clues`}
          fitToInk
        />
      </section>
      <div className="guess-controls">
        <button
          className="next-clue-button"
          onPointerDown={(event) => {
            if (answerFocused) event.preventDefault()
          }}
          onClick={handleRefresh}
          disabled={progressiveComplete}
          title={progressiveComplete ? 'All clues revealed' : 'Next clue'}
          aria-label={
            progressiveComplete
              ? 'All portrait elements revealed'
              : mode.id === 'progressive'
                ? 'Reveal the next portrait clue'
                : 'Refresh portrait clues'
          }
        >
          <Icon
            name={
              progressiveComplete
                ? 'check'
                : mode.id === 'progressive'
                  ? 'arrow'
                  : 'refresh'
            }
          />
        </button>
        <form className="guess-form" onSubmit={handleSubmit} noValidate>
          <label className="visually-hidden" htmlFor="famous-person">
            Enter their name
          </label>
          <div className={`guess-input ${answerError ? 'has-error' : ''}`}>
            <input
              id="famous-person"
              type="text"
              value={answer}
              onFocus={() => {
                setAnswerFocused(true)
                if (usesOnScreenKeyboard)
                  requestAnimationFrame(() => window.scrollTo(0, 0))
              }}
              onBlur={() => setAnswerFocused(false)}
              onChange={(event) => {
                setAnswer(event.target.value)
                if (answerError) setAnswerError('')
              }}
              placeholder="Their name…"
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="go"
              aria-invalid={Boolean(answerError)}
              aria-describedby={answerError ? 'answer-error' : undefined}
            />
            <button type="submit" aria-label="Submit guess">
              <Icon />
            </button>
          </div>
          <p id="answer-error" className="guess-error" aria-live="polite">
            {answerError}
          </p>
        </form>
      </div>
    </main>
  )
}
