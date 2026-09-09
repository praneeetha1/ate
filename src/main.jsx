import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { PantryProvider } from './context/PantryContext'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import App from './App'
import { ErrorBoundary } from './App'
import ConfigError from './components/ConfigError'
import { configError } from './lib/supabase'
import './index.css'

const root = createRoot(document.getElementById('root'))

if (configError) {
  // Without Supabase credentials there is no app to render — show what's wrong
  // rather than mounting providers that would immediately throw.
  root.render(<ConfigError message={configError} />)
} else {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <HashRouter>
          <ToastProvider>
            <AuthProvider>
              <AppProvider>
                <PantryProvider>
                  <App />
                </PantryProvider>
              </AppProvider>
            </AuthProvider>
          </ToastProvider>
        </HashRouter>
      </ErrorBoundary>
    </StrictMode>
  )

  registerServiceWorker()
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  if (!import.meta.env.PROD) {
    // In dev, unregister any cached SW so Vite's dev server always serves fresh assets.
    navigator.serviceWorker.getRegistrations()
      .then(regs => regs.forEach(r => r.unregister()))
      .catch(() => {})
    return
  }

  window.addEventListener('load', () => {
    // Captured before registering: if a worker is already in control, this page
    // is running against a previous deployment's shell and must reload once the
    // replacement activates. On a first visit there is nothing stale to replace,
    // so reloading would just cost the user an extra round trip.
    const hadController = !!navigator.serviceWorker.controller

    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js')
      .then(reg => {
        reg.addEventListener('updatefound', () => {
          const next = reg.installing
          if (!next) return
          next.addEventListener('statechange', () => {
            if (next.state === 'activated' && hadController) window.location.reload()
          })
        })
      })
      .catch(() => {})
  })
}
