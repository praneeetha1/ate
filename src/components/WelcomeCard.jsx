import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { loadSlice, saveSlice, scopeFor } from '../utils/storage'
import Icon from './Icon'

const KEY = 'seen_welcome'

/**
 * Three things worth knowing, once, on Home.
 *
 * A card rather than a step-by-step tour: tours get skipped, and they block the
 * app until they're done. Each tip goes straight to where it's used.
 *
 * Remembered per account on this device (and a guest dismissal counts for the
 * account that signs in on it). It can come back once on a new device; that
 * costs a tap, where storing it server-side would cost a schema change.
 */
export function hasSeenWelcome(uid) {
  return !!loadSlice(scopeFor(uid), KEY, false) || !!loadSlice(scopeFor(null), KEY, false)
}

export function resetWelcome(uid) {
  saveSlice(scopeFor(uid), KEY, false)
  saveSlice(scopeFor(null), KEY, false)
}

export default function WelcomeCard({ onNewRecipe }) {
  const { user } = useAuth()
  const uid = user?.id
  const [hidden, setHidden] = useState(() => hasSeenWelcome(uid))
  if (hidden || hasSeenWelcome(uid)) return null

  function dismiss() {
    saveSlice(scopeFor(uid), KEY, true)
    setHidden(true)
  }

  const tip = 'flex items-start gap-3 py-2.5 border-b border-dashed border-ink/20 last:border-0'
  const go = 'font-bold text-accent-dk underline underline-offset-2 min-h-[32px] inline-flex items-center'

  return (
    <section aria-labelledby="welcome-heading" className="mx-5 mt-4 border-[2.5px] border-ink rounded-2xl bg-card shadow-warm px-4 pt-3 pb-2">
      <div className="flex items-start justify-between gap-2">
        <h2 id="welcome-heading" className="font-display text-[1.15rem] font-semibold text-ink">Welcome to ate.</h2>
        <button onClick={dismiss} aria-label="Hide these tips" className="w-11 h-11 -mt-2 -mr-2 grid place-items-center rounded-full hover:bg-paper shrink-0">
          <Icon name="close" size={16} strokeWidth={2.6} />
        </button>
      </div>
      <ul className="list-none">
        <li className={tip}>
          <Icon name="fridge" size={20} className="shrink-0 mt-0.5" />
          <p className="text-[0.9rem] text-ink">
            {uid
              ? <>Tell the Fridge what you have, and <b>What can I make</b> ranks recipes by how close you are. <Link to="/pantry" className={go}>Open Fridge</Link></>
              : <>Sign in to keep a pantry, and <b>What can I make</b> ranks recipes by how close you are. <Link to="/login?next=/pantry" className={go}>Sign in</Link></>}
          </p>
        </li>
        <li className={tip}>
          <Icon name="plus" size={20} className="shrink-0 mt-0.5" />
          <p className="text-[0.9rem] text-ink">
            Add a recipe from a link or a screenshot — step photos come with it.{' '}
            <button type="button" onClick={onNewRecipe} className={go}>Add a recipe</button>
          </p>
        </li>
        <li className={tip}>
          <Icon name="pan" size={20} className="shrink-0 mt-0.5" />
          <p className="text-[0.9rem] text-ink">
            Open any recipe and tap <b>Start cooking</b>: one step at a time, with timers, and the screen stays on.
          </p>
        </li>
      </ul>
      <button onClick={dismiss} className="w-full min-h-[44px] mt-1 rounded-xl border-2 border-ink bg-accent font-bold text-ink shadow-pop press">Got it</button>
    </section>
  )
}
