import { useState, useMemo } from 'react'

// Hook condiviso per ordinare le tabelle dell'app.
// Restituisce stato di ordinamento, handler e l'array già ordinato.
//
// Modalità:
// - client (default): l'hook ordina l'array `items` lato browser. Va bene
//   solo se l'array contiene già tutti i record dell'entità (no paginazione
//   server-side), perché altrimenti si ordina solo la pagina visibile.
// - server: passa `{ server: true }` come quarto argomento. L'hook tiene
//   solo lo stato sortBy/sortDir e restituisce items invariato; spetta al
//   chiamante propagare i due valori all'API (es. `ordina_per` e
//   `direzione` come query parameter) e affidarsi al server per restituire
//   il dataset già ordinato e paginato.
export function useTableSort(items, defaultSort = null, defaultDir = 'asc', { server = false } = {}) {
  const [sortBy, setSortBy] = useState(defaultSort)
  const [sortDir, setSortDir] = useState(defaultDir)

  const handleSort = (campo) => {
    if (sortBy === campo) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(campo); setSortDir('asc') }
  }

  const sortedItems = useMemo(() => {
    const arr = items ?? []
    if (server || !sortBy) return arr
    return [...arr].sort((a, b) => {
      const va = a?.[sortBy] ?? ''
      const vb = b?.[sortBy] ?? ''
      const cmp = String(va).localeCompare(String(vb), 'it', { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [items, sortBy, sortDir, server])

  return { sortBy, sortDir, handleSort, sortedItems }
}

// Helper JSX per l'icona di ordinamento (deve essere usato dentro un componente).
export function sortIconClass(active) {
  return `ml-0.5 text-[10px] ${active ? 'text-blue-500' : 'text-gray-300'}`
}
