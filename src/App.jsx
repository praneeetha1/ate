import { useState, useEffect, Component } from 'react'
import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import RecipeModal from './components/RecipeModal'
import Home from './pages/Home'
import Search from './pages/Search'
import Saved from './pages/Saved'
import Profile from './pages/Profile'
import Friends from './pages/Friends'
import UserProfile from './pages/UserProfile'
import Auth from './pages/Auth'
import RECIPES from './data/recipes.json'
import { useApp } from './context/AppContext'
import { useAuth } from './context/AuthContext'
import UsernameModal from './components/UsernameModal'

export class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-8 text-center">
          <div className="text-[3rem]">🍳</div>
          <div className="font-display text-[1.3rem] font-semibold text-ink">Something went wrong</div>
          <div className="text-[0.82rem] text-muted max-w-sm">{this.state.error.message}</div>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 bg-accent text-white font-bold rounded-xl px-6 py-2.5 hover:bg-accent-dk transition-colors"
          >Reload app</button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [modalIdx, setModalIdx] = useState(null)
  // Holds the full recipe object when opening a user recipe that doesn't belong
  // to the logged-in user (e.g. from someone else's public profile) — those
  // aren't in this user's own `userRecipes`, so idx lookup alone can't find them.
  const [externalRecipe, setExternalRecipe] = useState(null)
  const { userRecipes } = useApp()
  const { user, profile } = useAuth()
  const needsUsername = user && profile && !profile.username_set

  function openModal(idx, recipe) { setModalIdx(idx); setExternalRecipe(recipe || null) }
  function closeModal()   { setModalIdx(null); setExternalRecipe(null) }

  // Open recipe from shared link e.g. ?r=42
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const r = params.get('r')
    if (r !== null) {
      const idx = parseInt(r)
      if (!isNaN(idx) && idx >= 0 && idx < RECIPES.length) setModalIdx(idx)
      // Clean up the URL without reloading
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    }
  }, [])

  const modalRecipe = modalIdx !== null
    ? (typeof modalIdx === 'number'
        ? RECIPES[modalIdx]
        : (externalRecipe || userRecipes.find(r => 'u_' + r.id === modalIdx)))
    : null

  return (
    <>
      <Header />
      <Routes>
        <Route path="/"        element={<Home    onOpen={openModal} />} />
        <Route path="/search"  element={<Search  onOpen={openModal} />} />
        <Route path="/saved"   element={<Saved   onOpen={openModal} />} />
        <Route path="/profile"      element={<Profile     onOpen={openModal} />} />
        <Route path="/friends"      element={<Friends     onOpen={openModal} />} />
        <Route path="/user/:username" element={<UserProfile onOpen={openModal} />} />
        <Route path="/login"        element={<Auth />} />
      </Routes>
      <BottomNav />
      {needsUsername && <UsernameModal />}
      {modalIdx !== null && modalRecipe && (
        <RecipeModal
          recipe={modalRecipe}
          idx={modalIdx}
          onClose={closeModal}
        />
      )}
    </>
  )
}
