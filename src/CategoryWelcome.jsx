import { useEffect, useRef, useState } from 'react'

export default function CategoryWelcome({ options, onStart }) {
  const dialogRef = useRef(null)
  const [categoryId, setCategoryId] = useState('all')

  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="category-welcome-dialog"
      aria-labelledby="category-welcome-title"
      aria-describedby="category-welcome-description"
      onCancel={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const first = dialogRef.current.querySelector('input:checked')
        const last = dialogRef.current.querySelector('button[type="submit"]')
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onStart(categoryId)
        }}
      >
        <h1 id="category-welcome-title">Choose a category</h1>
        <p id="category-welcome-description">
          Pick the faces you’d like to guess. You can change this any time.
        </p>
        <fieldset className="welcome-category-options">
          <legend className="visually-hidden">Categories</legend>
          {options.map((option) => (
            <label
              key={option.id}
              className={`welcome-category-option${categoryId === option.id ? ' selected' : ''}`}
            >
              <input
                type="radio"
                name="welcome-category"
                value={option.id}
                checked={categoryId === option.id}
                disabled={option.disabled}
                onChange={() => setCategoryId(option.id)}
                autoFocus={option.id === 'all'}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
        <button className="primary-button" type="submit">
          Start playing
        </button>
      </form>
    </dialog>
  )
}
