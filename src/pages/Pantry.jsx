import PantrySection from '../components/PantrySection'
import ShoppingList from '../components/ShoppingList'

/**
 * The Fridge page: what you have, directly above what you still need.
 *
 * Both halves used to sit at the bottom of Profile, behind a bio and a grid of
 * your own recipes. They are the two things you open in a kitchen or a shop,
 * so they get the tab — and Profile goes back to being about you rather than
 * about your groceries.
 */
export default function Pantry() {
  return (
    <div className="max-w-[720px] mx-auto pb-4">
      <div className="border-b border-ink">
        <PantrySection headingId="pantry-page-heading" />
      </div>
      <ShoppingList />
    </div>
  )
}
