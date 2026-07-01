import { useApp } from '../context/AppContext'
import Tag from './Tag'

export default function RecipeListItem({ recipe, idx, onOpen }) {
  const { favorites, toggleFav, ratings } = useApp()
  const isFav  = favorites.has(idx)
  const rating = ratings[recipe.name] || 0
  const isVeg  = (recipe.dietary || []).includes('vegetarian')

  return (
    <div
      className="flex items-center gap-3.5 px-5 py-3.5 border-b border-[rgba(200,180,130,0.3)] cursor-pointer hover:bg-paper transition-colors"
      onClick={() => onOpen(idx)}
    >
      <div className="flex-1 min-w-0">
        <div className="font-display text-[0.98rem] font-semibold text-ink truncate mb-[5px]">
          {recipe.name}{isVeg ? ' 🌿' : ''}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Tag category={recipe.category} />
          {recipe.timeMinutes && (
            <span className="text-[0.72rem] text-muted">⏱ {recipe.timeMinutes} min</span>
          )}
          {rating > 0 && (
            <span className="text-[0.75rem] text-star tracking-[-1px]">{'★'.repeat(rating)}</span>
          )}
        </div>
      </div>
      <button
        className={`shrink-0 text-[1.1rem] transition-all hover:scale-[1.2] p-1 ${isFav ? 'text-heart' : 'text-warm-tan hover:text-[#e8a0a0]'}`}
        onClick={e => { e.stopPropagation(); toggleFav(idx, recipe.name) }}
        title="Save"
      >♥</button>
      <span className="text-[1.4rem] text-rim shrink-0 pointer-events-none">›</span>
    </div>
  )
}
