import { vi } from 'vitest'

/**
 * A small in-memory stand-in for the Supabase JS client.
 *
 * It implements just enough of the PostgREST builder to exercise the app's real
 * query chains — filters, insert/upsert/update/delete, `.select()` after a
 * write, `.single()` / `.maybeSingle()`, and head counts — backed by plain
 * arrays. Uniqueness is enforced per table so `upsert` behaves like the real
 * `ON CONFLICT` clause.
 */

/** Mirrors the unique constraints in supabase/schema.sql. */
const UNIQUE_BY = {
  profiles:      ['id'],
  favorites:     ['user_id', 'recipe_key'],
  ratings:       ['user_id', 'recipe_key'],
  notes:         ['user_id', 'recipe_key'],
  shopping_list: ['user_id', 'recipe_key'],
  pantry:        ['user_id', 'item'],
  user_recipes:  ['id'],
  lists:         ['id'],
  list_items:    ['list_id', 'recipe_key'],
  follows:       ['follower_id', 'following_id'],
  activity:      ['id'],
}

const EMPTY_DB = () => ({
  profiles: [], favorites: [], ratings: [], notes: [], shopping_list: [],
  pantry: [], user_recipes: [], lists: [], list_items: [], follows: [], activity: [],
})

export function createMockSupabase(seed = {}) {
  const db = { ...EMPTY_DB(), ...structuredClone(seed) }
  const calls = []
  /** Queued one-shot failures, keyed "table:op". */
  const failures = new Map()
  let idCounter = 0
  const nextId = prefix => `${prefix}-${++idCounter}`

  let session = seed.__session ?? null
  const authListeners = new Set()

  /**
   * Translates a SQL LIKE pattern into a RegExp, honouring PostgREST's
   * backslash escaping so an escaped %/_ matches literally.
   */
  function likeToRegExp(pattern) {
    let out = ''
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i]
      if (ch === '\\' && i + 1 < pattern.length) {
        out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      } else if (ch === '%') {
        out += '.*'
      } else if (ch === '_') {
        out += '.'
      } else {
        out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      }
    }
    return new RegExp(`^${out}$`, 'i')
  }

  function matches(row, filters) {
    return filters.every(f => {
      const v = row[f.col]
      switch (f.op) {
        case 'eq':   return String(v) === String(f.val)
        case 'neq':  return String(v) !== String(f.val)
        case 'in':   return f.val.map(String).includes(String(v))
        case 'lt':   return v < f.val
        case 'gt':   return v > f.val
        case 'lte':  return v <= f.val
        case 'gte':  return v >= f.val
        case 'is':   return f.val === null ? (v === null || v === undefined) : v === f.val
        case 'notIs': return f.val === null ? !(v === null || v === undefined) : v !== f.val
        case 'ilike':
          return likeToRegExp(String(f.val)).test(String(v ?? ''))
        default: throw new Error(`mock: unsupported filter "${f.op}"`)
      }
    })
  }

  function conflictKey(table, row) {
    return (UNIQUE_BY[table] || ['id']).map(c => String(row[c])).join('')
  }

  function withDefaults(table, row) {
    const out = { ...row }
    if (out.id === undefined && ['user_recipes', 'lists', 'activity'].includes(table)) {
      out.id = nextId(table === 'user_recipes' ? 'ur' : table === 'lists' ? 'ls' : 'ac')
    }
    if (out.id === undefined && ['favorites', 'ratings', 'notes', 'shopping_list', 'pantry', 'list_items'].includes(table)) {
      out.id = ++idCounter
    }
    if (out.created_at === undefined && table !== 'profiles') {
      out.created_at = new Date(Date.now() - (1000 - idCounter)).toISOString()
    }
    if (table === 'shopping_list' && out.checked === undefined) out.checked = []
    return out
  }

  function builder(table) {
    const state = {
      op: 'select', filters: [], rows: null, patch: null,
      wantSelect: false, single: null, head: false, limit: null,
    }

    function execute() {
      const list = db[table]
      if (!list) throw new Error(`mock: unknown table "${table}"`)

      const failKey = `${table}:${state.op}`
      if (failures.has(failKey)) {
        const err = failures.get(failKey)
        failures.delete(failKey)
        return { data: null, count: null, error: err }
      }

      let data = null
      let count = null

      if (state.op === 'select') {
        data = list.filter(r => matches(r, state.filters))
        count = data.length
        if (state.limit != null) data = data.slice(0, state.limit)
        if (state.head) data = null
        data = data && data.map(r => ({ ...r }))
      } else if (state.op === 'insert') {
        const created = []
        for (const raw of state.rows) {
          const row = withDefaults(table, raw)
          const key = conflictKey(table, row)
          if (list.some(r => conflictKey(table, r) === key)) {
            return {
              data: null, count: null,
              error: { code: '23505', message: `duplicate key value violates unique constraint on ${table}` },
            }
          }
          list.push(row)
          created.push({ ...row })
        }
        data = state.wantSelect ? created : null
      } else if (state.op === 'upsert') {
        const affected = []
        for (const raw of state.rows) {
          const row = withDefaults(table, raw)
          const key = conflictKey(table, row)
          const i = list.findIndex(r => conflictKey(table, r) === key)
          if (i >= 0) { list[i] = { ...list[i], ...row }; affected.push({ ...list[i] }) }
          else { list.push(row); affected.push({ ...row }) }
        }
        data = state.wantSelect ? affected : null
      } else if (state.op === 'update') {
        const affected = []
        list.forEach((r, i) => {
          if (!matches(r, state.filters)) return
          list[i] = { ...r, ...state.patch }
          affected.push({ ...list[i] })
        })
        data = state.wantSelect ? affected : null
      } else if (state.op === 'delete') {
        const kept = []
        const removed = []
        for (const r of list) (matches(r, state.filters) ? removed : kept).push(r)
        db[table] = kept
        data = state.wantSelect ? removed : null
      }

      if (state.single) {
        const rows = data || []
        if (rows.length === 1) return { data: rows[0], count, error: null }
        if (rows.length === 0) {
          return state.single === 'maybe'
            ? { data: null, count, error: null }
            : { data: null, count, error: { code: 'PGRST116', message: 'no rows returned' } }
        }
        return { data: null, count, error: { code: 'PGRST114', message: 'multiple rows returned' } }
      }
      return { data, count, error: null }
    }

    const api = {
      select(_cols, opts) {
        if (state.op === 'select') {
          if (opts?.head) state.head = true
        } else {
          state.wantSelect = true
        }
        return api
      },
      insert(rows) { state.op = 'insert'; state.rows = Array.isArray(rows) ? rows : [rows]; return api },
      upsert(rows) { state.op = 'upsert'; state.rows = Array.isArray(rows) ? rows : [rows]; return api },
      update(patch) { state.op = 'update'; state.patch = patch; return api },
      delete() { state.op = 'delete'; return api },

      eq(col, val)  { state.filters.push({ col, op: 'eq',  val }); return api },
      neq(col, val) { state.filters.push({ col, op: 'neq', val }); return api },
      in(col, val)  { state.filters.push({ col, op: 'in',  val }); return api },
      lt(col, val)  { state.filters.push({ col, op: 'lt',  val }); return api },
      gt(col, val)  { state.filters.push({ col, op: 'gt',  val }); return api },
      ilike(col, val) { state.filters.push({ col, op: 'ilike', val }); return api },
      not(col, op, val) { state.filters.push({ col, op: op === 'is' ? 'notIs' : op, val }); return api },
      match(obj) {
        for (const [col, val] of Object.entries(obj)) state.filters.push({ col, op: 'eq', val })
        return api
      },
      order() { return api },
      limit(n) { state.limit = n; return api },
      single()      { state.single = 'exact'; return api },
      maybeSingle() { state.single = 'maybe'; return api },

      then(resolve, reject) {
        try {
          const result = execute()
          calls.push({ table, op: state.op, filters: [...state.filters], result })
          return Promise.resolve(result).then(resolve, reject)
        } catch (err) {
          return Promise.reject(err).then(resolve, reject)
        }
      },
      catch(fn) { return api.then(v => v).catch(fn) },
      finally(fn) { return api.then(v => v).finally(fn) },
    }
    return api
  }

  const client = {
    from: vi.fn(table => builder(table)),

    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session }, error: null })),
      onAuthStateChange: vi.fn(cb => {
        authListeners.add(cb)
        return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } }
      }),
      signInWithPassword: vi.fn(() => Promise.resolve({ error: null })),
      signUp: vi.fn(() => Promise.resolve({ error: null })),
      signInWithOAuth: vi.fn(() => Promise.resolve({ error: null })),
      resetPasswordForEmail: vi.fn(() => Promise.resolve({ error: null })),
      updateUser: vi.fn(() => Promise.resolve({ error: null })),
      signOut: vi.fn(() => { client.__setSession(null); return Promise.resolve({ error: null }) }),
    },

    channel: vi.fn(() => {
      const ch = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) }
      return ch
    }),
    removeChannel: vi.fn(),

    // ── test helpers ──
    __db: db,
    __calls: calls,
    __setSession(next) {
      session = next
      for (const cb of authListeners) cb(next ? 'SIGNED_IN' : 'SIGNED_OUT', next)
    },
    __emitAuth(event, next) {
      session = next
      for (const cb of authListeners) cb(event, next)
    },
    __callsTo(table, op) {
      return calls.filter(c => c.table === table && (!op || c.op === op))
    },
    /** Makes the next `op` on `table` return an error, once. */
    __failOn(table, op, error = { code: 'XX000', message: 'injected failure' }) {
      failures.set(`${table}:${op}`, error)
    },
  }

  return client
}

export function fakeSession(uid = 'user-1', email = 'cook@example.com') {
  return { user: { id: uid, email, user_metadata: {} } }
}
