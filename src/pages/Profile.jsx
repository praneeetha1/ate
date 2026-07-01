import RECIPES from '../data/recipes.json'
import { useApp } from '../context/AppContext'
import { ingredientLabel } from '../utils/recipe'

export default function Profile({ onOpen }) {
  const { shoppingList, shopChecked, toggleShopItem, toggleShopping, clearShopping } = useApp()
  const listArr = [...shoppingList]

  return (
    <>
      {/* Profile section */}
      <div className="flex flex-col items-center px-5 pt-7 pb-5 gap-2.5 border-b border-warm-tan">
        <div className="w-20 h-20 rounded-full bg-warm-tan border-2 border-rim flex items-center justify-center text-[2.5rem]">
          👤
        </div>
        <div className="font-display text-[1.3rem] font-semibold text-ink">Your Name</div>
        <div className="text-[0.82rem] text-muted">Home cook 🍽</div>
      </div>

      {/* Shopping list header */}
      <div className="flex items-center justify-between px-5 py-[18px] pb-3">
        <span className="font-display text-[1.3rem] font-semibold text-ink">🛒 Shopping List</span>
        {listArr.length > 0 && (
          <button
            onClick={clearShopping}
            className="text-[0.75rem] font-bold text-muted border-[1.5px] border-rim rounded-[14px] px-3 py-[5px] hover:text-heart hover:border-heart transition-all"
          >Clear all</button>
        )}
      </div>

      {!listArr.length ? (
        <div className="text-center py-[60px] px-5">
          <div className="font-display text-[1.05rem] text-muted">Nothing here yet</div>
          <div className="text-[0.8rem] text-muted mt-2 italic">
            Open a recipe and tap 🛒 to add its ingredients
          </div>
        </div>
      ) : (
        <div className="pb-4">
          {listArr.map(idx => {
            const recipe = RECIPES[idx]
            return (
              <div key={idx} className="mx-4 mb-3.5 border-[1.5px] border-warm-tan rounded-[10px] overflow-hidden bg-card">
                <div className="flex items-center justify-between px-3.5 py-2.5 bg-paper border-b border-warm-tan">
                  <span
                    className="font-display text-[0.92rem] font-semibold text-ink flex-1 truncate mr-2.5 cursor-pointer hover:text-accent transition-colors"
                    onClick={() => onOpen(idx)}
                  >{recipe.name}</span>
                  <button
                    onClick={() => toggleShopping(idx)}
                    className="text-[0.72rem] font-bold text-muted px-1.5 py-0.5 rounded-lg hover:text-heart hover:bg-[#fde8e8] transition-all shrink-0"
                  >Remove</button>
                </div>
                {recipe.ingredients.map((ing, i) => {
                  const key     = `${idx}-${i}`
                  const checked = shopChecked.has(key)
                  const { measure, item } = ingredientLabel(ing, 1)
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-2.5 px-3.5 py-2 border-b border-[rgba(200,180,130,0.2)] last:border-0 text-[0.86rem] cursor-pointer transition-all hover:bg-paper ${checked ? 'opacity-40' : ''}`}
                      onClick={() => toggleShopItem(key)}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleShopItem(key)}
                        onClick={e => e.stopPropagation()}
                        className="accent-accent w-[15px] h-[15px] shrink-0 mt-[1px]"
                      />
                      <span className="text-accent-dk font-bold min-w-[56px] shrink-0">{measure}</span>
                      <span className="text-ink">{item}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
