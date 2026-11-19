import { useState, useEffect, useCallback, useRef, Component } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import Icon from './components/Icon'
import RecipeModal from './components/RecipeModal'
import Home from './pages/Home'
import Search from './pages/Search'
import Saved from './pages/Saved'
import Pantry from './pages/Pantry'
import Shopping from './pages/Shopping'
import Profile from './pages/Profile'
import Auth from './pages/Auth'
import ResetPassword from './pages/ResetPassword'
import { useApp } from './context/AppContext'
import { useAuth } from './context/AuthContext'
import { useToast } from './context/ToastContext'
import { supabase } from './lib/supabase'
import { authArrival } from './lib/arrival'
import { resolveRecipe, isCatalogKey, normalizeUserRecipe } from './utils/recipe'

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
          <Icon name="pan" size={48} className="mx-auto text-accent-dk" />
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

/**
 * The wordmark while sign-in resolves — and, if it never does (a stalled
 * network, a hung auth request), a way out after a while instead of an
 * endless "Loading…".
 */
export function Splash({ slowAfter = 10000 }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), slowAfter)
    return () => clearTimeout(id)
  }, [slowAfter])
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3 px-8 text-center" role="status" aria-live="polite">
      <div className="font-display text-[2.4rem] font-semibold text-accent-dk leading-none">
        ate<span className="italic font-normal text-accent-dk">.</span>
      </div>
      {slow ? (
        <>
          <p className="text-[0.95rem] text-ink">This is taking longer than usual.</p>
          <p className="text-[0.85rem] text-muted">Check your connection, then try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 min-h-[48px] bg-accent text-ink border-2 border-ink shadow-pop press font-bold rounded-xl px-6"
          >Try again</button>
        </>
      ) : (
        <span className="text-[0.78rem] text-muted tracking-[0.1em] uppercase">Loading…</span>
      )}
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
  const { showError, showToast } = useToast()
  const navigate = useNavigate()

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

  /**
   * Say what happened on arrival, once sign-in has settled. Without this an
   * expired email link, a confirmation link opened on another device, or a
   * session that quietly ran out all looked the same: the home page, signed
   * out, with no hint why.
   */
  const arrivalHandled = useRef(false)
  useEffect(() => {
    if (authLoading || arrivalHandled.current) return
    arrivalHandled.current = true
    const { code, error, errorCode, hadSession } = authArrival
    if (code) {
      const route = window.location.hash.startsWith('#/') ? window.location.hash : '#/'
      window.history.replaceState({}, '', window.location.pathname + route)
    }
    if (error) {
      showError(errorCode === 'otp_expired'
        ? 'That email link has expired or was already used. Log in, or ask for a new link.'
        : `Couldn’t sign you in: ${error}`)
      if (!user) navigate('/login')
    } else if (code && !user) {
      // The link confirmed the email, but this browser couldn't finish signing
      // in — usually because it was opened on a different device.
      showToast('Your email is confirmed. Log in to continue.', 'info')
      navigate('/login')
    } else if (hadSession && !user && navigator.onLine) {
      showToast('You were signed out. Log in again to see your recipes.', 'info', {
        actions: [{ label: 'Log in', onClick: () => navigate('/login') }],
      })
    }
  }, [authLoading, user, navigate, showError, showToast])

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
          <Route path="/pantry"         element={<Pantry      onOpen={openModal} />} />
          <Route path="/shopping"       element={<Shopping />} />
          <Route path="/profile"        element={<Profile     onOpen={openModal} />} />
          <Route path="/login"          element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*"               element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
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
