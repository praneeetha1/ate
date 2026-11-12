import ShoppingList from '../components/ShoppingList'

/** The shopping list, on its own: the header's bag opens it from anywhere. */
export default function Shopping() {
  return (
    <div className="max-w-[720px] mx-auto pb-4">
      <ShoppingList />
    </div>
  )
}
