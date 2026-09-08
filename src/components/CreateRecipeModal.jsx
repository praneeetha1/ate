import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useDialog } from '../hooks/useDialog'
import { CATALOG_CATEGORIES } from '../utils/recipe'

const DIETARY = ['vegetarian', 'vegan', 'gluten-free', 'dairy-free']

const MAX_NAME = 200
const MAX_STEP = 1000
const MAX_ITEM = 200

const emptyIng = () => ({ amount: '', unit: '', item: '' })

/** Parses a positive-integer field, returning null for blank/invalid input. */
function positiveInt(value) {
  if (String(value).trim() === '') return null
  const n = parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Create or edit a user recipe.
 *
 * Pass `recipe` to edit an existing one — user recipes previously had no update
 * path in the UI at all, despite the RLS policy permitting it.
 */
export default function CreateRecipeModal({ recipe, onClose, onCreated, onSaved }) {
  const { createUserRecipe, updateUserRecipe } = useApp()
  const { titleId, backdropProps, panelProps } = useDialog({ onClose })

  const isEdit = !!recipe

  const [name,     setName]     = useState(recipe?.name ?? '')
  const [category, setCategory] = useState(recipe?.category ?? CATALOG_CATEGORIES[0])
  const [dietary,  setDietary]  = useState(recipe?.dietary ?? [])
  const [time,     setTime]     = useState(
    recipe?.timeMinutes ?? recipe?.time_minutes ?? '' ,
  )
  const [servings, setServings] = useState(recipe?.servings ?? '')
  const [ings,     setIngs]     = useState(
    recipe?.ingredients?.length ? recipe.ingredients.map(i => ({ ...emptyIng(), ...i })) : [emptyIng()],
  )
  const [steps,    setSteps]    = useState(recipe?.steps?.length ? [...recipe.steps] : [''])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  function toggleDietary(d) {
    setDietary(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  function updateIng(i, field, val) {
    setIngs(prev => prev.map((ing, idx) => idx === i ? { ...ing, [field]: val } : ing))
  }

  const addIng     = () => setIngs(prev => [...prev, emptyIng()])
  const removeIng  = i => setIngs(prev => prev.filter((_, idx) => idx !== i))
  const updateStep = (i, val) => setSteps(prev => prev.map((s, idx) => idx === i ? val : s))
  const addStep    = () => setSteps(prev => [...prev, ''])
  const removeStep = i => setSteps(prev => prev.filter((_, idx) => idx !== i))

  async function handleSave(e) {
    e.preventDefault()

    const cleanName  = name.trim()
    const cleanIngs  = ings
      .filter(ing => ing.item.trim())
      .map(ing => ({
        amount: ing.amount.trim(),
        unit:   ing.unit.trim(),
        item:   ing.item.trim().slice(0, MAX_ITEM),
      }))
    const cleanSteps = steps.map(s => s.trim()).filter(Boolean).map(s => s.slice(0, MAX_STEP))

    if (!cleanName)         { setError('Recipe name is required'); return }
    if (cleanName.length > MAX_NAME) { setError(`Recipe name must be ${MAX_NAME} characters or fewer`); return }
    if (!cleanIngs.length)  { setError('Add at least one ingredient'); return }
    if (!cleanSteps.length) { setError('Add at least one step'); return }

    // The number inputs have min="1", but that only blocks form submission in
    // some browsers and never blocks typed junk — so validate here too rather
    // than sending NaN to the database.
    if (String(time).trim() && positiveInt(time) === null) {
      setError('Time must be a positive number of minutes'); return
    }
    if (String(servings).trim() && positiveInt(servings) === null) {
      setError('Servings must be a positive number'); return
    }

    const fields = {
      name:         cleanName,
      category,
      dietary,
      ingredients:  cleanIngs,
      steps:        cleanSteps,
      time_minutes: positiveInt(time),
      servings:     positiveInt(servings),
    }

    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        await updateUserRecipe(recipe.id, fields)
        onSaved?.()
      } else {
        const created = await createUserRecipe(fields)
        onCreated?.('u_' + created.id)
      }
      onClose()
    } catch (err) {
      console.error(isEdit ? 'Recipe update failed:' : 'Recipe creation failed:', err)
      setError(err.message || 'Could not save this recipe.')
      setSaving(false)
    }
  }

  const inputCls = 'w-full border-2 border-ink rounded-xl px-3.5 py-2.5 text-[0.88rem] text-ink bg-paper outline-none focus:border-accent transition-colors placeholder:text-muted'
  const labelCls = 'text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted mb-1 block'

  return (
    <div
      className="fixed inset-0 bg-[rgba(60,35,15,0.55)] backdrop-blur-[3px] z-[600] flex items-start justify-center p-4 overflow-y-auto"
      {...backdropProps}
    >
      <div
        className="bg-card border-[3px] border-ink rounded-2xl shadow-warm-xl w-full max-w-[600px] mx-auto my-4"
        {...panelProps}
      >

        <div className="flex items-center justify-between px-5 py-4 border-b border-ink">
          <h2 id={titleId} className="font-display text-[1.3rem] font-semibold text-ink">
            {isEdit ? 'Edit Recipe' : 'New Recipe'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="bg-paper border-2 border-ink rounded-full w-8 h-8 text-muted flex items-center justify-center hover:bg-warm-tan hover:text-ink transition-all text-lg leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >×</button>
        </div>

        <form onSubmit={handleSave} className="p-5 flex flex-col gap-5">

          <div>
            <label className={labelCls} htmlFor="recipe-name">Recipe Name *</label>
            <input
              id="recipe-name"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={MAX_NAME}
              placeholder="e.g. Grandma's Pasta"
              className={inputCls}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="recipe-category">Category</label>
              {/* Options come from the catalog, so a user recipe always lands in
                  a real category and gets the matching tag colour. */}
              <select
                id="recipe-category"
                value={category}
                onChange={e => setCategory(e.target.value)}
                className={inputCls + ' cursor-pointer'}
              >
                {CATALOG_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="recipe-time">Time (minutes)</label>
              <input
                id="recipe-time"
                type="number"
                min="1"
                max="1440"
                value={time}
                onChange={e => setTime(e.target.value)}
                placeholder="e.g. 30"
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-start">
            <div>
              <label className={labelCls} htmlFor="recipe-servings">Servings</label>
              <input
                id="recipe-servings"
                type="number"
                min="1"
                max="99"
                value={servings}
                onChange={e => setServings(e.target.value)}
                placeholder="e.g. 4"
                className={inputCls}
              />
            </div>
            <div>
              <span className={labelCls} id="dietary-label">Dietary</span>
              <div className="flex flex-wrap gap-1.5 mt-1" role="group" aria-labelledby="dietary-label">
                {DIETARY.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDietary(d)}
                    aria-pressed={dietary.includes(d)}
                    className={`text-[0.72rem] font-bold px-2.5 py-[4px] rounded-full border-2 transition-all ${
                      dietary.includes(d)
                        ? 'bg-accent border-ink text-ink shadow-pop'
                        : 'bg-card border-ink text-muted hover:bg-paper'
                    }`}
                  >{d}</button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <span className={labelCls}>Ingredients *</span>
            <div className="flex flex-col gap-2">
              {ings.map((ing, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={ing.amount}
                    onChange={e => updateIng(i, 'amount', e.target.value)}
                    placeholder="Amt"
                    aria-label={`Ingredient ${i + 1} amount`}
                    maxLength={16}
                    className="w-[64px] border-2 border-ink rounded-xl px-2.5 py-2 text-[0.85rem] text-ink bg-paper outline-none focus:border-accent placeholder:text-muted"
                  />
                  <input
                    value={ing.unit}
                    onChange={e => updateIng(i, 'unit', e.target.value)}
                    placeholder="Unit"
                    aria-label={`Ingredient ${i + 1} unit`}
                    maxLength={24}
                    className="w-[72px] border-2 border-ink rounded-xl px-2.5 py-2 text-[0.85rem] text-ink bg-paper outline-none focus:border-accent placeholder:text-muted"
                  />
                  <input
                    value={ing.item}
                    onChange={e => updateIng(i, 'item', e.target.value)}
                    placeholder="Ingredient"
                    aria-label={`Ingredient ${i + 1} name`}
                    maxLength={MAX_ITEM}
                    className="flex-1 border-2 border-ink rounded-xl px-2.5 py-2 text-[0.85rem] text-ink bg-paper outline-none focus:border-accent placeholder:text-muted"
                  />
                  {ings.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeIng(i)}
                      aria-label={`Remove ingredient ${i + 1}`}
                      className="text-muted hover:text-heart text-[1.1rem] px-1 transition-colors shrink-0"
                    >×</button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addIng}
                className="self-start text-[0.78rem] font-bold text-ink border-2 border-ink bg-card shadow-pop press rounded-full px-3 py-[5px] hover:bg-accent hover:text-ink transition-all mt-0.5"
              >+ Add ingredient</button>
            </div>
          </div>

          <div>
            <span className={labelCls}>Steps *</span>
            <div className="flex flex-col gap-2">
              {steps.map((step, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span
                    className="bg-accent text-ink border-2 border-ink shadow-pop press w-[22px] h-[22px] rounded-full flex items-center justify-center text-[0.72rem] font-bold shrink-0 mt-2.5"
                    aria-hidden="true"
                  >{i + 1}</span>
                  <textarea
                    value={step}
                    onChange={e => updateStep(i, e.target.value)}
                    placeholder={`Step ${i + 1}…`}
                    aria-label={`Step ${i + 1}`}
                    maxLength={MAX_STEP}
                    rows={2}
                    className="flex-1 border-2 border-ink rounded-xl px-2.5 py-2 text-[0.85rem] text-ink bg-paper outline-none focus:border-accent resize-none placeholder:text-muted leading-relaxed"
                  />
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      aria-label={`Remove step ${i + 1}`}
                      className="text-muted hover:text-heart text-[1.1rem] px-1 transition-colors shrink-0 mt-2"
                    >×</button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addStep}
                className="self-start text-[0.78rem] font-bold text-ink border-2 border-ink bg-card shadow-pop press rounded-full px-3 py-[5px] hover:bg-accent hover:text-ink transition-all mt-0.5"
              >+ Add step</button>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-[0.82rem] text-heart bg-[#fde8e8] rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1 border-t border-ink">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border-2 border-ink rounded-xl py-3 text-[0.9rem] font-bold text-muted hover:bg-paper transition-all"
            >Cancel</button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-accent text-ink border-2 border-ink shadow-pop press rounded-xl py-3 text-[0.9rem] font-bold hover:bg-accent-dk disabled:opacity-50 transition-all"
            >{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save Recipe'}</button>
          </div>

        </form>
      </div>
    </div>
  )
}
