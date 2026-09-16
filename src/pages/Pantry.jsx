import PantrySection from '../components/PantrySection'
import ShoppingList from '../components/ShoppingList'

/**
 * The Fridge page: what you still need, then what you already have.
 *
 * The shopping list leads. It's the half you open standing in a shop, while
 * the pantry is maintenance you do occasionally — "read-mostly", as the notes
 * put it. It used to sit underneath, behind a hundred-odd quick-add and staple
 * chips, which put the thing you actually use several screens down.
 */
export default function Pantry() {
  return (
    <div className="max-w-[720px] mx-auto pb-4">
      <div className="border-b border-ink">
        <ShoppingList />
      </div>
      <PantrySection headingId="pantry-page-heading" />
    </div>
  )
}
