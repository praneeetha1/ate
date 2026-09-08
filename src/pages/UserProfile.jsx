import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { keyFromText, isCatalogKey, resolveRecipe, normalizeUserRecipe } from '../utils/recipe'

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function UserProfile({ onOpen }) {
  const { username } = useParams()
  const { user } = useAuth()
  const { showError } = useToast()
  const navigate = useNavigate()

  const [profile,   setProfile]   = useState(null)
  const [activity,  setActivity]  = useState([])
  const [recipes,   setRecipes]   = useState([])
  const [favorites, setFavorites] = useState([])   // resolved { recipe, key }
  const [following, setFollowing] = useState(false)
  const [pending,   setPending]   = useState(false)
  const [counts,    setCounts]    = useState({ followers: 0, following: 0 })
  const [loading,   setLoading]   = useState(true)
  const [notFound,  setNotFound]  = useState(false)
  const [tab,       setTab]       = useState('activity')

  // Usernames are stored lowercase, so a hand-typed or shared /user/Alice link
  // used to 404 even though the account exists.
  const handle = String(username || '').trim().toLowerCase()

  const loadProfile = useCallback(async signal => {
    setLoading(true)
    setNotFound(false)
    setTab('activity')

    try {
      const { data: p, error: profileErr } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, bio')
        .eq('username', handle)
        .maybeSingle()
      if (profileErr) throw profileErr
      if (signal.cancelled) return

      if (!p) { setNotFound(true); setLoading(false); return }
      setProfile(p)

      const [actRes, followerRes, followingRes, recipesRes, favRes] = await Promise.all([
        supabase.from('activity').select('*').eq('user_id', p.id).order('created_at', { ascending: false }).limit(30),
        supabase.from('follows').select('follower_id',  { count: 'exact', head: true }).eq('following_id', p.id),
        supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id',  p.id),
        supabase.from('user_recipes').select('*').eq('user_id', p.id).order('created_at', { ascending: false }),
        supabase.from('favorites').select('recipe_key').eq('user_id', p.id),
      ])
      if (signal.cancelled) return

      const ownRecipes = (recipesRes.data || []).map(normalizeUserRecipe)

      // A private profile returns no rows for these (RLS), so the tabs simply
      // read as empty rather than erroring.
      setActivity(actRes.data || [])
      setCounts({ followers: followerRes.count || 0, following: followingRes.count || 0 })
      setRecipes(ownRecipes)

      // Favourites can include this person's own recipes, not just catalog ones.
      setFavorites(
        (favRes.data || [])
          .map(f => {
            const key = keyFromText(f.recipe_key)
            const recipe = resolveRecipe(key, ownRecipes)
            return recipe ? { recipe, key } : null
          })
          .filter(Boolean)
      )

      if (user && user.id !== p.id) {
        // maybeSingle(), not single(): not following someone is the common case,
        // and single() logged a 406 for it every time.
        const { data: f } = await supabase
          .from('follows')
          .select('follower_id')
          .match({ follower_id: user.id, following_id: p.id })
          .maybeSingle()
        if (signal.cancelled) return
        setFollowing(!!f)
      } else {
        setFollowing(false)
      }
    } catch (err) {
      if (signal.cancelled) return
      console.error('Profile load failed:', err)
      showError('Could not load that profile.')
      setNotFound(true)
    } finally {
      if (!signal.cancelled) setLoading(false)
    }
  }, [handle, user?.id, showError])

  useEffect(() => {
    // Navigating away mid-load would otherwise land its results on a profile
    // the user has already left.
    const signal = { cancelled: false }
    loadProfile(signal)
    return () => { signal.cancelled = true }
  }, [loadProfile])

  async function toggleFollow() {
    if (!user || !profile || pending) return
    setPending(true)

    const { error } = following
      ? await supabase.from('follows').delete().match({ follower_id: user.id, following_id: profile.id })
      : await supabase.from('follows').insert({ follower_id: user.id, following_id: profile.id })

    setPending(false)
    if (error) {
      console.error(following ? 'Unfollow failed:' : 'Follow failed:', error)
      showError(following ? 'Could not unfollow.' : 'Could not follow.')
      return
    }
    setFollowing(!following)
    setCounts(c => ({
      ...c,
      followers: following ? Math.max(0, c.followers - 1) : c.followers + 1,
    }))
  }

  function activityLabel(item) {
    if (item.type === 'saved')   return <><span className="text-heart" aria-hidden="true">♥</span> saved <strong>{item.recipe_name}</strong></>
    if (item.type === 'created') return <>📖 created <strong>{item.recipe_name}</strong></>
    if (item.type === 'rated')   return <>⭐ rated <strong>{item.recipe_name}</strong> {'★'.repeat(item.rating || 0)}</>
    if (item.type === 'listed')  return <>📋 added <strong>{item.recipe_name}</strong> to <em>{item.list_name}</em></>
    return item.type
  }

  /** Resolves an activity row's recipe, including this person's own recipes. */
  function activityRecipe(item) {
    if (!item.recipe_key) return null
    const key = keyFromText(item.recipe_key)
    return { key, recipe: resolveRecipe(key, recipes) }
  }

  const backBar = label => (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-ink bg-paper">
      <button onClick={() => navigate(-1)} aria-label="Go back" className="text-accent text-[1.3rem] leading-none hover:text-accent-dk">‹</button>
      <span className="font-display text-[1rem] font-semibold text-ink">{label}</span>
    </div>
  )

  if (loading) return (
    <div className="flex flex-col min-h-screen">
      {backBar('Loading…')}
    </div>
  )

  if (notFound || !profile) return (
    <div className="flex flex-col min-h-screen">
      {backBar(`@${handle}`)}
      <div className="flex flex-col items-center py-20 text-center gap-2">
        <div className="text-[2rem]" aria-hidden="true">👤</div>
        <p className="font-display text-[1.1rem] text-muted">User not found</p>
      </div>
    </div>
  )

  const isOwnProfile = user?.id === profile.id

  const tabCls = active =>
    `flex-1 py-2.5 text-[0.78rem] font-bold tracking-[0.06em] uppercase transition-colors border-b-2 ${
      active ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
    }`

  return (
    <div className="flex flex-col min-h-screen">
      {backBar(`@${profile.username}`)}

      {/* Profile header */}
      <div className="px-5 py-5 border-b border-ink">
        <div className="flex items-center gap-4">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover border-[2px] border-ink" />
            : <div className="w-16 h-16 rounded-full bg-warm-tan flex items-center justify-center text-[2rem] border-[2px] border-ink" aria-hidden="true">👤</div>
          }
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-[1.2rem] font-bold text-ink truncate">@{profile.username}</h1>
            {profile.bio && <p className="text-[0.82rem] text-muted mt-1">{profile.bio}</p>}
            <div className="flex gap-4 mt-2 text-[0.8rem] text-muted">
              <span><strong className="text-ink">{counts.followers}</strong> followers</span>
              <span><strong className="text-ink">{counts.following}</strong> following</span>
            </div>
          </div>
          {!isOwnProfile && user && (
            <button
              onClick={toggleFollow}
              disabled={pending}
              aria-pressed={following}
              className={`text-[0.82rem] font-bold rounded-full px-4 py-[6px] border-2 transition-all shrink-0 disabled:opacity-50 ${
                following
                  ? 'border-ink text-muted hover:text-heart hover:border-heart'
                  : 'bg-accent border-ink text-ink shadow-pop hover:bg-accent-dk'
              }`}
            >{following ? 'Following' : 'Follow'}</button>
          )}
          {isOwnProfile && (
            <button
              onClick={() => navigate('/profile')}
              className="text-[0.82rem] font-bold rounded-full px-4 py-[6px] border-2 border-ink text-muted hover:bg-paper hover:text-accent transition-all shrink-0"
            >Edit Profile</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-ink bg-paper" role="tablist">
        <button role="tab" aria-selected={tab === 'activity'} className={tabCls(tab === 'activity')} onClick={() => setTab('activity')}>Activity</button>
        <button role="tab" aria-selected={tab === 'recipes'} className={tabCls(tab === 'recipes')} onClick={() => setTab('recipes')}>
          Recipes {recipes.length > 0 && <span className="ml-1 text-[0.68rem] text-muted">({recipes.length})</span>}
        </button>
        <button role="tab" aria-selected={tab === 'saved'} className={tabCls(tab === 'saved')} onClick={() => setTab('saved')}>
          Saved {favorites.length > 0 && <span className="ml-1 text-[0.68rem] text-muted">({favorites.length})</span>}
        </button>
      </div>

      {/* ── Activity tab ── */}
      {tab === 'activity' && (
        <div>
          {activity.length === 0 ? (
            <p className="py-12 text-center text-muted text-[0.85rem]">No activity yet</p>
          ) : (
            activity.map(item => {
              const hit = activityRecipe(item)
              return (
                <div key={item.id} className="px-5 py-4 border-b border-[rgba(200,180,130,0.3)]">
                  <div className="flex items-baseline gap-2 mb-1.5 flex-wrap">
                    <span className="text-[0.86rem] text-ink">{activityLabel(item)}</span>
                    <span className="text-[0.7rem] text-muted shrink-0">{timeAgo(item.created_at)}</span>
                  </div>
                  {hit?.recipe && (
                    <button
                      type="button"
                      className="w-full text-left bg-paper border-2 border-ink rounded-xl px-3.5 py-2.5 hover:bg-paper transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      onClick={() => onOpen(hit.key, isCatalogKey(hit.key) ? undefined : hit.recipe)}
                    >
                      <div className="font-display text-[0.9rem] font-semibold text-ink">{hit.recipe.name}</div>
                      <div className="text-[0.72rem] text-muted mt-0.5">
                        {hit.recipe.category}{hit.recipe.timeMinutes ? ` · ${hit.recipe.timeMinutes} min` : ''}
                      </div>
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Recipes tab ── */}
      {tab === 'recipes' && (
        <div>
          {recipes.length === 0 ? (
            <p className="py-12 text-center text-muted text-[0.85rem]">No recipes yet</p>
          ) : (
            recipes.map(r => (
              <button
                key={r.id}
                type="button"
                className="w-full flex items-center justify-between px-5 py-3.5 border-b border-[rgba(200,180,130,0.3)] hover:bg-paper transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onClick={() => onOpen('u_' + r.id, r)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="inline-block text-[0.65rem] font-bold tracking-[0.08em] uppercase px-2 py-[2px] rounded-xl bg-accent text-ink border-2 border-ink shadow-pop press shrink-0">
                      My Recipe
                    </span>
                    <span className="font-display text-[0.95rem] font-semibold text-ink truncate">{r.name}</span>
                  </div>
                  <div className="text-[0.75rem] text-muted">
                    {r.category}
                    {r.servings ? ` · ${r.servings} servings` : ''}
                    {r.timeMinutes ? ` · ${r.timeMinutes} min` : ''}
                  </div>
                </div>
                <span className="text-muted text-[1.1rem] ml-3 shrink-0" aria-hidden="true">›</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* ── Saved tab ── */}
      {tab === 'saved' && (
        <div>
          {favorites.length === 0 ? (
            <p className="py-12 text-center text-muted text-[0.85rem]">No saved recipes yet</p>
          ) : (
            favorites.map(({ recipe, key }) => (
              <button
                key={String(key)}
                type="button"
                className="w-full flex items-center justify-between px-5 py-3.5 border-b border-[rgba(200,180,130,0.3)] hover:bg-paper transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                // The key is already numeric for catalog recipes — it used to be
                // passed through as the raw string "5", which never matched and
                // so the modal silently refused to open.
                onClick={() => onOpen(key, isCatalogKey(key) ? undefined : recipe)}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-display text-[0.95rem] font-semibold text-ink truncate">{recipe.name}</div>
                  <div className="text-[0.75rem] text-muted">
                    {recipe.category}{recipe.timeMinutes ? ` · ${recipe.timeMinutes} min` : ''}
                  </div>
                </div>
                <span className="text-heart text-[1.1rem] ml-3 shrink-0" aria-hidden="true">♥</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
