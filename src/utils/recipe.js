import { parseFrac, fmtFrac } from './fractions'

export const TAG_COLORS = {
  'Main-Dish':        'bg-[#D5EBD8] text-[#2A6035]',
  'Breakfast':        'bg-[#FDE9C5] text-[#8B5C00]',
  'Dessert':          'bg-[#F9D8E0] text-[#8B2040]',
  'Side-Dish':        'bg-[#D8EDF5] text-[#1A5470]',
  'Soup--Stew':       'bg-[#F5E2CB] text-[#7A3D10]',
  'Salad':            'bg-[#DFF2DA] text-[#2A5E30]',
  'Quick-Meal':       'bg-[#EDE2F5] text-[#5A2A80]',
  'Vegetarian':       'bg-[#D8F0E5] text-[#1A6040]',
  'Snack--Appetizer': 'bg-[#FFF0C5] text-[#7A5A00]',
  'Drink':            'bg-[#D8E8FF] text-[#1A3A80]',
}

export function tagKey(cat) {
  return cat.replace(/\s+/g, '-').replace(/[&]/g, '-')
}

export function tagStyles(cat) {
  return TAG_COLORS[tagKey(cat)] || 'bg-warm-tan text-ink'
}

export function ingredientLabel(ing, scale = 1) {
  const n   = parseFrac(ing.amount)
  const amt = n != null ? fmtFrac(n * scale) : ing.amount
  return {
    measure: [amt, ing.unit].filter(Boolean).join(' '),
    item:    ing.item,
  }
}

export function applyFilters(pairs, dietFilter, timeFilter) {
  return pairs.filter(({ r }) => {
    if (dietFilter && !(r.dietary || []).includes(dietFilter)) return false
    if (timeFilter && (!r.timeMinutes || r.timeMinutes > Number(timeFilter))) return false
    return true
  })
}
