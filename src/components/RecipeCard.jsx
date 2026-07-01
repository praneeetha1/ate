import { useApp } from '../context/AppContext'
import Tag from './Tag'

export default function RecipeCard({ recipe, idx, onOpen, fill }) {
  const { favorites, toggleFav, ratings } = useApp()
  const isFav        = favorites.has(idx)
  const rating       = ratings[recipe.name] || 0
  const isVeg        = (recipe.dietary || []).includes('vegetarian')
  const isUserRecipe = typeof idx === 'string' && idx.startsWith('u_')

  return (
    <div
      className={`group bg-card border-[1.5px] border-warm-tan rounded-xl shadow-warm cursor-pointer transition-all hover:shadow-warm-lg hover:border-accent hover:-translate-y-[3px] flex flex-col overflow-hidden ${fill ? 'w-full' : 'w-[240px]'}`}
      onClick={() => onOpen(idx)}
    >
      <div className="p-4 pb-3 flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold text-ink leading-tight truncate mb-[7px]">
            {recipe.name}
          </div>
          <div className="flex items-center gap-[7px] flex-wrap">
            {isUserRecipe && (
              <span className="inline-block text-[0.68rem] font-bold tracking-[0.08em] uppercase px-2.5 py-[3px] rounded-xl bg-accent text-white">
                My Recipe
              </span>
            )}
            <Tag category={recipe.category} />
            {recipe.timeMinutes && (
              <span className="text-[0.7rem] text-muted">⏱ {recipe.timeMinutes} min</span>
            )}
            {isVeg && <span className="text-[0.72rem]">🌿</span>}
            {rating > 0 && (
              <span className="text-[0.68rem] text-star tracking-[-1px]">{'★'.repeat(rating)}</span>
            )}
          </div>
        </div>
        <button
          className={`shrink-0 text-[1.2rem] transition-all hover:scale-[1.2] px-[3px] py-[2px] ${isFav ? 'text-heart' : 'text-warm-tan hover:text-[#e8a0a0]'}`}
          onClick={e => { e.stopPropagation(); toggleFav(idx, recipe.name) }}
          title="Save"
        >♥</button>
      </div>
      <div className="text-[0.7rem] text-muted px-4 pb-3 border-t border-dashed border-warm-tan opacity-0 group-hover:opacity-100 transition-opacity">
        Tap to open →
      </div>
    </div>
  )
}
