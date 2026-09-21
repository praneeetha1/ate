/**
 * Does this text plausibly contain a recipe?
 *
 * A cheap gate in front of the model. The importer used to send any YouTube
 * description over 40 characters to Groq, so "Thanks for watching! Follow me
 * on Instagram, shot on a Sony ZV-E10, music by Epidemic Sound" cost a call
 * before anything could notice it wasn't a recipe. Free-tier quota is the
 * scarce thing here, and this spends none of it: the title and description
 * already arrived together in one YouTube API response.
 *
 * Deliberately biased toward letting things through. A false positive costs
 * one model call that the `{error}` and empty-result backstops already handle
 * gracefully; a false negative refuses a recipe the user actually wanted, with
 * no way for them to argue. So the bar is two weak signals, and the model
 * stays the real judge.
 *
 * This reads the description too, not just the title. Plenty of genuine
 * cooking videos are called "Amma's Sunday Special" or "the only thing I eat
 * for breakfast" — no signal in the title at all, with a full ingredients list
 * underneath. Judging on the title alone would reject exactly those.
 *
 * Pure and dependency-free so the test suite can reach it; index.ts touches
 * Deno globals at module scope and can't be imported under vitest.
 */

/**
 * Near-conclusive on its own. A page that says "ingredients" is describing
 * food, and one that says "recipe" is claiming to be this exact thing.
 */
const STRONG = /\b(?:ingredients?|recipes?)\b/i

/**
 * A number followed by a cooking unit — "2 tbsp", "1/2 cup", "200g".
 *
 * Longest alternative first, always: with `g` ahead of `grams?` the regex
 * engine takes the short match and leaves "rams" behind. That ordering bug
 * silently corrupted 375 lines of this importer's output once already.
 *
 * The unit must follow a number. A bare "cloves" or "cup" is an ordinary
 * English word and matches far too much prose.
 */
const QUANTITY =
  /\b\d[\d/.,]*\s*(?:teaspoons?|tablespoons?|tsps?|tbsps?|cups?|kilograms?|kgs?|grams?|millilit(?:re|er)s?|lit(?:re|er)s?|ml|ounces?|oz|pounds?|lbs?|pinch(?:es)?|cloves?|handfuls?|g)\b/i

/** The furniture of a written recipe. */
const STRUCTURE =
  /\b(?:methods?|instructions?|directions?|preparation|prep time|cook(?:ing)? time|total time|serves|servings?|yields?|makes \d)\b/i

/** Things you do to food. Stems, so "boiling" and "roasted" both count. */
const VERBS =
  /\b(?:preheat|marinat|saut|simmer|boil|knead|temper|roast|fry|fried|grill|bake|bakin|whisk|blend|grind|grate|steam|chop|dice|mince|soak|drain|braise|poach|blanch|garnish|simmer|stir|sprinkle|drizzle|strain|shallow[- ]fry|deep[- ]fry|stir[- ]fry)\w*/i

/**
 * Food itself — Indian cooking vocabulary first, since that's what this app is
 * for, then the everyday ingredients any cuisine leans on.
 */
const FOOD =
  /\b(?:masala|paneer|daa?l|dhal|curr(?:y|ies)|rotis?|chapat[hi]+|naan|chutney|biryani|pulao|sab?zi|subzi|tadka|ghee|jeera|haldi|atta|besan|idli|dosas?|sambar|rasam|poha|upma|khichdi|raita|kheer|halwa|lassi|samosas?|pakoras?|tikka|korma|rajma|chole|parathas?|dahi|paneer|chicken|mutton|prawns?|fish|rice|potato(?:es)?|onions?|tomato(?:es)?|garlic|ginger|flour|butter|eggs?|milk|sugar|salt|oil|cheese|chill?i(?:es|s)?|coriander|cumin|turmeric|yogh?urt|curd|lentils?|spices?|batter|dough|gravy|marinade)\b/i

/** How many *different* foods are named. One mention is chat; a list is a recipe. */
function distinctFoods(text: string): number {
  const seen = new Set<string>()
  // matchAll clones the regex, so the shared /g instance keeps no lastIndex
  // between calls.
  for (const m of text.matchAll(new RegExp(FOOD.source, 'gi'))) {
    seen.add(m[0].toLowerCase())
  }
  return seen.size
}

/**
 * True if the text is worth spending a model call on.
 *
 * One strong word is enough; otherwise two independent weak signals, so a
 * travel vlog that mentions fish once doesn't qualify but a description
 * listing "onions, tomatoes, chopped" does.
 *
 * Three different foods count as two signals by themselves. Measured, not
 * guessed: with a flat one-per-group score the title "Paneer Butter Masala"
 * was refused, and so was the very common Shorts description that lists
 * ingredients with no quantities and no prose — "poha, onion, mustard seeds,
 * turmeric". Both are real recipes, and refusing those is the one failure the
 * user can't work around. The cost of the change is that a street-food tour
 * now reaches the model; that's a single wasted call the backstops absorb.
 */
export function looksLikeRecipe(text: string): boolean {
  const t = String(text || '')
  if (STRONG.test(t)) return true

  let signals = 0
  if (QUANTITY.test(t))  signals++
  if (STRUCTURE.test(t)) signals++
  if (VERBS.test(t))     signals++

  const foods = distinctFoods(t)
  if (foods >= 3)     signals += 2
  else if (foods >= 1) signals++

  return signals >= 2
}
