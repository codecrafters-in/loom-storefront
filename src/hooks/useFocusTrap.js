import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/**
 * For a dialog: keyboard focus moves into it when it opens, Tab and Shift+Tab
 * stay inside it, and focus goes back to whatever opened it when it closes.
 * Without this a keyboard or screen-reader user tabs straight past an open
 * drawer into the page behind it.
 *
 * Returns the ref to put on the dialog element (give it `tabIndex={-1}`).
 */
export default function useFocusTrap(active = true) {
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    if (!active || !node || typeof document === 'undefined') return undefined
    const previous = document.activeElement
    const items = () => [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0)

    const start = node.querySelector('[data-autofocus]') || items()[0] || node
    // After the opening transition has started, so a sliding panel is not scrolled into view mid-slide.
    const timer = setTimeout(() => start.focus({ preventScroll: true }), 30)

    const onKey = (e) => {
      if (e.key !== 'Tab') return
      const list = items()
      if (!list.length) {
        e.preventDefault()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    node.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      node.removeEventListener('keydown', onKey)
      if (previous?.focus && document.contains(previous)) previous.focus({ preventScroll: true })
    }
  }, [active])

  return ref
}
