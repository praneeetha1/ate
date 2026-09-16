import { useEffect, useMemo } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useHideOnScroll } from '../hooks/useHideOnScroll'
import { useApp } from '../context/AppContext'
import Icon from './Icon'

// Read the one source of truth for the header height (--header-h) so the
// reveal threshold can't drift from the CSS. Cached — getComputedStyle forces
// a style recalc, and this value doesn't change at runtime.
let cachedHeight = 0
function headerHeight() {
  if (!cachedHeight) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--header-h')
    cachedHeight = parseInt(raw, 10) || 72
  }
  return cachedHeight
}

export default function Header() {
  const { pathname } = useLocation()
  const hidden = useHideOnScroll({ revealAbove: headerHeight(), resetKey: pathname })

  // Only what's still outstanding: a list you've ticked your way through
  // shouldn't keep claiming there are twelve things to buy.
  const { shoppingItems } = useApp()
  const toBuy = useMemo(
    () => [...shoppingItems.values()].filter(r => !r.checked).length,
    [shoppingItems],
  )

  // The wordmark is identity, not function, so it scrolls away — but the
  // filter bars below it are stateful controls and stay pinned. They read this
  // attribute to close the 72px gap the hidden header leaves behind.
  useEffect(() => {
    document.documentElement.dataset.headerHidden = hidden ? 'true' : 'false'
    return () => { delete document.documentElement.dataset.headerHidden }
  }, [hidden])

  // py keeps the header at --header-h (72px) now that the tagline is gone —
  // the sticky filter bars in Home/Search offset by that exact value.
  return (
    <header
      className={`relative bg-paper border-b-2.5 border-ink px-5 py-[19px] text-center sticky top-0 z-[100] transition-transform duration-200 will-change-transform motion-reduce:transition-none ${
        hidden ? '-translate-y-full' : 'translate-y-0'
      }`}
    >
      <Link to="/" className="inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xl">
        <h1 className="font-display text-[2rem] font-bold text-ink leading-none tracking-tight">
          ate<span className="text-accent">.</span>
        </h1>
      </Link>

      {/* Absolutely positioned so the wordmark stays optically centred and the
          header keeps its exact --header-h, which the sticky filter bars
          offset against.

          It goes to the same page as the Fridge tab, so the count is what
          earns it a place: how much is left to buy, visible from anywhere,
          which a nav tab can't tell you. Without anything outstanding it's a
          plain shortcut and stays quiet. */}
      <NavLink
        to="/pantry"
        aria-label={toBuy
          ? `Shopping list, ${toBuy} ${toBuy === 1 ? 'item' : 'items'} to buy`
          : 'Shopping list'}
        title="Shopping list"
        className={({ isActive }) =>
          `absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            isActive
              ? 'border-2 border-ink bg-accent text-ink shadow-pop'
              : 'text-warm-tan hover:text-accent-dk hover:bg-card'
          }`
        }
      >
        <Icon name="cart" size={20} />
        {toBuy > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 grid place-items-center rounded-full bg-heart text-card border-2 border-paper text-[0.62rem] font-extrabold leading-none"
          >{toBuy > 9 ? '9+' : toBuy}</span>
        )}
      </NavLink>
    </header>
  )
}
