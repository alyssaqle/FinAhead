import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/tokens.css'
import './styles/landing.css'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/**
 * Register the shell cache in production only.
 *
 * Skipped in development so the dev server's module graph is never intercepted,
 * and skipped in tests, which run in Node where `navigator` has no
 * `serviceWorker`.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // An unavailable service worker is not an error the user needs to see;
      // the app works identically without it.
    })
  })
}
