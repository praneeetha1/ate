import { Stencil, sketchUrl } from './Icon'

/**
 * Pieces of the hand-drawn sheet that aren't icons: the wordmark, the
 * handwritten digits, and the food doodles that stand for categories.
 * All stencils, so they take the surrounding text colour.
 */

const LOGO_RATIO = 2.19
const DIGIT_RATIO = { 0: 0.83, 1: 0.68, 2: 0.84, 3: 0.81, 4: 0.63, 5: 0.84, 6: 0.9, 7: 0.69, 8: 0.71, 9: 0.82 }

/** The drawn "ate." */
export function Logo({ height = 34, className = '' }) {
  return <Stencil file="logo" width={Math.round(height * LOGO_RATIO)} height={height} role="img" aria-label="ate." className={className} />
}

/**
 * A number in your handwriting, composed digit by digit, so step 35 works
 * even though only 0–9 were drawn. Read out as the plain number.
 */
export function HandNumber({ value, height = 18, className = '' }) {
  const digits = String(value).split('')
  return (
    <span role="img" aria-label={String(value)} className={`inline-flex items-end gap-[1px] ${className}`}>
      {digits.map((d, i) => (
        <Stencil key={i} file={`d${d}`} width={Math.round(height * (DIGIT_RATIO[d] ?? 0.8))} height={height} aria-hidden="true" />
      ))}
    </span>
  )
}

/** The doodle drawn for a category, when there is one. */
const CATEGORY_DOODLE = {
  'Main Dish': 'cat-main', 'Breakfast': 'cat-breakfast', 'Dessert': 'cat-dessert',
  'Soup & Stew': 'cat-soup', 'Vegetarian': 'cat-veg', 'Salad': 'cat-veg',
  'Drink': 'cat-drink', 'Bread & Baking': 'cat-bread', 'Pasta & Noodles': 'cat-pasta',
  'Quick Meal': 'cat-quick', 'Snack & Appetizer': 'cat-snack',
}

/**
 * Doodles drawn in colour come as two files: `name.png`, the lines (a stencil,
 * so they turn cream in dark mode like every other drawing), and
 * `name-fill.png`, the colour that sits underneath. One without a fill file
 * is drawn in ink alone.
 */
const HAS_FILL = new Set([
  'cat-breakfast', 'cat-main', 'cat-quick', 'cat-snack', 'cat-veg',
  'grp-produce', 'grp-dairy', 'grp-meat', 'grp-grains', 'grp-herbs',
  'grp-spices', 'grp-dals', 'grp-flours',
])

/**
 * A food doodle, in colour when it has one and `colour` allows it.
 *
 * A coloured one keeps its black lines in both themes, as drawn; in dark mode
 * it gets a cut-out sticker edge instead (see .doodle-sticker in index.css),
 * so it sits on the dark page like a sticker rather than losing its outline.
 */
export function Doodle({ file, size = 32, colour = true, className = '' }) {
  if (!colour || !HAS_FILL.has(file)) {
    return <Stencil file={file} width={size} height={size} aria-hidden="true" className={className} />
  }
  return (
    <span
      aria-hidden="true"
      className={`doodle-sticker relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size, '--stk': `${Math.max(1, Math.round(size / 26))}px` }}
    >
      <img src={sketchUrl(`${file}-fill`)} alt="" draggable="false" className="absolute inset-0 w-full h-full" />
      <Stencil file={file} width={size} height={size} className="absolute inset-0" style={{ backgroundColor: 'rgb(28 27 25)' }} />
    </span>
  )
}

/** Whether a course's doodle is drawn in colour (so it can be shown at full strength). */
export const doodleInColour = (category, fallback) => HAS_FILL.has(CATEGORY_DOODLE[category] || fallback)
export function CategoryDoodle({ category, size = 16, className = '', fallback }) {
  const file = CATEGORY_DOODLE[category] || fallback
  // Colour needs room: on a 14px tag it turns to mud, so small ones stay ink.
  return file ? <Doodle file={file} size={size} colour={size >= 20} className={className} /> : null
}
