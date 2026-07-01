import { tagStyles } from '../utils/recipe'

export default function Tag({ category }) {
  return (
    <span className={`inline-block text-[0.68rem] font-bold tracking-[0.08em] uppercase px-2.5 py-[3px] rounded-xl ${tagStyles(category)}`}>
      {category}
    </span>
  )
}
