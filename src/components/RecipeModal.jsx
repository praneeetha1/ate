import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { ingredientLabel } from '../utils/recipe'
import Tag from './Tag'

export default function RecipeModal({ recipe, idx, onClose }) {
  const { favorites, toggleFav, ratings, setRating, notes, setNote, shoppingList, toggleShopping } = useApp()

  const [scale,           setScale]           = useState(1)
  const [checkedIngs,     setCheckedIngs]     = useState(new Set())
  const [noteText,        setNoteText]        = useState('')
  const [savedHint,       setSavedHint]       = useState(false)
  const notesTimer = useRef(null)

  const isFav   = favorites.has(idx)
  const inList  = shoppingList.has(idx)
  const rating  = ratings[recipe.name] || 0

  useEffect(() => {
    setScale(1)
    setCheckedIngs(new Set())
    setNoteText(notes[recipe.name] || '')
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [idx])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggleIng(i) {
    setCheckedIngs(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  function handleNoteChange(e) {
    const val = e.target.value
    setNoteText(val)
    setSavedHint(false)
    clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => {
      setNote(recipe.name, val.trim())
      setSavedHint(true)
      setTimeout(() => setSavedHint(false), 1500)
    }, 600)
  }

  function handleStarClick(n) {
    setRating(recipe.name, n === rating ? 0 : n)
  }

  return (
    <div
      className="fixed inset-0 bg-[rgba(60,35,15,0.55)] backdrop-blur-[3px] z-[500] flex items-start justify-center p-8 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card border-[1.5px] border-rim rounded-2xl shadow-warm-xl w-full max-w-[640px] mx-auto my-auto modal-animate">

        {/* ── Header ── */}
        <div className="px-5 pt-5 pb-[14px] border-b border-warm-tan flex items-start gap-3.5">
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-[1.4rem] font-semibold text-ink leading-tight mb-2.5">
              {recipe.name}
            </h2>
            <div className="flex items-center gap-2.5 flex-wrap">
              <Tag category={recipe.category} />
              {recipe.timeMinutes && (
                <span className="text-[0.78rem] text-muted">⏱ {recipe.timeMinutes} min</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              className={`text-[1.5rem] transition-all hover:scale-[1.15] p-1 ${isFav ? 'text-heart' : 'text-warm-tan hover:text-[#e8a0a0]'}`}
              onClick={() => toggleFav(idx)}
              title="Save recipe"
            >♥</button>
            <button
              className={`text-[1.3rem] transition-all hover:scale-[1.15] p-1 ${inList ? 'text-accent-dk' : 'text-warm-tan hover:text-accent'}`}
              onClick={() => toggleShopping(idx)}
              title="Add to shopping list"
            >🛒</button>
            <button
              className="bg-paper border-[1.5px] border-rim rounded-full w-8 h-8 text-muted flex items-center justify-center hover:bg-warm-tan hover:text-ink transition-all text-lg leading-none"
              onClick={onClose}
              title="Close"
            >×</button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="p-5 pb-6">

          {/* Ingredients header + scale */}
          <div className="flex items-center justify-between mb-2.5 pb-1 border-b border-dashed border-rim">
            <span className="font-display text-[0.85rem] font-semibold tracking-[0.1em] uppercase text-accent-dk">
              Ingredients
            </span>
            <div className="flex gap-1 items-center">
              {[1, 2, 3].map(s => {
                const base = recipe.servings || 1
                const label = base * s === 1 ? '1 serving' : `${base * s} servings`
                return (
                  <button
                    key={s}
                    onClick={() => setScale(s)}
                    className={`rounded-[14px] px-2.5 py-[3px] text-[0.72rem] font-bold transition-all border-[1.5px] ${
                      scale === s
                        ? 'bg-accent border-accent text-white'
                        : 'bg-card border-rim text-muted hover:border-accent hover:text-accent-dk'
                    }`}
                  >{label}</button>
                )
              })}
            </div>
          </div>

          {/* Ingredients list */}
          <ul className="list-none mb-5">
            {recipe.ingredients.map((ing, i) => {
              const { measure, item } = ingredientLabel(ing, scale)
              const checked = checkedIngs.has(i)
              return (
                <li
                  key={i}
                  className={`flex items-start gap-2.5 py-[5px] border-b border-[rgba(200,180,130,0.25)] text-[0.88rem] cursor-pointer transition-opacity last:border-0 ${checked ? 'opacity-40' : ''}`}
                  onClick={() => toggleIng(i)}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleIng(i)}
                    onClick={e => e.stopPropagation()}
                    className="accent-accent w-[15px] h-[15px] shrink-0 mt-[1px] cursor-pointer"
                  />
                  <span className="text-accent-dk font-bold min-w-[60px] shrink-0">{measure}</span>
                  <span className="text-ink">{item}</span>
                </li>
              )
            })}
          </ul>

          {/* Steps */}
          <div className="font-display text-[0.85rem] font-semibold tracking-[0.1em] uppercase text-accent-dk mb-2.5 pb-1 border-b border-dashed border-rim">
            Steps
          </div>
          <ol className="list-none mb-1">
            {recipe.steps.map((step, i) => (
              <li key={i} className="flex gap-3 mb-3.5 text-[0.88rem] leading-relaxed">
                <span className="bg-accent text-white w-[22px] h-[22px] rounded-full flex items-center justify-center text-[0.72rem] font-bold shrink-0 mt-[1px]">
                  {i + 1}
                </span>
                <span className="text-ink">{step}</span>
              </li>
            ))}
          </ol>

          {/* Notes & Ratings */}
          <div className="mt-5 pt-4 border-t border-dashed border-rim">
            <div className="font-display text-[0.85rem] font-semibold tracking-[0.1em] uppercase text-accent-dk mb-2.5 pb-1 border-b border-dashed border-rim">
              Your Notes
            </div>
            {/* Stars */}
            <div className="flex items-center gap-0.5 mb-3">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => handleStarClick(n)}
                  className={`text-[1.4rem] leading-none p-[2px] transition-all hover:scale-[1.18] ${n <= rating ? 'text-star' : 'text-warm-tan'}`}
                  title={`${n} star${n > 1 ? 's' : ''}`}
                >★</button>
              ))}
              {rating > 0 && (
                <button
                  onClick={() => setRating(recipe.name, 0)}
                  className="ml-1.5 text-[0.7rem] text-muted underline hover:text-heart transition-colors"
                >clear</button>
              )}
            </div>
            {/* Textarea */}
            <textarea
              value={noteText}
              onChange={handleNoteChange}
              placeholder="Jot down substitutions, tips, how it turned out…"
              className="w-full min-h-[80px] border-[1.5px] border-rim rounded-lg px-3 py-2.5 text-[0.86rem] text-ink bg-paper resize-y outline-none focus:border-accent transition-colors leading-relaxed placeholder:text-muted font-sans"
            />
            <div className="text-right text-[0.68rem] text-muted mt-1 h-[14px]">
              {savedHint ? 'Saved' : ''}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
