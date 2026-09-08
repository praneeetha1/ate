import { useApp } from '../context/AppContext'
import { keyToText, isUserRecipeKey } from '../utils/recipe'
import Tag from './Tag'

export default function RecipeCard({ recipe, recipeKey, onOpen, fill }) {
  const { favorites, toggleFav, ratings } = useApp()

  const isFav        = favorites.has(recipeKey)
  const rating       = ratings[keyToText(recipeKey)] || 0
  const isVeg        = (recipe.dietary || []).includes('vegetarian')
  const isUserRecipe = isUserRecipeKey(recipeKey)

  return (
    <div
      className={`group bg-card border-[1.5px] border-warm-tan rounded-xl shadow-warm transition-all hover:shadow-warm-lg hover:border-accent hover:-translate-y-[3px] flex flex-col overflow-hidden focus-within:border-accent ${fill ? 'w-full' : 'w-[240px]'}`}
    >
      <div className="p-4 pb-3 flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          {/* A real button rather than a div+onClick, so the card is reachable
              and openable from the keyboard. */}
          <button
            type="button"
            onClick={() => onOpen(recipeKey)}
            className="text-left w-full font-display font-semibold text-ink leading-tight truncate mb-[7px] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            {recipe.name}
          </button>
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
            {isVeg && <span className="text-[0.72rem]" title="Vegetarian" role="img" aria-label="Vegetarian">🌿</span>}
            {rating > 0 && (
              <span className="text-[0.68rem] text-star tracking-[-1px]" aria-label={`Rated ${rating} out of 5`}>
                {'★'.repeat(rating)}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          className={`shrink-0 text-[1.2rem] transition-all hover:scale-[1.2] px-[3px] py-[2px] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${isFav ? 'text-heart' : 'text-warm-tan hover:text-[#e8a0a0]'}`}
          onClick={() => toggleFav(recipeKey, recipe.name)}
          aria-pressed={isFav}
          aria-label={isFav ? `Remove ${recipe.name} from saved` : `Save ${recipe.name}`}
          title="Save"
        >♥</button>
      </div>
      <button
        type="button"
        onClick={() => onOpen(recipeKey)}
        tabIndex={-1}
        aria-hidden="true"
        className="text-[0.7rem] text-muted px-4 pb-3 pt-1 text-left border-t border-dashed border-warm-tan opacity-0 group-hover:opacity-100 transition-opacity"
      >
        Tap to open →
      </button>
    </div>
  )
}
