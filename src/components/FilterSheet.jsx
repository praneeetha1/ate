import { useDialog } from '../hooks/useDialog'
import Icon from './Icon'

export const DIET_OPTIONS = [
  { value: '',        label: 'Any' },
  { value: 'veg',     label: 'Veg' },
  { value: 'egg',     label: 'Veg + egg' },
  { value: 'non-veg', label: 'Non-veg' },
  { value: 'vegan',   label: 'Vegan' },
]
export const TIME_OPTIONS = [
  { value: '',   label: 'Any time' },
  { value: '30', label: 'Under 30 min' },
  { value: '60', label: 'Under 1 hr' },
]

/** The chips for whatever is currently narrowing the list, each removable on its own. */
export function activeFilterChips({ diet, time, noPlanAhead }) {
  const out = []
  if (diet) out.push({ key: 'diet', label: DIET_OPTIONS.find(o => o.value === diet)?.label })
  if (time) out.push({ key: 'time', label: TIME_OPTIONS.find(o => o.value === time)?.label })
  if (noPlanAhead) out.push({ key: 'noPlanAhead', label: 'Ready tonight' })
  return out
}

/**
 * Filters in a bottom sheet.
 *
 * They used to be seven pills in one sideways-scrolling row, which on a phone
 * pushed the actions off-screen and showed only the first couple of choices.
 * Changes apply live, so the count on the button is always the real answer.
 */
export default function FilterSheet({ filters, onChange, count, onClose }) {
  const { titleId, backdropProps, panelProps } = useDialog({ onClose })
  const set = patch => onChange({ ...filters, ...patch })

  const pill = active =>
    `min-h-[44px] px-4 rounded-full border-2 border-ink text-[0.9rem] font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
      active ? 'bg-accent text-ink shadow-pop' : 'bg-card text-muted hover:bg-paper'
    }`

  return (
    <div className="fixed inset-0 z-[500] bg-[rgba(60,35,15,0.55)] flex items-end sm:items-center justify-center" {...backdropProps}>
      <div
        className="bg-card border-[3px] border-ink rounded-t-2xl sm:rounded-2xl shadow-warm-xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto pb-[env(safe-area-inset-bottom,0px)]"
        {...panelProps}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-ink">
          <h2 id={titleId} className="font-display text-[1.25rem] font-semibold text-ink">Filters</h2>
          <button onClick={onClose} aria-label="Close filters" className="w-11 h-11 grid place-items-center rounded-full hover:bg-paper">
            <Icon name="close" size={18} strokeWidth={2.6} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5">
          <fieldset>
            <legend className="text-[0.8rem] font-bold uppercase tracking-[0.08em] text-muted mb-2">Diet</legend>
            <div className="flex flex-wrap gap-2">
              {DIET_OPTIONS.map(o => (
                <button key={o.value} onClick={() => set({ diet: o.value })} aria-pressed={filters.diet === o.value} className={pill(filters.diet === o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[0.8rem] font-bold uppercase tracking-[0.08em] text-muted mb-2">Total time</legend>
            <div className="flex flex-wrap gap-2">
              {TIME_OPTIONS.map(o => (
                <button key={o.value} onClick={() => set({ time: o.value })} aria-pressed={filters.time === o.value} className={pill(filters.time === o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={filters.noPlanAhead}
              onChange={e => set({ noPlanAhead: e.target.checked })}
              className="accent-ink w-6 h-6 shrink-0 mt-0.5"
            />
            <span>
              <span className="block text-[0.95rem] font-bold text-ink">Ready tonight</span>
              <span className="block text-[0.82rem] text-muted">Hide recipes that need marinating, soaking, fermenting or chilling first.</span>
            </span>
          </label>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-ink">
          <button
            onClick={() => onChange({ diet: '', time: '', noPlanAhead: false })}
            className="min-h-[48px] px-5 rounded-xl border-2 border-ink bg-card font-bold text-muted"
          >Clear</button>
          <button
            onClick={onClose}
            className="flex-1 min-h-[48px] rounded-xl border-[2.5px] border-ink bg-accent text-ink font-display font-semibold text-[1rem] shadow-pop press"
          >Show {count} recipe{count === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>
  )
}
