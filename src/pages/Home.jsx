import { useState, useMemo } from 'react'
import RECIPES from '../data/recipes.json'
import RecipeCard from '../components/RecipeCard'
import { applyFilters } from '../utils/recipe'

const CATEGORIES = [...new Set(RECIPES.map(r => r.category))]

const DIET_PILLS = [
  { label: 'All',          value: '' },
  { label: '🌿 Vegetarian', value: 'vegetarian' },
]
const TIME_PILLS = [
  { label: 'Any time',      value: '' },
  { label: '⏱ Under 30 min', value: '30' },
  { label: '⏱ Under 1 hr',   value: '60' },
]

export default function Home({ onOpen }) {
  const [dietFilter, setDietFilter] = useState('')
  const [timeFilter, setTimeFilter] = useState('')

  const filtered = useMemo(() => {
    return applyFilters(RECIPES.map((r, i) => ({ r, i })), dietFilter, timeFilter)
  }, [dietFilter, timeFilter])

  const visibleCats = CATEGORIES.filter(cat => filtered.some(({ r }) => r.category === cat))

  function surprise() {
    if (!filtered.length) return
    const { i } = filtered[Math.floor(Math.random() * filtered.length)]
    onOpen(i)
  }

  const pillBase = 'shrink-0 text-[0.75rem] font-bold tracking-[0.06em] uppercase px-3.5 py-[5px] rounded-full border-[1.5px] transition-all whitespace-nowrap'
  const pillActive = 'bg-accent border-accent text-white'
  const pillInactive = 'bg-card border-rim text-muted hover:border-accent hover:text-accent-dk'

  return (
    <>
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-5 py-3 overflow-x-auto scrollbar-hide border-b border-warm-tan bg-cream sticky top-[72px] z-[80]">
        {DIET_PILLS.map(p => (
          <button
            key={p.value}
            onClick={() => setDietFilter(p.value)}
            className={`${pillBase} ${dietFilter === p.value ? pillActive : pillInactive}`}
          >{p.label}</button>
        ))}
        <div className="w-px h-[22px] bg-rim shrink-0 mx-0.5" />
        {TIME_PILLS.map(p => (
          <button
            key={p.value}
            onClick={() => setTimeFilter(p.value)}
            className={`${pillBase} ${timeFilter === p.value ? pillActive : pillInactive}`}
          >{p.label}</button>
        ))}
        <button
          onClick={surprise}
          className="shrink-0 ml-auto text-[0.75rem] font-bold text-accent-dk bg-paper border-[1.5px] border-rim rounded-full px-3.5 py-[5px] whitespace-nowrap hover:bg-accent hover:text-white hover:border-accent transition-all"
        >🎲 Surprise me</button>
      </div>

      {/* Category sections */}
      <div>
        {visibleCats.map((cat, ci) => {
          const recipes = filtered.filter(({ r }) => r.category === cat)
          return (
            <div key={cat} className="mb-2">
              <div className="flex items-baseline justify-between px-5 pt-[18px] pb-2.5">
                <span className="font-display text-[1.1rem] font-semibold text-ink">{cat}</span>
                <span className="text-[0.72rem] text-muted">
                  {recipes.length} recipe{recipes.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex gap-3.5 overflow-x-auto px-5 pb-4 scrollbar-hide snap-x-mandatory">
                {recipes.map(({ r, i }) => (
                  <div key={i} className="snap-start shrink-0">
                    <RecipeCard recipe={r} idx={i} onOpen={onOpen} />
                  </div>
                ))}
              </div>
              {ci < visibleCats.length - 1 && (
                <div className="h-px bg-warm-tan opacity-60 mx-5" />
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
