import { dietKind } from '../utils/diet'
import { sketchUrl } from './Icon'

const MARKS = {
  'veg':     { label: 'Veg',          file: 'veg' },
  'egg':     { label: 'Contains egg', file: 'egg' },
  'non-veg': { label: 'Non-veg',      file: 'nonveg' },
}

/**
 * The square veg / non-veg mark every Indian cook already reads off a packet,
 * hand-drawn: a green dot for veg, an amber dot for egg, a red triangle for
 * non-veg. Shape as well as colour, so it reads without colour too.
 */
export default function DietMark({ recipe, size = 14 }) {
  const { label, file } = MARKS[dietKind(recipe)]
  return <img src={sketchUrl(file)} width={size} height={size} alt={label} title={label} className="shrink-0" />
}
