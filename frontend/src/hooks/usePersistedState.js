import { useState, useEffect, useRef } from 'react'

const FILTRI_PREFIX = 'filtri.'
const MODE_KEY = 'filtri-persistenza'   // 'sessione' (default) | 'sempre'

/**
 * Restituisce lo Storage da usare per i filtri in base alla preferenza utente.
 * - 'sempre' → localStorage (sopravvive a chiusura browser)
 * - 'sessione' (default) → sessionStorage (si pulisce a chiusura browser)
 */
export function getFilterStorage() {
  if (typeof window === 'undefined') return null
  const mode = window.localStorage.getItem(MODE_KEY)
  return mode === 'sempre' ? window.localStorage : window.sessionStorage
}

// Chiavi extra (non `filtri.*`) che devono seguire la stessa preferenza.
const ALTRE_CHIAVI_MIGRATE = ['tabs.aperti', 'tabs.attivo']

/**
 * Sposta tutte le chiavi gestite dal gestionale (filtri + tab aperti) tra
 * sessionStorage e localStorage in base al nuovo modo.
 * Da chiamare quando l'utente cambia la preferenza.
 */
export function migraFiltri(nuovoModo) {
  if (typeof window === 'undefined') return
  const dst = nuovoModo === 'sempre' ? window.localStorage : window.sessionStorage
  const src = nuovoModo === 'sempre' ? window.sessionStorage : window.localStorage
  const chiavi = [...ALTRE_CHIAVI_MIGRATE]
  for (let i = 0; i < src.length; i++) {
    const k = src.key(i)
    if (k && k.startsWith(FILTRI_PREFIX)) chiavi.push(k)
  }
  for (const k of chiavi) {
    const v = src.getItem(k)
    if (v !== null) {
      dst.setItem(k, v)
      src.removeItem(k)
    }
  }
}

/**
 * useState che mirroring lo stato sullo storage scelto dall'utente
 * (sessionStorage di default, localStorage se l'utente ha attivato
 * "Mantieni filtri al riavvio del browser" nelle impostazioni).
 *
 * Le chiavi vengono auto-prefissate con `filtri.` per identificarle.
 */
export function usePersistedState(key, initial) {
  const fullKey = key.startsWith(FILTRI_PREFIX) ? key : FILTRI_PREFIX + key
  const storeRef = useRef(getFilterStorage())

  const [state, setState] = useState(() => {
    try {
      // Legge dallo storage attuale; in fallback prova l'altro
      // (es. l'utente ha appena cambiato modo e i dati sono ancora di là)
      const primary = storeRef.current?.getItem(fullKey)
      if (primary !== null && primary !== undefined) return JSON.parse(primary)
      const altro = storeRef.current === window.localStorage ? window.sessionStorage : window.localStorage
      const fallback = altro?.getItem(fullKey)
      if (fallback !== null && fallback !== undefined) return JSON.parse(fallback)
      return initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      const store = getFilterStorage()
      storeRef.current = store
      if (state === undefined) store?.removeItem(fullKey)
      else store?.setItem(fullKey, JSON.stringify(state))
    } catch {
      // storage pieno, disabilitato o non serializzabile — ignora silenziosamente
    }
  }, [fullKey, state])

  return [state, setState]
}
