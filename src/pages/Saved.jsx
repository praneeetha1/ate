import { useState } from 'react'
import RECIPES from '../data/recipes.json'
import { useApp } from '../context/AppContext'
import RecipeCard from '../components/RecipeCard'
import RecipeListItem from '../components/RecipeListItem'

export default function Saved({ onOpen }) {
  const { favorites } = useApp()
  const [layout, setLayout] = useState('grid')
  const favList = [...favorites]

  return (
    <>
      <div className="flex items-center justify-between px-5 py-[18px] pb-3">
        <span className="font-display text-[1.3rem] font-semibold text-ink">Saved Recipes</span>
        <div className="flex gap-1">
          {[
            { key: 'grid', icon: '⊞' },
            { key: 'list', icon: '☰' },
          ].map(({ key, icon }) => (
            <button
              key={key}
              onClick={() => setLayout(key)}
              className={`w-8 h-8 rounded-md text-[1.1rem] flex items-center justify-center border-[1.5px] transition-all ${
                layout === key ? 'bg-accent border-accent text-white' : 'bg-card border-rim text-muted'
              }`}
            >{icon}</button>
          ))}
        </div>
      </div>

      {!favList.length ? (
        <div className="text-center py-[60px] font-display text-[1.1rem] text-muted px-5">
          No saved recipes yet — tap ♥ on any recipe to save it here.
        </div>
      ) : layout === 'grid' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 px-5 pb-5">
          {favList.map(i => (
            <RecipeCard key={i} recipe={RECIPES[i]} idx={i} onOpen={onOpen} fill />
          ))}
        </div>
      ) : (
        <div>
          {favList.map(i => (
            <RecipeListItem key={i} recipe={RECIPES[i]} idx={i} onOpen={onOpen} />
          ))}
        </div>
      )}
    </>
  )
}
