import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import RECIPES from '../data/recipes.json'

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000
  if (diff < 60)   return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function ActivityItem({ item, onOpenRecipe }) {
  const navigate = useNavigate()
  function resolveRecipe() {
    if (!item.recipe_key) return null
    if (/^\d+$/.test(item.recipe_key)) return RECIPES[parseInt(item.recipe_key)]
    return null // user recipes need to be passed in separately
  }

  const recipe = resolveRecipe()

  function label() {
    if (item.type === 'saved')   return <><span className="text-heart">♥</span> saved <strong>{item.recipe_name}</strong></>
    if (item.type === 'created') return <>📖 created <strong>{item.recipe_name}</strong></>
    if (item.type === 'rated')   return <>⭐ rated <strong>{item.recipe_name}</strong> {'★'.repeat(item.rating)}</>
    if (item.type === 'listed')  return <>📋 added <strong>{item.recipe_name}</strong> to <em>{item.list_name}</em></>
    return item.type
  }

  return (
    <div className="px-5 py-4 border-b border-[rgba(200,180,130,0.3)]">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        {item.profile?.avatar_url ? (
          <img
            src={item.profile.avatar_url}
            className="w-9 h-9 rounded-full object-cover shrink-0 border border-rim cursor-pointer"
            onClick={() => item.profile?.username && navigate(`/user/${item.profile.username}`)}
          />
        ) : (
          <div
            className="w-9 h-9 rounded-full bg-warm-tan flex items-center justify-center text-[1.1rem] shrink-0 border border-rim cursor-pointer"
            onClick={() => item.profile?.username && navigate(`/user/${item.profile.username}`)}
          >👤</div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap mb-1">
            <span
              className="font-bold text-[0.9rem] text-accent-dk cursor-pointer hover:underline"
              onClick={() => item.profile?.username && navigate(`/user/${item.profile.username}`)}
            >@{item.profile?.username || 'unknown'}</span>
            <span className="text-[0.72rem] text-muted">{timeAgo(item.created_at)}</span>
          </div>
          <p className="text-[0.86rem] text-ink leading-snug">{label()}</p>

          {/* Mini recipe card */}
          {recipe && (
            <div
              className="mt-2.5 bg-paper border-[1.5px] border-warm-tan rounded-xl px-3.5 py-2.5 cursor-pointer hover:border-accent transition-colors"
              onClick={() => {
                const key = /^\d+$/.test(item.recipe_key) ? parseInt(item.recipe_key) : item.recipe_key
                onOpenRecipe(key)
              }}
            >
              <div className="font-display text-[0.9rem] font-semibold text-ink">{recipe.name}</div>
              <div className="text-[0.72rem] text-muted mt-0.5">
                {recipe.category}{recipe.timeMinutes ? ` · ${recipe.timeMinutes} min` : ''}{recipe.servings ? ` · ${recipe.servings} servings` : ''}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FindPeopleSheet({ onClose }) {
  const { user } = useAuth()
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState([])
  const [following, setFollowing] = useState(new Set())
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    // Load who user already follows
    if (!user) return
    supabase.from('follows').select('following_id').eq('follower_id', user.id)
      .then(({ data }) => {
        if (data) setFollowing(new Set(data.map(f => f.following_id)))
      })
  }, [user?.id])

  async function search(q) {
    setQuery(q)
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .ilike('username', `%${q}%`)
      .neq('id', user.id)
      .limit(10)
    setResults(data || [])
    setLoading(false)
  }

  async function toggleFollow(profileId) {
    if (following.has(profileId)) {
      const { error } = await supabase.from('follows').delete().match({ follower_id: user.id, following_id: profileId })
      if (error) { console.error('Unfollow failed:', error); return }
      setFollowing(prev => { const n = new Set(prev); n.delete(profileId); return n })
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: user.id, following_id: profileId })
      if (error) { console.error('Follow failed:', error); return }
      setFollowing(prev => new Set([...prev, profileId]))
    }
  }

  return (
    <div className="fixed inset-0 bg-[rgba(60,35,15,0.55)] backdrop-blur-[3px] z-[500] flex items-end justify-center">
      <div className="bg-card w-full max-w-lg rounded-t-2xl border-t-[1.5px] border-rim shadow-warm-xl pb-safe">
        <div className="flex items-center justify-between px-5 py-4 border-b border-rim">
          <h3 className="font-display text-[1.1rem] font-semibold text-ink">Find People</h3>
          <button onClick={onClose} className="text-muted text-[1.4rem] hover:text-ink">×</button>
        </div>

        <div className="px-5 py-3">
          <input
            value={query}
            onChange={e => search(e.target.value)}
            placeholder="Search by username…"
            autoFocus
            className="w-full border-[1.5px] border-rim rounded-xl px-4 py-2.5 text-[0.9rem] text-ink bg-paper outline-none focus:border-accent placeholder:text-muted"
          />
        </div>

        <div className="px-5 pb-6 min-h-[120px]">
          {loading && <div className="text-center py-6 text-muted text-[0.85rem]">Searching…</div>}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="text-center py-6 text-muted text-[0.85rem]">No users found</div>
          )}
          {results.map(p => (
            <div key={p.id} className="flex items-center gap-3 py-3 border-b border-[rgba(200,180,130,0.2)] last:border-0">
              {p.avatar_url
                ? <img src={p.avatar_url} className="w-10 h-10 rounded-full object-cover border border-rim" />
                : <div className="w-10 h-10 rounded-full bg-warm-tan flex items-center justify-center text-[1.2rem] border border-rim">👤</div>
              }
              <span className="flex-1 font-bold text-[0.92rem] text-ink">@{p.username}</span>
              <button
                onClick={() => toggleFollow(p.id)}
                className={`text-[0.8rem] font-bold rounded-[14px] px-4 py-[6px] border-[1.5px] transition-all ${
                  following.has(p.id)
                    ? 'border-rim text-muted hover:text-heart hover:border-heart'
                    : 'bg-accent border-accent text-white hover:bg-accent-dk'
                }`}
              >{following.has(p.id) ? 'Following' : 'Follow'}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Friends({ onOpen }) {
  const { user } = useAuth()
  const [feed,             setFeed]             = useState([])
  const [followedProfiles, setFollowedProfiles] = useState([])
  const [loading,          setLoading]          = useState(true)
  const [showFindPeople,   setShowFindPeople]   = useState(false)
  const navigate = useNavigate()
  // Tracks followed user IDs so the realtime handler only reloads for relevant inserts.
  const followingIdsRef = useRef(new Set())

  useEffect(() => {
    if (!user) { setLoading(false); return }
    loadFeed()

    // Only reload when a followed user posts activity, not on every global insert.
    const channel = supabase
      .channel('activity-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' }, (payload) => {
        if (followingIdsRef.current.has(payload.new.user_id)) loadFeed()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user?.id])

  async function loadFeed() {
    if (!user) return
    // Get who I follow
    const { data: followData } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)

    if (!followData?.length) {
      setFollowedProfiles([])
      setFeed([])
      setLoading(false)
      return
    }

    const followingIds = followData.map(f => f.following_id)
    followingIdsRef.current = new Set(followingIds)

    // Fetch activity + profiles of followed users in parallel
    const [activityRes, profilesRes] = await Promise.all([
      supabase
        .from('activity')
        .select('*, profile:profiles(username, avatar_url)')
        .in('user_id', followingIds)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', followingIds),
    ])

    setFollowedProfiles(profilesRes.data || [])
    setFeed(activityRes.data || [])
    setLoading(false)
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-3">
        <div className="text-[2.5rem]">👥</div>
        <div className="font-display text-[1.2rem] font-semibold text-ink">See what friends are cooking</div>
        <div className="text-[0.85rem] text-muted">Log in to follow friends and see their activity</div>
        <button
          onClick={() => navigate('/login')}
          className="mt-2 bg-accent text-white font-bold rounded-xl px-6 py-2.5 hover:bg-accent-dk transition-colors"
        >Log in</button>
      </div>
    )
  }

  return (
    <>
      {showFindPeople && <FindPeopleSheet onClose={() => { setShowFindPeople(false); loadFeed() }} />}

      <div className="flex items-center justify-between px-5 py-[18px] pb-3">
        <span className="font-display text-[1.3rem] font-semibold text-ink">Friends</span>
        <button
          onClick={() => setShowFindPeople(true)}
          className="text-[0.78rem] font-bold text-accent border-[1.5px] border-accent rounded-[14px] px-3 py-[5px] hover:bg-accent hover:text-white transition-all"
        >+ Find People</button>
      </div>

      {/* Followed users strip */}
      {followedProfiles.length > 0 && (
        <div className="px-5 pb-4 border-b border-warm-tan">
          <div className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-muted mb-3">Following</div>
          <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1">
            {followedProfiles.map(p => (
              <button
                key={p.id}
                onClick={() => p.username && navigate(`/user/${p.username}`)}
                className="flex flex-col items-center gap-1.5 shrink-0 group"
              >
                {p.avatar_url ? (
                  <img
                    src={p.avatar_url}
                    className="w-12 h-12 rounded-full object-cover border-[2px] border-rim group-hover:border-accent transition-colors"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-warm-tan flex items-center justify-center text-[1.3rem] border-[2px] border-rim group-hover:border-accent transition-colors">
                    👤
                  </div>
                )}
                <span className="text-[0.68rem] text-muted group-hover:text-accent-dk transition-colors max-w-[52px] truncate text-center">
                  @{p.username || '?'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-muted text-[0.9rem]">Loading…</div>
      ) : feed.length === 0 ? (
        <div className="flex flex-col items-center py-16 px-6 text-center gap-2">
          <div className="text-[2rem]">👥</div>
          <div className="font-display text-[1.05rem] text-muted">Nothing here yet</div>
          <div className="text-[0.82rem] text-muted">Follow some friends to see their activity</div>
          <button
            onClick={() => setShowFindPeople(true)}
            className="mt-3 text-[0.82rem] font-bold text-accent border-[1.5px] border-accent rounded-[14px] px-4 py-[6px] hover:bg-accent hover:text-white transition-all"
          >Find People</button>
        </div>
      ) : (
        <div>
          {feed.map(item => (
            <ActivityItem key={item.id} item={item} onOpenRecipe={onOpen} />
          ))}
        </div>
      )}
    </>
  )
}
