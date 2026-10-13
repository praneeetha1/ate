import { Stencil } from './Icon'

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
}
export function CategoryDoodle({ category, size = 16, className = '' }) {
  const file = CATEGORY_DOODLE[category]
  return file ? <Stencil file={file} width={size} height={size} aria-hidden="true" className={className} /> : null
}
