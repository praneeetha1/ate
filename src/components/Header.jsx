import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useHideOnScroll } from '../hooks/useHideOnScroll'

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
      className={`bg-paper border-b-2.5 border-ink px-5 py-[19px] text-center sticky top-0 z-[100] transition-transform duration-200 will-change-transform motion-reduce:transition-none ${
        hidden ? '-translate-y-full' : 'translate-y-0'
      }`}
    >
      <Link to="/" className="inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xl">
        <h1 className="font-display text-[2rem] font-bold text-ink leading-none tracking-tight">
          ate<span className="text-accent">.</span>
        </h1>
      </Link>
    </header>
  )
}
