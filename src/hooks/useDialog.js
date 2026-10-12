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
// How many dialogs are open, stacked. Each one owns the history entry at its
// depth, so Back closes only the top one.
let openDialogs = 0

/**
 * The phone's Back button closes the dialog instead of leaving the page.
 *
 * Opening pushes a history entry tagged with this dialog's depth; Back pops
 * it, and only the dialog whose entry went away closes. Closing any other way
 * (×, Escape, backdrop) pops the entry itself so Back isn't left with a dead
 * step. Deliberately independent of `enabled`: a dialog stays in the stack
 * while another is stacked over it.
 */
function useBackToClose(onClose) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const depth = ++openDialogs
    // Reuse the entry if it's already ours — a remount (StrictMode, or a
    // dialog replaced by another in the same tick) would otherwise stack a
    // second one and Back would need pressing twice.
    if (window.history.state?.ateDialog !== depth) {
      window.history.pushState({ ...window.history.state, ateDialog: depth }, '')
    }
    let closedByBack = false

    function onPop() {
      if ((window.history.state?.ateDialog ?? 0) >= depth) return
      closedByBack = true
      onCloseRef.current?.()
    }
    window.addEventListener('popstate', onPop)

    return () => {
      window.removeEventListener('popstate', onPop)
      openDialogs--
      if (closedByBack) return
      // Deferred, and skipped if another dialog has taken this depth in the
      // meantime (StrictMode's remount, or one dialog swapping for another).
      // history.back() fixes its target when called, so going back while a
      // replacement is pushing lands one entry too far and closes the
      // replacement as well.
      setTimeout(() => {
        if (openDialogs < depth && window.history.state?.ateDialog === depth) window.history.back()
      }, 0)
    }
  }, [])
}

export function useDialog({ onClose, labelledBy, enabled = true } = {}) {
  const panelRef    = useRef(null)
  const previousRef = useRef(null)
  const titleId     = useId()

  useBackToClose(onClose)

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
