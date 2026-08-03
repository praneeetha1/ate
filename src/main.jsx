import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import App from './App'
import { ErrorBoundary } from './App'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <ToastProvider>
          <AuthProvider>
            <AppProvider>
              <App />
            </AppProvider>
          </AuthProvider>
        </ToastProvider>
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>
)

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/ate/sw.js')
        .then(reg => {
          // When a new SW activates after a deployment, reload so the page
          // gets the fresh asset URLs instead of running with a stale shell.
          reg.addEventListener('updatefound', () => {
            const next = reg.installing
            next?.addEventListener('statechange', () => {
              if (next.state === 'activated') window.location.reload()
            })
          })
        })
        .catch(() => {})
    })
  } else {
    // In dev, unregister any cached SW so Vite's dev server always serves fresh assets.
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()))
  }
}
