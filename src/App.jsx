import { useState } from 'react'
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

export default function App() {
  const [modalIdx, setModalIdx] = useState(null)

  function openModal(idx) { setModalIdx(idx) }
  function closeModal()   { setModalIdx(null) }

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
      {modalIdx !== null && (
        <RecipeModal
          recipe={RECIPES[modalIdx]}
          idx={modalIdx}
          onClose={closeModal}
        />
      )}
    </>
  )
}
