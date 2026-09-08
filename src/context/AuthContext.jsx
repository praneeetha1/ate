import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase, appUrl } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async uid => {
    try {
      // maybeSingle(), not single(): a missing row is an expected state (the
      // signup trigger can fail, and accounts predating it have no row at all).
      // single() would return an error that supabase-js does NOT throw, so the
      // catch below never fired and profile silently stayed null — which left
      // `needsUsername` false forever and the account permanently profile-less.
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle()

      if (error) throw error

      if (data) {
        setProfile(data)
        return
      }

      // No profile row — create one so the username prompt can appear.
      const { data: created, error: insertErr } = await supabase
        .from('profiles')
        .insert({ id: uid })
        .select()
        .maybeSingle()

      if (insertErr) throw insertErr
      setProfile(created)
    } catch (err) {
      console.error('fetchProfile failed:', err)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!active) return
        setUser(session?.user ?? null)
        if (session?.user) fetchProfile(session.user.id)
        else setLoading(false)
      })
      .catch(err => {
        if (!active) return
        console.error('getSession failed:', err)
        setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => { active = false; subscription.unsubscribe() }
  }, [fetchProfile])

  async function signUp(email, password) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      // Derived from the Vite base so confirming from local dev returns to
      // localhost instead of bouncing the developer to production.
      options: { emailRedirectTo: appUrl },
    })
    if (error) throw error
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: appUrl },
    })
    if (error) throw error
  }

  async function sendPasswordReset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: appUrl,
    })
    if (error) throw error
  }

  async function updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  async function updateUsername(username) {
    const clean = username.toLowerCase().trim()
    const { error } = await supabase
      .from('profiles')
      .update({ username: clean, username_set: true })
      .eq('id', user.id)
    // Catch the DB unique constraint violation (23505) with a friendly message.
    // This is race-safe: no TOCTOU window between a pre-check and the update.
    if (error?.code === '23505') throw new Error('Username already taken')
    // 23514 is the username_format check — the modal validates first, so this
    // is only reachable if the two rules ever drift apart.
    if (error?.code === '23514') throw new Error('That username isn’t allowed')
    if (error) throw error
    setProfile(prev => ({ ...prev, username: clean, username_set: true }))
  }

  async function updateProfile(updates) {
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
    if (error?.code === '23514') throw new Error('Bio must be 300 characters or fewer')
    if (error) throw error
    setProfile(prev => ({ ...prev, ...updates }))
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signUp, signIn, signInWithGoogle, signOut,
      sendPasswordReset, updatePassword,
      updateUsername, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
