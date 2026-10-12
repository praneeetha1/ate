import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import CookMode from './CookMode'

const recipe = {
  name: 'Dal tadka',
  servings: 2,
  ingredients: [
    { amount: '1', unit: 'cup', item: 'toor dal' },
    { amount: '4', unit: '', item: 'cloves garlic, finely chopped' },
    { amount: '1', unit: 'tsp', item: 'cumin seeds' },
  ],
  steps: [
    'Soak the dal for 30 minutes, then pressure cook.',
    'Fry the cumin seeds and garlic in ghee for 2 minutes.',
    'Pour the tadka over the dal.',
  ],
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.useRealTimers())

describe('CookMode', () => {
  it('opens on a get-ready screen with plan-ahead and the scaled ingredients', () => {
    render(<CookMode recipe={recipe} recipeKey={7} scale={2} onClose={() => {}} />)
    expect(screen.getByText('Get ready')).toBeInTheDocument()
    expect(screen.getByText(/Soak for at least 30 min/)).toBeInTheDocument()
    expect(screen.getByText('2 cup')).toBeInTheDocument()
  })

  it('walks the steps one at a time, with that step’s quantities', () => {
    render(<CookMode recipe={recipe} recipeKey={7} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /start cooking/i }))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
    expect(screen.getByText(recipe.steps[1])).toBeInTheDocument()
    const chips = screen.getByRole('list', { name: /quantities/i })
    expect(chips).toHaveTextContent('1 tspcumin seed')
    expect(chips).toHaveTextContent('4garlic')
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
  })

  it('runs a labelled timer from the step text and rings when it ends', () => {
    vi.useFakeTimers()
    const vibrate = vi.fn()
    navigator.vibrate = vibrate
    render(<CookMode recipe={recipe} recipeKey={7} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /start cooking/i }))
    fireEvent.click(screen.getByRole('button', { name: /start 30 min timer/i }))
    expect(screen.getByText('Step 1 · 30 minutes')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(30 * 60 * 1000 + 1000) })
    expect(screen.getByRole('alert')).toHaveTextContent('Done!')
    expect(vibrate).toHaveBeenCalled()
  })

  it('remembers the step it was left on', () => {
    const { unmount } = render(<CookMode recipe={recipe} recipeKey={7} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /start cooking/i }))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    unmount()
    render(<CookMode recipe={recipe} recipeKey={7} onClose={() => {}} />)
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
  })

  it('closes on the phone’s Back button', async () => {
    const onClose = vi.fn()
    render(<CookMode recipe={recipe} recipeKey={7} onClose={onClose} />)
    expect(window.history.state?.ateDialog).toBe(1)
    window.history.replaceState({}, '')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('CookMode, on messy real-world steps', () => {
  it('ignores describing words and offers each time once', () => {
    const tikka = {
      name: 'Tikka',
      ingredients: [
        { amount: '675', unit: 'g', item: 'skinless and boneless chicken breast' },
        { amount: '2', unit: 'tbsp', item: 'chopped fresh cilantro' },
      ],
      steps: ['Leave the chicken to marinate for 2 hours, or 2 hours more if fresh. Never more than 48 hours.'],
    }
    render(<CookMode recipe={tikka} recipeKey={9} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /start cooking/i }))
    const chips = screen.getByRole('list', { name: /quantities/i })
    expect(chips).toHaveTextContent('chicken')
    expect(chips).not.toHaveTextContent('cilantro')
    expect(screen.getAllByRole('button', { name: /start .* timer/i }).map(b => b.textContent))
      .toEqual(['Start 2 h timer'])
  })
})
