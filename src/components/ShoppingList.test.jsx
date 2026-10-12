import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ShoppingList from './ShoppingList'

const items = new Map([
  ['onion', { item: 'onion', display: 'Onion', checked: false, sources: [] }],
  ['milk',  { item: 'milk',  display: 'Milk',  checked: true,  sources: [] }],
])
vi.mock('../context/AppContext', () => ({ useApp: () => ({ shoppingItems: items }) }))
vi.mock('../context/PantryContext', () => ({ usePantry: () => ({}) }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({}) }))

describe('ShoppingList share', () => {
  it('shares only what is still to buy', async () => {
    const share = vi.fn().mockResolvedValue()
    navigator.share = share
    render(<ShoppingList />)
    fireEvent.click(screen.getByRole('button', { name: 'Share shopping list' }))
    await waitFor(() => expect(share).toHaveBeenCalled())
    const { text } = share.mock.calls[0][0]
    expect(text).toContain('Onion')
    expect(text).not.toContain('Milk')
    delete navigator.share
  })
})
