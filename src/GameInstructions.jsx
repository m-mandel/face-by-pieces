import { useEffect, useRef } from 'react'

export default function GameInstructions({ onContinue }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="category-welcome-dialog instructions-dialog"
      aria-labelledby="instructions-title"
      aria-describedby="instructions-goal instructions-game"
      onCancel={(event) => {
        event.preventDefault()
        onContinue()
      }}
    >
      <h1 id="instructions-title">How to play</h1>
      <p id="instructions-goal" className="instructions-goal">
        <strong>Guess each face in as few steps as possible.</strong>
      </p>
      <p id="instructions-game">
        Each game has <strong>5 faces</strong>.
      </p>
      <ol className="instructions-steps">
        <li>Type a name whenever you’re ready to guess.</li>
        <li>Tap the arrow for another clue. Each clue adds a step.</li>
        <li>After the final clue, you can choose “I don’t know.”</li>
      </ol>
      <button className="primary-button" type="button" onClick={onContinue} autoFocus>
        Choose a category
      </button>
    </dialog>
  )
}
