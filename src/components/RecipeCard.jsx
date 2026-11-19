import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { keyToText, isUserRecipeKey } from '../utils/recipe'
import { formatRecipeTime } from '../utils/formatTime'
import Tag from './Tag'
import Icon from './Icon'
import DietMark from './DietMark'
import { CategoryDoodle, doodleInColour } from './Sketch'
import { leadTimes } from '../utils/steps'

/** `children` is a footer line (a pantry caption) drawn inside the card's border. */
export default function RecipeCard({ recipe, recipeKey, onOpen, fill, hideCategory, children }) {
  const { favorites, toggleFav, ratings } = useApp()
  // Bumped on each save, so the heart replays its pop (unsaving stays quiet).
  const [pops, setPops] = useState(0)
  // A dead image link falls back to the drawn tile, like a recipe with no photo.
  const [broken, setBroken] = useState(false)
  const photo = recipe.image && !broken

  const isFav        = favorites.has(recipeKey)
  const rating       = ratings[keyToText(recipeKey)] || 0
  const planAhead    = leadTimes(recipe).length > 0
  const isUserRecipe = isUserRecipeKey(recipeKey)

  return (
    <div
      className={`group relative bg-card border-2.5 border-ink rounded-xl shadow-warm transition-all hover:shadow-warm-lg hover:-translate-y-[2px] active:scale-[0.98] active:shadow-pop flex flex-col overflow-hidden h-full ${fill ? 'w-full' : 'w-[240px]'}`}
    >
      {/* Every card gets the same picture area, so a row of cards lines up:
          the photo when there is one, otherwise the course's doodle on paper
          (drawn, not a grey box). */}
      <button
        type="button"
        onClick={() => onOpen(recipeKey)}
        tabIndex={-1}
        aria-hidden="true"
        className="block w-full h-[132px] shrink-0 border-b-2.5 border-ink bg-paper overflow-hidden"
      >
        {photo ? (
          <img
            src={recipe.image}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span data-testid="card-doodle" className={`w-full h-full grid place-items-center ${doodleInColour(recipe.category, 'cat-main') ? 'text-ink' : 'text-ink/30'}`}>
            <CategoryDoodle category={recipe.category} fallback="cat-main" size={76} className="-rotate-6" />
          </span>
        )}
      </button>
      <div className="p-4 pb-3 flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          {/* A real button rather than a div+onClick, so the card is reachable
              and openable from the keyboard. */}
          <button
            type="button"
            onClick={() => onOpen(recipeKey)}
            className="text-left w-full font-display font-semibold text-[1.02rem] text-ink leading-tight line-clamp-2 min-h-[2.5em] mb-[7px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink rounded after:absolute after:inset-0 after:content-['']"
          >
            {recipe.name}
          </button>
          <div className="flex items-center gap-[7px] flex-wrap">
            {isUserRecipe && (
              <span className="inline-block text-[0.7rem] font-bold px-1.5 py-[1px] rounded border-[1.5px] border-ink bg-accent text-ink">
                My Recipe
              </span>
            )}
            {!hideCategory && <Tag category={recipe.category} />}
            {recipe.timeMinutes > 0 && (
              <span className="flex items-center gap-1 text-[0.7rem] font-bold text-muted">
                <Icon name="clock" size={13} />{formatRecipeTime(recipe)}
              </span>
            )}
            <DietMark recipe={recipe} />
            {planAhead && (
              <span className="text-[0.7rem] font-bold px-1.5 py-[1px] rounded border-[1.5px] border-ink bg-sun text-ink">Plan ahead</span>
            )}
            {rating > 0 && (
              <span className="flex items-center gap-[1px] text-star" aria-label={`Rated ${rating} out of 5`}>
                {Array.from({ length: rating }, (_, i) => <Icon key={i} name="star" size={11} filled />)}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          className={`relative z-10 shrink-0 text-[1.2rem] transition-transform hover:scale-[1.25] active:scale-95 p-2.5 -m-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ink ${isFav ? 'text-heart' : 'text-muted hover:text-heart'}`}
          onClick={() => { if (!isFav) setPops(n => n + 1); toggleFav(recipeKey, recipe.name) }}
          aria-pressed={isFav}
          aria-label={isFav ? `Remove ${recipe.name} from saved` : `Save ${recipe.name}`}
          title="Save"
        >
          <span key={pops} className={`relative block ${pops && isFav ? 'heart-pop' : ''}`}>
            <Icon name="heart" size={19} filled={isFav} />
          </span>
        </button>
      </div>
      {/* mt-auto pins the caption to the bottom, so cards in a row line up. */}
      {children && <div className="mt-auto">{children}</div>}
    </div>
  )
}
