import { useState } from 'react'
import { useDialog } from '../hooks/useDialog'
import Icon from './Icon'

const SECTIONS = [
  { key: 'buy',      title: 'To buy',                                hint: 'Not in your pantry.' },
  { key: 'low',      title: 'Running low',                           hint: 'Add if you need more.' },
  { key: 'optional', title: 'Optional in this recipe',               hint: 'Only if you want them.' },
  { key: 'assumed',  title: 'Usually in your kitchen',               hint: 'We assume you keep these. Tick any you’ve run out of.', folded: true },
  { key: 'pantry',   title: 'In your pantry',                        hint: 'You said you have these.', folded: true, readOnly: true },
]

/**
 * Review before adding a recipe to the shopping list.
 *
 * Only opened when there's a real choice (see planShopping): running-low
 * items, optional ones, or "this or that". Everything starts the way most
 * people want it — things you don't have ticked, the rest not — so the
 * common case is one tap on the button.
 */
export default function ShoppingSheet({ recipe, servings, plan, onAdd, onClose }) {
  const { titleId, backdropProps, panelProps } = useDialog({ onClose })
  const [rows, setRows] = useState(plan.rows)
  const [open, setOpen] = useState({})

  const update = (id, patch) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  const count = rows.filter(r => r.checked && r.section !== 'pantry').length

  return (
    <div className="fixed inset-0 z-[600] bg-[rgba(60,35,15,0.55)] flex items-end sm:items-center justify-center" {...backdropProps}>
      <div
        className="bg-card border-[3px] border-ink rounded-t-2xl sm:rounded-2xl shadow-warm-xl w-full max-w-[520px] max-h-[90vh] flex flex-col"
        {...panelProps}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-ink">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-[1.2rem] font-semibold text-ink">Add to shopping list</h2>
            <p className="text-[0.85rem] text-muted truncate">
              {recipe.name}{servings ? ` · for ${servings} serving${servings === 1 ? '' : 's'}` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 grid place-items-center rounded-full hover:bg-paper shrink-0">
            <Icon name="close" size={18} strokeWidth={2.6} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-3 flex flex-col gap-4">
          {SECTIONS.map(sec => {
            const list = rows.filter(r => r.section === sec.key)
            if (!list.length) return null
            const folded = sec.folded && !open[sec.key]
            return (
              <section key={sec.key} aria-label={sec.title}>
                <button
                  type="button"
                  onClick={() => sec.folded && setOpen(o => ({ ...o, [sec.key]: !o[sec.key] }))}
                  aria-expanded={sec.folded ? !folded : undefined}
                  disabled={!sec.folded}
                  className="w-full flex items-baseline justify-between gap-2 text-left disabled:cursor-default min-h-[32px]"
                >
                  <span className="text-[0.8rem] font-bold uppercase tracking-[0.06em] text-ink">{sec.title}</span>
                  <span className="text-[0.75rem] text-muted shrink-0">
                    {list.length}{sec.folded ? (folded ? ' · show' : ' · hide') : ''}
                  </span>
                </button>
                {!folded && (
                  <>
                    <p className="text-[0.78rem] text-muted mb-1.5">{sec.hint}</p>
                    <ul className="list-none border-2 border-ink rounded-xl overflow-hidden">
                      {list.map(r => (
                        <li key={r.id} className="border-b border-warm-tan last:border-0 px-3 py-2">
                          <label className={`flex items-center gap-3 min-h-[40px] ${sec.readOnly ? '' : 'cursor-pointer'}`}>
                            {!sec.readOnly && (
                              <input
                                type="checkbox"
                                checked={r.checked}
                                onChange={e => update(r.id, { checked: e.target.checked })}
                                className="accent-accent w-5 h-5 shrink-0"
                              />
                            )}
                            <span className="min-w-0">
                              <span className="block text-[0.95rem] text-ink">
                                {r.measure && <span className="font-bold text-accent-dk mr-1.5">{r.measure}</span>}
                                {r.name}
                              </span>
                              {r.alsoOnListFor.length > 0 && (
                                <span className="block text-[0.75rem] text-muted">
                                  Also on your list for {r.alsoOnListFor.join(', ')} — amounts add up.
                                </span>
                              )}
                            </span>
                          </label>
                          {/* "Sour cream or plain yogurt": pick which one to buy. */}
                          {r.options.length > 1 && !sec.readOnly && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5 ml-8" role="group" aria-label={`Which to buy for ${r.name}`}>
                              <span className="text-[0.75rem] text-muted">Buy</span>
                              {r.options.map(o => (
                                <button
                                  key={o}
                                  type="button"
                                  aria-pressed={r.chosen === o}
                                  onClick={() => update(r.id, { chosen: o, name: o, checked: true })}
                                  className={`min-h-[32px] px-3 rounded-full border-2 border-ink text-[0.78rem] font-bold ${r.chosen === o ? 'bg-accent' : 'bg-card text-muted'}`}
                                >{o}</button>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )
          })}
        </div>

        <div className="flex gap-3 px-5 py-3 border-t border-ink pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <button onClick={onClose} className="min-h-[48px] px-5 rounded-xl border-2 border-ink bg-card font-bold text-ink">Cancel</button>
          <button
            onClick={() => onAdd(rows)}
            disabled={!count}
            className="flex-1 min-h-[48px] rounded-xl border-[2.5px] border-ink bg-accent text-ink font-display font-semibold text-[1rem] shadow-pop press disabled:opacity-40"
          >{count ? `Add ${count} to shopping list` : 'Nothing selected'}</button>
        </div>
      </div>
    </div>
  )
}
