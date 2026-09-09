import PantrySection from '../components/PantrySection'

/**
 * The Fridge / Pantry page.
 *
 * Reached from the fridge icon in the header. The same section also sits on
 * Profile beside the Shopping List — the two belong together, since one is
 * what you have and the other is what you still need — but the pantry earns a
 * direct route as well: it's the thing you check before deciding what to cook,
 * and that shouldn't mean scrolling past your recipes and bio to find it.
 */
export default function Pantry() {
  return (
    <div className="max-w-[720px] mx-auto pb-4">
      <PantrySection headingId="pantry-page-heading" />
    </div>
  )
}
