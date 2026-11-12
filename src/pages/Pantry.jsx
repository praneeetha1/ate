import PantrySection from '../components/PantrySection'

/**
 * The Fridge tab: what you have in your kitchen. The shopping list has its own
 * page now, behind the bag in the header, so each button opens one thing.
 */
export default function Pantry() {
  return (
    <div className="max-w-[720px] mx-auto pb-4">
      <PantrySection headingId="pantry-page-heading" />
    </div>
  )
}
