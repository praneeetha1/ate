import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

const CATEGORIES = ['Main Dish', 'Side Dish', 'Appetizer', 'Salad', 'Soup', 'Breakfast', 'Dessert', 'Snack', 'Sauce', 'Drink', 'My Recipes']
const DIETARY    = ['vegetarian', 'vegan', 'gluten-free', 'dairy-free']

const emptyIng  = () => ({ amount: '', unit: '', item: '' })
const emptyStep = () => ''

export default function CreateRecipeModal({ onClose, onCreated }) {
  const { createUserRecipe } = useApp()

  const [name,      setName]      = useState('')
  const [category,  setCategory]  = useState('My Recipes')
  const [dietary,   setDietary]   = useState([])
  const [time,      setTime]      = useState('')
  const [servings,  setServings]  = useState('')
  const [ings,      setIngs]      = useState([emptyIng()])
  const [steps,     setSteps]     = useState([emptyStep()])
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggleDietary(d) {
    setDietary(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  function updateIng(i, field, val) {
    setIngs(prev => prev.map((ing, idx) => idx === i ? { ...ing, [field]: val } : ing))
  }

  function addIng()    { setIngs(prev => [...prev, emptyIng()]) }
  function removeIng(i) { setIngs(prev => prev.filter((_, idx) => idx !== i)) }

  function updateStep(i, val) {
    setSteps(prev => prev.map((s, idx) => idx === i ? val : s))
  }

  function addStep()     { setSteps(prev => [...prev, emptyStep()]) }
  function removeStep(i) { setSteps(prev => prev.filter((_, idx) => idx !== i)) }

  async function handleSave(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Recipe name is required'); return }
    const cleanIngs  = ings.filter(ing => ing.item.trim())
    const cleanSteps = steps.filter(s => s.trim())
    if (!cleanIngs.length)  { setError('Add at least one ingredient'); return }
    if (!cleanSteps.length) { setError('Add at least one step'); return }
    setSaving(true)
    setError('')
    try {
      const recipe = await createUserRecipe({
        name:         name.trim(),
        category,
        dietary,
        ingredients:  cleanIngs,
        steps:        cleanSteps,
        time_minutes: time    ? parseInt(time)     : null,
        servings:     servings ? parseInt(servings) : null,
      })
      onCreated?.('u_' + recipe.id)
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const inputCls = 'w-full border-[1.5px] border-rim rounded-lg px-3.5 py-2.5 text-[0.88rem] text-ink bg-paper outline-none focus:border-accent transition-colors placeholder:text-muted'
  const labelCls = 'text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted mb-1 block'

  return (
    <div
      className="fixed inset-0 bg-[rgba(60,35,15,0.55)] backdrop-blur-[3px] z-[600] flex items-start justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card border-[1.5px] border-rim rounded-2xl shadow-warm-xl w-full max-w-[600px] mx-auto my-4">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-warm-tan">
          <h2 className="font-display text-[1.3rem] font-semibold text-ink">New Recipe</h2>
          <button
            onClick={onClose}
            className="bg-paper border-[1.5px] border-rim rounded-full w-8 h-8 text-muted flex items-center justify-center hover:bg-warm-tan hover:text-ink transition-all text-lg leading-none"
          >×</button>
        </div>

        <form onSubmit={handleSave} className="p-5 flex flex-col gap-5">

          {/* Name */}
          <div>
            <label className={labelCls}>Recipe Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Grandma's Pasta"
              className={inputCls}
            />
          </div>

          {/* Category + Dietary */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className={inputCls + ' cursor-pointer'}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Time (minutes)</label>
              <input
                type="number"
                min="1"
                value={time}
                onChange={e => setTime(e.target.value)}
                placeholder="e.g. 30"
                className={inputCls}
              />
            </div>
          </div>

          {/* Servings + Dietary */}
          <div className="grid grid-cols-2 gap-3 items-start">
            <div>
              <label className={labelCls}>Servings</label>
              <input
                type="number"
                min="1"
                value={servings}
                onChange={e => setServings(e.target.value)}
                placeholder="e.g. 4"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Dietary</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {DIETARY.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDietary(d)}
                    className={`text-[0.72rem] font-bold px-2.5 py-[4px] rounded-full border-[1.5px] transition-all ${
                      dietary.includes(d)
                        ? 'bg-accent border-accent text-white'
                        : 'bg-card border-rim text-muted hover:border-accent'
                    }`}
                  >{d}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <label className={labelCls}>Ingredients *</label>
            <div className="flex flex-col gap-2">
              {ings.map((ing, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={ing.amount}
                    onChange={e => updateIng(i, 'amount', e.target.value)}
                    placeholder="Amt"
                    className="w-[64px] border-[1.5px] border-rim rounded-lg px-2.5 py-2 text-[0.85rem] text-ink bg-paper outline-none focus:border-accent placeholder:text-muted"
                  />
                  <input
                    value={ing.unit}
                    onChange={e => updateIng(i, 'unit', e.target.value)}
                    placeholder="Unit"
                    className="w-[72px] border-[1.5px] border-rim rounded-lg px-2.5 py-2 text-[0.85rem] text-ink bg-paper outline-none focus:border-accent placeholder:text-muted"
                  />
                  <input
                    value={ing.item}
                    onChange={e => updateIng(i, 'item', e.target.value)}
                    placeholder="Ingredient"
                    className="flex-1 border-[1.5px] border-rim rounded-lg px-2.5 py-2 text-[0.85rem] text-ink bg-paper outline-none focus:border-accent placeholder:text-muted"
                  />
                  {ings.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeIng(i)}
                      className="text-muted hover:text-heart text-[1.1rem] px-1 transition-colors shrink-0"
                    >×</button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addIng}
                className="self-start text-[0.78rem] font-bold text-accent border-[1.5px] border-accent rounded-[14px] px-3 py-[5px] hover:bg-accent hover:text-white transition-all mt-0.5"
              >+ Add ingredient</button>
            </div>
          </div>

          {/* Steps */}
          <div>
            <label className={labelCls}>Steps *</label>
            <div className="flex flex-col gap-2">
              {steps.map((step, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="bg-accent text-white w-[22px] h-[22px] rounded-full flex items-center justify-center text-[0.72rem] font-bold shrink-0 mt-2.5">
                    {i + 1}
                  </span>
                  <textarea
                    value={step}
                    onChange={e => updateStep(i, e.target.value)}
                    placeholder={`Step ${i + 1}…`}
                    rows={2}
                    className="flex-1 border-[1.5px] border-rim rounded-lg px-2.5 py-2 text-[0.85rem] text-ink bg-paper outline-none focus:border-accent resize-none placeholder:text-muted leading-relaxed"
                  />
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      className="text-muted hover:text-heart text-[1.1rem] px-1 transition-colors shrink-0 mt-2"
                    >×</button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addStep}
                className="self-start text-[0.78rem] font-bold text-accent border-[1.5px] border-accent rounded-[14px] px-3 py-[5px] hover:bg-accent hover:text-white transition-all mt-0.5"
              >+ Add step</button>
            </div>
          </div>

          {error && <p className="text-[0.82rem] text-heart bg-[#fde8e8] rounded-lg px-3 py-2">{error}</p>}

          {/* Actions */}
          <div className="flex gap-3 pt-1 border-t border-rim">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border-[1.5px] border-rim rounded-xl py-3 text-[0.9rem] font-bold text-muted hover:bg-paper transition-all"
            >Cancel</button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-accent text-white rounded-xl py-3 text-[0.9rem] font-bold hover:bg-accent-dk disabled:opacity-50 transition-all"
            >{saving ? 'Saving…' : 'Save Recipe'}</button>
          </div>

        </form>
      </div>
    </div>
  )
}
