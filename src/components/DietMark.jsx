import { dietKind } from '../utils/diet'

const MARKS = {
  'veg':     { label: 'Veg',          color: '#1E8E3E', shape: 'dot' },
  'egg':     { label: 'Contains egg', color: '#D98E04', shape: 'dot' },
  'non-veg': { label: 'Non-veg',      color: '#A4342A', shape: 'triangle' },
}

/**
 * The square veg / non-veg mark every Indian cook already reads off a packet:
 * a dot in a square for veg, a triangle for non-veg. Egg gets the dot in
 * amber, the common convention for eggetarian on menus.
 */
export default function DietMark({ recipe, size = 14 }) {
  const { label, color, shape } = MARKS[dietKind(recipe)]
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" role="img" aria-label={label} className="shrink-0">
      <title>{label}</title>
      <rect x="1" y="1" width="12" height="12" rx="2" fill="#fff" stroke={color} strokeWidth="1.6" />
      {shape === 'dot'
        ? <circle cx="7" cy="7" r="3" fill={color} />
        : <path d="M7 3.6 10.4 9.8H3.6Z" fill={color} />}
    </svg>
  )
}
