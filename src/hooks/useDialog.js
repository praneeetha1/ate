import { useEffect, useRef, useId } from 'react'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Wires up the behaviour a modal dialog needs to be usable without a mouse.
 *
 * Every modal in the app previously rendered as a bare <div>: no dialog role,
 * no focus management, and Tab would walk straight out of the modal into the
 * page behind it.
 *
 * Returns props to spread onto the backdrop and the dialog panel, plus an id to
 * put on the element that names the dialog.
 *
 * Pass `enabled: false` while a nested dialog is open on top of this one, so the
 * two traps don't fight over focus and a single Escape doesn't dismiss both.
 */
export function useDialog({ onClose, labelledBy, enabled = true } = {}) {
  const panelRef    = useRef(null)
  const previousRef = useRef(null)
  const titleId     = useId()

  useEffect(() => {
    if (!enabled) return
    previousRef.current = document.activeElement

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Move focus into the dialog so a screen reader announces it and Tab starts
    // from inside. Prefer an explicitly autofocused control if there is one.
    const panel = panelRef.current
    const preferred = panel?.querySelector('[autofocus]')
    const first     = preferred || panel?.querySelector(FOCUSABLE)
    ;(first || panel)?.focus?.()

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return

      const items = [...panelRef.current.querySelectorAll(FOCUSABLE)]
        .filter(el => el.offsetParent !== null)
      if (!items.length) return

      const firstItem = items[0]
      const lastItem  = items[items.length - 1]

      // Cycle within the dialog instead of escaping to the page behind it.
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      // Return focus to whatever opened the dialog.
      previousRef.current?.focus?.()
    }
  }, [onClose, enabled])

  return {
    titleId,
    /** Spread onto the full-screen backdrop. */
    backdropProps: {
      onMouseDown: e => { if (enabled && e.target === e.currentTarget) onClose?.() },
    },
    /** Spread onto the dialog panel itself. */
    panelProps: {
      ref: panelRef,
      role: 'dialog',
      'aria-modal': true,
      'aria-labelledby': labelledBy || titleId,
      tabIndex: -1,
      // Clicks inside must not reach the backdrop's dismiss handler.
      onMouseDown: e => e.stopPropagation(),
    },
  }
}
