import { useState, useEffect, useMemo, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { useDialog } from '../hooks/useDialog'
import { ingredientLabel, keyToText, isUserRecipeKey, userRecipeId, sourceLabel, scaleStep } from '../utils/recipe'
import { describeError } from '../utils/errors'
import { recipeInShopping, recipeShoppingScale } from '../utils/shopping'
import { renderRecipeCard } from '../utils/recipeImage'
import { shoppingName } from '../utils/ingredients'
import { lineId } from '../utils/registry'
import { formatRecipeTime } from '../utils/formatTime'
import { appUrl } from '../lib/supabase'
import CreateRecipeModal from './CreateRecipeModal'
import CookMode, { PlanAhead, ScaledNote, loadCookSession, clearCookSession } from './CookMode'
import { leadTimes } from '../utils/steps'
import Tag from './Tag'
import Icon from './Icon'
import PantryMark from './PantryMark'
import { usePantry } from '../context/PantryContext'
import { pantryFit } from '../utils/pantry'

export default function RecipeModal({ recipe, recipeKey, editable = false, onClose }) {
  const { favorites, toggleFav, ratings, setRating, notes, setNote, shoppingItems,
          addRecipeToShopping, removeRecipeFromShopping, addShoppingIngredient,
          lists, addToList, removeFromList, createList, createUserRecipe, userRecipes } = useApp()
  const { showToast, showError } = useToast()
  const { pantryState, pantryEnabled, stateOf } = usePantry()
  const [editing,     setEditing]     = useState(false)
  const [copying,     setCopying]     = useState(false)
  const [sharing,     setSharing]     = useState(false)
  const [cooking,     setCooking]     = useState(false)

  /**
   * Someone else's recipe, opened from a shared link.
   *
   * A catalog recipe is already in everyone's app, and your own is editable —
   * so this is the only case with nothing you can do but read it. `editable`
   * is false for catalog recipes too, hence the second half.
   */
  const isSomeoneElses = isUserRecipeKey(recipeKey) && !editable
  const alreadyCopied  = isSomeoneElses &&
    userRecipes.some(r => r.name === recipe.name && r.source_url)

  /**
   * Take a copy rather than a reference.
   *
   * The sharer can edit or delete theirs at any time, and a link that rots is
   * worse than no link — so the recipient gets their own row, which they can
   * then change without it meaning anything to the original.
   */
  async function handleCopy() {
    if (copying) return
    setCopying(true)
    try {
      const created = await createUserRecipe({
        name:         recipe.name,
        category:     recipe.category,
        dietary:      recipe.dietary ?? [],
        ingredients:  recipe.ingredients ?? [],
        steps:        recipe.steps ?? [],
        time_minutes: recipe.timeMinutes ?? recipe.time_minutes ?? null,
        ...((recipe.activeMinutes ?? recipe.active_minutes) ? { active_minutes: recipe.activeMinutes ?? recipe.active_minutes } : {}),
        servings:     recipe.servings ?? null,
        image_url:    recipe.image ?? recipe.image_url ?? null,
        // Where it came from, so a copied recipe can still be traced back.
        source_url:   recipe.sourceUrl ?? recipe.source_url ??
                      `${appUrl}?u=${userRecipeId(recipeKey)}`,
      })
      showToast(`Saved “${created.name}” to your recipes`, 'success')
    } catch (err) {
      console.error('Copying a shared recipe failed:', err)
      showError(describeError(err, 'Could not save this recipe.'))
    } finally {
      setCopying(false)
    }
  }

  // Stand the trap down while the edit dialog is stacked on top of this one.
  const { titleId, backdropProps, panelProps } = useDialog({ onClose, enabled: !editing && !cooking })

  // Opens at the servings an unfinished cook was using, so resuming after a
  // reload doesn't quietly drop back to the original amounts.
  const [scale,       setScale]       = useState(() => loadCookSession(recipeKey, recipe)?.scale || 1)
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
    () => pantryFit(recipe, stateOf),
    [recipe, stateOf],
  )

  const leads   = useMemo(() => leadTimes(recipe), [recipe])
  // Each line's verdict from the shared evaluator, so the dot beside "sour
  // cream or plain yogurt" agrees with the summary when only yogurt is in.
  const needByLine = useMemo(() => {
    const m = new Map()
    for (const n of fit.needs || []) for (const l of n.lines) if (!m.has(l)) m.set(l, n)
    return m
  }, [fit])
  const keyProp = keyToText(recipeKey)
  // Where cook mode was left, so the button can offer to pick up from there.
  const session = useMemo(
    () => loadCookSession(recipeKey, recipe),
    // Re-read whenever cook mode closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyProp, recipe, cooking],
  )
  const resumeAt = session?.index || 0
  const isFav   = favorites.has(recipeKey)
  const inList  = recipeInShopping(shoppingItems, recipeKey)
  // The servings the whole recipe went on the list at; null if it's only
  // there line by line, or not at all.
  const listScale = recipeShoppingScale(shoppingItems, recipeKey)
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
    setScale(loadCookSession(recipeKey, recipe)?.scale || 1)
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

    /**
     * A picture first, the link second.
     *
     * A link asks the recipient to open an unfamiliar app and wait for a
     * megabyte of bundle, and it arrives in the chat as a naked URL because
     * GitHub Pages can't emit per-recipe Open Graph tags. An image just shows
     * up — and another cook can import it back through the vision importer,
     * so it isn't a dead end either.
     *
     * Everything here degrades quietly: no canvas, a photo whose host sends
     * no CORS headers, or a browser without file sharing all fall through to
     * the link rather than failing the share.
     */
    if (!sharing) {
      setSharing(true)
      try {
        const blob = await renderRecipeCard(recipe)
        if (blob) {
          const file = new File([blob], `${recipe.name.replace(/[^\w]+/g, '-').toLowerCase()}.png`,
                                { type: 'image/png' })
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: recipe.name })
            return
          }
          // Desktop browsers mostly can't share files, but they can download.
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = file.name
          a.click()
          URL.revokeObjectURL(url)
          showToast('Recipe card saved', 'info')
          return
        }
      } catch (err) {
        if (err?.name === 'AbortError') return
        // Not worth a message: the link below is a perfectly good share.
        console.error('Recipe card failed, falling back to a link:', err)
      } finally {
        setSharing(false)
      }
    }

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

  const iconBtn = 'transition-all hover:scale-[1.15] p-2.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'

  return (
    <>
    {cooking && (
      <CookMode recipe={recipe} recipeKey={recipeKey} scale={scale} onClose={() => setCooking(false)} />
    )}
    <div
      className="fixed inset-0 bg-[rgba(60,35,15,0.55)] backdrop-blur-[3px] z-[500] flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      {...backdropProps}
    >
      <div
        className="bg-card border-[3px] border-ink rounded-2xl shadow-warm-xl w-full max-w-[640px] mx-auto my-auto modal-animate"
        {...panelProps}
      >

        {/* ── Header ── */}
        <div className="px-5 pt-5 pb-[14px] border-b border-ink">
          <div className="flex items-start gap-3.5">
            <div className="flex-1 min-w-0">
              <h2 id={titleId} className="font-display text-[1.4rem] font-semibold text-ink leading-tight mb-2.5">
                {recipe.name}
              </h2>
              <div className="flex items-center gap-2.5 flex-wrap">
                <Tag category={recipe.category} />
                {recipe.timeMinutes > 0 && (
                  <span className="flex items-center gap-1.5 text-[0.78rem] text-muted"><Icon name="clock" size={14} />{formatRecipeTime(recipe)}</span>
                )}
                {recipe.servings && (
                  <span className="flex items-center gap-1.5 text-[0.78rem] text-muted"><Icon name="plate" size={14} />{recipe.servings} servings</span>
                )}
              </div>
            </div>
            <button
              className="shrink-0 bg-paper border-2 border-ink rounded-full w-11 h-11 -mt-1.5 -mr-1.5 text-ink flex items-center justify-center hover:bg-heart transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onClick={onClose}
              aria-label="Close recipe"
              title="Close"
            ><Icon name="close" size={17} strokeWidth={2.6} /></button>
          </div>
          {/* Actions get their own row: beside the title they squeezed it to
              a few words a line on a phone. A retired recipe offers none of
              them — only close, which stays up top. */}
          {!recipe.hidden && (
            <div className="flex items-center justify-end gap-1.5 mt-3">
              {/* The whole point of a shared link: keeping the recipe, not just
                  reading it once. Labelled rather than an icon, because it's the
                  only thing a visitor can usefully do here. */}
              {isSomeoneElses && (
                <button
                  onClick={handleCopy}
                  disabled={copying || alreadyCopied}
                  className="shrink-0 bg-accent text-ink border-2 border-ink shadow-pop press rounded-full px-3 py-[5px] text-[0.75rem] font-bold whitespace-nowrap hover:bg-accent-dk transition-colors disabled:opacity-50 disabled:shadow-none"
                >{alreadyCopied ? 'In your recipes' : copying ? 'Saving…' : '+ Add to my recipes'}</button>
              )}
              {editable && (
                <button
                  className={`${iconBtn} text-muted hover:text-accent-dk`}
                  onClick={() => setEditing(true)}
                  aria-label={`Edit ${recipe.name}`}
                  title="Edit recipe"
                ><Icon name="pencil" size={20} /></button>
              )}
              <button
                className={`${iconBtn} ${isFav ? 'text-heart' : 'text-muted hover:text-heart'}`}
                onClick={() => toggleFav(recipeKey, recipe.name)}
                aria-pressed={isFav}
                aria-label={isFav ? `Remove ${recipe.name} from saved` : `Save ${recipe.name}`}
                title="Save recipe"
              ><Icon name="heart" size={22} filled={isFav} /></button>
              {/* Labelled, because it's the one action here with a consequence
                  you'd want to read first. Three states: add, update to the
                  servings now picked, or take it off again. */}
              <button
                className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full border-2 border-ink text-[0.82rem] font-bold shadow-pop press transition-colors ${
                  inList && listScale === scale ? 'bg-accent text-ink' : 'bg-card text-ink hover:bg-paper'
                }`}
                onClick={() => {
                  const servings = (recipe.servings || 1) * scale
                  if (inList && listScale === scale) {
                    removeRecipeFromShopping(recipeKey)
                    showToast('Removed from shopping list', 'info')
                  } else {
                    // Pantry-aware: what you already have goes on ticked, so the
                    // list shows what's left to buy rather than everything.
                    addRecipeToShopping(recipeKey, recipe, pantryEnabled ? pantryState : null, scale)
                    showToast(inList
                      ? `Shopping list updated for ${servings} serving${servings === 1 ? '' : 's'}`
                      : 'Added what you need to the shopping list', 'info')
                  }
                }}
                aria-pressed={inList && listScale === scale}
              >
                <Icon name="cart" size={18} />
                {!inList ? 'Add to shopping list'
                  : listScale === scale ? 'On shopping list' : `Update list to ${(recipe.servings || 1) * scale} servings`}
              </button>
              <div className="relative" ref={listsRef}>
                <button
                  className={`${iconBtn} ${lists.some(l => l.items.includes(recipeKey)) ? 'text-accent-dk' : 'text-muted hover:text-accent-dk'}`}
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
                className={`${iconBtn} text-muted hover:text-accent-dk`}
                onClick={handleShare}
                aria-label={`Share ${recipe.name}`}
                title="Share recipe"
              ><Icon name="share" size={19} /></button>
            </div>
          )}
        </div>

        {/* ── Body ── */}
        <div className="p-5 pb-6">

          {/* The build stubs hidden recipes down to a name (vite.config.js),
              so an old link would otherwise open an empty card. */}
          {recipe.hidden ? (
            <p className="text-[0.86rem] text-muted">
              This recipe has been retired and is no longer available.
            </p>
          ) : (<>
          {leads.length > 0 && <PlanAhead leads={leads} />}

          {/* Ingredients header + scale */}
          <div className="flex flex-wrap items-center justify-between mb-2.5 pb-1 border-b border-dashed border-ink gap-x-3 gap-y-2">
            <h3 className="font-display text-[0.85rem] font-semibold tracking-[0.1em] uppercase text-accent-dk">
              Ingredients
            </h3>
            <div className="flex flex-wrap gap-1.5 items-center" role="group" aria-label="Scale ingredients">
              {/* Half only where it gives a whole number of servings. */}
              {[0.5, 1, 2, 3].filter(s => s >= 1 || (recipe.servings || 1) % 2 === 0).map(s => {
                const base  = recipe.servings || 1
                const total = base * s
                const label = total === 1 ? '1 serving' : `${total} servings`
                return (
                  <button
                    key={s}
                    onClick={() => setScale(s)}
                    aria-pressed={scale === s}
                    className={`whitespace-nowrap rounded-full px-3 min-h-[36px] text-[0.78rem] font-bold transition-all border-2 ${
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
              {/* Named, not folded into "have": an assumption is a guess about
                  your kitchen, and worth a glance before you start. */}
              {fit.assumed > 0 && (
                <span className="text-muted"> · assumed: {fit.assumedNames.join(", ")}</span>
              )}
              {fit.optionalMissing.length > 0 && (
                <span className="text-muted"> · optional: {fit.optionalMissing.join(', ')}</span>
              )}
            </p>
          )}

          {scale !== 1 && (
            <p className="text-[0.78rem] text-muted italic mb-2">
              Salt, spices and cooking times don&rsquo;t always scale evenly — taste as you go.
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
                    <button
                      type="button"
                      onClick={() => {
                        addShoppingIngredient(recipeKey, recipe, ing, i, scale)
                        showToast(`Added ${shoppingName(ing.item)} to the shopping list`, 'info')
                      }}
                      aria-label={`Add ${shoppingName(ing.item)} to shopping list`}
                      title="Add just this to the shopping list"
                      className="shrink-0 grid place-items-center w-11 h-11 -my-2.5 rounded-full text-muted hover:text-accent-dk hover:bg-paper transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    ><Icon name="cart" size={13} /></button>
                    <PantryMark item={ing.item} need={needByLine.get(i)} className="mt-[2px]" />
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Steps */}
          <h3 className="font-display text-[0.85rem] font-semibold tracking-[0.1em] uppercase text-accent-dk mb-2.5 pb-1 border-b border-dashed border-ink">
            Steps
          </h3>
          {scale !== 1 && <ScaledNote recipe={recipe} servings={recipe.servings ? recipe.servings * scale : null} />}
          <ol className="list-none mb-1">
            {recipe.steps.map((step, i) => (
              <li key={i} className="flex gap-3 mb-3.5 text-[0.88rem] leading-relaxed">
                <span className="bg-accent text-ink border-2 border-ink shadow-pop press w-[22px] h-[22px] rounded-full flex items-center justify-center text-[0.72rem] font-bold shrink-0 mt-[1px]" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="text-ink">
                  {scaleStep(step, recipe.ingredients, scale, lineId).map((seg, k) => seg.scaled
                    ? <mark key={k} className="bg-sun text-ink rounded px-1">{seg.text}</mark>
                    : <span key={k}>{seg.text}</span>)}
                </span>
              </li>
            ))}
          </ol>
          </>)}

          {/* Attribution. For CC-BY-SA catalog imports this isn't decoration —
              the license is only satisfied while the credit travels with the
              recipe wherever it's shown, see LICENSE-DATA.md. Any other
              imported/copied recipe still gets a plain "where this came from"
              credit, since that's the whole point of importing. */}
          {recipe.sourceUrl && (
            <p className="mt-4 pt-3 border-t border-dashed border-rim text-[0.72rem] text-muted leading-relaxed">
              Adapted from{' '}
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="underline text-ink hover:text-accent-dk transition-colors"
              >{recipe.source ?? sourceLabel(recipe.sourceUrl)}</a>
              {recipe.license && (
                <>
                  , used under{' '}
                  <a
                    href="https://creativecommons.org/licenses/by-sa/4.0/"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline text-ink hover:text-accent-dk transition-colors"
                  >CC BY-SA 4.0</a>
                </>
              )}.
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

        {/* Pinned to the bottom of the screen while the recipe scrolls — the
            one thing you came here to do, at thumb height. */}
        {!recipe.hidden && recipe.steps?.length > 0 && (
          // Offset by the backdrop's padding (p-4 / sm:p-8): sticky measures
          // from inside it, which left a strip of recipe showing underneath.
          <div className="sticky -bottom-4 sm:-bottom-8 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] bg-card border-t-2 border-ink rounded-b-2xl">
            <button
              onClick={() => setCooking(true)}
              className="w-full min-h-[52px] bg-accent text-ink border-[2.5px] border-ink shadow-pop press rounded-xl font-display font-semibold text-[1.05rem] flex items-center justify-center gap-2"
            >
              <Icon name="pan" size={20} />
              {resumeAt > 0 ? `Resume cooking · step ${Math.min(resumeAt, recipe.steps.length)}` : 'Start cooking'}
            </button>
            {resumeAt > 0 && (
              <button
                onClick={() => { clearCookSession(recipeKey); setCooking(true) }}
                className="w-full min-h-[44px] mt-1 text-[0.85rem] font-bold text-muted underline underline-offset-2"
              >Start over</button>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  )
}
