import { useEffect, useState } from 'react'

// Quick-return chrome: hide on scroll down, reveal on scroll up. Scrolling
// down reads as "I'm browsing, get out of the way"; scrolling up is a
// navigation intent, so the header comes straight back rather than making the
// user travel to the top of the list for it.

// Ignore sub-pixel and jitter-sized deltas, or a trackpad's tail-off would
// flap the header.
const DELTA = 6

export function useHideOnScroll({ revealAbove = 0, resetKey } = {}) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    // A route change puts us back at the top of a fresh list, so the header
    // starts visible again.
    setHidden(false)

    let last  = window.scrollY
    let frame = 0

    function read() {
      frame = 0
      const y = window.scrollY

      // Near the top the header is always shown, whatever the direction —
      // this also covers a scroll-to-top that arrives in small steps.
      if (y <= revealAbove) { last = y; setHidden(false); return }

      // iOS rubber-banding overshoots past both ends and would otherwise
      // register as a direction change on release.
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (y < 0 || y > max) { last = y; return }

      const diff = y - last
      if (Math.abs(diff) < DELTA) return
      last = y
      setHidden(diff > 0)
    }

    function onScroll() {
      if (!frame) frame = requestAnimationFrame(read)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [revealAbove, resetKey])

  return hidden
}
