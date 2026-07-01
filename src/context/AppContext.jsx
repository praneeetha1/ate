import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'

const AppContext = createContext(null)

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback }
  catch { return fallback }
}

export function AppProvider({ children }) {
  const { user } = useAuth()

  const [favorites,    setFavorites]    = useState(() => new Set(load('ate_favs', [])))
  const [ratings,      setRatings]      = useState(() => load('ate_ratings', {}))
  const [notes,        setNotes]        = useState(() => load('ate_notes', {}))
  const [shoppingList, setShoppingList] = useState(() => new Set(load('ate_shopping', [])))
  const [shopChecked,  setShopChecked]  = useState(() => new Set(load('ate_shop_checked', [])))
  const [userRecipes,  setUserRecipes]  = useState(() => load('ate_user_recipes', []))
  const [lists,        setLists]        = useState(() => load('ate_lists', []))

  // Persist to localStorage
  useEffect(() => { localStorage.setItem('ate_favs',         JSON.stringify([...favorites])) },    [favorites])
  useEffect(() => { localStorage.setItem('ate_ratings',      JSON.stringify(ratings)) },           [ratings])
  useEffect(() => { localStorage.setItem('ate_notes',        JSON.stringify(notes)) },             [notes])
  useEffect(() => { localStorage.setItem('ate_shopping',     JSON.stringify([...shoppingList])) }, [shoppingList])
  useEffect(() => { localStorage.setItem('ate_shop_checked', JSON.stringify([...shopChecked])) },  [shopChecked])
  useEffect(() => { localStorage.setItem('ate_user_recipes', JSON.stringify(userRecipes)) },       [userRecipes])
  useEffect(() => { localStorage.setItem('ate_lists',        JSON.stringify(lists)) },             [lists])

  // Sync on login / reset on logout
  useEffect(() => {
    if (user) {
      syncFromSupabase(user.id)
    } else {
      setUserRecipes(load('ate_user_recipes', []))
      setLists(load('ate_lists', []))
    }
  }, [user?.id])

  async function syncFromSupabase(uid) {
    try {
      // Upload any recipes created while logged out before the DB fetch overwrites local state.
      const localRecipes = load('ate_user_recipes', []).filter(r => String(r.id).startsWith('local_'))
      if (localRecipes.length) {
        const toUpload = localRecipes.map(({ id, user_id, created_at, ...data }) => ({ ...data, user_id: uid }))
        const { error: uploadErr } = await supabase.from('user_recipes').insert(toUpload)
        if (uploadErr) console.error('Local recipe upload failed:', uploadErr)
      }

      const [favsRes, ratingsRes, notesRes, shopRes, recipesRes, listsRes] = await Promise.all([
        supabase.from('favorites').select('recipe_key').eq('user_id', uid),
        supabase.from('ratings').select('recipe_name,rating').eq('user_id', uid),
        supabase.from('notes').select('recipe_name,body').eq('user_id', uid),
        supabase.from('shopping_list').select('recipe_key').eq('user_id', uid),
        supabase.from('user_recipes').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        supabase.from('lists').select('*, list_items(recipe_key)').eq('user_id', uid),
      ])

      if (!favsRes.error && favsRes.data?.length)
        setFavorites(prev => new Set([...prev, ...favsRes.data.map(f => f.recipe_key)]))
      if (!ratingsRes.error && ratingsRes.data?.length)
        setRatings(prev => ({ ...prev, ...Object.fromEntries(ratingsRes.data.map(r => [r.recipe_name, r.rating])) }))
      if (!notesRes.error && notesRes.data?.length)
        setNotes(prev => ({ ...prev, ...Object.fromEntries(notesRes.data.map(n => [n.recipe_name, n.body])) }))
      if (!shopRes.error && shopRes.data?.length)
        setShoppingList(prev => new Set([...prev, ...shopRes.data.map(s => s.recipe_key)]))
      if (!recipesRes.error && recipesRes.data)
        setUserRecipes(recipesRes.data)
      if (!listsRes.error && listsRes.data)
        setLists(listsRes.data.map(l => ({
          id: l.id,
          name: l.name,
          items: l.list_items.map(li => /^\d+$/.test(li.recipe_key) ? parseInt(li.recipe_key) : li.recipe_key),
        })))
    } catch (err) {
      console.error('Supabase sync failed:', err)
    }
  }

  // ── activity logging ───────────────────────────────────────
  function logActivity(type, data) {
    if (!user) return
    supabase.from('activity').insert({ user_id: user.id, type, ...data })
  }

  // ── favorites ──────────────────────────────────────────────
  function toggleFav(idx, recipeName) {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(idx)) {
        next.delete(idx)
        if (user && typeof idx === 'number')
          supabase.from('favorites').delete().match({ user_id: user.id, recipe_key: idx })
      } else {
        next.add(idx)
        if (user && typeof idx === 'number')
          supabase.from('favorites').upsert({ user_id: user.id, recipe_key: idx })
        if (recipeName) logActivity('saved', { recipe_key: String(idx), recipe_name: recipeName })
      }
      return next
    })
  }

  // ── ratings ────────────────────────────────────────────────
  function setRating(name, value) {
    setRatings(prev => {
      const next = { ...prev }
      if (value) {
        next[name] = value
        if (user) supabase.from('ratings').upsert({ user_id: user.id, recipe_name: name, rating: value })
        if (value >= 4) logActivity('rated', { recipe_name: name, rating: value })
      } else {
        delete next[name]
        if (user) supabase.from('ratings').delete().match({ user_id: user.id, recipe_name: name })
      }
      return next
    })
  }

  // ── notes ──────────────────────────────────────────────────
  function setNote(name, value) {
    setNotes(prev => {
      const next = { ...prev }
      if (value) {
        next[name] = value
        if (user) supabase.from('notes').upsert({ user_id: user.id, recipe_name: name, body: value })
      } else {
        delete next[name]
        if (user) supabase.from('notes').delete().match({ user_id: user.id, recipe_name: name })
      }
      return next
    })
  }

  // ── shopping ───────────────────────────────────────────────
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
        if (user && typeof idx === 'number')
          supabase.from('shopping_list').delete().match({ user_id: user.id, recipe_key: idx })
      } else {
        next.add(idx)
        if (user && typeof idx === 'number')
          supabase.from('shopping_list').upsert({ user_id: user.id, recipe_key: idx })
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
    if (user) supabase.from('shopping_list').delete().eq('user_id', user.id)
    setShoppingList(new Set())
    setShopChecked(new Set())
  }

  // ── user recipes ────────────────────────────────────────────
  const MY_RECIPES_LIST = 'My Recipes'

  async function createUserRecipe(data) {
    if (user) {
      const { data: created, error } = await supabase
        .from('user_recipes')
        .insert({ ...data, user_id: user.id })
        .select()
        .single()
      if (error) throw error
      setUserRecipes(prev => [created, ...prev])
      logActivity('created', { recipe_key: 'u_' + created.id, recipe_name: created.name })

      // Auto-add to the "My Recipes" system list, creating it on first use.
      try {
        let { data: myList } = await supabase
          .from('lists')
          .select('id')
          .eq('user_id', user.id)
          .eq('name', MY_RECIPES_LIST)
          .maybeSingle()

        if (!myList) {
          const { data: newList, error: listErr } = await supabase
            .from('lists')
            .insert({ name: MY_RECIPES_LIST, user_id: user.id })
            .select('id, name')
            .single()
          if (!listErr) {
            myList = newList
            setLists(prev => [{ id: newList.id, name: MY_RECIPES_LIST, items: [] }, ...prev])
          }
        }

        if (myList) {
          const recipeKey = 'u_' + created.id
          await supabase.from('list_items').upsert({ list_id: myList.id, recipe_key: recipeKey })
          setLists(prev => prev.map(l =>
            l.id === myList.id && !l.items.includes(recipeKey)
              ? { ...l, items: [...l.items, recipeKey] }
              : l
          ))
        }
      } catch (err) {
        console.error('Failed to add to My Recipes list:', err)
      }

      return created
    } else {
      const recipe = { ...data, id: 'local_' + Date.now(), user_id: null, created_at: new Date().toISOString() }
      setUserRecipes(prev => [recipe, ...prev])
      return recipe
    }
  }

  async function deleteUserRecipe(id) {
    setUserRecipes(prev => prev.filter(r => r.id !== id))
    setLists(prev => prev.map(l => ({ ...l, items: l.items.filter(k => k !== 'u_' + id) })))
    if (user) supabase.from('user_recipes').delete().match({ id, user_id: user.id })
  }

  // ── lists ──────────────────────────────────────────────────
  async function createList(name) {
    if (user) {
      const { data, error } = await supabase
        .from('lists')
        .insert({ name, user_id: user.id })
        .select()
        .single()
      if (error) throw error
      const list = { id: data.id, name: data.name, items: [] }
      setLists(prev => [list, ...prev])
      return list
    } else {
      const list = { id: 'local_' + Date.now(), name, items: [] }
      setLists(prev => [list, ...prev])
      return list
    }
  }

  async function deleteList(id) {
    setLists(prev => prev.filter(l => l.id !== id))
    if (user) supabase.from('lists').delete().match({ id, user_id: user.id })
  }

  async function renameList(id, name) {
    setLists(prev => prev.map(l => l.id === id ? { ...l, name } : l))
    if (user) supabase.from('lists').update({ name }).match({ id, user_id: user.id })
  }

  function addToList(listId, recipeKey, recipeName) {
    setLists(prev => {
      const list = prev.find(l => l.id === listId)
      if (list && !list.items.includes(recipeKey)) {
        logActivity('listed', { recipe_key: String(recipeKey), recipe_name: recipeName, list_name: list.name })
      }
      return prev.map(l =>
        l.id === listId && !l.items.includes(recipeKey)
          ? { ...l, items: [...l.items, recipeKey] }
          : l
      )
    })
    if (user) supabase.from('list_items').upsert({ list_id: listId, recipe_key: String(recipeKey) })
  }

  function removeFromList(listId, recipeKey) {
    setLists(prev => prev.map(l =>
      l.id === listId ? { ...l, items: l.items.filter(k => k !== recipeKey) } : l
    ))
    if (user) supabase.from('list_items').delete().match({ list_id: listId, recipe_key: String(recipeKey) })
  }

  return (
    <AppContext.Provider value={{
      favorites,    toggleFav,
      ratings,      setRating,
      notes,        setNote,
      shoppingList, toggleShopping,
      shopChecked,  toggleShopItem, clearShopping,
      userRecipes,  createUserRecipe, deleteUserRecipe,
      lists,        createList, deleteList, renameList, addToList, removeFromList,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
