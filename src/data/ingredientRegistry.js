/**
 * The ingredient registry: one entry per food the app knows, keyed by a stable id.
 *
 * Ids are the readable names the pantry already stores ("bell pepper",
 * "toor dal"), so existing pantry and shopping rows stay valid. An id never
 * changes once published — rename what's shown, never the id.
 *
 * This file says what things ARE and what can stand in for what. It does not
 * parse prose; ingredients.js does that, and resolveIngredient() (registry.js)
 * turns its output into one of these ids.
 *
 * Fields, all optional except id:
 *   aliases    other names (as canonicalItem() writes them) for the same food
 *   parent     a more general food this is a kind of. A kind can always be
 *              used where the general one is asked for: red onion → onion.
 *   genericOk  the general food (parent) also does for this one: a recipe
 *              asking for red onion is fine with an onion. Off by default —
 *              bread flour is not interchangeable with any flour.
 *   satisfies  other ids this one also covers, one way only: whole eggs give
 *              you yolks; a pot of yolks is not an egg.
 *   madeFrom   ids that together make this, for things you'd make rather
 *              than buy: ginger paste is ready if you have ginger.
 *   orUse      ids that do the same job in a pinch: cooking spray → oil.
 *   never      not a purchase (water). Never counts as missing.
 *
 * Reviewed by hand against every visible catalog line (13 Oct 2026).
 */
const R = []
const e = (id, o = {}) => R.push({ id, ...o })

// ── never bought ──────────────────────────────────────────────
e('water', { never: true, aliases: ['warm water', 'water for cooking', 'chlorine-free water for fermenting', 'chlorine-free water', 'ice water'] })
e('ice', { never: true })

// ── salt, pepper, oils, sugars ────────────────────────────────
e('salt', { aliases: ['salt to taste'] })
e('black salt')
e('black pepper')
e('white pepper', { orUse: ['black pepper'] })
e('neutral oil', { aliases: ['nonstick cooking spray', 'cooking spray'] })
e('olive oil')
e('mustard oil', { aliases: ['mustard seed oil'] })
e('sesame oil', { aliases: ['gingely oil', 'til oil'] })
e('ghee', { orUse: ['butter'] })
e('butter')
e('sugar', { aliases: ['white granulated sugar'] })
e('brown sugar')
e("confectioners' sugar", { aliases: ['powdered sugar', 'icing sugar'] })
e('jaggery')
e('honey')
e('agave nectar')

// ── flours, starches, raising ─────────────────────────────────
e('all-purpose flour', { aliases: ['flour', 'refined flour', 'maida'] })
e('cake flour', { orUse: ['all-purpose flour'] })
e('wheat flour')
e('rice flour')
e('gram flour')
e('semolina', { aliases: ['fine semolina flour', 'semolina flour'] })
e('cornstarch')
e('arrowroot starch', { orUse: ['cornstarch'] })
e('baking powder')
e('baking soda', { aliases: ['soda bicarbonate', 'bicarbonate of soda'] })
e('quick-cooking oat', { aliases: ['oat', 'rolled oat'] })
e('panko', { aliases: ['panko breadcrumb'] })
e('bread')
e('sourdough bread', { aliases: ['7-inch sourdough bread boule', 'sourdough boule'], parent: 'bread' })
e('tortilla')
e('corn tortilla', { parent: 'tortilla', genericOk: true })

// ── rice, pasta, noodles ──────────────────────────────────────
e('rice')
e('white rice', { parent: 'rice', genericOk: true })
e('basmati rice', { parent: 'rice', genericOk: true })
e('long grain white rice', { parent: 'white rice', genericOk: true })
e('brown rice', { parent: 'rice' })
e('sushi rice', { parent: 'rice' })
// Idli rice. "Rice" in an Indian pantry is what you'd use, and earlier live
// testing wanted a pantry of rice to answer it.
e('parboiled rice', { aliases: ['parboiled short-grain rice', 'idli rice'], parent: 'rice', genericOk: true })
e('flattened rice', { aliases: ['poha'] })
e('pasta')
e('ditalini', { aliases: ['dried ditalini'], parent: 'pasta', genericOk: true })
e('fregola sarda', { aliases: ['fregola sarda pasta', 'fregola'], parent: 'pasta' })
e('rice vermicelli', { aliases: ['rice vermicelli noodle', 'rice noodle'] })
e('gyoza')

// ── dals and pulses ───────────────────────────────────────────
// "Urad dal" in an Indian kitchen means the split, skinned white one.
e('urad dal', { aliases: ['white urad dal', 'skinless white urad dal', 'split urad dal', 'black gram', 'skinless black gram'] })
e('whole urad dal', { aliases: ['sabut urad', 'whole black gram'] })
e('toor dal')
e('moong dal', { aliases: ['moong dhal', 'mung dal'] })
e('chana dal')
e('red lentil')
e('lentil')
e('split pea')
e('chickpea')
e('kidney bean')
e('black bean')
e('white bean')
e('black-eyed pea')
e('green pea', { aliases: ['petits poi'] })
e('green bean')

// ── vegetables ────────────────────────────────────────────────
e('onion')
e('red onion', { parent: 'onion', genericOk: true })
e('green onion')
e('shallot', { orUse: ['onion'] })
e('leek')
e('garlic')
e('garlic paste', { madeFrom: ['garlic'] })
e('ginger', { aliases: ['inch piece of ginger', 'inch piece of ginger root', 'very small piece of ginger', 'ginger root'] })
e('ground ginger')
e('ginger paste', { madeFrom: ['ginger'] })
e('ginger-green chili paste', { madeFrom: ['ginger', 'green chili'] })
e('tomato')
e('plum tomato', { parent: 'tomato', genericOk: true })
e('grape tomato', { parent: 'tomato', genericOk: true })
e('cherry tomato', { parent: 'tomato', genericOk: true })
// A kind of tomato for cooking: search for tomato finds it, and a tin answers
// a recipe that says tomato. Fresh tomatoes do for a tin in a pinch too.
e('canned tomato', { aliases: ['tomatoes with juice', 'whole tomatoes with juice', 'tomatoes in juice', 'diced tomato', 'can diced tomato', 'canned diced tomato', 'crushed tomato', 'tinned tomato'], parent: 'tomato', orUse: ['tomato'] })
e('tomato paste')
e('marinara sauce')
e('potato')
e('russet potato', { parent: 'potato', genericOk: true })
e('red potato', { aliases: ['red-skinned potato'], parent: 'potato', genericOk: true })
e('sweet potato')
e('carrot')
e('celery', { aliases: ['celery stalk'] })
e('bell pepper')
e('red bell pepper', { parent: 'bell pepper', genericOk: true })
e('poblano pepper', { aliases: ['poblano chili pepper', 'poblano'] })
e('green chili')
e('red chili', { aliases: ['dry red chili', 'dried red chili'] })
e('fresh red chili', { orUse: ['green chili'] })
e('spinach')
e('baby spinach', { aliases: ['baby spinach leaf'], parent: 'spinach', genericOk: true })
e('cabbage')
e('red cabbage', { parent: 'cabbage', genericOk: true })
e('cauliflower')
e('broccoli', { aliases: ['broccoli floret'] })
e('asparagus')
e('artichoke heart', { aliases: ['frozen artichoke heart'] })
e('zucchini')
e('cucumber')
e('persian cucumber', { parent: 'cucumber', genericOk: true })
e('eggplant')
e('okra')
e('mushroom')
e('butternut squash', { orUse: ['pumpkin'] })
e('pumpkin')
e('mixed vegetables', { aliases: ['boiled vegetable', 'mixed vegetable'] })
e('avocado')
e('coconut', { aliases: ['grated coconut', 'fresh coconut'] })

// ── fruit ─────────────────────────────────────────────────────
e('lemon')
e('lemon juice', { madeFrom: ['lemon'] })
e('lime')
e('lime juice', { madeFrom: ['lime'] })
e('banana', { aliases: ['banana slice', 'mashed banana'] })
e('unsweetened applesauce', { aliases: ['applesauce'] })
e('sultana', { aliases: ['raisin'] })

// ── herbs and leaves ──────────────────────────────────────────
e('cilantro', { aliases: ['fresh cilantro', 'fresh coriander', 'fresh coriander leaf', 'finely-chopped coriander leaf', 'coriander leaf', 'coriander leaves'] })
e('mint')
e('basil')
e('dried basil')
e('parsley')
e('oregano')
e('thyme')
e('rosemary')
e('curry leaf', { aliases: ['kadi patta', 'kadi patta leaf'] })
e('bay leaf')
e('fenugreek leaf')

// ── spices ────────────────────────────────────────────────────
e('turmeric')
e('cumin')
e('cumin seed')
e('coriander')
e('coriander seed')
e('red chili powder')
e('kashmiri red chili powder', { parent: 'red chili powder', genericOk: true })
e('cayenne pepper', { orUse: ['red chili powder'] })
e('paprika', { orUse: ['red chili powder'] })
e('garam masala', { aliases: ['garam masala spice mixture'] })
e('curry powder')
e('chaat masala')
e('sambar powder')
e('malvani masala', { aliases: ['malvani special masala'], orUse: ['garam masala'] })
e('mustard seed')
e('black mustard seed', { parent: 'mustard seed', genericOk: true })
e('fenugreek seed')
e('nigella seed')
e('fennel seed')
e('carom seed')
e('poppy seed')
e('asafoetida')
e('cardamom', { aliases: ['pods green cardamom', 'green cardamom pod'] })
e('cinnamon')
e('clove')
e('nutmeg')
e('star anise')
e('saffron')
e('amchur')
e('italian seasoning')
e("za'atar", { aliases: ["za'atar seasoning"] })
e('furikake')
e('vanilla extract')
e('rosewater', { aliases: ['rose water'] })
e('kewda essence')

// ── dairy and eggs ────────────────────────────────────────────
e('egg', { satisfies: ['egg yolk', 'egg white'] })
e('egg yolk')
e('egg white')
e('milk')
e('buttermilk', { aliases: ['cultured buttermilk', 'glasses cultured buttermilk'] })
e('yogurt', { aliases: ['curds/yogurt', 'natural yogurt', 'curd'] })
e('greek yogurt', { parent: 'yogurt', genericOk: true })
e('cream')
e('heavy cream', { parent: 'cream', genericOk: true })
e('half-and-half')
e('sour cream', { aliases: ['full-fat sour cream'] })
e('cream cheese', { aliases: ['bar cream cheese', 'full-fat block cream cheese'] })
e('neufchatel cheese', { parent: 'cream cheese', genericOk: true })
e('paneer')
e('chenna', { orUse: ['paneer'] })
e('cheddar cheese', { aliases: ['sharp white and yellow cheddar cheese', 'sharp cheddar cheese'] })
e('monterey jack cheese', { aliases: ['monterrey jack cheese'] })
e('pepper jack cheese')
e('mozzarella cheese')
e('parmesan')

// ── meat and fish ─────────────────────────────────────────────
e('chicken')
e('chicken breast', { parent: 'chicken', genericOk: true })
e('chicken thigh', { parent: 'chicken', genericOk: true })
e('ground lamb', { aliases: ['minced lamb', 'lamb mince', 'mutton mince'] })
e('ground beef', { aliases: ['minced beef', 'beef mince'] })
e('minced meat', { aliases: ['meat'] })
e('lamb')
e('mutton')
e('goat')
e('beef')
e('pork')
e('bacon')
e('sausage')
e('turkey')
e('fish')
e('halibut', { aliases: ['halibut fillet'], parent: 'fish' })
e('salmon', { parent: 'fish' })
e('cod', { parent: 'fish' })
e('tuna', { parent: 'fish' })
e('shrimp', { orUse: ['prawn'] })
e('prawn', { orUse: ['shrimp'] })
e('crab')
e('chikuwa')
e('tofu')

// ── stocks, sauces, condiments ────────────────────────────────
e('chicken broth', { aliases: ['low-sodium chicken broth', 'chicken stock'] })
e('vegetable stock', { aliases: ['vegetable broth'] })
e('soy sauce')
e('vinegar')
e('mirin')
e('dry red wine', { aliases: ['red wine'] })
e('limoncello')
e('mayonnaise')
e('ketchup')
e('mustard')
e('pesto')
e('salsa', { aliases: ['store-bought salsa'] })
e('tahini')
e('peanut butter')
e('coconut milk')
e('tamarind', { aliases: ['tamarind concentrate', 'tamarind paste'] })

// ── nuts and sweet things ─────────────────────────────────────
e('almond', { aliases: ['slivered blanched almond', 'slivered almond'] })
e('cashew', { aliases: ['cashew nut'] })
e('peanut', { aliases: ['roasted peanut'] })
e('pistachio')
e('pine nut')
e('walnut')
e('pecan')
e('semi-sweet chocolate', { aliases: ['semi-sweet chocolate chip', 'semisweet chocolate chip', 'chocolate chip'] })
e('white chocolate')
e('cocoa powder', { aliases: ['unsweetened cocoa powder'] })
e('chocolate wafer cookie', { aliases: ['chocolate wafer cooky'] })
e('vanilla buttercream')
e('fermentation starter')

export default R
