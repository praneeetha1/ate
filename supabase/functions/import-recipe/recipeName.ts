/**
 * Trimming a page or video title down to the dish.
 *
 * Publishers title for search, not for a recipe card. "How To Make Macarons
 * Recipe by Tasty" arrived as a recipe name and rendered as the heading,
 * and YouTube is worse — "EASY Paneer Butter Masala | Restaurant Style |
 * Chef Someone". The model is asked to strip this in SYSTEM, but it's a small
 * free-tier model and it doesn't always comply, so this runs over whatever
 * comes back.
 *
 * Deliberately conservative. It removes only furniture that carries no
 * information about the dish — the alternative is mangling a real name, and a
 * wrong name is worse than a long one. Adjectives ("easy", "authentic",
 * "restaurant style") are left to the model's judgement rather than a word
 * list, because "Bombay" and "best" are not distinguishable by regex.
 *
 * Never returns empty: if the rules eat the whole string, the original stands.
 */
export function cleanRecipeName(raw: string): string {
  const original = String(raw || '').trim()
  if (!original) return ''

  // "Butter Chicken | Restaurant Style | Chef X" — everything after the first
  // pipe is channel and SEO. Dashes are NOT split on: "Aloo Gobi - Potato and
  // Cauliflower Curry" uses one to join two halves of a real name.
  let s = original.split(/\s*[|•·]\s*/)[0]

  s = s.replace(/\p{Extended_Pictographic}/gu, ' ')
  s = s.replace(/^\s*how\s+to\s+(?:make|cook|prepare)\s+/i, '')

  // Attribution before the trailing "Recipe", so "Macarons Recipe by Tasty"
  // loses "by Tasty" first and "Recipe" becomes strippable. The exclusions are
  // method, not authorship — without them "Pasta by Hand" became "Pasta".
  s = s.replace(/\s+by\s+(?!hand\b|heart\b|eye\b|weight\b|volume\b)[^,|]+$/i, '')
  s = s.replace(/[\s,–—-]*\brecipes?\b\s*$/i, '')

  s = s.replace(/\s+/g, ' ').replace(/^[\s,.:–—-]+|[\s,.:–—-]+$/g, '').trim()

  return s || original
}
