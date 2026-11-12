import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../hooks/useDialog'
import { getTheme, setTheme } from '../utils/theme'
import { VISIBLE_CATALOG } from '../utils/recipe'
import { useStarterRecipes } from './StarterRecipes'
import { resetWelcome } from './Tour'
import Icon from './Icon'

const APPEARANCE = [
  { value: 'light',  label: 'Light' },
  { value: 'dark',   label: 'Dark' },
  { value: 'system', label: 'Match device' },
]

/** App settings. Starter recipes opens its picker in place of this sheet. */
export default function SettingsSheet({ onClose, onPickStarters }) {
  const { titleId, backdropProps, panelProps } = useDialog({ onClose })
  const { user } = useAuth()
  const navigate = useNavigate()
  const { catalog } = useStarterRecipes()
  const [theme, pick] = useState(getTheme)

  const section = 'px-5 py-4 border-b border-warm-tan last:border-0'
  const heading = 'text-[0.8rem] font-bold uppercase tracking-[0.06em] text-ink mb-2'
  const rowBtn  = 'min-h-[44px] px-4 rounded-xl border-2 border-ink bg-card font-bold text-[0.9rem] text-ink shadow-pop press'

  return (
    <div className="fixed inset-0 z-[600] bg-[rgba(60,35,15,0.55)] flex items-end sm:items-center justify-center" {...backdropProps}>
      <div className="bg-card border-[3px] border-ink rounded-t-2xl sm:rounded-2xl shadow-warm-xl w-full max-w-[480px] max-h-[90vh] flex flex-col" {...panelProps}>
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-ink">
          <h2 id={titleId} className="font-display text-[1.3rem] font-semibold text-ink">Settings</h2>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 grid place-items-center rounded-full hover:bg-paper">
            <Icon name="close" size={18} strokeWidth={2.6} />
          </button>
        </div>

        <div className="overflow-y-auto">
          <fieldset className={section}>
            <legend className={`${heading} float-left w-full`}>Appearance</legend>
            <div className="clear-both flex gap-2" role="radiogroup" aria-label="Appearance">
              {APPEARANCE.map(o => (
                <label key={o.value} className={`flex-1 min-h-[44px] grid place-items-center rounded-xl border-2 border-ink text-[0.9rem] font-bold cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink ${theme === o.value ? 'bg-accent shadow-pop' : 'bg-card text-muted'}`}>
                  <input
                    type="radio" name="theme" value={o.value} className="sr-only"
                    checked={theme === o.value}
                    onChange={() => { pick(o.value); setTheme(o.value) }}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>

          <section className={section} aria-labelledby="set-starters">
            <h3 id="set-starters" className={heading}>Starter recipes</h3>
            <p className="text-[0.9rem] text-muted mb-3">
              Showing {catalog.length} of {VISIBLE_CATALOG.length}. Hide the ones you won&rsquo;t make, or bring them back.
            </p>
            <button onClick={() => { onClose(); onPickStarters() }} className={rowBtn}>Choose starter recipes</button>
          </section>

          <section className={section} aria-labelledby="set-tips">
            <h3 id="set-tips" className={heading}>Tips</h3>
            <p className="text-[0.9rem] text-muted mb-3">A quick tour of where everything is, on Home.</p>
            <button onClick={() => { onClose(); navigate('/'); resetWelcome(user?.id) }} className={rowBtn}>Show the tour again</button>
          </section>
        </div>
      </div>
    </div>
  )
}
