import { it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'

vi.mock('./lib/supabase', () => ({ supabase: {}, configError: null, appUrl: '' }))
const { Splash } = await import('./App')

it('offers a way out when loading never finishes', () => {
  vi.useFakeTimers()
  render(<Splash slowAfter={1000} />)
  expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
  act(() => { vi.advanceTimersByTime(1100) })
  expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  vi.useRealTimers()
})
