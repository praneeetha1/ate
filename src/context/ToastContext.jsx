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

  /**
   * `actions` ([{ label, onClick }]) adds buttons such as View and Undo. A
   * toast with actions stays up twice as long — long enough to reach for Undo.
   */
  const showToast = useCallback((message, type = 'error', { actions } = {}) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, type, actions }])
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
      timersRef.current.delete(id)
    }, actions?.length ? DURATION * 2 : DURATION)
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
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto w-full flex items-center gap-1 rounded-xl shadow-warm-lg text-[0.82rem] font-medium text-white ${
              t.type === 'error' ? 'bg-[#c0392b]' : 'bg-accent'
            }`}
          >
            <button type="button" onClick={() => dismiss(t.id)} className="flex-1 text-left px-4 py-2.5">
              {t.message}
            </button>
            {t.actions?.map(a => (
              <button
                key={a.label}
                type="button"
                onClick={() => { a.onClick(); dismiss(t.id) }}
                className="shrink-0 min-h-[44px] px-3 font-bold underline underline-offset-2"
              >{a.label}</button>
            ))}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
