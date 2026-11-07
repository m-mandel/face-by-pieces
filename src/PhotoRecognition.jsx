import { useEffect, useRef, useState } from 'react'
import './photoRecognition.css'

export default function PhotoRecognition({ photoSrc, roundNumber, viewportHeight, onAnswer }) {
  const [status, setStatus] = useState(photoSrc ? 'loading' : 'unavailable')
  const [attempt, setAttempt] = useState(0)
  const [recognizes, setRecognizes] = useState(false)
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
    <main className="ink-app photo-recognition" style={viewportHeight ? { height: viewportHeight } : undefined}>
      <header className="photo-recognition-header">
        <p className="guess-face-counter">Face {roundNumber} of 5</p>
        <h1 ref={headingRef} tabIndex={-1}>
          {unavailable ? 'Photo unavailable' : recognizes ? 'Who is it?' : 'Recognize this person?'}
        </h1>
        <p>{unavailable ? (roundNumber === 5 ? 'You can continue to your results.' : 'You can continue to the next face.') : recognizes ? 'Take another guess using the photo.' : 'Do you recognize the person in this photo?'}</p>
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
        {recognizes && ready ? (
          <form className="photo-guess-form" onSubmit={submitGuess} noValidate>
            <label className="visually-hidden" htmlFor="photo-guess">Enter their name</label>
            <input
              id="photo-guess"
              autoFocus
              type="text"
              placeholder="Their name…"
              value={guess}
              maxLength={200}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="go"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'photo-guess-error' : undefined}
              onChange={(event) => { setGuess(event.target.value); setError('') }}
            />
            <button className="primary-button" type="submit">Submit guess</button>
            <p id="photo-guess-error" role="status">{error}</p>
            <button className="text-button" type="button" onClick={() => answer(true)}>I still don’t know</button>
          </form>
        ) : unavailable ? (
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
            <button className="recognition-choice" disabled={!ready} onClick={() => { if (ready && !answeredRef.current) setRecognizes(true) }}>Yes, I recognize them</button>
            <button className="recognition-choice" disabled={!ready} onClick={() => answer(false)}>No, I don’t</button>
            {status === 'loading' && <button className="text-button" onClick={() => answer(null)}>Continue without photo</button>}
          </>
        )}
      </div>
    </main>
  )
}
