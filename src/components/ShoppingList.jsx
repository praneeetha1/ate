import { useApp } from '../context/AppContext'
import { usePantry } from '../context/PantryContext'
import { ingredientLabel, resolveRecipe, keyToText } from '../utils/recipe'
import { shoppingName, isNeverShopped } from '../utils/ingredients'
import Icon from './Icon'

/**
 * What you still need, grouped by the recipe that wants it.
 *
 * Lives on the Fridge page directly under the pantry, because the two are one
 * question asked twice: what you have, and what you don't. It used to sit on
 * Profile, which meant scrolling past a bio and a recipe grid to reach the
 * thing you actually open in a shop.
 */
export default function ShoppingList({ onOpen }) {
  const { shoppingList, toggleShopItem, isShopItemChecked, toggleShopping,
          clearShopping, userRecipes } = useApp()
  const { setPantryState } = usePantry()

  const listArr = [...shoppingList]

  return (
    <section aria-labelledby="shopping-heading">
      <div className="flex items-center justify-between px-5 py-[18px] pb-3">
        <h2 id="shopping-heading" className="font-display text-[1.15rem] font-semibold text-ink flex items-center gap-2">
          <Icon name="cart" size={19} />Shopping List
        </h2>
        {listArr.length > 0 && (
          <button
            onClick={clearShopping}
            className="text-[0.78rem] font-bold border-2 rounded-full px-3 py-[5px] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent border-ink text-muted hover:text-heart hover:border-heart"
          >Clear all</button>
        )}
      </div>

      {!listArr.length ? (
        <div className="text-center py-[40px] px-5">
          <p className="font-display text-[1.05rem] text-muted">Nothing here yet</p>
          <p className="text-[0.8rem] text-muted mt-2 italic">
            Open a recipe and tap the cart to add its ingredients
          </p>
        </div>
      ) : (
        <div className="pb-4">
          {listArr.map(key => {
            // Resolves user recipes as well as catalog ones. Adding a user
            // recipe to the shopping list used to persist but render nothing,
            // because only numeric catalog keys were looked up here.
            const recipe = resolveRecipe(key, userRecipes)
            if (!recipe) return null
            return (
              <div key={keyToText(key)} className="mx-4 mb-3.5 border-2 border-ink rounded-xl overflow-hidden bg-card">
                <div className="flex items-center justify-between px-3.5 py-2.5 bg-paper border-b border-ink gap-2">
                  <button
                    type="button"
                    className="font-display text-[0.92rem] font-semibold text-ink flex-1 truncate text-left hover:text-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                    onClick={() => onOpen(key)}
                  >{recipe.name}</button>
                  <button
                    onClick={() => toggleShopping(key)}
                    aria-label={`Remove ${recipe.name} from shopping list`}
                    className="text-[0.72rem] font-bold text-muted px-1.5 py-0.5 rounded-xl hover:text-heart hover:bg-[#fde8e8] transition-all shrink-0"
                  >Remove</button>
                </div>
                <ul className="list-none">
                  {recipe.ingredients
                    // Index has to be captured before filtering: the checked
                    // state and toggleShopItem both address ingredients by
                    // their position in the recipe, not in this list.
                    .map((ing, i) => ({ ing, i }))
                    .filter(({ ing }) => !isNeverShopped(ing.item))
                    .map(({ ing, i }) => {
                      const checked = isShopItemChecked(key, i)
                      // The catalog's `item` is a cooking string — prep, notes
                      // and alternatives inline, up to 128 chars. None of that
                      // helps in a shop, and the recipe view still shows it in
                      // full, so the list renders the shopping name instead.
                      const { measure } = ingredientLabel(ing, 1)
                      const item = shoppingName(ing.item)
                      return (
                        <li
                          key={i}
                          className={`border-b border-[rgba(200,180,130,0.2)] last:border-0 text-[0.86rem] transition-all hover:bg-paper ${checked ? 'opacity-40' : ''}`}
                        >
                          <label className="flex items-start gap-2.5 px-3.5 py-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                toggleShopItem(key, i)
                                // Ticking something off in the shop means you
                                // have it now, so the pantry learns from a
                                // gesture the user already makes. Unticking is
                                // a correction, not a claim to be out of it,
                                // so it deliberately writes nothing.
                                if (!checked) setPantryState(ing.item, 'have')
                              }}
                              className="accent-accent w-[15px] h-[15px] shrink-0 mt-[3px]"
                            />
                            <span className="text-accent-dk font-bold min-w-[56px] shrink-0">{measure}</span>
                            {/* The full string stays reachable — some of the
                                dropped detail matters once you're cooking. */}
                            <span className="text-ink" title={ing.item}>{item}</span>
                          </label>
                        </li>
                      )
                    })}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
