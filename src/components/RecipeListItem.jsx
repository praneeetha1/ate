import { useApp } from '../context/AppContext'
import { keyToText, isUserRecipeKey } from '../utils/recipe'
import Tag from './Tag'

export default function RecipeListItem({ recipe, recipeKey, onOpen }) {
  const { favorites, toggleFav, ratings } = useApp()

  const isFav  = favorites.has(recipeKey)
  const rating = ratings[keyToText(recipeKey)] || 0
  const isVeg  = (recipe.dietary || []).includes('vegetarian')

  return (
    <div className="flex items-center gap-3.5 px-5 py-3.5 border-b border-[rgba(200,180,130,0.3)] hover:bg-paper transition-colors focus-within:bg-paper">
      <button
        type="button"
        onClick={() => onOpen(recipeKey)}
        className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
      >
        <div className="font-display text-[0.98rem] font-semibold text-ink truncate mb-[5px]">
          {recipe.name}{isVeg ? ' 🌿' : ''}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isUserRecipeKey(recipeKey) && (
            <span className="inline-block text-[0.62rem] font-bold tracking-[0.08em] uppercase px-2 py-[2px] rounded-lg bg-accent text-white">
              My Recipe
            </span>
          )}
          <Tag category={recipe.category} />
          {recipe.timeMinutes && (
            <span className="text-[0.72rem] text-muted">⏱ {recipe.timeMinutes} min</span>
          )}
          {rating > 0 && (
            <span className="text-[0.75rem] text-star tracking-[-1px]" aria-label={`Rated ${rating} out of 5`}>
              {'★'.repeat(rating)}
            </span>
          )}
        </div>
      </button>
      <button
        type="button"
        className={`shrink-0 text-[1.1rem] transition-all hover:scale-[1.2] p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${isFav ? 'text-heart' : 'text-warm-tan hover:text-[#e8a0a0]'}`}
        onClick={() => toggleFav(recipeKey, recipe.name)}
        aria-pressed={isFav}
        aria-label={isFav ? `Remove ${recipe.name} from saved` : `Save ${recipe.name}`}
        title="Save"
      >♥</button>
      <span className="text-[1.4rem] text-rim shrink-0 pointer-events-none" aria-hidden="true">›</span>
    </div>
  )
}
