import { useEffect, useRef, useState } from 'react'
import './photoRecognition.css'

export default function PhotoRecognition({ photoSrc, roundNumber, viewportHeight, viewportOffset = 0, keyboardLayoutActive = false, onEditingChange, onAnswer }) {
  const [status, setStatus] = useState(photoSrc ? 'loading' : 'unavailable')
  const [attempt, setAttempt] = useState(0)
  const [answerFocused, setAnswerFocused] = useState(false)
  const [guess, setGuess] = useState('')
  const [error, setError] = useState('')
  const headingRef = useRef(null)
  const answeredRef = useRef(false)
  const ready = status === 'ready'
  const unavailable = status === 'unavailable' || status === 'error'

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }) }, [])

  const answer = (recognized, submittedGuess = null) => {
    if (answeredRef.current || (recognized !== null && !ready)) return
    answeredRef.current = true
    onAnswer(recognized, submittedGuess)
  }

  const submitGuess = (event) => {
    event.preventDefault()
    if (!ready || answeredRef.current) return
    if (!guess.trim()) {
      setError('Type a name before you guess.')
      return
    }
    if (guess.trim().length > 200) {
      setError('Keep your guess to 200 characters or fewer.')
      return
    }
    answer(true, guess.trim())
  }

  return (
    <main
      className={`ink-app photo-recognition ${keyboardLayoutActive ? 'answer-focused' : ''}`}
      style={{ height: viewportHeight, '--viewport-offset': `${viewportOffset}px` }}
    >
      <header className="photo-recognition-header">
        <p className="guess-face-counter">Face {roundNumber} of 5</p>
        <h1 ref={headingRef} tabIndex={-1}>
          {unavailable ? 'Photo unavailable' : 'Who is it?'}
        </h1>
        <p>{unavailable ? (roundNumber === 5 ? 'You can continue to your results.' : 'You can continue to the next face.') : 'Take another guess using the photo.'}</p>
      </header>
      <div className="recognition-photo" aria-busy={status === 'loading'}>
        {photoSrc && status !== 'error' && (
          <img
            key={attempt}
            src={photoSrc}
            alt="Photo of the person from this round"
            onLoad={() => setStatus('ready')}
            onError={() => setStatus('error')}
          />
        )}
        {status === 'loading' && <p role="status">Loading photo…</p>}
        {unavailable && <p role="status">The photo isn’t available right now.</p>}
      </div>
      <div className="photo-recognition-actions">
        {unavailable ? (
          <>
            {photoSrc && (
              <button className="recognition-choice" onClick={() => { setStatus('loading'); setAttempt(attempt + 1) }}>
                Try loading again
              </button>
            )}
            <button className="primary-button" onClick={() => answer(null)}>
              {roundNumber === 5 ? 'See results' : 'Continue'}
            </button>
          </>
        ) : (
          <>
            <form className={`guess-form photo-guess-form ${answerFocused ? 'is-editing' : 'has-skip'}`} onSubmit={submitGuess} noValidate>
              <label className="visually-hidden" htmlFor="photo-guess">Enter their name</label>
              <div className="guess-answer-row">
                <div
                  className={`guess-input ${error ? 'has-error' : ''}`}
                  onFocus={() => {
                    if (!ready) return
                    setAnswerFocused(true)
                    onEditingChange?.(true)
                  }}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setAnswerFocused(false)
                      onEditingChange?.(false)
                    }
                  }}
                >
                  <input
                    id="photo-guess"
                    type="text"
                    placeholder="Their name…"
                    value={guess}
                    maxLength={200}
                    disabled={!ready}
                    autoComplete="off"
                    autoCapitalize="words"
                    enterKeyHint="go"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'photo-guess-error' : undefined}
                    onChange={(event) => { setGuess(event.target.value); setError('') }}
                  />
                  {answerFocused && (
                    <button type="submit" aria-label="Submit guess" onPointerDown={(event) => event.preventDefault()}>
                      Submit
                    </button>
                  )}
                </div>
                {!answerFocused && (
                  <button className="reveal-answer-button" type="button" disabled={!ready} onClick={() => answer(false)}>
                    I don't know :(
                  </button>
                )}
              </div>
              <p id="photo-guess-error" className="guess-error" aria-live="polite">{error}</p>
            </form>
            {status === 'loading' && <button className="text-button" onClick={() => answer(null)}>Continue without photo</button>}
          </>
        )}
      </div>
    </main>
  )
}
