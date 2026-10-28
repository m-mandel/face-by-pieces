import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { PORTRAITS, getAvailablePortraitIndices, getClueIndices } from './portraits'
import { CATEGORIES } from './portraitCategories'
import { getNextLayerIndex } from './layerOrder'
import { isCorrectAnswer } from './answerMatching'
import CategoryWelcome from './CategoryWelcome'
import PortraitArtwork from './PortraitArtwork'
import {
  completeGameSession,
  createSessionId,
  getOrCreateDeviceId,
  recordInitialElements,
  recordSessionEvent,
  startGameSession,
} from './telemetry'

const STYLE_ID = 'line-art'
const MODE_ID = 'progressive'
const CATEGORY_STORAGE_KEY = 'face-by-pieces-category'

function getCategoryOptions() {
  return CATEGORIES.map((option) => ({
    ...option,
    disabled: getAvailablePortraitIndices(STYLE_ID, option.id).length === 0,
  }))
}

function getPlayerCategory(deviceId) {
  const savedCategory = localStorage.getItem(`${CATEGORY_STORAGE_KEY}:${deviceId}`)
  return CATEGORIES.some((category) => category.id === savedCategory) &&
    getAvailablePortraitIndices(STYLE_ID, savedCategory).length > 0
    ? savedCategory
    : null
}

function savePlayerCategory(deviceId, categoryId) {
  localStorage.setItem(`${CATEGORY_STORAGE_KEY}:${deviceId}`, categoryId)
  localStorage.setItem(CATEGORY_STORAGE_KEY, categoryId)
}

function getRandomPortraitIndex(currentIndex = -1, categoryId = 'all') {
  const eligibleIndices = getAvailablePortraitIndices(STYLE_ID, categoryId)
  const availableIndices = eligibleIndices.filter(
    (index) => index !== currentIndex,
  )
  if (availableIndices.length === 0) return eligibleIndices[0] ?? -1
  return availableIndices[Math.floor(Math.random() * availableIndices.length)]
}

function getNextUnviewedPortraitIndex(
  currentIndex,
  viewedPortraits,
  categoryId,
) {
  const stylePortraitIndices = getAvailablePortraitIndices(STYLE_ID, categoryId)
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
    const items = [
      ...menuRef.current.querySelectorAll('[role^="menuitem"]:not(:disabled)'),
    ]
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
              disabled={option.disabled}
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
              <strong>Sequence</strong>
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
  const [deviceId] = useState(getOrCreateDeviceId)
  const [startingCategoryId, setStartingCategoryId] = useState(() =>
    getPlayerCategory(deviceId),
  )

  const handleStart = (categoryId) => {
    if (getAvailablePortraitIndices(STYLE_ID, categoryId).length === 0) return
    savePlayerCategory(deviceId, categoryId)
    setStartingCategoryId(categoryId)
  }

  if (startingCategoryId === null) {
    return (
      <main className="ink-app">
        <Masthead />
        <CategoryWelcome options={getCategoryOptions()} onStart={handleStart} />
      </main>
    )
  }

  return <Game deviceId={deviceId} initialCategoryId={startingCategoryId} />
}

function Game({ deviceId, initialCategoryId }) {
  const [categoryId, setCategoryId] = useState(initialCategoryId)
  const [portraitIndex, setPortraitIndex] = useState(() =>
    getRandomPortraitIndex(-1, categoryId),
  )
  const viewedPortraitsRef = useRef(new Set([portraitIndex]))
  const [sessionId, setSessionId] = useState(createSessionId)
  const [visibleIndices, setVisibleIndices] = useState([])
  const [elementHistory, setElementHistory] = useState([])
  const [refreshCount, setRefreshCount] = useState(0)
  const [drawingState, setDrawingState] = useState(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
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
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const promptRef = useRef(null)

  const portrait = PORTRAITS[portraitIndex]
  const artwork = portrait.styles[STYLE_ID]
  const drawingRequestId = `${sessionId}:${refreshCount}:${loadAttempt}`
  const currentDrawingState =
    drawingState?.artwork === artwork &&
    drawingState.visibleIndices === visibleIndices &&
    drawingState.requestId === drawingRequestId
      ? drawingState.status
      : 'loading'
  const drawingReady = currentDrawingState === 'ready'
  const drawingFailed = currentDrawingState === 'error'
  const drawingLoading = !drawingReady && !drawingFailed
  const clueIndices = useMemo(
    () => getClueIndices(artwork, STYLE_ID),
    [artwork],
  )
  const sequenceComplete = visibleIndices.length >= clueIndices.length
  const usesOnScreenKeyboard = window.matchMedia(
    '(hover: none) and (pointer: coarse)',
  ).matches
  const keyboardLayoutActive = answerFocused && usesOnScreenKeyboard

  useEffect(() => {
    promptRef.current?.focus({ preventScroll: true })
  }, [])

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
      mode: MODE_ID,
      style: STYLE_ID,
    })
  }, [deviceId, portrait.id, sessionId])

  useEffect(() => {
    const firstIndex = getNextLayerIndex(artwork.layers)
    const initialIndices = firstIndex === null ? [] : [firstIndex]
    setVisibleIndices(initialIndices)
    setElementHistory([initialIndices])
    recordInitialElements(sessionId, initialIndices)
    setRefreshCount(0)
    setAnswer('')
    setAnswerError('')
    setResult(null)
    setSubmittedAnswer('')
  }, [artwork, portraitIndex, sessionId])

  const handleRefresh = () => {
    if (drawingFailed) {
      setLoadAttempt((attempt) => attempt + 1)
      return
    }
    if (!drawingReady || sequenceComplete) return

    const nextIndex = getNextLayerIndex(artwork.layers, visibleIndices)
    if (nextIndex === null) return
    const nextVisibleIndices = [...visibleIndices, nextIndex]

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

    const correct = isCorrectAnswer(trimmedAnswer, portrait.aliases)
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

  const handleChangeCategory = (nextCategory) => {
    if (
      nextCategory === categoryId ||
      getAvailablePortraitIndices(STYLE_ID, nextCategory).length === 0
    ) return
    savePlayerCategory(deviceId, nextCategory)
    recordSessionEvent(sessionId, 'category_changed', {
      from: categoryId,
      to: nextCategory,
    })
    const nextPortraitIndex = getRandomPortraitIndex(portraitIndex, nextCategory)
    viewedPortraitsRef.current = new Set([nextPortraitIndex])
    setSessionId(createSessionId())
    setPortraitIndex(nextPortraitIndex)
    setCategoryId(nextCategory)
  }

  const handlePlayAgain = () => {
    const nextPortraitIndex = getNextUnviewedPortraitIndex(
      portraitIndex,
      viewedPortraitsRef.current,
      categoryId,
    )
    setSessionId(createSessionId())
    setPortraitIndex(nextPortraitIndex)
  }

  const handleToggleCategories = () => {
    if (!categoriesOpen) recordSessionEvent(sessionId, 'category_opened')
    setCategoriesOpen((current) => !current)
  }

  const handleCloseMenu = useCallback(() => setCategoriesOpen(false), [])

  if (result) {
    return (
      <ResultScreen
        elementHistory={elementHistory}
        portrait={portrait}
        artwork={artwork}
        refreshCount={refreshCount}
        result={result}
        styleId={STYLE_ID}
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
            label="Categories"
            options={getCategoryOptions()}
            value={categoryId}
            open={categoriesOpen}
            onToggle={handleToggleCategories}
            onClose={handleCloseMenu}
            onSelect={handleChangeCategory}
          />
        </div>
        <h1 id="game-prompt" ref={promptRef} tabIndex={-1}>
          Guess Who?
        </h1>
        <p className="guess-step-counter" role="status" aria-atomic="true">
          <span>Step</span> {refreshCount + 1}
        </p>
      </header>
      <section className="guess-sketch" aria-labelledby="game-prompt">
        <PortraitArtwork
          className="portrait-artwork"
          artwork={artwork}
          styleId={STYLE_ID}
          visibleIndices={visibleIndices}
          label={`A partially revealed portrait with ${visibleIndices.length} visible clues`}
          fitToInk
          roundId={sessionId}
          requestId={drawingRequestId}
          onLoadStateChange={setDrawingState}
        />
      </section>
      <div className="guess-controls">
        <button
          className="next-clue-button"
          onPointerDown={(event) => {
            if (answerFocused) event.preventDefault()
          }}
          onClick={handleRefresh}
          disabled={drawingLoading || (sequenceComplete && !drawingFailed)}
          title={
            drawingLoading
              ? 'Loading drawing…'
              : drawingFailed
                ? 'Retry loading drawing'
                : sequenceComplete
                  ? 'All clues revealed'
                  : 'Next clue'
          }
          aria-label={
            drawingLoading
              ? 'Loading drawing'
              : drawingFailed
                ? 'Retry loading drawing'
                : sequenceComplete
                  ? 'All portrait elements revealed'
                  : 'Reveal the next portrait clue'
          }
        >
          <Icon
            name={
              drawingFailed
                ? 'refresh'
                : sequenceComplete
                  ? 'check'
                  : 'arrow'
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
