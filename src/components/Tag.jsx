import { CategoryDoodle } from './Sketch'

/**
 * A category, in ink: outline, the doodle drawn for it when there is one, and
 * the name. The rainbow fills are gone — colour is kept for things that mean
 * something (veg / non-veg, pantry state, warnings).
 */
export default function Tag({ category }) {
  return (
    <span className="inline-flex items-center gap-1 text-[0.63rem] font-extrabold tracking-[0.06em] uppercase px-2 py-[1px] rounded border-[1.5px] border-ink bg-card text-ink">
      <CategoryDoodle category={category} size={14} />
      {category}
    </span>
  )
}
