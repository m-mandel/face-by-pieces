import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Old interface links and saved preferences open the same fixed game.
document.documentElement.dataset.ux = 'ink'
document
  .querySelector('meta[name="theme-color"]')
  ?.setAttribute('content', '#ffffff')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
