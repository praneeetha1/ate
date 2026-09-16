import { useApp } from '../context/AppContext'
import { keyToText, isUserRecipeKey } from '../utils/recipe'
import Tag from './Tag'
import Icon from './Icon'

export default function RecipeCard({ recipe, recipeKey, onOpen, fill }) {
  const { favorites, toggleFav, ratings } = useApp()

  const isFav        = favorites.has(recipeKey)
  const rating       = ratings[keyToText(recipeKey)] || 0
  const isVeg        = (recipe.dietary || []).includes('vegetarian')
  const isUserRecipe = isUserRecipeKey(recipeKey)

  return (
    <div
      className={`group bg-card border-2.5 border-ink rounded-xl shadow-warm transition-all hover:shadow-warm-lg hover:-translate-x-[2px] hover:-translate-y-[2px] flex flex-col overflow-hidden ${fill ? 'w-full' : 'w-[240px]'}`}
    >
      {/* Only when there is one. Most of the catalog has no photo, and a grid
          of grey placeholders reads worse than a grid of clean text cards, so
          the no-image layout stays exactly as it was. */}
      {recipe.image && (
        <button
          type="button"
          onClick={() => onOpen(recipeKey)}
          tabIndex={-1}
          aria-hidden="true"
          className="block w-full border-b-2.5 border-ink bg-paper"
        >
          <img
            src={recipe.image}
            alt=""
            loading="lazy"
            // A dead link is common with linked images, and a broken-image
            // glyph is worse than no image: drop the whole frame instead.
            onError={e => { e.currentTarget.parentElement.style.display = 'none' }}
            className="w-full h-[132px] object-cover"
          />
        </button>
      )}
      <div className="p-4 pb-3 flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          {/* A real button rather than a div+onClick, so the card is reachable
              and openable from the keyboard. */}
          <button
            type="button"
            onClick={() => onOpen(recipeKey)}
            className="text-left w-full font-display font-semibold text-[1.02rem] text-ink leading-tight truncate mb-[7px] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            {recipe.name}
          </button>
          <div className="flex items-center gap-[7px] flex-wrap">
            {isUserRecipe && (
              <span className="inline-block text-[0.63rem] font-extrabold tracking-[0.06em] uppercase px-2.5 py-[1px] rounded-full border-2 border-ink bg-accent text-ink">
                My Recipe
              </span>
            )}
            <Tag category={recipe.category} />
            {recipe.timeMinutes && (
              <span className="flex items-center gap-1 text-[0.7rem] font-bold text-muted">
                <Icon name="clock" size={13} />{recipe.timeMinutes} min
              </span>
            )}
            {isVeg && <Icon name="leaf" size={13} label="Vegetarian" className="text-[#2E8B57]" />}
            {rating > 0 && (
              <span className="flex items-center gap-[1px] text-star" aria-label={`Rated ${rating} out of 5`}>
                {Array.from({ length: rating }, (_, i) => <Icon key={i} name="star" size={11} filled />)}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          className={`shrink-0 text-[1.2rem] transition-transform hover:scale-[1.25] active:scale-95 px-[3px] py-[2px] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${isFav ? 'text-heart' : 'text-warm-tan hover:text-heart'}`}
          onClick={() => toggleFav(recipeKey, recipe.name)}
          aria-pressed={isFav}
          aria-label={isFav ? `Remove ${recipe.name} from saved` : `Save ${recipe.name}`}
          title="Save"
        >
          <Icon name="heart" size={19} filled={isFav} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => onOpen(recipeKey)}
        tabIndex={-1}
        aria-hidden="true"
        className="font-display text-[0.72rem] font-semibold text-ink bg-sun border-t-2.5 border-ink px-4 py-[7px] text-left opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <span className="inline-flex items-center gap-1.5">{"Let's cook"}<Icon name="arrowRight" size={13} /></span>
      </button>
    </div>
  )
}
