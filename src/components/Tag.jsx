import { tagStyles } from '../utils/recipe'

export default function Tag({ category }) {
  return (
    <span className={`inline-block text-[0.63rem] font-extrabold tracking-[0.06em] uppercase px-2.5 py-[1px] rounded-full ${tagStyles(category)}`}>
      {category}
    </span>
  )
}
