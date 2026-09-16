/**
 * A tiny stand-in catalog for the UI behaviour tests.
 *
 * Those tests are about whether search, the pantry box and the ranking filters
 * *work* — not about what the real catalog happens to contain. Pointing them
 * at `src/data/recipes.json` coupled them to its contents, so curating the
 * catalog broke ten of them at once, and several couldn't be repointed at all
 * (the "Drink" pills have nothing to assert against once no drink is visible).
 *
 * The real catalog is still exercised where that's the actual subject:
 * `recipe.test.js` and `ingredients.test.js` check it directly.
 *
 * Deliberately includes the awkward shapes those tests were written to guard:
 *   - several phrasings of egg, so one canonical name has to win
 *   - a hyphenated product whose compound must survive canonicalisation
 *   - a plural the singulariser can't reach ("diced tomatoes in juice")
 *   - mains (chicken, shrimp) for the must-use chips
 *   - enough categories, times and diet tags for the filter rows
 */
const r = (name, category, ingredients, opts = {}) => ({
  name,
  category,
  dietary: opts.dietary || [],
  ingredients: ingredients.map(i =>
    typeof i === 'string' ? { amount: '1', unit: '', item: i } : i),
  steps: opts.steps || [
    `Prepare everything for the ${name.toLowerCase()}.`,
    'Cook it through, stirring now and then so nothing catches.',
    'Taste, adjust the seasoning, and serve.',
  ],
  servings: opts.servings ?? 4,
  ...(opts.timeMinutes ? { timeMinutes: opts.timeMinutes } : {}),
})

export default [
  r('Tomato and garlic pasta', 'Pasta & Noodles',
    ['tomato', 'garlic', 'olive oil', 'spaghetti', 'basil'], { timeMinutes: 25, dietary: ['vegetarian'] }),
  r('Old Fashioned Vegetable Soup', 'Soup & Stew',
    ['diced tomatoes in juice', 'carrot', 'celery', 'onion', 'vegetable stock'], { timeMinutes: 50, dietary: ['vegetarian'] }),
  r('Sun-dried tomato tart', 'Main Dish',
    ['sun-dried tomatoes', 'puff pastry', 'goat cheese', 'thyme'], { timeMinutes: 40, dietary: ['vegetarian'] }),
  r('Roast chicken', 'Main Dish',
    ['chicken', 'lemon', 'garlic', 'butter', 'black pepper'], { timeMinutes: 90 }),
  r('Chicken and rice', 'Main Dish',
    ['boneless chicken breast', 'rice', 'onion', 'stock'], { timeMinutes: 45 }),
  r('Garlic shrimp', 'Quick Meal',
    ['shrimp', 'garlic', 'butter', 'parsley'], { timeMinutes: 15 }),
  r('Shrimp noodles', 'Pasta & Noodles',
    ['shrimp', 'noodles', 'spring onion', 'soy sauce'], { timeMinutes: 20 }),
  r('Potato hash', 'Breakfast',
    ['potato', 'onion', 'paprika', 'eggs'], { timeMinutes: 30, dietary: ['vegetarian'] }),
  r('Baked eggs', 'Breakfast',
    ['large egg', 'cream', 'chives', 'butter'], { timeMinutes: 20, dietary: ['vegetarian'] }),
  r('Meringue', 'Dessert',
    ['egg white', 'sugar', 'vanilla extract'], { timeMinutes: 120, dietary: ['vegetarian'] }),
  r('Custard', 'Dessert',
    ['egg yolk', 'milk', 'sugar', 'vanilla extract'], { timeMinutes: 35, dietary: ['vegetarian'] }),
  r('Lemonade', 'Drink',
    ['lemon', 'sugar', 'water'], { timeMinutes: 10, dietary: ['vegetarian', 'vegan'] }),
  r('Iced tea', 'Drink',
    ['tea', 'lemon', 'sugar'], { timeMinutes: 10, dietary: ['vegetarian', 'vegan'] }),
  r('Paneer curry', 'Main Dish',
    ['paneer', 'tomato', 'onion', 'garam masala', 'ginger'], { timeMinutes: 35, dietary: ['vegetarian'] }),
  // The decoy for word-boundary matching: searching "pepper" must not reach it.
  r('Peppermint bark', 'Dessert',
    ['peppermint extract', 'dark chocolate', 'sugar'], { timeMinutes: 60, dietary: ['vegetarian'] }),
  r('Masala omelette', 'Breakfast',
    ['eggs', 'onion', 'green chili', 'turmeric'], { timeMinutes: 15, dietary: ['vegetarian'] }),
  r('Potato salad', 'Salad',
    ['potato', 'mayonnaise', 'spring onion'], { timeMinutes: 25, dietary: ['vegetarian'] }),
]
