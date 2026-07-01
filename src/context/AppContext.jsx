import { createContext, useContext, useState, useEffect } from 'react'

const AppContext = createContext(null)

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback }
  catch { return fallback }
}

export function AppProvider({ children }) {
  const [favorites,    setFavorites]    = useState(() => new Set(load('ate_favs', [])))
  const [ratings,      setRatings]      = useState(() => load('ate_ratings', {}))
  const [notes,        setNotes]        = useState(() => load('ate_notes', {}))
  const [shoppingList, setShoppingList] = useState(() => new Set(load('ate_shopping', [])))
  const [shopChecked,  setShopChecked]  = useState(() => new Set(load('ate_shop_checked', [])))

  useEffect(() => { localStorage.setItem('ate_favs',         JSON.stringify([...favorites])) },    [favorites])
  useEffect(() => { localStorage.setItem('ate_ratings',      JSON.stringify(ratings)) },           [ratings])
  useEffect(() => { localStorage.setItem('ate_notes',        JSON.stringify(notes)) },             [notes])
  useEffect(() => { localStorage.setItem('ate_shopping',     JSON.stringify([...shoppingList])) }, [shoppingList])
  useEffect(() => { localStorage.setItem('ate_shop_checked', JSON.stringify([...shopChecked])) },  [shopChecked])

  function toggleFav(idx) {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  function setRating(name, value) {
    setRatings(prev => {
      const next = { ...prev }
      if (value) next[name] = value; else delete next[name]
      return next
    })
  }

  function setNote(name, value) {
    setNotes(prev => {
      const next = { ...prev }
      if (value) next[name] = value; else delete next[name]
      return next
    })
  }

  function toggleShopping(idx) {
    setShoppingList(prev => {
      const next = new Set(prev)
      if (next.has(idx)) {
        next.delete(idx)
        setShopChecked(c => {
          const cn = new Set(c)
          cn.forEach(k => { if (k.startsWith(`${idx}-`)) cn.delete(k) })
          return cn
        })
      } else {
        next.add(idx)
      }
      return next
    })
  }

  function toggleShopItem(key) {
    setShopChecked(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function clearShopping() {
    setShoppingList(new Set())
    setShopChecked(new Set())
  }

  return (
    <AppContext.Provider value={{
      favorites,    toggleFav,
      ratings,      setRating,
      notes,        setNote,
      shoppingList, toggleShopping,
      shopChecked,  toggleShopItem,
      clearShopping,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
