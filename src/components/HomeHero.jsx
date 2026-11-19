import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { formatRecipeTime } from '../utils/formatTime'
import Icon from './Icon'
import DietMark from './DietMark'
import { CategoryDoodle } from './Sketch'

/** What the clock says you're probably about to cook. */
function mealNow(hour) {
  if (hour >= 5 && hour < 11)  return { hello: 'Good morning',   ask: 'Something for breakfast?', doodle: 'Breakfast', cats: ['Breakfast'] }
  if (hour >= 11 && hour < 16) return { hello: 'Good afternoon', ask: 'Lunch, maybe this?',      doodle: 'Pasta & Noodles', cats: ['Quick Meal', 'Main Dish', 'Pasta & Noodles'] }
  if (hour >= 16 && hour < 22) return { hello: 'Good evening',   ask: 'How about this for dinner?', doodle: 'Main Dish', cats: ['Main Dish', 'Pasta & Noodles', 'Quick Meal'] }
  return { hello: 'Hello, night owl', ask: 'A late bite?', doodle: 'Dessert', cats: ['Snack & Appetizer', 'Dessert', 'Quick Meal'] }
}

/** Local day number, so the pick changes at your midnight, not UTC's. */
const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 864e5)

/**
 * The top of Home: a greeting, and one recipe picked for the time of day.
 * The pick is stable for the day (no reshuffle on every visit); the dice
 * deals another one in place, so you can see it before committing to it.
 */
export default function HomeHero({ recipes, onOpen, action }) {
  const profile = useAuth()?.profile
  const meal = mealNow(new Date().getHours())

  const pool = useMemo(() => {
    const withPic = recipes.filter(({ r }) => r.image)
    const forMeal = withPic.filter(({ r }) => meal.cats.includes(r.category))
    return forMeal.length ? forMeal : withPic.length ? withPic : recipes
    // meal.cats is a fresh array each render; its content only changes with the greeting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipes, meal.hello])

  const [shift, setShift] = useState(0)
  const [rolls, setRolls] = useState(0)
  const pick = pool.length ? pool[(today() + shift) % pool.length] : null
  const { r, i } = pick ?? {}
  const name = profile?.username_set && profile.username

  function deal() {
    // Never deal the same card twice in a row.
    setShift(s => s + 1 + (pool.length > 2 ? Math.floor(Math.random() * (pool.length - 1)) : 0))
    setRolls(n => n + 1)
  }

  return (
    <section aria-labelledby="hero-heading" className="px-5 pt-5 pb-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="hero-heading" className="font-display text-[1.6rem] leading-tight font-semibold text-ink">
            {meal.hello}{name ? `, ${name}` : ''}
          </h2>
          <p className="text-[0.9rem] text-muted mt-0.5">{meal.ask}</p>
        </div>
        {action}
      </div>

      {pick && (
      <div className="relative mt-4 mb-2">
        {/* The meal's doodle, stuck on the corner of the card like a sticker. */}
        <span aria-hidden="true" className="absolute -top-6 -right-1 z-20 rotate-12">
          <CategoryDoodle category={meal.doodle} size={56} className="doodle-wiggle" />
        </span>
        {/* A strip of tape holding the card down. Decoration only. */}
        <span aria-hidden="true" className="absolute -top-2.5 left-1/2 -translate-x-1/2 -rotate-3 z-10 w-20 h-5 bg-accent/80 border-[1.5px] border-ink/30" />
        <article
          key={i}
          className="deal-in relative bg-card border-2.5 border-ink rounded-2xl shadow-warm-lg overflow-hidden -rotate-1 transition-transform hover:rotate-0 active:scale-[0.99] active:shadow-warm"
        >
          {r.image && (
            <img
              src={r.image}
              alt=""
              className="w-full h-[180px] object-cover border-b-2.5 border-ink bg-paper"
              onError={e => { e.currentTarget.style.display = 'none' }}
            />
          )}
          <div className="p-4 flex items-end gap-3">
            <div className="flex-1 min-w-0">
              <span className="text-[0.72rem] font-bold text-accent-dk">Today’s pick</span>
              <button
                type="button"
                onClick={() => onOpen(i)}
                className="block text-left w-full font-display font-semibold text-[1.3rem] leading-tight text-ink line-clamp-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink rounded after:absolute after:inset-0 after:content-['']"
              >{r.name}</button>
              <div className="flex items-center gap-2 mt-1.5 text-[0.75rem] font-bold text-muted">
                <span>{r.category}</span>
                {r.timeMinutes > 0 && <span className="flex items-center gap-1"><Icon name="clock" size={13} />{formatRecipeTime(r)}</span>}
                <DietMark recipe={r} />
              </div>
            </div>
            {pool.length > 1 && (
              <button
                type="button"
                onClick={deal}
                aria-label="Surprise me: show another recipe"
                title="Surprise me"
                className="relative z-10 shrink-0 w-12 h-12 grid place-items-center rounded-circle border-2 border-ink bg-accent text-ink shadow-pop press focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                <span key={rolls} className={rolls ? 'dice-roll' : ''}><Icon name="dice" size={22} /></span>
              </button>
            )}
          </div>
        </article>
      </div>
      )}
    </section>
  )
}

/**
 * Sticker chips for each course, jumping to its row. HashRouter owns the URL
 * fragment, so this scrolls by id rather than with #anchors.
 */
export function CategoryJump({ cats }) {
  if (cats.length < 2) return null
  return (
    <nav aria-label="Jump to a course" className="flex gap-2.5 overflow-x-auto px-5 pt-3 pb-4 scrollbar-hide">
      {cats.map(({ name, count }, n) => (
        <button
          key={name}
          type="button"
          onClick={() => document.getElementById(courseId(name))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className={`shrink-0 inline-flex items-center gap-1.5 min-h-[40px] pl-2.5 pr-3 rounded-xl border-2 border-ink bg-card text-ink text-[0.82rem] font-bold shadow-pop press transition-transform hover:rotate-0 ${n % 2 ? 'rotate-1' : '-rotate-1'}`}
        >
          <CategoryDoodle category={name} size={20} />
          {name}
          <span className="text-muted font-semibold">{count}</span>
        </button>
      ))}
    </nav>
  )
}

export const courseId = name => 'course-' + name.toLowerCase().replace(/[^a-z]+/g, '-')
