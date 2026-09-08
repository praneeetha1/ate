/**
 * Namespaced localStorage.
 *
 * Every persisted slice used to live under a single global key (`ate_favs`,
 * `ate_lists`, …). That meant signing out left the previous account's recipes,
 * saves and notes sitting in storage, where the next person to use the device
 * — or the anonymous session — would read them straight back in.
 *
 * Keys are now scoped per identity: `ate:<uid>:favs` for a signed-in user and
 * `ate:guest:favs` for an anonymous one, so the two never see each other's data.
 */

const PREFIX = 'ate'
const GUEST  = 'guest'

/** Slices that are persisted locally, and the legacy key each migrated from. */
export const LEGACY_KEYS = {
  favs:         'ate_favs',
  ratings:      'ate_ratings',
  notes:        'ate_notes',
  shopping:     'ate_shopping',
  shop_checked: 'ate_shop_checked',
  user_recipes: 'ate_user_recipes',
  lists:        'ate_lists',
}

export function scopeFor(uid) {
  return uid || GUEST
}

function fullKey(scope, slice) {
  return `${PREFIX}:${scope}:${slice}`
}

export function loadSlice(scope, slice, fallback) {
  try {
    const raw = localStorage.getItem(fullKey(scope, slice))
    if (raw === null) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    // Corrupt JSON, or storage blocked entirely (Safari private mode).
    return fallback
  }
}

export function saveSlice(scope, slice, value) {
  try {
    localStorage.setItem(fullKey(scope, slice), JSON.stringify(value))
  } catch {
    // Quota exceeded or storage unavailable — in-memory state is still correct,
    // so degrade to a session-only experience rather than breaking the app.
  }
}

export function clearScope(scope) {
  try {
    for (const slice of Object.keys(LEGACY_KEYS)) {
      localStorage.removeItem(fullKey(scope, slice))
    }
  } catch {
    // Ignore: nothing to clear if storage is unavailable.
  }
}

/**
 * One-time move of the old unscoped keys into the guest scope.
 *
 * Anything already in localStorage was created before scoping existed and can't
 * be attributed to an account, so it becomes guest data — it will be uploaded
 * and merged the next time the user logs in.
 */
export function migrateLegacyKeys() {
  try {
    if (localStorage.getItem(`${PREFIX}:migrated`) === '1') return

    for (const [slice, legacyKey] of Object.entries(LEGACY_KEYS)) {
      const raw = localStorage.getItem(legacyKey)
      if (raw === null) continue
      // Don't clobber guest data that already exists under the new scheme.
      if (localStorage.getItem(fullKey(GUEST, slice)) === null) {
        localStorage.setItem(fullKey(GUEST, slice), raw)
      }
      localStorage.removeItem(legacyKey)
    }

    localStorage.setItem(`${PREFIX}:migrated`, '1')
  } catch {
    // Ignore: worst case the user starts from an empty guest scope.
  }
}
