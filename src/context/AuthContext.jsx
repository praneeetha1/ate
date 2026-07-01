import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(uid) {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
    setProfile(data)
    setLoading(false)
  }

  async function signUp(email, password) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: 'https://praneeetha1.github.io/ate/' },
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
      options: { redirectTo: window.location.origin + '/ate/' },
    })
    if (error) throw error
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  async function updateUsername(username) {
    const clean = username.toLowerCase().trim()
    // Check availability
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', clean)
      .neq('id', user.id)
      .maybeSingle()
    if (existing) throw new Error('Username already taken')

    const { error } = await supabase
      .from('profiles')
      .update({ username: clean, username_set: true })
      .eq('id', user.id)
    if (error) throw error
    setProfile(prev => ({ ...prev, username: clean, username_set: true }))
  }

  async function updateProfile(updates) {
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
    if (error) throw error
    setProfile(prev => ({ ...prev, ...updates }))
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signUp, signIn, signInWithGoogle, signOut,
      updateUsername, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
