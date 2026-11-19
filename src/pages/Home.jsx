import { useState, useMemo } from 'react'
import RecipeCard from '../components/RecipeCard'
import CreateRecipeModal from '../components/CreateRecipeModal'
import { applyFilters, VISIBLE_CATALOG } from '../utils/recipe'
import { useApp } from '../context/AppContext'
import { usePantry } from '../context/PantryContext'
import { pantryFit, compareFit } from '../utils/pantry'
import { MAIN_INGREDIENTS } from '../utils/ingredients'
import { recipeUses } from '../utils/readiness'
import PantryFit from '../components/PantryFit'
import Icon from '../components/Icon'
import FilterSheet, { activeFilterChips } from '../components/FilterSheet'
import Tour from '../components/Tour'
import { StarterChoice, useStarterRecipes, isReturning } from '../components/StarterRecipes'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import HomeHero, { CategoryJump, courseId } from '../components/HomeHero'
import { CategoryDoodle } from '../components/Sketch'

// Catalogue order, except Breakfast leads: it's the first meal, and its recipes sit at the end of the file.
// Meals in the order of a day, then the extras; anything else after, as found.
const ORDER = ['Breakfast', 'Quick Meal', 'Main Dish', 'Pasta & Noodles', 'Snack & Appetizer', 'Dessert']
const CATEGORIES = [...new Set([...ORDER, ...VISIBLE_CATALOG.map(({ r }) => r.category)])]

export default function Home({ onOpen }) {
  const [filters,         setFilters]         = useState({ diet: '', time: '', noPlanAhead: false })
  const [showFilters,     setShowFilters]     = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [pantryMode,     setPantryMode]      = useState(false)
  const [catFilter,      setCatFilter]       = useState('')
  const [mustHave,       setMustHave]        = useState('')
  const { userRecipes } = useApp()
  const { chosen: startersChosen, catalog } = useStarterRecipes()
  const returning = isReturning(useAuth()?.user)
  const { pantryEnabled, pantryReady, pantryState, pantry, stateOf } = usePantry()

  const { diet: dietFilter, time: timeFilter, noPlanAhead } = filters
  const filtered = useMemo(
    () => applyFilters(catalog, dietFilter, timeFilter, { noPlanAhead }),
    [catalog, dietFilter, timeFilter, noPlanAhead],
  )

  // The same filters now apply to the My Recipes strip, which previously
  // ignored them and stayed fully visible under any filter.
  const filteredMine = useMemo(
    () => applyFilters(userRecipes.map(r => ({ r })), dietFilter, timeFilter, { noPlanAhead }).map(({ r }) => r),
    [userRecipes, dietFilter, timeFilter, noPlanAhead],
  )
  const chips = activeFilterChips(filters)

  const visibleCats = CATEGORIES.filter(cat => filtered.some(({ r }) => r.category === cat))

  /**
   * Everything the filters allow, ordered by how little you'd have to buy.
   *
   * A flat list rather than the category strips: "what can I make" is a
   * question about the whole catalogue at once, and ranking inside each
   * category would bury the best answer under whichever heading it fell into.
   */
  const ranked = useMemo(() => {
    // Also feeds the "Closest to ready" strip, so it can't be gated on the
    // toggle — but it stays idle until the pantry actually knows something.
    if (!pantryEnabled || (!pantryMode && pantry.size === 0)) return []
    return [
      ...filtered,
      ...filteredMine.map(r => ({ r, i: 'u_' + r.id })),
    ]
      // `items` is carried alongside the fit so the must-have row can be
      // derived and applied without canonicalising every ingredient again.
      .map(p => ({ ...p, fit: pantryFit(p.r, stateOf) }))
      .sort((a, b) => compareFit(a.fit, b.fit))
  }, [pantryEnabled, pantryMode, pantry, filtered, filteredMine, stateOf])

  /**
   * The categories actually represented in the ranking, in catalogue order.
   *
   * Derived from the results rather than from the full category list so no
   * pill ever leads to an empty screen — and so a category that only exists
   * among the user's own recipes still gets one.
   */
  const rankedCats = useMemo(() => {
    const present = new Set(ranked.map(({ r }) => r.category))
    return [
      ...CATEGORIES.filter(c => present.has(c)),
      ...[...present].filter(c => !CATEGORIES.includes(c)).sort(),
    ]
  }, [ranked])

  /**
   * The main ingredients worth offering as a must-have, for this cook.
   *
   * Two conditions, both necessary: the cook said they have it (or a kind of
   * it — basmati answers rice), and something in the current
   * ranking actually uses it. The second is what keeps a chip from leading to
   * an empty screen, the same reason the course pills are derived from the
   * results rather than from the full category list.
   */
  const mustHaves = useMemo(() => {
    if (!pantryEnabled) return []
    return MAIN_INGREDIENTS.filter(m => {
      const state = pantryState(m)
      if (state !== 'have' && state !== 'low') return false
      return ranked.some(({ r }) => recipeUses(r, m))
    })
  }, [pantryEnabled, pantryState, ranked])

  // A chip can stop being offered while it's still selected — the last of the
  // chicken gets marked out, and the pill vanishes from under the selection.
  // Reading the filter as unset in that case beats stranding the user on an
  // empty list with nothing on screen explaining why.
  const activeMustHave = mustHaves.includes(mustHave) ? mustHave : ''

  // Category and must-have narrowing apply to the full ranked list only. The
  // "Closest to ready" strip stays unfiltered: it's a preview of your best
  // options overall, and its pills aren't on screen to explain a narrowed one.
  const rankedVisible = useMemo(() => {
    let out = catFilter ? ranked.filter(({ r }) => r.category === catFilter) : ranked
    if (activeMustHave) out = out.filter(({ r }) => recipeUses(r, activeMustHave))
    return out
  }, [ranked, catFilter, activeMustHave])

  const pillBase     = 'shrink-0 inline-flex items-center gap-1.5 text-[0.8rem] font-bold px-3.5 min-h-[40px] rounded-full border-2 transition-all whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-ink'
  const pillActive   = 'bg-accent border-ink text-ink shadow-pop'
  const pillInactive = 'bg-card border-ink text-muted hover:bg-paper hover:text-accent-dk'

  const filterBtn = (
    <button
      data-tour="filters"
      onClick={() => setShowFilters(true)}
      aria-haspopup="dialog"
      aria-label={`Filters${chips.length ? ` · ${chips.length}` : ''}`}
      title="Filters"
      className={`relative shrink-0 w-11 h-11 grid place-items-center rounded-circle border-2 border-ink shadow-pop press focus:outline-none focus-visible:ring-2 focus-visible:ring-ink ${chips.length ? 'bg-accent text-ink' : 'bg-card text-ink'}`}
    >
      <Icon name="menu" size={17} />
      {chips.length > 0 && (
        <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-circle bg-ink text-card text-[0.65rem] font-extrabold">{chips.length}</span>
      )}
    </button>
  )

  return (
    <>
      {showFilters && (
        <FilterSheet
          filters={filters}
          onChange={setFilters}
          count={filtered.length + filteredMine.length}
          onClose={() => setShowFilters(false)}
        />
      )}
      {showCreateModal && (
        <CreateRecipeModal
          onClose={() => setShowCreateModal(false)}
          onCreated={key => onOpen(key)}
        />
      )}

      {/* The two views, only once you're in the ranked one: the home feed
          reaches it from "What can I make" on the Closest to ready row, so
          a permanent switch at the top was just one more loud bar. */}
      {pantryMode && (
        <div className="flex items-center gap-2 px-5 pt-4">
          <div className="seg flex-1" role="group" aria-label="Show">
            <button onClick={() => setPantryMode(false)} aria-pressed={!pantryMode}>All recipes</button>
            <button onClick={() => setPantryMode(true)} aria-pressed={pantryMode}><Icon name="plate" size={13} />What can I make</button>
          </div>
          {filterBtn}
        </div>
      )}

      {startersChosen || returning
        ? <Tour />
        : <StarterChoice />}

      {/* What's narrowing the list, each removable without reopening the sheet. */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-5 pt-3" aria-label="Active filters">
          {chips.map(c => (
            <button
              key={c.key}
              onClick={() => setFilters(f => ({ ...f, [c.key]: c.key === 'noPlanAhead' ? false : '' }))}
              aria-label={`Remove filter: ${c.label}`}
              className="inline-flex items-center gap-1.5 min-h-[36px] pl-3 pr-2 rounded-full border-2 border-ink bg-accent text-ink text-[0.82rem] font-bold"
            >{c.label}<Icon name="close" size={14} strokeWidth={3} /></button>
          ))}
          <button
            onClick={() => setFilters({ diet: '', time: '', noPlanAhead: false })}
            className="min-h-[36px] px-2 text-[0.82rem] font-bold text-muted underline underline-offset-2"
          >Clear all</button>
        </div>
      )}

      {!pantryMode && <>
        <HomeHero recipes={filtered} onOpen={onOpen} action={filterBtn} />
        <CategoryJump cats={visibleCats.map(name => ({ name, count: filtered.filter(({ r }) => r.category === name).length }))} />
      </>}

      {/* Once the pantry knows anything, the payoff comes to the user rather
          than waiting behind the toggle. Capped at eight: a strip, not a
          replacement for the catalogue. */}
      {!pantryMode && pantry.size > 0 && ranked.length > 0 && (
        <section className="mb-2" aria-labelledby="closest-strip-heading">
          <div className="flex items-baseline justify-between px-5 pt-[18px] pb-2.5">
            <h2 id="closest-strip-heading" className="font-display text-[1.1rem] font-semibold text-ink flex items-center gap-2">
              <Icon name="fridge" size={17} />Closest to ready
            </h2>
            <button
              onClick={() => setPantryMode(true)}
              className="inline-flex items-center gap-1 text-[0.8rem] font-bold text-ink underline underline-offset-4 decoration-accent-dk decoration-2 min-h-[36px]"
            >What can I make<Icon name="arrowRight" size={14} /></button>
          </div>
          <div className="flex gap-3.5 overflow-x-auto px-5 pb-4 scrollbar-hide snap-x-mandatory">
            {ranked.slice(0, 8).map(({ r, i, fit }) => (
              <div key={i} className="snap-start shrink-0 w-[240px]">
                <RecipeCard recipe={r} recipeKey={i} onOpen={onOpen} fill><PantryFit fit={fit} /></RecipeCard>
              </div>
            ))}
          </div>
          <div className="h-px bg-warm-tan opacity-60 mx-5" />
        </section>
      )}

      {/* Signed in with an empty fridge: say what the fridge is for, rather
          than hiding the feature until someone stumbles on it. */}
      {!pantryMode && pantryEnabled && pantryReady && pantry.size === 0 && (
        <section aria-labelledby="cook-with-heading" className="mx-5 mt-3 mb-2 flex items-center gap-3 rounded-2xl border-2 border-dashed border-ink bg-paper px-4 py-3">
          <Icon name="fridge" size={30} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 id="cook-with-heading" className="font-display text-[1.05rem] font-semibold text-ink">Cook with what you have</h2>
            <p className="text-[0.8rem] text-muted">Tell <Link to="/pantry" className="font-bold text-ink underline underline-offset-2">your fridge</Link> what’s in it, and see what you can make.</p>
          </div>
          <button
            onClick={() => setPantryMode(true)}
            className="shrink-0 min-h-[40px] px-3 rounded-full border-2 border-ink bg-card text-ink text-[0.8rem] font-bold shadow-pop press"
          >What can I make</button>
        </section>
      )}

      {pantryMode ? (
        <section aria-labelledby="closest-heading" className="pb-2">
          <div className="flex items-baseline justify-between px-5 pt-[18px] pb-2.5">
            <h2 id="closest-heading" className="font-display text-[1.1rem] font-semibold text-ink">
              Closest to ready
            </h2>
            <span className="text-[0.72rem] text-muted">{rankedVisible.length} recipes</span>
          </div>

          {/* Course filter, only in this mode: the flat ranking replaces the
              category strips, so this is what puts "just breakfast" back. */}
          {rankedCats.length > 1 && (
            <div
              className="flex items-center gap-2 px-5 pb-3 overflow-x-auto scrollbar-hide"
              role="group"
              aria-label="Filter by category"
            >
              {/* "Any course", not "All" — the diet row above already has an
                  All pill, and two identically named buttons on one screen is
                  ambiguous in the UI and indistinguishable to a screen
                  reader. */}
              <button
                onClick={() => setCatFilter('')}
                aria-pressed={catFilter === ''}
                className={`${pillBase} ${catFilter === '' ? pillActive : pillInactive}`}
              >Any course</button>
              {rankedCats.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCatFilter(cat)}
                  aria-pressed={catFilter === cat}
                  className={`${pillBase} ${catFilter === cat ? pillActive : pillInactive}`}
                >{cat}</button>
              ))}
            </div>
          )}

          {/* Must-haves: the other question a full fridge asks. The ranking
              answers "what am I closest to cooking"; this answers "I need to
              use up the chicken". Only the mains the cook actually has, so the
              row is short and every chip leads somewhere. */}
          {mustHaves.length > 0 && (
            <div
              className="flex items-center gap-2 px-5 pb-3 overflow-x-auto scrollbar-hide"
              role="group"
              aria-label="Filter by a must-have ingredient"
            >
              <span className="shrink-0 text-[0.7rem] font-bold uppercase tracking-[0.08em] text-muted">
                Must use
              </span>
              <button
                onClick={() => setMustHave('')}
                aria-pressed={activeMustHave === ''}
                className={`${pillBase} ${activeMustHave === '' ? pillActive : pillInactive}`}
              >Anything</button>
              {mustHaves.map(m => (
                <button
                  key={m}
                  onClick={() => setMustHave(m)}
                  aria-pressed={activeMustHave === m}
                  className={`${pillBase} ${activeMustHave === m ? pillActive : pillInactive}`}
                >{m}</button>
              ))}
            </div>
          )}

          {/* An untouched pantry ranks by recipe size alone, which looks like a
              broken feature unless we say why. */}
          {pantryReady && pantry.size === 0 && (
            <p className="mx-5 mb-3 text-[0.78rem] text-muted italic border-2 border-dashed border-rim rounded-xl px-4 py-3">
              Nothing in your pantry yet, so this is a guess. Add a few things
              you have in the <Link to="/pantry" className="font-bold not-italic text-accent-dk underline">Fridge</Link> tab
              and this list sorts itself around them.
            </p>
          )}

          {rankedVisible.length === 0 ? (
            <p className="text-center py-[60px] font-display text-[1.1rem] text-muted px-5">
              No recipes match those filters.
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 px-5 pb-6">
              {rankedVisible.map(({ r, i, fit }) => (
                <div key={i}>
                  <RecipeCard recipe={r} recipeKey={i} onOpen={onOpen} fill><PantryFit fit={fit} /></RecipeCard>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
      <>
      {/* My Recipes: always here, led by a card to add one, so adding your
          own lives with your own recipes instead of in a toolbar. */}
      <section className="mb-2" aria-labelledby="my-recipes-heading">
        <div className="flex items-baseline justify-between px-5 pt-[18px] pb-2.5">
          <h2 id="my-recipes-heading" className="font-display text-[1.2rem] font-semibold text-ink">My Recipes</h2>
          {filteredMine.length > 0 && (
            <span className="text-[0.72rem] text-muted">
              {filteredMine.length} recipe{filteredMine.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex gap-3.5 overflow-x-auto px-5 pb-4 scrollbar-hide snap-x-mandatory">
          <div className="snap-start shrink-0">
            <button
              data-tour="add"
              onClick={() => setShowCreateModal(true)}
              className={`h-full ${filteredMine.length ? 'w-[150px] min-h-[220px]' : 'w-[240px] min-h-[120px]'} flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink bg-paper text-ink px-4 press hover:bg-card transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink`}
            >
              <span className="w-11 h-11 grid place-items-center rounded-circle border-2 border-ink bg-accent shadow-pop"><Icon name="plus" size={18} strokeWidth={2.6} /></span>
              <span className="font-display font-semibold text-[1rem]">Add a recipe</span>
              <span className="text-[0.75rem] text-muted text-center">Write one, or paste a link</span>
            </button>
          </div>
          {filteredMine.map(r => (
            <div key={r.id} className="snap-start shrink-0">
              <RecipeCard recipe={r} recipeKey={'u_' + r.id} onOpen={onOpen} />
            </div>
          ))}
        </div>
        <div className="h-px bg-warm-tan opacity-60 mx-5" />
      </section>

      {/* Category sections */}
      <div>
        {visibleCats.length === 0 && (
          <p className="text-center py-[60px] font-display text-[1.1rem] text-muted px-5">
            {catalog.length ? 'No recipes match those filters.' : 'No starter recipes yet. Add your own under My Recipes.'}
          </p>
        )}
        {visibleCats.map((cat, ci) => {
          const recipes = filtered.filter(({ r }) => r.category === cat)
          return (
            <section key={cat} id={courseId(cat)} className="mb-2 scroll-mt-32">
              <div className="flex items-baseline justify-between px-5 pt-[18px] pb-2.5">
                <h2 className="font-display text-[1.2rem] font-semibold text-ink flex items-center gap-2">
                  <CategoryDoodle category={cat} size={22} />{cat}
                </h2>
                <span className="text-[0.72rem] text-muted">
                  {recipes.length} recipe{recipes.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex gap-3.5 overflow-x-auto px-5 pb-4 scrollbar-hide snap-x-mandatory">
                {recipes.map(({ r, i }, n) => (
                  <div key={i} className="snap-start shrink-0" data-tour={ci === 0 && n === 0 ? 'recipe' : undefined}>
                    <RecipeCard recipe={r} recipeKey={i} onOpen={onOpen} hideCategory />
                  </div>
                ))}
              </div>
              {ci < visibleCats.length - 1 && (
                <div className="h-px bg-warm-tan opacity-60 mx-5" />
              )}
            </section>
          )
        })}
      </div>
      </>
      )}
    </>
  )
}
