import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RECIPES from '../data/recipes.json'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { ingredientLabel } from '../utils/recipe'
import CreateRecipeModal from '../components/CreateRecipeModal'

export default function Profile({ onOpen }) {
  const { shoppingList, shopChecked, toggleShopItem, toggleShopping, clearShopping,
          userRecipes, deleteUserRecipe } = useApp()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const listArr = [...shoppingList]

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Home cook'
  const avatarUrl   = user?.user_metadata?.avatar_url

  return (
    <>
      {showCreate && (
        <CreateRecipeModal
          onClose={() => setShowCreate(false)}
          onCreated={idx => { setShowCreate(false); onOpen(idx) }}
        />
      )}

      {/* Profile section */}
      <div className="flex flex-col items-center px-5 pt-7 pb-5 gap-2.5 border-b border-warm-tan">
        {avatarUrl ? (
          <img src={avatarUrl} alt="avatar" className="w-20 h-20 rounded-full border-2 border-rim object-cover" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-warm-tan border-2 border-rim flex items-center justify-center text-[2.5rem]">
            👤
          </div>
        )}
        <div className="font-display text-[1.3rem] font-semibold text-ink">{displayName}</div>
        {user ? (
          <div className="flex flex-col items-center gap-2 mt-0.5">
            <div className="text-[0.78rem] text-muted">{user.email}</div>
            <button
              onClick={() => signOut()}
              className="text-[0.78rem] font-bold text-muted border-[1.5px] border-rim rounded-[14px] px-4 py-[5px] hover:text-heart hover:border-heart transition-all"
            >Sign out</button>
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="mt-0.5 text-[0.85rem] font-bold text-accent border-[1.5px] border-accent rounded-[14px] px-5 py-[6px] hover:bg-accent hover:text-white transition-all"
          >Log in / Sign up</button>
        )}
      </div>

      {/* My Recipes section */}
      <div className="border-b border-warm-tan">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <span className="font-display text-[1.15rem] font-semibold text-ink">My Recipes</span>
          <button
            onClick={() => setShowCreate(true)}
            className="text-[0.78rem] font-bold text-accent border-[1.5px] border-accent rounded-[14px] px-3 py-[5px] hover:bg-accent hover:text-white transition-all"
          >+ New Recipe</button>
        </div>

        {!userRecipes.length ? (
          <div className="px-5 pb-5 text-[0.85rem] text-muted italic">
            No recipes yet — create your first one!
          </div>
        ) : (
          <div className="flex flex-col gap-1 pb-3">
            {userRecipes.map(r => (
              <div
                key={r.id}
                className="flex items-center justify-between px-5 py-2.5 hover:bg-paper transition-colors"
              >
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => onOpen('u_' + r.id)}
                >
                  <div className="font-display text-[0.95rem] font-semibold text-ink truncate">{r.name}</div>
                  <div className="text-[0.75rem] text-muted">
                    {r.category}{r.servings ? ` · ${r.servings} servings` : ''}{r.time_minutes ? ` · ${r.time_minutes} min` : ''}
                  </div>
                </div>
                <button
                  onClick={() => deleteUserRecipe(r.id)}
                  className="text-[0.72rem] text-muted hover:text-heart transition-colors ml-3 px-2 py-1 rounded shrink-0"
                >Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shopping list */}
      <div className="flex items-center justify-between px-5 py-[18px] pb-3">
        <span className="font-display text-[1.15rem] font-semibold text-ink">🛒 Shopping List</span>
        {listArr.length > 0 && (
          <button
            onClick={clearShopping}
            className="text-[0.75rem] font-bold text-muted border-[1.5px] border-rim rounded-[14px] px-3 py-[5px] hover:text-heart hover:border-heart transition-all"
          >Clear all</button>
        )}
      </div>

      {!listArr.length ? (
        <div className="text-center py-[40px] px-5">
          <div className="font-display text-[1.05rem] text-muted">Nothing here yet</div>
          <div className="text-[0.8rem] text-muted mt-2 italic">
            Open a recipe and tap 🛒 to add its ingredients
          </div>
        </div>
      ) : (
        <div className="pb-4">
          {listArr.map(idx => {
            const recipe = typeof idx === 'number' ? RECIPES[idx] : null
            if (!recipe) return null
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
