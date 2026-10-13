import { useState, useEffect, useMemo, useRef } from 'react'
import { useDialog } from '../hooks/useDialog'
import { ingredientLabel, keyToText, scaleStep } from '../utils/recipe'
import { findDurations, leadTimes, describeLead } from '../utils/steps'
import { canonicalItem } from '../utils/ingredients'
import { formatDuration } from '../utils/formatTime'
import Icon from './Icon'

/**
 * One step at a time, readable from across the counter.
 *
 * Built for a cook whose hands are wet and whose attention is on the pan:
 * big type, the two controls that matter (back, next) at thumb height and
 * full width, the quantities that step needs printed under it, and a timer
 * button for every time the step mentions. Everything else is one tap away.
 *
 * Screen 0 is "get ready" — plan-ahead warnings and the ingredient list — and
 * the last is "done", so the steps themselves are 1..n.
 */

const storeKey = key => `ate:cook:${keyToText(key)}`

/** A cheap fingerprint of what the session was cooking, so an edited recipe doesn't resume stale progress. */
function fingerprint(recipe) {
  const s = JSON.stringify([recipe?.ingredients || [], recipe?.steps || []])
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

/**
 * The saved session for this recipe — { index, timers, scale, checked } — or
 * null when there's none or the recipe has changed since. A stale one is
 * dropped rather than resumed at a step that may no longer exist.
 */
export function loadCookSession(key, recipe) {
  try {
    const s = JSON.parse(localStorage.getItem(storeKey(key)))
    if (!s) return null
    if (s.fp !== fingerprint(recipe)) { localStorage.removeItem(storeKey(key)); return null }
    return s
  } catch { return null }
}
export const clearCookSession = key => save(key, null)

function save(key, value) {
  try {
    if (value) localStorage.setItem(storeKey(key), JSON.stringify(value))
    else localStorage.removeItem(storeKey(key))
  } catch { /* private mode: progress just isn't kept */ }
}

/** "mm:ss", or "h:mm:ss" past the hour. */
function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(r).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Three short beeps and a buzz. Both are best-effort: no audio, no vibration motor, no fuss. */
function alarm() {
  try { navigator.vibrate?.([300, 150, 300, 150, 300]) } catch { /* unsupported */ }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[0, 0.35, 0.7].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = 880
      g.gain.setValueAtTime(0.25, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3)
    })
    setTimeout(() => ctx.close(), 1500)
  } catch { /* no Web Audio */ }
}

/** Keep the screen on while cooking. Re-taken on return, since the browser drops it when the tab hides. */
function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock = null, gone = false
    const take = async () => {
      try { lock = await navigator.wakeLock.request('screen') } catch { /* denied or low battery */ }
      if (gone) lock?.release().catch(() => {})
    }
    const onVisible = () => { if (document.visibilityState === 'visible') take() }
    take()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      gone = true
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [])
}

// Words that describe an ingredient rather than name it. Matching on these
// tagged every "fresh …" ingredient onto any step that said "fresh".
const FILLER = new Set(['and', 'with', 'the', 'for', 'fresh', 'dried', 'chopped', 'sliced', 'large',
  'small', 'medium', 'whole', 'ground', 'red', 'green', 'white', 'black', 'boneless', 'skinless', 'powder'])

/**
 * The ingredients a step mentions, matched on their everyday name: "garlic",
 * not "4 large cloves of garlic, finely chopped".
 *
 * `pinned` are lines the step names by amount ("8 tablespoons melted butter").
 * When a step pins one line of a name, the recipe's other lines of that name
 * are left out — step 1 of the biscuits needs the batter butter, not the
 * brushing butter too.
 */
function ingredientsIn(step, labelled, pinned) {
  const text = step.toLowerCase()
  const rx = w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(e?s)?\\b`, 'i')
  const mentioned = labelled.filter(({ name }) => {
    if (!name || name.length < 3) return false
    // Any word of the everyday name: steps say "the chicken" for "chicken
    // breast" and "the dal" for "toor dal".
    return rx(name).test(text) || name.split(' ').some(w => w.length >= 3 && !FILLER.has(w) && rx(w).test(text))
  })
  const pinnedNames = new Set(mentioned.filter(l => pinned.has(l.line)).map(l => l.name))
  return mentioned.filter(l => !pinnedNames.has(l.name) || pinned.has(l.line))
}

export default function CookMode({ recipe, recipeKey, scale = 1, onClose }) {
  const steps = recipe.steps || []
  const last  = steps.length + 1
  const saved = useMemo(() => loadCookSession(recipeKey, recipe), [recipeKey, recipe])

  const [index,   setIndex]   = useState(() => Math.min(saved?.index ?? 0, last))
  const [timers,  setTimers]  = useState(() => saved?.timers ?? [])
  const [now,     setNow]     = useState(() => Date.now())
  const [showAll, setShowAll] = useState(false)
  const [checked, setChecked] = useState(() => new Set(saved?.checked ?? []))
  const touch = useRef(null)

  const { titleId, panelProps } = useDialog({ onClose })
  useWakeLock()

  const labelled = useMemo(
    () => (recipe.ingredients || []).map((ing, line) => ({ ...ingredientLabel(ing, scale), name: canonicalItem(ing.item), line })),
    [recipe, scale],
  )
  const leads = useMemo(() => leadTimes(recipe), [recipe])

  // Survives closing, a reload, or the phone locking mid-simmer.
  useEffect(() => {
    const fresh = index === 0 && !timers.length && !checked.size
    save(recipeKey, fresh ? null : { index, timers, scale, checked: [...checked], fp: fingerprint(recipe) })
  }, [recipeKey, recipe, index, timers, scale, checked])

  // Ticks only while something is counting down. Finished timers are worked
  // out from their end time rather than counted, so a backgrounded tab that
  // missed a thousand ticks still lands on the right answer when it returns.
  const running = timers.some(t => !t.rang)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [running])

  useEffect(() => {
    const due = timers.filter(t => !t.rang && t.endsAt <= now)
    if (!due.length) return
    alarm()
    setTimers(ts => ts.map(t => (due.some(d => d.id === t.id) ? { ...t, rang: true } : t)))
  }, [now, timers])

  const go = n => { setIndex(Math.max(0, Math.min(last, n))); setShowAll(false) }

  useEffect(() => {
    function onKey(e) {
      if (e.target.closest?.('input, textarea')) return
      if (e.key === 'ArrowRight') go(index + 1)
      if (e.key === 'ArrowLeft')  go(index - 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  function startTimer(d, stepNo) {
    const label = `Step ${stepNo} · ${d.text}`
    setTimers(ts => [...ts, { id: `${Date.now()}-${Math.random()}`, label, endsAt: Date.now() + d.minutes * 60000 }])
    setNow(Date.now())
  }
  const dropTimer = id => setTimers(ts => ts.filter(t => t.id !== id))

  function finish() {
    save(recipeKey, null)
    onClose()
  }

  // A horizontal swipe turns the page; a vertical one is left to scrolling.
  const swipe = {
    onTouchStart: e => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY } },
    onTouchEnd: e => {
      const s = touch.current; touch.current = null
      if (!s) return
      const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1))
    },
  }

  const step       = index >= 1 && index <= steps.length ? steps[index - 1] : null
  const segments   = step ? scaleStep(step, recipe.ingredients, scale, ing => canonicalItem(ing.item)) : []
  const pinned     = new Set(segments.filter(s => s.line != null).map(s => s.line))
  const stepIngs   = step ? ingredientsIn(step, labelled, pinned) : []
  const servings   = recipe.servings ? recipe.servings * scale : null
  // One button per distinct time, and none for waits measured in days — those
  // are plan-ahead, not something to watch count down.
  const durations  = step
    ? findDurations(step)
        .filter(d => !d.overnight && d.minutes <= 12 * 60)
        .filter((d, i, all) => all.findIndex(x => x.minutes === d.minutes) === i)
    : []
  const bigBtn     = 'min-h-[56px] rounded-xl border-[2.5px] border-ink font-display font-semibold text-[1.05rem] press flex items-center justify-center gap-2 px-4'

  return (
    <div className="fixed inset-0 z-[600] bg-cream flex flex-col" {...panelProps} {...swipe}>
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-paper border-b-[2.5px] border-ink">
        <button
          onClick={onClose}
          aria-label="Leave cooking mode"
          className="w-11 h-11 grid place-items-center rounded-full hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        ><Icon name="close" size={20} strokeWidth={2.6} /></button>
        <div className="flex-1 min-w-0 text-center">
          <h2 id={titleId} className="font-display font-semibold text-[1rem] text-ink truncate">{recipe.name}</h2>
          <p className="text-[0.8rem] text-muted" aria-live="polite">
            {index === 0 ? 'Get ready' : index === last ? 'Done' : `Step ${index} of ${steps.length}`}
          </p>
        </div>
        <button
          onClick={() => setShowAll(v => !v)}
          aria-expanded={showAll}
          className="h-11 px-3 rounded-full border-2 border-ink bg-card text-[0.85rem] font-bold shadow-pop press"
        >Ingredients</button>
      </div>

      {/* ── Progress ── */}
      <div className="flex gap-1 px-3 pt-2" aria-hidden="true">
        {steps.map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < index ? 'bg-accent' : 'bg-warm-tan'}`} />
        ))}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {showAll ? (
          <IngredientList labelled={labelled} checked={checked} setChecked={setChecked} />
        ) : index === 0 ? (
          <>
            <p className="font-display text-[1.6rem] font-semibold text-ink leading-tight mb-4">Get everything out first</p>
            {leads.length > 0 && <PlanAhead leads={leads} />}
            <IngredientList labelled={labelled} checked={checked} setChecked={setChecked} />
          </>
        ) : index === last ? (
          <div className="text-center pt-10">
            <Icon name="pan" size={56} className="mx-auto text-accent-dk mb-4" />
            <p className="font-display text-[1.8rem] font-semibold text-ink">That&rsquo;s it — enjoy!</p>
            <p className="text-[1rem] text-muted mt-2">Rate it and jot down what you&rsquo;d change in Your Notes.</p>
          </div>
        ) : (
          <>
            {scale !== 1 && <ScaledNote recipe={recipe} servings={servings} />}
            <p className="text-[1.45rem] leading-snug text-ink font-semibold">
              {segments.map((seg, i) => seg.scaled
                ? <mark key={i} className="bg-sun text-ink rounded px-1">{seg.text}</mark>
                : <span key={i}>{seg.text}</span>)}
            </p>

            {stepIngs.length > 0 && (
              <ul className="flex flex-wrap gap-2 mt-5 list-none" aria-label="Quantities for this step">
                {stepIngs.map((ing, i) => (
                  <li key={i} className="border-2 border-ink bg-card rounded-xl px-3 py-1.5 text-[1rem]">
                    {ing.measure && <span className="font-bold text-accent-dk mr-1.5">{ing.measure}</span>}
                    {ing.name}
                  </li>
                ))}
              </ul>
            )}

            {durations.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-5">
                {durations.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => startTimer(d, index)}
                    className="min-h-[48px] inline-flex items-center gap-2 bg-sun border-[2.5px] border-ink rounded-xl px-4 font-bold text-[1rem] shadow-pop press"
                  ><Icon name="clock" size={18} />Start {formatDuration(d.minutes)} timer</button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Timers ── */}
      {timers.length > 0 && (
        <ul className="list-none px-3 pb-2 flex flex-col gap-1.5" aria-label="Timers">
          {timers.map(t => {
            const left = t.endsAt - now
            return (
              <li
                key={t.id}
                className={`flex items-center gap-3 border-2 border-ink rounded-xl px-3 py-2 ${t.rang ? 'bg-heart text-card animate-pulse' : 'bg-card'}`}
                role={t.rang ? 'alert' : undefined}
              >
                <Icon name="clock" size={18} />
                <span className="flex-1 min-w-0 truncate text-[0.95rem]">{t.label}</span>
                <span className="font-display font-semibold text-[1.2rem] tabular-nums">{t.rang ? 'Done!' : clock(left)}</span>
                <button
                  onClick={() => dropTimer(t.id)}
                  aria-label={t.rang ? `Dismiss ${t.label}` : `Cancel ${t.label}`}
                  className="w-11 h-11 -my-2 -mr-2 grid place-items-center rounded-full"
                ><Icon name="close" size={16} strokeWidth={3} /></button>
              </li>
            )
          })}
        </ul>
      )}

      {/* ── Back / Next, at thumb height ── */}
      <div className="grid grid-cols-[1fr_2fr] gap-3 px-3 pt-2 pb-[calc(12px+env(safe-area-inset-bottom,0px))] border-t-[2.5px] border-ink bg-paper">
        <button onClick={() => go(index - 1)} disabled={index === 0} className={`${bigBtn} bg-card shadow-pop disabled:opacity-40`}>
          <Icon name="arrowRight" size={18} className="rotate-180" />Back
        </button>
        {index === last ? (
          <button onClick={finish} className={`${bigBtn} bg-accent shadow-pop`}>Finish</button>
        ) : (
          <button onClick={() => go(index + 1)} className={`${bigBtn} bg-accent shadow-pop`}>
            {index === 0 ? 'Start cooking' : index === steps.length ? 'Finish' : 'Next'}
            <Icon name="arrowRight" size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

/** Warnings for the waiting a recipe needs before cooking can start. */
export function PlanAhead({ leads, className = '' }) {
  return (
    <div className={`border-2 border-ink bg-sun rounded-xl px-4 py-3 mb-4 ${className}`} role="note">
      <p className="font-bold text-ink flex items-center gap-2"><Icon name="clock" size={16} />Plan ahead</p>
      <ul className="list-none mt-1">
        {leads.map(l => (
          <li key={`${l.step}-${l.label}`} className="text-ink">{describeLead(l)}</li>
        ))}
      </ul>
    </div>
  )
}

function IngredientList({ labelled, checked, setChecked }) {
  const toggle = i => setChecked(prev => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i); else next.add(i)
    return next
  })
  return (
    <ul className="list-none">
      {labelled.map((ing, i) => (
        <li key={i} className="border-b border-warm-tan last:border-0">
          <label className="flex items-start gap-3 py-3 cursor-pointer min-h-[48px]">
            <input
              type="checkbox"
              checked={checked.has(i)}
              onChange={() => toggle(i)}
              className="accent-accent w-6 h-6 shrink-0 mt-0.5"
            />
            <span className={`text-[1.1rem] ${checked.has(i) ? 'line-through text-muted' : 'text-ink'}`}>
              {ing.measure && <span className="font-bold text-accent-dk mr-2">{ing.measure}</span>}
              {ing.item}
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}

/**
 * Said once per step while scaled: the amounts we could tie to an ingredient
 * are adjusted (highlighted); any other number in the step is as the recipe
 * wrote it, for its original servings.
 */
export function ScaledNote({ recipe, servings, className = '' }) {
  return (
    <p className={`text-[0.9rem] text-muted mb-3 ${className}`}>
      Making {servings ?? 'a scaled batch'}{servings ? ' servings' : ''}. <mark className="bg-sun text-ink rounded px-1">Highlighted</mark> amounts
      are adjusted; other numbers in the steps are as written{recipe.servings ? ` for ${recipe.servings}` : ''}.
    </p>
  )
}
