import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../hooks/useDialog'
import { loadSlice, saveSlice, scopeFor } from '../utils/storage'

const KEY = 'seen_welcome'
const EVENT = 'ate:tour'

/**
 * Seen once per account on this device; a guest who finished it counts for
 * the account that signs in on it. Kept under the welcome card's old key so
 * nobody who already dismissed that sees this again.
 */
export function hasSeenWelcome(uid) {
  return !!loadSlice(scopeFor(uid), KEY, false) || !!loadSlice(scopeFor(null), KEY, false)
}

/** Settings → Show tips again. Also restarts a tour on the page you're on. */
export function resetWelcome(uid) {
  saveSlice(scopeFor(uid), KEY, false)
  saveSlice(scopeFor(null), KEY, false)
  window.dispatchEvent(new Event(EVENT))
}

/** Each stop points at a real control, marked with data-tour="…". */
function stops(signedIn) {
  return [
    { at: 'recipe',   title: 'Recipes',       text: 'Tap a card to open it. Start cooking then takes you through it one card at a time, with timers.' },
    { at: 'add',      title: '+ My Recipe',   text: 'Add your own, or paste a link and it’s imported for you, step photos and all.' },
    { at: 'fridge',   title: 'Fridge',        text: signedIn
      ? 'Mark what you have, and recipes show what you’re missing.'
      : 'Sign in, mark what you have, and recipes show what you’re missing.' },
    { at: 'cart',     title: 'Shopping list', text: 'What a recipe is missing goes here, in one tap.' },
    { at: 'settings', title: 'Settings',      text: 'Dark mode, which starter recipes you see, and this tour again.' },
  ]
}

const target = at => document.querySelector(`[data-tour="${at}"]`)

/**
 * A few seconds' tour of where things are: the page dims, the control being
 * explained stays lit, and one short line says what it does. Skippable at
 * every stop; stops whose control isn't on screen are left out.
 */
export default function Tour() {
  const uid = useAuth().user?.id
  const [open, setOpen] = useState(() => !hasSeenWelcome(uid))
  const [steps, setSteps] = useState([])
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)

  useEffect(() => {
    const restart = () => { setI(0); setOpen(true) }
    window.addEventListener(EVENT, restart)
    return () => window.removeEventListener(EVENT, restart)
  }, [])

  // Which stops exist on this screen, worked out once the page has rendered.
  useEffect(() => {
    if (open) setSteps(stops(!!uid).filter(s => target(s.at)))
  }, [open, uid])

  const step = steps[i]

  // Bring the control into view, then measure it. Header controls need the
  // page at the top, where the hide-on-scroll header is showing.
  useLayoutEffect(() => {
    if (!open || !step) return
    const el = target(step.at)
    if (!el) return
    if (el.closest('header')) { try { window.scrollTo(0, 0) } catch { /* jsdom */ } }
    else el.scrollIntoView?.({ block: 'center', inline: 'nearest' })
    const measure = () => setRect(el.getBoundingClientRect())
    measure()
    const settle = setTimeout(measure, 260)   // after the header slides back in
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      clearTimeout(settle)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, step])

  const finish = useCallback(() => {
    saveSlice(scopeFor(uid), KEY, true)
    setOpen(false)
    setRect(null)
  }, [uid])

  if (!open || !step || !rect) return null
  return createPortal(
    <Stop step={step} n={i} count={steps.length} rect={rect} onNext={() => setI(i + 1)} onFinish={finish} />,
    document.body,
  )
}

/** One stop: the lit window and the bubble. A dialog only while it's showing. */
function Stop({ step, n, count, rect, onNext, onFinish }) {
  const { titleId, panelProps } = useDialog({ onClose: onFinish })

  const pad = 6
  const vw = window.innerWidth, vh = window.innerHeight
  const width = Math.min(320, vw - 24)
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), vw - width - 12)
  const below = rect.bottom + 190 < vh
  const last = n === count - 1

  return (
    <div className="fixed inset-0 z-[700]">
      {/* The dimmed page, with a lit window over the control. Taps on the page
          do nothing during the tour, so it can't navigate away underneath. */}
      <div
        aria-hidden="true"
        className="fixed rounded-xl border-[3px] border-accent pointer-events-none transition-all duration-200 motion-reduce:transition-none"
        style={{
          top: rect.top - pad, left: rect.left - pad,
          width: rect.width + pad * 2, height: rect.height + pad * 2,
          boxShadow: '0 0 0 9999px rgba(20, 15, 10, 0.62)',
        }}
      />
      <div
        className="fixed bg-card border-[3px] border-ink rounded-2xl shadow-warm-lg px-4 pt-3 pb-3"
        style={{ width, left, ...(below ? { top: rect.bottom + pad + 10 } : { bottom: vh - rect.top + pad + 10 }) }}
        {...panelProps}
      >
        <p className="text-[0.75rem] font-bold text-muted">{n + 1} of {count}</p>
        <h2 id={titleId} className="font-display text-[1.25rem] font-semibold text-ink leading-tight">{step.title}</h2>
        <p className="text-[0.95rem] text-ink mt-1">{step.text}</p>
        {/* Next comes first so it takes focus (Enter moves on); shown on the right. */}
        <div className="flex flex-row-reverse items-center justify-between gap-3 mt-3">
          <button
            onClick={() => (last ? onFinish() : onNext())}
            className="min-h-[44px] px-5 rounded-xl border-2 border-ink bg-accent font-bold text-ink shadow-pop press focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >{last ? 'Done' : 'Next'}</button>
          <button onClick={onFinish} className="min-h-[44px] px-2 -ml-2 text-[0.9rem] font-bold text-muted underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink rounded">
            {last ? 'Close' : 'Skip tour'}
          </button>
        </div>
      </div>
    </div>
  )
}
