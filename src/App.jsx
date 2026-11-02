import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PORTRAITS, getAvailablePortraitIndices, getClueIndices } from './portraits'
import { CATEGORIES } from './portraitCategories'
import { getNextLayerIndex } from './layerOrder'
import { isCorrectAnswer } from './answerMatching'
import CategoryWelcome from './CategoryWelcome'
import PortraitArtwork from './PortraitArtwork'
import './sessionResults.css'
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
const SESSION_LENGTH = 5
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

function getNextSessionPortraitIndex(currentIndex, completedRounds, categoryId) {
  const played = new Set(completedRounds.map((round) => round.portraitIndex))
  const unplayed = getAvailablePortraitIndices(STYLE_ID, categoryId).filter(
    (index) => !played.has(index),
  )
  const available = unplayed.filter((index) => index !== currentIndex)
  if (available.length === 0 && unplayed.length > 0) return unplayed[0]
  if (available.length === 0) return getRandomPortraitIndex(currentIndex, categoryId)
  return available[Math.floor(Math.random() * available.length)]
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

function TimelineReplay({ elementHistory, onBack, artwork, styleId, embedded = false }) {
  const Container = embedded ? 'section' : 'main'
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
    <Container className="ink-app replay-screen">
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
    </Container>
  )
}

function SessionResults({ rounds, onPlayAgain }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const carouselRef = useRef(null)
  const headingRef = useRef(null)
  const navigationTargetRef = useRef(null)
  const activeIndexRef = useRef(activeIndex)
  activeIndexRef.current = activeIndex
  const activeRound = rounds[activeIndex]
  const correctCount = rounds.filter((round) => round.result === 'correct').length

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  useLayoutEffect(() => {
    const alignSlide = () => {
      const carousel = carouselRef.current
      if (carousel && !timelineOpen) {
        navigationTargetRef.current = null
        carousel.scrollTo({ left: carousel.clientWidth * activeIndexRef.current, behavior: 'instant' })
      }
    }
    alignSlide()
    window.addEventListener('resize', alignSlide)
    return () => window.removeEventListener('resize', alignSlide)
  }, [timelineOpen])

  const showFace = (index) => {
    const nextIndex = Math.max(0, Math.min(rounds.length - 1, index))
    const carousel = carouselRef.current
    navigationTargetRef.current = nextIndex
    carousel?.scrollTo({
      left: carousel.clientWidth * nextIndex,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
    setActiveIndex(nextIndex)
  }

  return (
    <main className="ink-app result-screen session-results">
      <Masthead caption="Five faces. The whole picture." />
      <h1 className="visually-hidden" ref={headingRef} tabIndex={-1}>Your session results</h1>
      <div className="session-body">
        <section
          className="session-gallery"
          hidden={timelineOpen}
          aria-label="Face results gallery"
          aria-roledescription="carousel"
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault()
              showFace(activeIndex + (event.key === 'ArrowRight' ? 1 : -1))
            }
          }}
        >
          <nav className="results-navigation" aria-label="Browse face results">
            <button
              className="replay-icon-button"
              aria-label="Previous face"
              disabled={activeIndex === 0}
              onClick={() => showFace(activeIndex - 1)}
            ><Icon name="back" /></button>
            <div className="results-position-group">
              <p className="result-position" role="status" aria-live="polite" aria-atomic="true">
                Face {activeIndex + 1} of {rounds.length}
              </p>
              <div className="results-dots" role="group" aria-label="Choose a face">
                {rounds.map((round, index) => (
                  <button
                    key={round.sessionId}
                    type="button"
                    aria-label={`Show face ${index + 1}`}
                    aria-current={index === activeIndex ? 'true' : undefined}
                    onClick={() => showFace(index)}
                  ><span /></button>
                ))}
              </div>
            </div>
            <button
              className="replay-icon-button"
              aria-label="Next face"
              disabled={activeIndex === rounds.length - 1}
              onClick={() => showFace(activeIndex + 1)}
            ><Icon /></button>
          </nav>
          <div
            ref={carouselRef}
            className="results-carousel"
            tabIndex={0}
            aria-label="Swipe left or right to review your faces"
            onPointerDown={() => { navigationTargetRef.current = null }}
            onWheel={() => { navigationTargetRef.current = null }}
            onScroll={(event) => {
              const { scrollLeft, clientWidth } = event.currentTarget
              if (clientWidth > 0) {
                const target = navigationTargetRef.current
                if (target !== null && Math.abs(scrollLeft - clientWidth * target) > 2) return
                navigationTargetRef.current = null
                const index = Math.round(scrollLeft / clientWidth)
                setActiveIndex(Math.max(0, Math.min(rounds.length - 1, index)))
              }
            }}
          >
            {rounds.map((round, index) => {
              const isCorrect = round.result === 'correct'
              const isSkipped = round.result === 'revealed'
              return (
                <article
                  key={round.sessionId}
                  className={`result-slide ${round.result}`}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`Face ${index + 1} of ${rounds.length}`}
                  aria-hidden={index !== activeIndex}
                >
                  <div className="result-layout">
                    <div className="result-heading">
                      <span className="eyebrow">The reveal</span>
                      <h2>{isCorrect ? 'Correct' : isSkipped ? 'Now you know' : 'Incorrect'}</h2>
                    </div>
                    <figure className="result-figure">
                      <PortraitFrame
                        className="result-portrait"
                        artwork={round.artwork}
                        styleId={round.styleId}
                        label={`Portrait of ${round.portrait.name}`}
                      />
                      <figcaption>
                        <span className="eyebrow">The face behind the lines</span>
                        <h3>{round.portrait.name}</h3>
                      </figcaption>
                    </figure>
                    <div className="result-details">
                      <p className="result-message">
                        {isSkipped ? (
                          'You weren’t sure about this one. Now you know!'
                        ) : (
                          <>You guessed <strong>{round.submittedAnswer}</strong>.{' '}
                            {isCorrect ? 'Nicely spotted.' : 'Another face to remember.'}</>
                        )}
                      </p>
                      <div className="round-stats" aria-label="Round statistics">
                        <div>
                          <strong>{String(round.refreshCount + 1).padStart(2, '0')}</strong>
                          <span>{round.refreshCount === 0 ? 'clue' : 'clues'} used</span>
                        </div>
                        <div>
                          <strong>{index + 1} / {rounds.length}</strong>
                          <span>face in this session</span>
                        </div>
                      </div>
                      <button
                        className="text-button replay-button"
                        disabled={index !== activeIndex}
                        onClick={() => setTimelineOpen(true)}
                      >
                        <Icon name="replay" />
                        Retrace your clues
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
        {timelineOpen && (
          <TimelineReplay
            key={activeRound.sessionId}
            elementHistory={activeRound.elementHistory}
            artwork={activeRound.artwork}
            styleId={activeRound.styleId}
            onBack={() => setTimelineOpen(false)}
            embedded
          />
        )}
      </div>
      <footer className="session-actions">
        <div className="session-score" role="img" aria-label={`${correctCount} out of ${SESSION_LENGTH} correct`}>
          <div className="session-stars" aria-hidden="true">
            {rounds.map((round) => (
              <svg key={round.sessionId} className={`session-star ${round.result === 'correct' ? 'filled' : ''}`} viewBox="0 0 24 24">
                <path d="m12 2.5 2.9 5.9 6.5 1-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5L2.6 9.4l6.5-1Z" />
              </svg>
            ))}
          </div>
          <p aria-hidden="true">{correctCount} of {SESSION_LENGTH} correct</p>
        </div>
        <button className="primary-button" onClick={onPlayAgain}>
          Play again <Icon />
        </button>
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
  const [round, setRound] = useState(() => ({
    categoryId: initialCategoryId,
    portraitIndex: getRandomPortraitIndex(-1, initialCategoryId),
    sessionId: createSessionId(),
    completedRounds: [],
  }))
  const { categoryId, portraitIndex, sessionId, completedRounds } = round

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
    setRound({
      sessionId: createSessionId(),
      portraitIndex: getNextSessionPortraitIndex(portraitIndex, completedRounds, nextCategory),
      categoryId: nextCategory,
      completedRounds,
    })
  }

  const handleComplete = (completedRound) => {
    const completed = [...completedRounds, completedRound]
    const nextRound = {
      ...round,
      completedRounds: completed,
      ...(completed.length < SESSION_LENGTH && {
        sessionId: createSessionId(),
        portraitIndex: getNextSessionPortraitIndex(portraitIndex, completed, categoryId),
      }),
    }
    // Ignore a repeated submission or a callback from a face already replaced.
    setRound((current) =>
      current.sessionId !== completedRound.sessionId ||
      current.completedRounds.length >= SESSION_LENGTH
        ? current
        : nextRound,
    )
  }

  const handlePlayAgain = () => {
    setRound({
      sessionId: createSessionId(),
      portraitIndex: getRandomPortraitIndex(portraitIndex, categoryId),
      categoryId,
      completedRounds: [],
    })
  }

  if (completedRounds.length === SESSION_LENGTH) {
    return <SessionResults rounds={completedRounds} onPlayAgain={handlePlayAgain} />
  }

  // Every face mounts fresh state before rendering. Completed answers stay in
  // the parent until all five faces are finished and the gallery can be shown.
  return (
    <GameRound
      key={sessionId}
      categoryId={categoryId}
      portraitIndex={portraitIndex}
      sessionId={sessionId}
      roundNumber={completedRounds.length + 1}
      deviceId={deviceId}
      onChangeCategory={handleChangeCategory}
      onComplete={handleComplete}
    />
  )
}

function GameRound({
  deviceId,
  categoryId,
  portraitIndex,
  sessionId,
  onChangeCategory,
  roundNumber,
  onComplete,
}) {
  const portrait = PORTRAITS[portraitIndex]
  const artwork = portrait.styles[STYLE_ID]
  const [initialIndices] = useState(() => {
    const firstIndex = getNextLayerIndex(artwork.layers)
    return firstIndex === null ? [] : [firstIndex]
  })
  const [visibleIndices, setVisibleIndices] = useState(initialIndices)
  const [elementHistory, setElementHistory] = useState(() => [initialIndices])
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
  const finishedRef = useRef(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const promptRef = useRef(null)

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
  const allCluesRevealed = sequenceComplete && drawingReady
  const showSkip = allCluesRevealed && !answerFocused
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
    recordInitialElements(sessionId, initialIndices)
  }, [initialIndices, sessionId])

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

  const finishRound = (outcome, submittedAnswer) => {
    if (finishedRef.current) return
    finishedRef.current = true
    completeGameSession(sessionId, {
      outcome: outcome === 'revealed' ? 'incorrect' : outcome,
      submittedAnswer,
      visibleElements: visibleIndices.length,
    })
    onComplete({
      sessionId,
      portraitIndex,
      categoryId,
      portrait,
      artwork,
      styleId: STYLE_ID,
      elementHistory,
      refreshCount,
      result: outcome,
      submittedAnswer,
    })
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmedAnswer = answer.trim()
    if (!trimmedAnswer) {
      setAnswerError('Type a name before you guess.')
      return
    }

    const correct = isCorrectAnswer(trimmedAnswer, portrait.aliases)
    finishRound(correct ? 'correct' : 'incorrect', trimmedAnswer)
  }

  const handleRevealAnswer = () => {
    if (!allCluesRevealed || finishedRef.current) return
    recordSessionEvent(sessionId, 'answer_revealed', { reason: 'unknown' })
    finishRound('revealed', '')
  }

  const handleToggleCategories = () => {
    if (!categoriesOpen) recordSessionEvent(sessionId, 'category_opened')
    setCategoriesOpen((current) => !current)
  }

  const handleCloseMenu = useCallback(() => setCategoriesOpen(false), [])


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
            onSelect={onChangeCategory}
          />
        </div>
        <div className="guess-title">
          <p className="guess-face-counter" role="status">
            Face {roundNumber} of {SESSION_LENGTH}
          </p>
          <h1 id="game-prompt" ref={promptRef} tabIndex={-1}>
            Guess Who?
          </h1>
        </div>
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
                : allCluesRevealed
                  ? 'check'
                  : 'arrow'
            }
          />
        </button>
        <form
          className={`guess-form ${answerFocused ? 'is-editing' : ''} ${showSkip ? 'has-skip' : ''}`}
          onSubmit={handleSubmit}
          noValidate
        >
          <label className="visually-hidden" htmlFor="famous-person">
            Enter their name
          </label>
          <div className="guess-answer-row">
            <div
              className={`guess-input ${answerError ? 'has-error' : ''}`}
              onFocus={() => {
                setAnswerFocused(true)
                if (usesOnScreenKeyboard)
                  requestAnimationFrame(() => window.scrollTo(0, 0))
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                  setAnswerFocused(false)
              }}
            >
              <input
                id="famous-person"
                type="text"
                value={answer}
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
              {answerFocused && (
                <button
                  type="submit"
                  aria-label="Submit guess"
                  onPointerDown={(event) => event.preventDefault()}
                >
                  <Icon />
                </button>
              )}
            </div>
            {showSkip && (
              <button
                type="button"
                className="reveal-answer-button"
                aria-label="I don't know :("
                onClick={handleRevealAnswer}
              >
                I don't know :(
              </button>
            )}
          </div>
          <p id="answer-error" className="guess-error" aria-live="polite">
            {answerError}
          </p>
        </form>
      </div>
    </main>
  )
}
