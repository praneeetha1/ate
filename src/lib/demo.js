import RECIPES from '../data/recipes.json'
import { createFakeSupabase, fakeSession } from './fakeSupabase'

/**
 * Dev-only demo mode: the app as a signed-in cook, against an in-memory
 * database, so the signed-in screens can be looked at without a real account.
 * Turn on with ?demo, off with ?demo=off; it sticks in between. Never part of
 * the production build (lib/supabase.js only reaches it behind DEV).
 */
const KEY = 'ate:demo'

export function demoWanted() {
  try {
    const q = new URLSearchParams(window.location.search).get('demo')
    if (q === 'off') localStorage.removeItem(KEY)
    else if (q !== null) localStorage.setItem(KEY, '1')
    return localStorage.getItem(KEY) === '1'
  } catch { return false }
}

/** Decided once at load. DEV is false in production builds, so it's always false there. */
export const isDemo = import.meta.env.DEV && demoWanted()

const UID = 'demo-user'
const key = name => String(RECIPES.findIndex(r => !r.hidden && r.name === name))

export function createDemoSupabase() {
  return createFakeSupabase({
    __session: fakeSession(UID, 'demo@ate.local'),
    profiles: [{ id: UID, username: 'demo', username_set: true, bio: 'Trying things out.', is_private: false }],
    favorites: ['Poha', 'Butter Chicken', 'Fruit Custard'].map(n => ({ user_id: UID, recipe_key: key(n) })),
    pantry: [
      ['onion', 'have'], ['tomato', 'have'], ['potato', 'have'], ['green chili', 'have'], ['ginger garlic paste', 'have'],
      ['flattened rice', 'have'], ['semolina', 'have'], ['egg', 'have'], ['milk', 'have'], ['curry leaf', 'have'],
      ['butter', 'low'], ['cilantro', 'low'], ['paneer', 'out'], ['cream', 'out'],
    ].map(([item, state]) => ({ user_id: UID, item, state })),
    shopping_items: [
      { user_id: UID, item: 'paneer', display: 'paneer', checked: false, sources: [{ key: key('Paneer Butter Masala (Restaurant Style)'), name: 'Paneer Butter Masala', amount: '250', unit: 'g' }] },
      { user_id: UID, item: 'banana', display: 'bananas', checked: true, sources: [{ key: 'manual', name: '', amount: '6', unit: '' }] },
    ],
    user_recipes: [{
      id: 'demo-r1', user_id: UID, name: 'Amma’s Rasam', category: 'Main Dish', dietary: ['vegetarian', 'vegan'],
      ingredients: [
        { amount: '2', unit: '', item: 'tomatoes, chopped' }, { amount: '1', unit: 'tsp', item: 'black pepper' },
        { amount: '1', unit: 'tsp', item: 'cumin seeds' }, { amount: '3', unit: 'cup', item: 'water' },
      ],
      steps: ['Boil the tomatoes with the water.', 'Crush the pepper and cumin, add them, and simmer for 10 minutes.'],
      time_minutes: 20, servings: 3,
    }],
    lists: [{ id: 'demo-l1', user_id: UID, name: 'Weekend' }],
    list_items: [{ list_id: 'demo-l1', recipe_key: key('Chicken Biryani (One-Pot)') }],
  })
}
