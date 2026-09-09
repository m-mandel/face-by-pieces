import React from 'react'
import ReactDOM from 'react-dom/client'

// Keep the original interface independently loadable, including its stylesheet.
const UX_STORAGE_KEY = 'face-by-pieces-ux'
const requestedUX = new URLSearchParams(window.location.search).get('ux')
let savedUX
try {
  savedUX = localStorage.getItem(UX_STORAGE_KEY)
} catch {
  /* The default interface also works without preference storage. */
}
const ux = ['ink', 'legacy'].includes(requestedUX)
  ? requestedUX
  : savedUX === 'legacy'
    ? 'legacy'
    : 'ink'
try {
  localStorage.setItem(UX_STORAGE_KEY, ux)
} catch {
  /* Saving a preference is optional. */
}
document.documentElement.dataset.ux = ux
document
  .querySelector('meta[name="theme-color"]')
  ?.setAttribute('content', ux === 'legacy' ? '#f5f0e6' : '#ffffff')

async function mountApp() {
  const [{ default: App }] =
    ux === 'legacy'
      ? await Promise.all([
          import('./legacy/LegacyApp'),
          import('./legacy/styles.css'),
        ])
      : await Promise.all([import('./App'), import('./styles.css')])

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

mountApp()
