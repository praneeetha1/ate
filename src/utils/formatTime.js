// 1345 → "22 h 25 min". Raw minutes read badly once a recipe needs an overnight ferment.
export function formatDuration(mins) {
  const m = Math.round(Number(mins))
  if (!Number.isFinite(m) || m <= 0) return ''
  const h = Math.floor(m / 60), r = m % 60
  if (h === 0) return `${m} min`
  return r ? `${h} h ${r} min` : `${h} h`
}

// `activeMinutes` (optional) splits hands-on time from waiting, e.g. idli.
export function formatRecipeTime(recipe) {
  const total = recipe?.timeMinutes
  if (!(total > 0)) return ''
  const a = recipe.activeMinutes
  if (a > 0 && a < total) return `${formatDuration(a)} active + ${formatDuration(total - a)} wait`
  return formatDuration(total)
}
