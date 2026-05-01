import { useEffect, useRef, useState } from 'react'

// Mostra una freccia ←/→ in dissolvenza quando l'utente naviga indietro/avanti.
// - Mouse buttons (3 = back, 4 = forward): freccia alla posizione del cursore
// - Browser buttons o scorciatoie tastiera: freccia al centro della pagina
export default function NavArrowOverlay() {
  const [arrow, setArrow] = useState(null) // { dir: 'left'|'right', x, y, key }
  const mouseTrigger = useRef(null) // { x, y } o null
  const lastIdxRef = useRef(null)

  useEffect(() => {
    lastIdxRef.current = window.history.state?.idx ?? null

    // Mouse buttons 3 (back) e 4 (forward): memorizza la posizione del cursore.
    const onMouseDown = (e) => {
      if (e.button === 3 || e.button === 4) {
        mouseTrigger.current = { x: e.clientX, y: e.clientY }
      }
    }

    // TabContext emette questo evento quando spinge un nuovo state SPA: aggiorna l'idx tracciato
    const onNavPush = (e) => {
      lastIdxRef.current = e.detail?.idx ?? null
    }

    const onPopState = (e) => {
      // Solo per i nostri stati SPA con idx (e con sessione corrente: state.session ignorato qui,
      // se è obsoleto TabContext non navigherà comunque, ma noi non vogliamo mostrare la freccia)
      if (!e.state?.spa || typeof e.state.idx !== 'number') return
      const newIdx = e.state.idx
      const oldIdx = lastIdxRef.current ?? newIdx
      lastIdxRef.current = newIdx
      if (newIdx === oldIdx) return
      const dir = newIdx < oldIdx ? 'left' : 'right'

      let x, y
      if (mouseTrigger.current) {
        x = mouseTrigger.current.x
        y = mouseTrigger.current.y
        mouseTrigger.current = null
      } else {
        x = window.innerWidth / 2
        y = window.innerHeight / 2
      }
      setArrow({ dir, x, y, key: Date.now() })
    }

    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('popstate', onPopState)
    window.addEventListener('spa-nav-push', onNavPush)

    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('spa-nav-push', onNavPush)
    }
  }, [])

  useEffect(() => {
    if (!arrow) return
    const t = setTimeout(() => setArrow(null), 1000)
    return () => clearTimeout(t)
  }, [arrow])

  if (!arrow) return null

  const isLeft = arrow.dir === 'left'
  return (
    <div
      key={arrow.key}
      style={{
        position: 'fixed',
        left: arrow.x - 15,
        top: arrow.y - 25,
        width: 30,
        height: 50,
        pointerEvents: 'none',
        zIndex: 9999,
        animation: 'navArrowFade 1s ease-out forwards',
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 30 50" width="30" height="50" fill="none">
        <path
          d={isLeft ? 'M 22 5 L 8 25 L 22 45' : 'M 8 5 L 22 25 L 8 45'}
          stroke="rgba(30, 41, 59, 0.85)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <style>{`
        @keyframes navArrowFade {
          0%   { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.8); }
        }
      `}</style>
    </div>
  )
}
