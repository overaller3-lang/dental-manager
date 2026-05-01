import { useEffect, useRef } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function FocusTrap({ children }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const focusable = Array.from(el.querySelectorAll(FOCUSABLE))
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const previously = document.activeElement

    first?.focus()

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return
      if (focusable.length === 0) { e.preventDefault(); return }
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }

    // Chiudi con Escape (il gestore onClose va passato dal parent)
    el.addEventListener('keydown', onKeyDown)
    return () => {
      el.removeEventListener('keydown', onKeyDown)
      previously?.focus()
    }
  }, [])

  return <div ref={ref}>{children}</div>
}
