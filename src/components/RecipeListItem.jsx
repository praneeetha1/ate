import { useApp } from '../context/AppContext'
import { keyToText, isUserRecipeKey } from '../utils/recipe'
import Tag from './Tag'

export default function RecipeListItem({ recipe, recipeKey, onOpen }) {
  const { favorites, toggleFav, ratings } = useApp()

  const isFav  = favorites.has(recipeKey)
  const rating = ratings[keyToText(recipeKey)] || 0
  const isVeg  = (recipe.dietary || []).includes('vegetarian')

  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5 bg-card border-b-2 border-ink last:border-b-0 hover:bg-paper transition-colors focus-within:bg-paper">
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
            <span className="inline-block text-[0.6rem] font-extrabold tracking-[0.06em] uppercase px-2 py-[1px] rounded-full border-2 border-ink bg-accent text-ink">
              My Recipe
            </span>
          )}
          <Tag category={recipe.category} />
          {recipe.timeMinutes && (
            <span className="text-[0.72rem] font-bold text-muted">⏱ {recipe.timeMinutes} min</span>
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
        className={`shrink-0 text-[1.1rem] transition-transform hover:scale-[1.25] active:scale-95 p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${isFav ? 'text-heart' : 'text-warm-tan hover:text-heart'}`}
        onClick={() => toggleFav(recipeKey, recipe.name)}
        aria-pressed={isFav}
        aria-label={isFav ? `Remove ${recipe.name} from saved` : `Save ${recipe.name}`}
        title="Save"
      >♥</button>
      <span
        className="shrink-0 w-6 h-6 grid place-items-center rounded-full border-2 border-ink bg-sun text-ink text-[0.8rem] font-extrabold leading-none pointer-events-none"
        aria-hidden="true"
      >›</span>
    </div>
  )
}
