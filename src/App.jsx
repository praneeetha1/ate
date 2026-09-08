import { useState, useEffect, useCallback, Component } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
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
import ResetPassword from './pages/ResetPassword'
import { useApp } from './context/AppContext'
import { useAuth } from './context/AuthContext'
import { useToast } from './context/ToastContext'
import { supabase } from './lib/supabase'
import { resolveRecipe, isCatalogKey, normalizeUserRecipe } from './utils/recipe'
import UsernameModal from './components/UsernameModal'

export class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-8 text-center">
          <div className="text-[3rem]" aria-hidden="true">🍳</div>
          <h1 className="font-display text-[1.3rem] font-semibold text-ink">Something went wrong</h1>
          <p className="text-[0.82rem] text-muted max-w-sm">{this.state.error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 bg-accent text-ink border-2 border-ink shadow-pop press font-bold rounded-xl px-6 py-2.5 hover:bg-accent-dk transition-colors"
          >Reload app</button>
        </div>
      )
    }
    return this.props.children
  }
}

function Splash() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3" role="status" aria-live="polite">
      <div className="font-display text-[2.4rem] font-semibold text-accent-dk leading-none">
        ate<span className="italic font-normal text-accent">.</span>
      </div>
      <span className="text-[0.78rem] text-muted tracking-[0.1em] uppercase">Loading…</span>
    </div>
  )
}

export default function App() {
  // `modalKey` is a recipe key: a catalog index (number) or "u_<uuid>".
  const [modalKey, setModalKey] = useState(null)
  // Holds the full recipe object for a user recipe that isn't the signed-in
  // user's own (opened from someone else's profile, or a shared link), since
  // those aren't in `userRecipes` and can't be resolved by key alone.
  const [externalRecipe, setExternalRecipe] = useState(null)

  const { userRecipes } = useApp()
  const { user, profile, loading: authLoading } = useAuth()
  const { showError } = useToast()
  const navigate = useNavigate()

  const needsUsername = user && profile && !profile.username_set

  const openModal  = useCallback((key, recipe) => {
    setModalKey(key)
    setExternalRecipe(recipe || null)
  }, [])
  const closeModal = useCallback(() => {
    setModalKey(null)
    setExternalRecipe(null)
  }, [])

  // Open a recipe from a shared link: ?r=<catalog index> or ?u=<recipe uuid>.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const r = params.get('r')
    const u = params.get('u')
    if (r === null && u === null) return

    // Strip the query without reloading, so a refresh doesn't reopen the modal.
    window.history.replaceState({}, '', window.location.pathname + window.location.hash)

    if (r !== null) {
      const idx = parseInt(r, 10)
      if (resolveRecipe(idx)) openModal(idx)
      else showError('That recipe link is no longer valid.')
      return
    }

    let cancelled = false
    supabase
      .from('user_recipes')
      .select('*')
      .eq('id', u)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) throw error
        if (!data) {
          // Either deleted, or the owner's profile is private.
          showError('That recipe isn’t available.')
          return
        }
        openModal('u_' + data.id, normalizeUserRecipe(data))
      })
      .catch(err => {
        if (cancelled) return
        console.error('Shared recipe lookup failed:', err)
        showError('Could not open that recipe link.')
      })

    return () => { cancelled = true }
  }, [openModal, showError])

  // A password-reset link signs the user straight in with a recovery session;
  // this is the only signal that they meant to change their password rather
  // than just browse, so route them to the form.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') navigate('/reset-password')
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  if (authLoading) return <Splash />

  const modalRecipe = modalKey === null
    ? null
    : isCatalogKey(modalKey)
      ? resolveRecipe(modalKey)
      : (externalRecipe || resolveRecipe(modalKey, userRecipes))

  // A user recipe the signed-in user owns can be edited from the modal; one
  // opened from someone else's profile cannot.
  const modalIsOwn = modalKey !== null && !isCatalogKey(modalKey) &&
    userRecipes.some(r => 'u_' + r.id === modalKey)

  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/"               element={<Home        onOpen={openModal} />} />
          <Route path="/search"         element={<Search      onOpen={openModal} />} />
          <Route path="/saved"          element={<Saved       onOpen={openModal} />} />
          <Route path="/profile"        element={<Profile     onOpen={openModal} />} />
          <Route path="/friends"        element={<Friends     onOpen={openModal} />} />
          <Route path="/user/:username" element={<UserProfile onOpen={openModal} />} />
          <Route path="/login"          element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*"               element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
      {needsUsername && <UsernameModal />}
      {modalRecipe && (
        <RecipeModal
          recipe={modalRecipe}
          recipeKey={modalKey}
          editable={modalIsOwn}
          onClose={closeModal}
        />
      )}
    </>
  )
}
