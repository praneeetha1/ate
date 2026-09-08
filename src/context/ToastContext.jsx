import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

const ToastContext = createContext(null)

const DURATION = 4000

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef     = useRef(0)
  const timersRef = useRef(new Map())

  const dismiss = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) { clearTimeout(timer); timersRef.current.delete(id) }
  }, [])

  const showToast = useCallback((message, type = 'error') => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, type }])
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
      timersRef.current.delete(id)
    }, DURATION)
    timersRef.current.set(id, timer)
    return id
  }, [])

  const showError = useCallback(message => showToast(message, 'error'), [showToast])

  // Clear any in-flight timers if the provider ever unmounts.
  useEffect(() => {
    const timers = timersRef.current
    return () => { timers.forEach(clearTimeout); timers.clear() }
  }, [])

  return (
    <ToastContext.Provider value={{ showToast, showError, dismiss }}>
      {children}
      <div
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[800] flex flex-col gap-2 items-center pointer-events-none px-4 w-full max-w-sm"
        // Announced to screen readers as it changes; assertive for errors is
        // handled per-toast below.
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto w-full text-left px-4 py-2.5 rounded-xl shadow-warm-lg text-[0.82rem] font-medium text-white ${
              t.type === 'error' ? 'bg-[#c0392b]' : 'bg-accent'
            }`}
          >
            {t.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
