import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import RecipeModal from './components/RecipeModal'
import Home from './pages/Home'
import Search from './pages/Search'
import Saved from './pages/Saved'
import Profile from './pages/Profile'
import Auth from './pages/Auth'
import RECIPES from './data/recipes.json'
import { useApp } from './context/AppContext'

export default function App() {
  const [modalIdx, setModalIdx] = useState(null)
  const { userRecipes } = useApp()

  function openModal(idx) { setModalIdx(idx) }
  function closeModal()   { setModalIdx(null) }

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
        : userRecipes.find(r => 'u_' + r.id === modalIdx))
    : null

  return (
    <>
      <Header />
      <Routes>
        <Route path="/"        element={<Home    onOpen={openModal} />} />
        <Route path="/search"  element={<Search  onOpen={openModal} />} />
        <Route path="/saved"   element={<Saved   onOpen={openModal} />} />
        <Route path="/profile" element={<Profile onOpen={openModal} />} />
        <Route path="/login"   element={<Auth />} />
      </Routes>
      <BottomNav />
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
