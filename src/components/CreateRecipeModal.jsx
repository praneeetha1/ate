import { useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useDialog } from '../hooks/useDialog'
import { CATALOG_CATEGORIES } from '../utils/recipe'
import { importRecipe, looksLikeUrl } from '../utils/importRecipe'
import { fileToDataUrl, dataUrlBytes, MAX_TOTAL_BYTES } from '../utils/imageFile'
import Icon from './Icon'
import { uploadRecipePhoto } from '../utils/photoUpload'
import { useAuth } from '../context/AuthContext'

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
  const { user } = useAuth()
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
  const [image,    setImage]    = useState(recipe?.image ?? recipe?.image_url ?? '')
  const [source,   setSource]   = useState(recipe?.sourceUrl ?? recipe?.source_url ?? '')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const [paste,     setPaste]     = useState('')
  const [importing, setImporting] = useState(false)
  const [note,      setNote]      = useState('')

  /**
   * Fill the form from an imported recipe.
   *
   * Lands as a draft rather than saving: a model can misread a quantity, and a
   * wrong "2 tbsp" is only caught by a person looking at it. Everything stays
   * editable, and nothing is written until Save.
   */
  function applyDraft(draft) {
    setName(draft.name ?? '')
    if (draft.category) setCategory(draft.category)
    setDietary(draft.dietary ?? [])
    setTime(draft.timeMinutes ?? '')
    setServings(draft.servings ?? '')
    setIngs(draft.ingredients?.length
      ? draft.ingredients.map(i => ({ ...emptyIng(), ...i }))
      : [emptyIng()])
    setSteps(draft.steps?.length ? [...draft.steps] : [''])
    setImage(draft.image ?? '')
    setSource(draft.sourceUrl ?? '')
  }

  const photoRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  /** Upload a photo of the finished dish and point the recipe at it. */
  async function handlePhoto(file) {
    if (!file || uploading) return
    setUploading(true)
    setError('')
    try {
      setImage(await uploadRecipePhoto(file, user?.id))
      setNote('Photo uploaded.')
    } catch (err) {
      console.error('Photo upload failed:', err)
      setError(err.message || 'Could not upload that photo.')
    } finally {
      setUploading(false)
      if (photoRef.current) photoRef.current.value = ''
    }
  }

  const fileRef = useRef(null)

  /**
   * Import from photos.
   *
   * Plural, because one recipe often doesn't fit in one screenshot — the
   * ingredients in the first, the method in the second. They go up together
   * and come back as a single recipe rather than several.
   *
   * Each picture is redrawn smaller before it leaves the phone: a raw
   * screenshot is several megabytes once base64-encoded, which is slow on
   * mobile data and large enough to be refused outright.
   */
  async function handleImages(fileList) {
    const files = [...(fileList || [])].slice(0, 4)
    if (!files.length || importing) return

    setImporting(true)
    setError('')
    setNote('')
    try {
      const images = []
      for (const file of files) images.push(await fileToDataUrl(file))

      const total = images.reduce((n, img) => n + dataUrlBytes(img), 0)
      if (total > MAX_TOTAL_BYTES) {
        throw new Error('Those photos are too large even after shrinking — try fewer at a time.')
      }

      const { recipe: draft, warning } = await importRecipe({ images })
      applyDraft(draft)
      setNote(warning || `Read ${files.length > 1 ? `${files.length} photos` : 'that photo'}. Check it over before saving.`)
    } catch (err) {
      console.error('Importing from a photo failed:', err)
      setError(err.message || 'Could not read a recipe from that.')
    } finally {
      setImporting(false)
      // Cleared so picking the same file again still fires a change event.
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleImport() {
    const value = paste.trim()
    if (!value || importing) return
    setImporting(true)
    setError('')
    setNote('')
    try {
      // A link gets fetched; anything else is treated as the recipe text
      // itself, which is how a YouTube description or a pasted caption gets in.
      const { recipe: draft, warning } = await importRecipe(
        looksLikeUrl(value) ? { url: value } : { text: value },
      )
      applyDraft(draft)
      setPaste('')
      setNote(warning || `Imported “${draft.name}”. Check it over before saving.`)
    } catch (err) {
      console.error('Recipe import failed:', err)
      setError(err.message || 'Could not import that recipe.')
    } finally {
      setImporting(false)
    }
  }

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
      // Linked, never copied: the image stays on whoever's server published
      // it, which costs no storage and keeps the credit where it belongs.
      image_url:    image.trim() || null,
      source_url:   source.trim() || null,
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

          {/* Import first, because typing a recipe in by hand is the thing
              nobody does twice. Only when creating: re-importing over a recipe
              you're editing would silently overwrite your own edits. */}
          {!isEdit && (
            <div className="border-2 border-dashed border-rim rounded-xl p-3.5 bg-paper">
              <label className={labelCls} htmlFor="recipe-import">
                Import from a link or pasted text
              </label>
              <div className="flex gap-2">
                <input
                  id="recipe-import"
                  value={paste}
                  onChange={e => { setPaste(e.target.value); setNote('') }}
                  onKeyDown={e => {
                    // Enter here means import, not submit — the form would
                    // otherwise try to save a recipe that isn't filled in yet.
                    if (e.key === 'Enter') { e.preventDefault(); handleImport() }
                  }}
                  placeholder="Paste a recipe link, or the text itself…"
                  disabled={importing}
                  className={inputCls + ' flex-1 min-w-0'}
                />
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || !paste.trim()}
                  className="shrink-0 bg-accent text-ink border-2 border-ink shadow-pop press rounded-xl px-4 text-[0.8rem] font-bold hover:bg-accent-dk transition-colors disabled:opacity-50 disabled:shadow-none"
                >{importing ? 'Reading…' : 'Import'}</button>
                {/* The only route in from Instagram: their API is closed, so a
                    screenshot is the one thing you can actually get out. */}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={importing}
                  aria-label="Import from a photo or screenshot"
                  title="Import from a photo or screenshot"
                  className="shrink-0 grid place-items-center w-[38px] bg-card text-ink border-2 border-ink rounded-xl hover:bg-paper transition-colors disabled:opacity-50"
                ><Icon name="camera" size={16} /></button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={e => handleImages(e.target.files)}
                />
              </div>
              {note && (
                <p role="status" className="text-[0.75rem] text-muted italic mt-2">{note}</p>
              )}
            </div>
          )}

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
            <div className="col-span-2">
              <label className={labelCls} htmlFor="recipe-image">Photo</label>
              <div className="flex gap-2">
                <input
                  id="recipe-image"
                  type="url"
                  value={image}
                  onChange={e => setImage(e.target.value)}
                  placeholder="Filled in when you import, or upload your own"
                  className={inputCls + ' flex-1 min-w-0'}
                />
                {/* An imported recipe links the publisher's picture. This is
                    for a photo of the thing you actually cooked, which has to
                    be stored somewhere rather than linked. */}
                <button
                  type="button"
                  onClick={() => photoRef.current?.click()}
                  disabled={uploading}
                  className="shrink-0 bg-card text-ink border-2 border-ink rounded-xl px-3 text-[0.78rem] font-bold hover:bg-paper transition-colors disabled:opacity-50"
                >{uploading ? 'Uploading…' : 'Upload'}</button>
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={e => handlePhoto(e.target.files?.[0])}
                />
              </div>
              {image && (
                // A broken link is worth seeing now rather than discovering on
                // the card later, so the preview stands in for validation.
                <img
                  src={image}
                  alt=""
                  onError={e => { e.currentTarget.style.display = 'none' }}
                  onLoad={e => { e.currentTarget.style.display = '' }}
                  className="mt-2 w-full h-28 object-cover rounded-xl border-2 border-ink"
                />
              )}
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
