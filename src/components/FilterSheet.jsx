import { useDialog } from '../hooks/useDialog'
import Icon, { sketchUrl } from './Icon'

// Strictest first, so the row reads as a scale; `mark` is the packet symbol.
export const DIET_OPTIONS = [
  { value: '',        label: 'Any' },
  { value: 'vegan',   label: 'Vegan',     mark: 'veg' },
  { value: 'veg',     label: 'Veg',       mark: 'veg' },
  { value: 'egg',     label: 'Veg + egg', mark: 'egg' },
  { value: 'non-veg', label: 'Non-veg',   mark: 'nonveg' },
]
export const TIME_OPTIONS = [
  { value: '',   label: 'Any' },
  // Short in the sheet (its heading says "Ready within"); the removable chip
  // on the page has no heading beside it, so it says it in full.
  { value: '30', label: '30 min', chip: 'Under 30 min' },
  { value: '60', label: '1 hour', chip: 'Under 1 hr' },
]

/** The chips for whatever is currently narrowing the list, each removable on its own. */
export function activeFilterChips({ diet, time, noPlanAhead }) {
  const out = []
  if (diet) out.push({ key: 'diet', label: DIET_OPTIONS.find(o => o.value === diet)?.label })
  if (time) out.push({ key: 'time', label: TIME_OPTIONS.find(o => o.value === time)?.chip })
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
  const anySet = !!(filters.diet || filters.time || filters.noPlanAhead)

  return (
    <div className="fixed inset-0 z-[500] bg-[rgba(60,35,15,0.55)] flex items-end sm:items-center justify-center" {...backdropProps}>
      <div
        className="relative bg-card border-3 border-ink rounded-t-2xl sm:rounded-2xl shadow-warm-xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto pb-safe modal-animate"
        {...panelProps}
      >
        <span aria-hidden="true" className="sm:hidden absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1.5 rounded-full bg-ink/20" />
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h2 id={titleId} className="font-display text-[1.4rem] font-semibold text-ink">Filters</h2>
          <button onClick={onClose} aria-label="Close filters" className="w-11 h-11 -mr-2 grid place-items-center rounded-circle hover:bg-paper">
            <Icon name="close" size={18} strokeWidth={2.6} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-6">
          <fieldset>
            <legend className="font-display text-[1.1rem] font-semibold text-ink mb-2.5">Diet</legend>
            <div className="grid grid-cols-3 gap-2">
              {DIET_OPTIONS.map(o => {
                const on = filters.diet === o.value
                return (
                  <button
                    key={o.value}
                    onClick={() => set({ diet: o.value })}
                    aria-pressed={on}
                    aria-label={o.value ? undefined : 'Any diet'}
                    className={`min-h-[48px] px-2 inline-flex items-center justify-center gap-1.5 rounded-xl border-2 text-[0.88rem] font-bold transition-colors press ${
                      on ? 'border-ink bg-accent text-ink shadow-pop' : 'border-ink/40 bg-card text-ink hover:border-ink'
                    }`}
                  >
                    {o.mark && <img src={sketchUrl(o.mark)} alt="" width={16} height={16} className="shrink-0" />}
                    {o.label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-display text-[1.1rem] font-semibold text-ink mb-2.5">Ready within</legend>
            <div className="seg">
              {TIME_OPTIONS.map(o => (
                <button key={o.value} onClick={() => set({ time: o.value })} aria-pressed={filters.time === o.value} aria-label={o.value ? o.chip : 'Any time'}>
                  {o.value && <Icon name="clock" size={14} />}{o.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center justify-between gap-4 cursor-pointer rounded-xl border-2 border-ink/40 px-4 py-3">
            <span>
              <span className="block text-[0.98rem] font-bold text-ink">Ready tonight</span>
              <span className="block text-[0.82rem] text-muted">Hide recipes that need marinating, soaking, fermenting or chilling first.</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={filters.noPlanAhead}
              onChange={e => set({ noPlanAhead: e.target.checked })}
            />
          </label>
        </div>

        <div className="sticky bottom-0 flex items-center gap-3 px-5 py-4 border-t border-ink/20 bg-card">
          <button
            onClick={() => onChange({ diet: '', time: '', noPlanAhead: false })}
            disabled={!anySet}
            className="min-h-[48px] px-2 font-bold text-muted underline underline-offset-4 disabled:opacity-40 disabled:no-underline"
          >Clear all</button>
          <button
            onClick={onClose}
            className="flex-1 min-h-[52px] rounded-xl border-2 border-ink bg-accent text-ink font-bold text-[1rem] shadow-warm press"
          >{`Show ${count} recipe${count === 1 ? '' : 's'}`}</button>
        </div>
      </div>
    </div>
  )
}
