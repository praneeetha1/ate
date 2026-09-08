import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { keyFromText, isCatalogKey, resolveRecipe, normalizeUserRecipe, userRecipeId } from '../utils/recipe'
import { escapeLike } from '../utils/postgrest'
import Icon from '../components/Icon'

const PAGE_SIZE = 30

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function activityLabel(item) {
  if (item.type === 'saved')   return <><Icon name="heart" size={14} filled className="inline align-[-2px] text-heart" /> saved <strong>{item.recipe_name}</strong></>
  if (item.type === 'created') return <><Icon name="book" size={14} className="inline align-[-2px] text-muted" /> created <strong>{item.recipe_name}</strong></>
  if (item.type === 'rated')   return <><Icon name="star" size={14} filled className="inline align-[-2px] text-star" /> rated <strong>{item.recipe_name}</strong> {Array.from({ length: item.rating || 0 }, (_, i) => (
      <Icon key={i} name="star" size={12} filled className="inline align-[-1px] text-star" />
    ))}</>
  if (item.type === 'listed')  return <><Icon name="list" size={14} className="inline align-[-2px] text-muted" /> added <strong>{item.recipe_name}</strong> to <em>{item.list_name}</em></>
  return item.type
}

function Avatar({ url, username, size = 'w-9 h-9', text = 'text-[1.1rem]', onClick }) {
  const shared = `${size} rounded-full shrink-0 border border-ink`
  const label  = username ? `@${username}` : 'this cook'

  if (url) {
    return (
      <img
        src={url}
        alt=""
        onClick={onClick}
        className={`${shared} object-cover ${onClick ? 'cursor-pointer' : ''}`}
      />
    )
  }
  return (
    <div
      onClick={onClick}
      aria-label={onClick ? `View ${label}` : undefined}
      className={`${shared} bg-warm-tan flex items-center justify-center ${text} ${onClick ? 'cursor-pointer' : ''}`}
    ><Icon name="user" size={18} /></div>
  )
}

function ActivityItem({ item, userRecipeMap, onOpenRecipe }) {
  const navigate = useNavigate()
  const key = item.recipe_key ? keyFromText(item.recipe_key) : null

  // User recipes are resolved from a map fetched alongside the feed. They used
  // to render as plain text with no preview card, which hid exactly the events
  // ('created') that are most worth looking at.
  const recipe = key === null
    ? null
    : isCatalogKey(key)
      ? resolveRecipe(key)
      : userRecipeMap.get(userRecipeId(key)) || null

  const goToProfile = () => {
    if (item.profile?.username) navigate(`/user/${item.profile.username}`)
  }

  return (
    <li className="px-5 py-4 border-b border-[rgba(200,180,130,0.3)] list-none">
      <div className="flex items-start gap-3">
        <Avatar url={item.profile?.avatar_url} username={item.profile?.username} onClick={goToProfile} />

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap mb-1">
            <button
              type="button"
              className="font-bold text-[0.9rem] text-accent-dk hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              onClick={goToProfile}
            >@{item.profile?.username || 'unknown'}</button>
            <span className="text-[0.72rem] text-muted">{timeAgo(item.created_at)}</span>
          </div>
          <p className="text-[0.86rem] text-ink leading-snug">{activityLabel(item)}</p>

          {recipe && (
            <button
              type="button"
              className="mt-2.5 w-full text-left bg-paper border-2 border-ink rounded-xl px-3.5 py-2.5 hover:bg-paper transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onClick={() => onOpenRecipe(key, isCatalogKey(key) ? undefined : recipe)}
            >
              <div className="font-display text-[0.9rem] font-semibold text-ink">{recipe.name}</div>
              <div className="text-[0.72rem] text-muted mt-0.5">
                {recipe.category}
                {recipe.timeMinutes ? ` · ${recipe.timeMinutes} min` : ''}
                {recipe.servings ? ` · ${recipe.servings} servings` : ''}
              </div>
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

function FindPeopleSheet({ onClose }) {
  const { user } = useAuth()
  const { showError } = useToast()

  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState([])
  const [following, setFollowing] = useState(new Set())
  const [loading,   setLoading]   = useState(false)
  const [pending,   setPending]   = useState(new Set())

  // Monotonically increasing request id: a slow early response must not
  // overwrite the results of a later, faster one.
  const requestRef = useRef(0)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    supabase.from('follows').select('following_id').eq('follower_id', user.id)
      .then(({ data, error }) => {
        if (cancelled || error) return
        setFollowing(new Set((data || []).map(f => f.following_id)))
      })
    return () => { cancelled = true }
  }, [user?.id])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const runSearch = useCallback(async q => {
    const id = ++requestRef.current
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .ilike('username', `%${escapeLike(q)}%`)
      .not('username', 'is', null)
      .neq('id', user.id)
      .limit(10)

    if (id !== requestRef.current) return // superseded
    if (error) {
      console.error('User search failed:', error)
      showError('Could not search for people right now.')
      setResults([])
    } else {
      setResults(data || [])
    }
    setLoading(false)
  }, [user?.id, showError])

  // Debounced so typing a name doesn't fire a query per keystroke.
  function onQueryChange(q) {
    setQuery(q)
    clearTimeout(debounceRef.current)

    if (q.trim().length < 2) {
      requestRef.current++ // invalidate anything in flight
      setResults([])
      setLoading(false)
      return
    }
    debounceRef.current = setTimeout(() => runSearch(q.trim()), 250)
  }

  async function toggleFollow(profileId) {
    if (pending.has(profileId)) return
    setPending(p => new Set([...p, profileId]))

    const isFollowing = following.has(profileId)
    const { error } = isFollowing
      ? await supabase.from('follows').delete().match({ follower_id: user.id, following_id: profileId })
      : await supabase.from('follows').insert({ follower_id: user.id, following_id: profileId })

    setPending(p => { const n = new Set(p); n.delete(profileId); return n })

    if (error) {
      console.error(isFollowing ? 'Unfollow failed:' : 'Follow failed:', error)
      showError(isFollowing ? 'Could not unfollow.' : 'Could not follow.')
      return
    }
    setFollowing(prev => {
      const n = new Set(prev)
      if (isFollowing) n.delete(profileId); else n.add(profileId)
      return n
    })
  }

  return (
    <div className="fixed inset-0 bg-[rgba(60,35,15,0.55)] backdrop-blur-[3px] z-[500] flex items-end justify-center">
      <div className="bg-card w-full max-w-lg rounded-t-2xl border-t-[1.5px] border-ink shadow-warm-xl pb-safe">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink">
          <h2 className="font-display text-[1.1rem] font-semibold text-ink">Find People</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted text-[1.4rem] hover:text-ink">×</button>
        </div>

        <div className="px-5 py-3">
          <input
            type="search"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder="Search by username…"
            aria-label="Search by username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            className="w-full border-2 border-ink rounded-xl px-4 py-2.5 text-[0.9rem] text-ink bg-paper outline-none focus:border-accent placeholder:text-muted"
          />
        </div>

        <div className="px-5 pb-6 min-h-[120px]" aria-live="polite">
          {loading && <p className="text-center py-6 text-muted text-[0.85rem]">Searching…</p>}
          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-center py-6 text-muted text-[0.85rem]">No users found</p>
          )}
          <ul className="list-none">
            {results.map(p => (
              <li key={p.id} className="flex items-center gap-3 py-3 border-b border-[rgba(200,180,130,0.2)] last:border-0">
                <Avatar url={p.avatar_url} username={p.username} size="w-10 h-10" text="text-[1.2rem]" />
                <span className="flex-1 font-bold text-[0.92rem] text-ink truncate">@{p.username}</span>
                <button
                  onClick={() => toggleFollow(p.id)}
                  disabled={pending.has(p.id)}
                  aria-pressed={following.has(p.id)}
                  className={`text-[0.8rem] font-bold rounded-full px-4 py-[6px] border-2 transition-all disabled:opacity-50 ${
                    following.has(p.id)
                      ? 'border-ink text-muted hover:text-heart hover:border-heart'
                      : 'bg-accent border-ink text-ink shadow-pop hover:bg-accent-dk'
                  }`}
                >{following.has(p.id) ? 'Following' : 'Follow'}</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default function Friends({ onOpen }) {
  const { user } = useAuth()
  const { showError } = useToast()
  const navigate = useNavigate()

  const [feed,             setFeed]             = useState([])
  const [userRecipeMap,    setUserRecipeMap]    = useState(new Map())
  const [followedProfiles, setFollowedProfiles] = useState([])
  const [loading,          setLoading]          = useState(true)
  const [loadingMore,      setLoadingMore]      = useState(false)
  const [hasMore,          setHasMore]          = useState(false)
  const [showFindPeople,   setShowFindPeople]   = useState(false)

  // Followed ids, so the realtime handler only reloads for relevant inserts.
  const followingIdsRef = useRef(new Set())
  const mountedRef      = useRef(true)

  const loadFeed = useCallback(async () => {
    if (!user) return
    try {
      const { data: followData, error: followErr } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
      if (followErr) throw followErr

      if (!followData?.length) {
        followingIdsRef.current = new Set()
        if (!mountedRef.current) return
        setFollowedProfiles([])
        setFeed([])
        setUserRecipeMap(new Map())
        setHasMore(false)
        setLoading(false)
        return
      }

      const followingIds = followData.map(f => f.following_id)
      followingIdsRef.current = new Set(followingIds)

      const [activityRes, profilesRes] = await Promise.all([
        supabase
          .from('activity')
          .select('*, profile:profiles(username, avatar_url)')
          .in('user_id', followingIds)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE),
        supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', followingIds),
      ])
      if (activityRes.error) throw activityRes.error
      if (profilesRes.error) throw profilesRes.error

      const rows = activityRes.data || []
      const recipeMap = await fetchUserRecipes(rows)

      if (!mountedRef.current) return
      setFollowedProfiles(profilesRes.data || [])
      setFeed(rows)
      setUserRecipeMap(recipeMap)
      setHasMore(rows.length === PAGE_SIZE)
    } catch (err) {
      console.error('Feed load failed:', err)
      if (mountedRef.current) showError('Could not load your friends’ activity.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [user?.id, showError])

  /** Fetches the user recipes referenced by a page of activity rows. */
  async function fetchUserRecipes(rows, existing = new Map()) {
    const ids = [...new Set(
      rows
        .map(r => r.recipe_key)
        .filter(k => k && !isCatalogKey(k) && String(k).startsWith('u_'))
        .map(k => userRecipeId(k))
        .filter(id => !existing.has(id))
    )]
    if (!ids.length) return existing

    const { data, error } = await supabase.from('user_recipes').select('*').in('id', ids)
    if (error) {
      // A private owner or deleted recipe simply yields no preview card.
      console.error('Activity recipe lookup failed:', error)
      return existing
    }
    const next = new Map(existing)
    for (const row of data || []) next.set(row.id, normalizeUserRecipe(row))
    return next
  }

  async function loadMore() {
    const oldest = feed[feed.length - 1]
    if (!oldest || loadingMore) return
    setLoadingMore(true)
    try {
      const { data, error } = await supabase
        .from('activity')
        .select('*, profile:profiles(username, avatar_url)')
        .in('user_id', [...followingIdsRef.current])
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (error) throw error

      const rows = data || []
      const recipeMap = await fetchUserRecipes(rows, userRecipeMap)
      if (!mountedRef.current) return
      setFeed(prev => [...prev, ...rows])
      setUserRecipeMap(recipeMap)
      setHasMore(rows.length === PAGE_SIZE)
    } catch (err) {
      console.error('Loading more activity failed:', err)
      showError('Could not load more activity.')
    } finally {
      if (mountedRef.current) setLoadingMore(false)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    if (!user) { setLoading(false); return () => { mountedRef.current = false } }

    loadFeed()

    // Requires `activity` to be in the supabase_realtime publication — see
    // migration 006, which adds it. Without that this never fired at all.
    const channel = supabase
      .channel('activity-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' }, payload => {
        if (followingIdsRef.current.has(payload.new.user_id)) loadFeed()
      })
      .subscribe()

    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
    }
  }, [user?.id, loadFeed])

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-3">
        <Icon name="users" size={40} className="mx-auto text-warm-tan" />
        <h1 className="font-display text-[1.2rem] font-semibold text-ink">See what friends are cooking</h1>
        <p className="text-[0.85rem] text-muted">Log in to follow friends and see their activity</p>
        <button
          onClick={() => navigate('/login')}
          className="mt-2 bg-accent text-ink border-2 border-ink shadow-pop press font-bold rounded-xl px-6 py-2.5 hover:bg-accent-dk transition-colors"
        >Log in</button>
      </div>
    )
  }

  return (
    <>
      {showFindPeople && <FindPeopleSheet onClose={() => { setShowFindPeople(false); loadFeed() }} />}

      <div className="flex items-center justify-between px-5 py-[18px] pb-3">
        <h1 className="font-display text-[1.3rem] font-semibold text-ink">Friends</h1>
        <button
          onClick={() => setShowFindPeople(true)}
          className="text-[0.78rem] font-bold text-ink border-2 border-ink bg-card shadow-pop press rounded-full px-3 py-[5px] hover:bg-accent hover:text-ink transition-all"
        >+ Find People</button>
      </div>

      {followedProfiles.length > 0 && (
        <nav className="px-5 pb-4 border-b border-ink" aria-label="People you follow">
          <h2 className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-muted mb-3">Following</h2>
          <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1">
            {followedProfiles.map(p => (
              <button
                key={p.id}
                onClick={() => p.username && navigate(`/user/${p.username}`)}
                className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                {p.avatar_url ? (
                  <img
                    src={p.avatar_url}
                    alt=""
                    className="w-12 h-12 rounded-full object-cover border-[2px] border-ink group-hover:bg-paper transition-colors"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-warm-tan flex items-center justify-center text-[1.3rem] border-[2px] border-ink group-hover:bg-paper transition-colors" aria-hidden="true">
                    <Icon name="user" size={22} />
                  </div>
                )}
                <span className="text-[0.68rem] text-muted group-hover:text-accent-dk transition-colors max-w-[52px] truncate text-center">
                  @{p.username || '?'}
                </span>
              </button>
            ))}
          </div>
        </nav>
      )}

      {loading ? (
        <p className="text-center py-16 text-muted text-[0.9rem]" role="status">Loading…</p>
      ) : feed.length === 0 ? (
        <div className="flex flex-col items-center py-16 px-6 text-center gap-2">
          <Icon name="users" size={32} className="mx-auto text-warm-tan" />
          <p className="font-display text-[1.05rem] text-muted">Nothing here yet</p>
          <p className="text-[0.82rem] text-muted">Follow some friends to see their activity</p>
          <button
            onClick={() => setShowFindPeople(true)}
            className="mt-3 text-[0.82rem] font-bold text-ink border-2 border-ink bg-card shadow-pop press rounded-full px-4 py-[6px] hover:bg-accent hover:text-ink transition-all"
          >Find People</button>
        </div>
      ) : (
        <>
          <ul className="list-none">
            {feed.map(item => (
              <ActivityItem
                key={item.id}
                item={item}
                userRecipeMap={userRecipeMap}
                onOpenRecipe={onOpen}
              />
            ))}
          </ul>
          {hasMore && (
            <div className="flex justify-center py-5">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-[0.82rem] font-bold text-ink border-2 border-ink bg-card shadow-pop press rounded-full px-4 py-[6px] hover:bg-accent hover:text-ink transition-all disabled:opacity-50"
              >{loadingMore ? 'Loading…' : 'Load more'}</button>
            </div>
          )}
        </>
      )}
    </>
  )
}
