import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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

export default function UserProfile({ onOpen }) {
  const { username } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [profile,   setProfile]   = useState(null)
  const [activity,  setActivity]  = useState([])
  const [following, setFollowing] = useState(false)
  const [counts,    setCounts]    = useState({ followers: 0, following: 0 })
  const [loading,   setLoading]   = useState(true)
  const [notFound,  setNotFound]  = useState(false)

  useEffect(() => {
    loadProfile()
  }, [username])

  async function loadProfile() {
    setLoading(true)
    const { data: p } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, bio')
      .eq('username', username)
      .single()

    if (!p) { setNotFound(true); setLoading(false); return }
    setProfile(p)

    const [actRes, followerRes, followingRes] = await Promise.all([
      supabase.from('activity').select('*').eq('user_id', p.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('follows').select('follower_id', { count: 'exact' }).eq('following_id', p.id),
      supabase.from('follows').select('following_id', { count: 'exact' }).eq('follower_id', p.id),
    ])

    setActivity(actRes.data || [])
    setCounts({ followers: followerRes.count || 0, following: followingRes.count || 0 })

    if (user && user.id !== p.id) {
      const { data: f } = await supabase.from('follows').select('follower_id').match({ follower_id: user.id, following_id: p.id }).single()
      setFollowing(!!f)
    }

    setLoading(false)
  }

  async function toggleFollow() {
    if (!user || !profile) return
    if (following) {
      await supabase.from('follows').delete().match({ follower_id: user.id, following_id: profile.id })
      setFollowing(false)
      setCounts(c => ({ ...c, followers: Math.max(0, c.followers - 1) }))
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: profile.id })
      setFollowing(true)
      setCounts(c => ({ ...c, followers: c.followers + 1 }))
    }
  }

  if (loading) return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-rim">
        <button onClick={() => navigate(-1)} className="text-accent text-[1.1rem] hover:text-accent-dk">‹</button>
        <span className="font-display text-[1rem] text-muted">Loading…</span>
      </div>
    </div>
  )

  if (notFound) return (
    <div className="flex flex-col min-h-screen pb-20">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-rim">
        <button onClick={() => navigate(-1)} className="text-accent text-[1.1rem] hover:text-accent-dk">‹</button>
        <span className="font-display text-[1rem] text-ink">@{username}</span>
      </div>
      <div className="flex flex-col items-center py-20 text-center gap-2">
        <div className="text-[2rem]">👤</div>
        <div className="font-display text-[1.1rem] text-muted">User not found</div>
      </div>
    </div>
  )

  const isOwnProfile = user?.id === profile?.id
  const icons = { saved: '♥', created: '📖', rated: '⭐', listed: '📋' }

  function activityLabel(item) {
    if (item.type === 'saved')   return <><span className="text-heart">♥</span> saved <strong>{item.recipe_name}</strong></>
    if (item.type === 'created') return <>📖 created <strong>{item.recipe_name}</strong></>
    if (item.type === 'rated')   return <>⭐ rated <strong>{item.recipe_name}</strong> {'★'.repeat(item.rating || 0)}</>
    if (item.type === 'listed')  return <>📋 added <strong>{item.recipe_name}</strong> to <em>{item.list_name}</em></>
    return item.type
  }

  function resolveRecipe(item) {
    if (!item.recipe_key) return null
    if (/^\d+$/.test(item.recipe_key)) return RECIPES[parseInt(item.recipe_key)]
    return null
  }

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* Back bar */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-rim bg-paper">
        <button onClick={() => navigate(-1)} className="text-accent text-[1.3rem] leading-none hover:text-accent-dk">‹</button>
        <span className="font-display text-[1rem] font-semibold text-ink">@{profile.username}</span>
      </div>

      {/* Profile header */}
      <div className="px-5 py-5 border-b border-rim">
        <div className="flex items-center gap-4">
          {profile.avatar_url
            ? <img src={profile.avatar_url} className="w-16 h-16 rounded-full object-cover border-[2px] border-rim" />
            : <div className="w-16 h-16 rounded-full bg-warm-tan flex items-center justify-center text-[2rem] border-[2px] border-rim">👤</div>
          }
          <div className="flex-1">
            <div className="font-display text-[1.2rem] font-bold text-ink">@{profile.username}</div>
            {profile.bio && <div className="text-[0.82rem] text-muted mt-1">{profile.bio}</div>}
            <div className="flex gap-4 mt-2 text-[0.8rem] text-muted">
              <span><strong className="text-ink">{counts.followers}</strong> followers</span>
              <span><strong className="text-ink">{counts.following}</strong> following</span>
            </div>
          </div>
          {!isOwnProfile && user && (
            <button
              onClick={toggleFollow}
              className={`text-[0.82rem] font-bold rounded-[14px] px-4 py-[6px] border-[1.5px] transition-all shrink-0 ${
                following
                  ? 'border-rim text-muted hover:text-heart hover:border-heart'
                  : 'bg-accent border-accent text-white hover:bg-accent-dk'
              }`}
            >{following ? 'Following' : 'Follow'}</button>
          )}
          {isOwnProfile && (
            <button
              onClick={() => navigate('/profile')}
              className="text-[0.82rem] font-bold rounded-[14px] px-4 py-[6px] border-[1.5px] border-rim text-muted hover:border-accent hover:text-accent transition-all shrink-0"
            >Edit Profile</button>
          )}
        </div>
      </div>

      {/* Activity */}
      <div>
        {activity.length === 0 ? (
          <div className="py-12 text-center text-muted text-[0.85rem]">No activity yet</div>
        ) : (
          activity.map(item => {
            const recipe = resolveRecipe(item)
            return (
              <div key={item.id} className="px-5 py-4 border-b border-[rgba(200,180,130,0.3)]">
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-[0.86rem] text-ink">{activityLabel(item)}</span>
                  <span className="text-[0.7rem] text-muted shrink-0">{timeAgo(item.created_at)}</span>
                </div>
                {recipe && (
                  <div
                    className="bg-paper border-[1.5px] border-warm-tan rounded-xl px-3.5 py-2.5 cursor-pointer hover:border-accent transition-colors"
                    onClick={() => {
                      const key = /^\d+$/.test(item.recipe_key) ? parseInt(item.recipe_key) : item.recipe_key
                      onOpen(key)
                    }}
                  >
                    <div className="font-display text-[0.9rem] font-semibold text-ink">{recipe.name}</div>
                    <div className="text-[0.72rem] text-muted mt-0.5">
                      {recipe.category}{recipe.timeMinutes ? ` · ${recipe.timeMinutes} min` : ''}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
