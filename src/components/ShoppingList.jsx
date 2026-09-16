import { useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { usePantry } from '../context/PantryContext'
import { measureLabel } from '../utils/shopping'
import Icon from './Icon'

/**
 * What you still need, one row per thing you'd pick up.
 *
 * Keyed by ingredient rather than by recipe, so onions wanted by three recipes
 * are one row you tick once instead of three you tick three times. The recipes
 * that wanted it become a subtitle, which is the only thing the old grouping
 * was really for.
 *
 * Lives on the Fridge page directly under the pantry, because the two are one
 * question asked twice — and now they share a vocabulary, so ticking something
 * off hands it straight to the pantry.
 */
export default function ShoppingList() {
  const { shoppingItems, toggleShopItem, removeShopItem, addShoppingItem, clearShopping } = useApp()
  const { setPantryState } = usePantry()

  const [draft, setDraft] = useState('')
  const [note,  setNote]  = useState('')
  const inputRef = useRef(null)

  /**
   * Still to buy first, then what's already in the basket.
   *
   * Ticked rows stay on screen rather than vanishing — seeing the list shorten
   * is the point of ticking, and an item that disappears the instant you tap it
   * is one you can't untick when you put it back.
   */
  const rows = useMemo(() => {
    const all = [...shoppingItems.values()]
    const by = (a, b) => a.display.localeCompare(b.display)
    return [...all.filter(r => !r.checked).sort(by), ...all.filter(r => r.checked).sort(by)]
  }, [shoppingItems])

  const outstanding = rows.filter(r => !r.checked).length

  function handleAdd(e) {
    e.preventDefault()
    const value = draft.trim()
    if (!value) { inputRef.current?.focus(); return }
    const item = addShoppingItem(value)
    if (!item) {
      setNote('No need to buy water.')
      setDraft('')
      return
    }
    setDraft('')
    setNote('')
    inputRef.current?.focus()
  }

  /**
   * Ticking means you have it now, so the pantry learns from a gesture you
   * were making anyway. Unticking is a correction — putting it back on the
   * shelf isn't a claim to be out of it — so it deliberately writes nothing.
   */
  function handleToggle(row) {
    const nowChecked = toggleShopItem(row.item)
    if (nowChecked) setPantryState(row.item, 'have')
  }

  return (
    <section aria-labelledby="shopping-heading">
      <div className="flex items-center justify-between px-5 py-[18px] pb-3">
        <h2 id="shopping-heading" className="font-display text-[1.15rem] font-semibold text-ink flex items-center gap-2">
          <Icon name="cart" size={19} />Shopping List
          {outstanding > 0 && (
            <span className="text-[0.72rem] font-normal text-muted">({outstanding} to buy)</span>
          )}
        </h2>
        {rows.length > 0 && (
          <button
            onClick={clearShopping}
            className="text-[0.78rem] font-bold border-2 rounded-full px-3 py-[5px] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent border-ink text-muted hover:text-heart hover:border-heart"
          >Clear all</button>
        )}
      </div>

      <div className="px-4 pb-4">
        {/* The list used to be recipe-keyed, so there was nowhere to put
            something you just ran out of. */}
        <form onSubmit={handleAdd} className="flex gap-2 mb-4">
          <input
            ref={inputRef}
            value={draft}
            onChange={e => { setDraft(e.target.value); setNote('') }}
            placeholder="Add something to buy…"
            aria-label="Add an item to your shopping list"
            maxLength={80}
            className="flex-1 min-w-0 text-[0.85rem] border-2 border-ink rounded-xl px-3 py-2 bg-card outline-none focus:border-accent text-ink placeholder:text-muted"
          />
          <button
            type="submit"
            className="bg-accent text-ink border-2 border-ink shadow-pop press rounded-xl px-4 text-[0.8rem] font-bold whitespace-nowrap hover:bg-accent-dk transition-colors"
          >Add</button>
        </form>
        {note && (
          <p role="status" className="text-[0.78rem] text-muted italic mb-3 -mt-2">{note}</p>
        )}

        {!rows.length ? (
          <div className="text-center py-[32px] px-5">
            <p className="font-display text-[1.05rem] text-muted">Nothing here yet</p>
            <p className="text-[0.8rem] text-muted mt-2 italic">
              Add something above, or open a recipe and tap the cart to add what it needs.
            </p>
          </div>
        ) : (
          <ul className="list-none border-2 border-ink rounded-xl overflow-hidden bg-card">
            {rows.map(row => {
              const measure = measureLabel(row)
              const from = row.sources.map(s => s.name).filter(Boolean)
              return (
                <li
                  key={row.item}
                  className={`flex items-start gap-2 border-b border-[rgba(200,180,130,0.25)] last:border-0 transition-all hover:bg-paper ${row.checked ? 'opacity-45' : ''}`}
                >
                  <label className="flex items-start gap-2.5 px-3.5 py-2.5 cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={row.checked}
                      onChange={() => handleToggle(row)}
                      aria-label={row.display}
                      className="accent-accent w-[15px] h-[15px] shrink-0 mt-[3px]"
                    />
                    <span className="min-w-0">
                      <span className={`block text-[0.88rem] text-ink ${row.checked ? 'line-through' : ''}`}>
                        {measure && <span className="text-accent-dk font-bold mr-1.5">{measure}</span>}
                        {row.display}
                      </span>
                      {/* Why it's on the list. An item you added yourself has
                          no sources and needs no explanation. */}
                      {from.length > 0 && (
                        <span className="block text-[0.72rem] text-muted truncate">{from.join(', ')}</span>
                      )}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeShopItem(row.item)}
                    aria-label={`Remove ${row.display} from shopping list`}
                    className="shrink-0 grid place-items-center w-7 h-7 mt-2 mr-2 rounded-full text-muted opacity-60 hover:opacity-100 hover:text-heart hover:bg-paper transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  ><Icon name="close" size={12} strokeWidth={3} /></button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
