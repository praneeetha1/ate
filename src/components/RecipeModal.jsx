import { useState, useEffect, useMemo, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { useDialog } from '../hooks/useDialog'
import { ingredientLabel, keyToText, isUserRecipeKey, userRecipeId } from '../utils/recipe'
import { describeError } from '../utils/errors'
import CreateRecipeModal from './CreateRecipeModal'
import Tag from './Tag'
import Icon from './Icon'
import PantryMark from './PantryMark'
import { usePantry } from '../context/PantryContext'
import { pantryFit } from '../utils/pantry'

export default function RecipeModal({ recipe, recipeKey, editable = false, onClose }) {
  const { favorites, toggleFav, ratings, setRating, notes, setNote, shoppingList, toggleShopping,
          lists, addToList, removeFromList, createList } = useApp()
  const { showToast, showError } = useToast()
  const { pantryState, pantryEnabled } = usePantry()
  const [editing,     setEditing]     = useState(false)

  // Stand the trap down while the edit dialog is stacked on top of this one.
  const { titleId, backdropProps, panelProps } = useDialog({ onClose, enabled: !editing })

  const [scale,       setScale]       = useState(1)
  const [checkedIngs, setCheckedIngs] = useState(new Set())
  const [noteText,    setNoteText]    = useState('')
  const [savedHint,   setSavedHint]   = useState(false)
  const [showLists,   setShowLists]   = useState(false)
  const [newListName, setNewListName] = useState('')

  const notesTimer = useRef(null)
  const hintTimer  = useRef(null)
  const listsRef   = useRef(null)
  const newListRef = useRef(null)

  // Recomputed as marks change, so the summary above the list stays live.
  const fit = useMemo(
    () => pantryFit(recipe, pantryState),
    [recipe, pantryState],
  )

  const keyProp = keyToText(recipeKey)
  const isFav   = favorites.has(recipeKey)
  const inList  = shoppingList.has(recipeKey)
  const rating  = ratings[keyProp] || 0

  // Ratings and notes are keyed by recipe key, not recipe name — a user recipe
  // called "Carbonara" no longer shares its stars and notes with the catalog
  // recipe of the same name.
  const savedNote = notes[keyProp] || ''

  // Holds the latest keystroke so it can be flushed if the modal closes inside
  // the debounce window. Without this, typing a note and closing within 600ms
  // silently discarded it.
  const pendingNote = useRef(null)

  useEffect(() => {
    setScale(1)
    setCheckedIngs(new Set())
    setNoteText(savedNote)
    setShowLists(false)
    setNewListName('')
    pendingNote.current = null
    // savedNote is intentionally not a dependency: re-running on every note
    // change would overwrite what the user is currently typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyProp])

  // Flush an in-flight note edit when the modal goes away.
  useEffect(() => {
    return () => {
      clearTimeout(notesTimer.current)
      clearTimeout(hintTimer.current)
      if (pendingNote.current !== null) {
        setNote(recipeKey, pendingNote.current, recipe.name)
        pendingNote.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyProp])

  // Dismiss the "add to list" popover on an outside click.
  useEffect(() => {
    if (!showLists) return
    function onDown(e) {
      if (listsRef.current && !listsRef.current.contains(e.target)) setShowLists(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showLists])

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
    pendingNote.current = val.trim()

    clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => {
      setNote(recipeKey, pendingNote.current, recipe.name)
      pendingNote.current = null
      setSavedHint(true)
      hintTimer.current = setTimeout(() => setSavedHint(false), 1500)
    }, 600)
  }

  function handleStarClick(n) {
    setRating(recipeKey, n === rating ? 0 : n, recipe.name)
  }

  async function handleShare() {
    const base = window.location.origin + import.meta.env.BASE_URL
    // User recipes are shareable too, via their uuid — they previously fell
    // back to the bare app URL, which shared nothing in particular.
    const shareUrl = isUserRecipeKey(recipeKey)
      ? `${base}?u=${userRecipeId(recipeKey)}`
      : `${base}?r=${recipeKey}`

    try {
      if (navigator.share) {
        await navigator.share({
          title: recipe.name,
          text: `Check out this recipe: ${recipe.name}`,
          url: shareUrl,
        })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
        showToast('Link copied', 'info')
      } else {
        // Clipboard needs a secure context; nothing to fall back to.
        showError('Sharing isn’t supported in this browser.')
      }
    } catch (err) {
      // The user dismissing the native share sheet rejects with AbortError —
      // that isn't a failure worth reporting.
      if (err?.name === 'AbortError') return
      console.error('Share failed:', err)
      showError('Could not share this recipe.')
    }
  }

  async function handleNewList(e) {
    e.preventDefault()
    const name = newListName.trim()
    // No room for an inline message here, but the click must still do
    // something rather than silently no-op.
    if (!name) { newListRef.current?.focus(); return }
    try {
      const list = await createList(name)
      addToList(list.id, recipeKey, recipe.name)
      setNewListName('')
      showToast(`Added to ${list.name}`, 'info')
    } catch (err) {
      console.error('Create list failed:', err)
      showError(describeError(err, 'Could not create that list.'))
    }
  }

  if (editing) {
    return (
      <CreateRecipeModal
        recipe={recipe}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    )
  }

  const iconBtn = 'transition-all hover:scale-[1.15] p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'

  return (
    <div
      className="fixed inset-0 bg-[rgba(60,35,15,0.55)] backdrop-blur-[3px] z-[500] flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      {...backdropProps}
    >
      <div
        className="bg-card border-[3px] border-ink rounded-2xl shadow-warm-xl w-full max-w-[640px] mx-auto my-auto modal-animate"
        {...panelProps}
      >

        {/* ── Header ── */}
        <div className="px-5 pt-5 pb-[14px] border-b border-ink flex items-start gap-3.5">
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="font-display text-[1.4rem] font-semibold text-ink leading-tight mb-2.5">
              {recipe.name}
            </h2>
            <div className="flex items-center gap-2.5 flex-wrap">
              <Tag category={recipe.category} />
              {recipe.timeMinutes && (
                <span className="flex items-center gap-1.5 text-[0.78rem] text-muted"><Icon name="clock" size={14} />{recipe.timeMinutes} min</span>
              )}
              {recipe.servings && (
                <span className="flex items-center gap-1.5 text-[0.78rem] text-muted"><Icon name="plate" size={14} />{recipe.servings} servings</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {editable && (
              <button
                className={`${iconBtn} text-warm-tan hover:text-accent`}
                onClick={() => setEditing(true)}
                aria-label={`Edit ${recipe.name}`}
                title="Edit recipe"
              ><Icon name="pencil" size={20} /></button>
            )}
            <button
              className={`${iconBtn} ${isFav ? 'text-heart' : 'text-warm-tan hover:text-heart'}`}
              onClick={() => toggleFav(recipeKey, recipe.name)}
              aria-pressed={isFav}
              aria-label={isFav ? `Remove ${recipe.name} from saved` : `Save ${recipe.name}`}
              title="Save recipe"
            ><Icon name="heart" size={22} filled={isFav} /></button>
            <button
              className={`${iconBtn} ${inList ? 'text-accent-dk' : 'text-warm-tan hover:text-accent'}`}
              onClick={() => {
                toggleShopping(recipeKey)
                showToast(inList ? 'Removed from shopping list' : 'Added to shopping list', 'info')
              }}
              aria-pressed={inList}
              aria-label={inList ? 'Remove from shopping list' : 'Add to shopping list'}
              title="Add to shopping list"
            ><Icon name="cart" size={21} /></button>
            <div className="relative" ref={listsRef}>
              <button
                className={`${iconBtn} ${lists.some(l => l.items.includes(recipeKey)) ? 'text-accent-dk' : 'text-warm-tan hover:text-accent'}`}
                onClick={() => setShowLists(p => !p)}
                aria-expanded={showLists}
                aria-label="Add to a list"
                title="Add to list"
              ><Icon name="list" size={20} /></button>
              {showLists && (
                <div className="absolute right-0 top-[calc(100%+6px)] w-[220px] bg-card border-2 border-ink rounded-xl shadow-warm-lg z-50 overflow-hidden">
                  <div className="px-3 py-2 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted border-b border-ink bg-paper">
                    Add to list
                  </div>
                  {lists.length === 0 && (
                    <p className="px-3 py-2 text-[0.8rem] text-muted italic">No lists yet</p>
                  )}
                  {lists.map(l => {
                    const inL = l.items.includes(recipeKey)
                    return (
                      <button
                        key={l.id}
                        onClick={() => {
                          if (inL) removeFromList(l.id, recipeKey)
                          else addToList(l.id, recipeKey, recipe.name)
                          showToast(`${inL ? 'Removed from' : 'Added to'} ${l.name}`, 'info')
                        }}
                        aria-pressed={inL}
                        className={`w-full text-left px-3 py-2.5 text-[0.86rem] flex items-center gap-2 border-b border-[rgba(200,180,130,0.2)] last:border-0 hover:bg-paper transition-colors ${inL ? 'text-accent-dk font-bold' : 'text-ink'}`}
                      >
                        <Icon name={inL ? 'check' : 'plus'} size={15} />
                        <span className="truncate">{l.name}</span>
                      </button>
                    )
                  })}
                  <form onSubmit={handleNewList} className="flex gap-1.5 p-2 border-t border-ink bg-paper">
                    <input
                      ref={newListRef}
                      value={newListName}
                      onChange={e => setNewListName(e.target.value)}
                      placeholder="New list…"
                      aria-label="New list name"
                      maxLength={60}
                      className="flex-1 text-[0.8rem] border-2 border-ink rounded-xl px-2.5 py-1.5 bg-card outline-none focus:border-accent text-ink placeholder:text-muted"
                    />
                    <button
                      type="submit"
                      className="bg-accent text-ink border-2 border-ink shadow-pop press text-[0.78rem] font-bold rounded-xl px-2.5 hover:bg-accent-dk transition-colors"
                    >
                      Add
                    </button>
                  </form>
                </div>
              )}
            </div>
            <button
              className={`${iconBtn} text-warm-tan hover:text-accent`}
              onClick={handleShare}
              aria-label={`Share ${recipe.name}`}
              title="Share recipe"
            ><Icon name="share" size={19} /></button>
            <button
              className="bg-paper border-2 border-ink rounded-full w-8 h-8 text-ink flex items-center justify-center hover:bg-heart transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onClick={onClose}
              aria-label="Close recipe"
              title="Close"
            ><Icon name="close" size={17} strokeWidth={2.6} /></button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="p-5 pb-6">

          {/* Ingredients header + scale */}
          <div className="flex items-center justify-between mb-2.5 pb-1 border-b border-dashed border-ink gap-3">
            <h3 className="font-display text-[0.85rem] font-semibold tracking-[0.1em] uppercase text-accent-dk">
              Ingredients
            </h3>
            <div className="flex gap-1 items-center" role="group" aria-label="Scale ingredients">
              {[1, 2, 3].map(s => {
                const base  = recipe.servings || 1
                const total = base * s
                const label = total === 1 ? '1 serving' : `${total} servings`
                return (
                  <button
                    key={s}
                    onClick={() => setScale(s)}
                    aria-pressed={scale === s}
                    className={`rounded-full px-2.5 py-[3px] text-[0.72rem] font-bold transition-all border-2 ${
                      scale === s
                        ? 'bg-accent border-ink text-ink shadow-pop'
                        : 'bg-card border-ink text-muted hover:bg-paper hover:text-accent-dk'
                    }`}
                  >{label}</button>
                )
              })}
            </div>
          </div>

          {/* What the dots below add up to.
              The marks are set here, so their consequence has to be visible
              here too — otherwise a tap changes nothing the user can see and
              the whole feature reads as decorative. */}
          {pantryEnabled && fit.total > 0 && (
            <p className="text-[0.78rem] mb-2 -mt-0.5">
              {fit.missing.length === 0 ? (
                <span className="text-accent-dk font-bold">
                  <Icon name="check" size={13} className="inline align-[-2px] mr-1" />
                  You have everything
                </span>
              ) : (
                <span className="text-muted">
                  You have <span className="font-bold text-ink">{fit.have.length + fit.low.length} of {fit.total}</span>
                  {' '}— missing <span className="font-bold text-ink">{fit.missing.join(', ')}</span>
                </span>
              )}
              {fit.low.length > 0 && (
                <span className="text-muted"> · low on {fit.low.join(', ')}</span>
              )}
            </p>
          )}

          {/* Ingredients list */}
          <ul className="list-none mb-5">
            {recipe.ingredients.map((ing, i) => {
              const { measure, item } = ingredientLabel(ing, scale)
              const checked = checkedIngs.has(i)
              return (
                <li key={i} className={`text-[0.88rem] border-b border-[rgba(200,180,130,0.25)] last:border-0 transition-opacity ${checked ? 'opacity-40' : ''}`}>
                  {/* The pantry marker is a sibling of the label, not inside
                      it: nesting a button in a label makes every tap on it
                      toggle the checkbox too. */}
                  <div className="flex items-start gap-2.5 py-[5px]">
                    <label className="flex items-start gap-2.5 flex-1 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleIng(i)}
                        className="accent-accent w-[15px] h-[15px] shrink-0 mt-[3px] cursor-pointer"
                      />
                      <span className="text-accent-dk font-bold min-w-[60px] shrink-0">{measure}</span>
                      <span className="text-ink">{item}</span>
                    </label>
                    <PantryMark item={ing.item} className="mt-[2px]" />
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Steps */}
          <h3 className="font-display text-[0.85rem] font-semibold tracking-[0.1em] uppercase text-accent-dk mb-2.5 pb-1 border-b border-dashed border-ink">
            Steps
          </h3>
          <ol className="list-none mb-1">
            {recipe.steps.map((step, i) => (
              <li key={i} className="flex gap-3 mb-3.5 text-[0.88rem] leading-relaxed">
                <span className="bg-accent text-ink border-2 border-ink shadow-pop press w-[22px] h-[22px] rounded-full flex items-center justify-center text-[0.72rem] font-bold shrink-0 mt-[1px]" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="text-ink">{step}</span>
              </li>
            ))}
          </ol>

          {/* Attribution. Not decoration: the imported recipes are CC-BY-SA,
              which is only satisfied while the credit travels with the recipe
              wherever it's shown. See LICENSE-DATA.md. */}
          {recipe.license && recipe.sourceUrl && (
            <p className="mt-4 pt-3 border-t border-dashed border-rim text-[0.72rem] text-muted leading-relaxed">
              Adapted from{' '}
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="underline text-ink hover:text-accent-dk transition-colors"
              >{recipe.source}</a>
              , used under{' '}
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                target="_blank"
                rel="noreferrer noopener"
                className="underline text-ink hover:text-accent-dk transition-colors"
              >CC BY-SA 4.0</a>.
            </p>
          )}

          {/* Notes & Ratings */}
          <div className="mt-5 pt-4 border-t border-dashed border-ink">
            <h3 className="font-display text-[0.85rem] font-semibold tracking-[0.1em] uppercase text-accent-dk mb-2.5 pb-1 border-b border-dashed border-ink">
              Your Notes
            </h3>
            <div className="flex items-center gap-0.5 mb-3" role="group" aria-label="Your rating">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => handleStarClick(n)}
                  aria-pressed={n <= rating}
                  aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
                  className={`leading-none p-[2px] transition-transform hover:scale-[1.18] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded ${n <= rating ? 'text-star' : 'text-warm-tan'}`}
                ><Icon name="star" size={24} filled={n <= rating} /></button>
              ))}
              {rating > 0 && (
                <button
                  onClick={() => setRating(recipeKey, 0, recipe.name)}
                  className="ml-1.5 text-[0.7rem] text-muted underline hover:text-heart transition-colors"
                >clear</button>
              )}
            </div>
            <textarea
              value={noteText}
              onChange={handleNoteChange}
              maxLength={2000}
              aria-label={`Your notes on ${recipe.name}`}
              placeholder="Jot down substitutions, tips, how it turned out…"
              className="w-full min-h-[80px] border-2 border-ink rounded-xl px-3 py-2.5 text-[0.86rem] text-ink bg-paper resize-y outline-none focus:border-accent transition-colors leading-relaxed placeholder:text-muted font-sans"
            />
            <div className="text-right text-[0.68rem] text-muted mt-1 h-[14px]" aria-live="polite">
              {savedHint ? 'Saved' : ''}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
