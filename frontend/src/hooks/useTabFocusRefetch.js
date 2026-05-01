import { useEffect, useRef } from 'react'

// Esegue le funzioni di refetch ogni volta che l'utente attiva una tab.
// Usa una ref per evitare lo stale-closure problem con array spread.
export function useTabFocusRefetch(...refetchFns) {
  const fnsRef = useRef(refetchFns)
  fnsRef.current = refetchFns

  useEffect(() => {
    const handler = () => fnsRef.current.forEach(fn => fn?.())
    window.addEventListener('dental-tab-activated', handler)
    return () => window.removeEventListener('dental-tab-activated', handler)
  }, [])
}
