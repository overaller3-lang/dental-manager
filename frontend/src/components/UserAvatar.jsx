import { coloreAvatar } from '../utils/colori'

// Padding e font-size per ogni size — il rettangolo si adatta alle iniziali.
const SIZE = {
  xs: 'text-[10px] px-1 py-[1px]',
  sm: 'text-xs px-1.5 py-[2px]',
  md: 'text-sm px-2 py-0.5',
  lg: 'text-base px-2.5 py-1',
}

/**
 * Etichetta rettangolare con le iniziali dell'utente.
 * Il rettangolo si adatta strettamente alle iniziali.
 * Colore: `utente.colore_avatar` o derivato deterministicamente.
 */
export default function UserAvatar({ utente, size = 'sm' }) {
  if (!utente) return null
  const iniziali = `${utente.cognome?.[0] || ''}${utente.nome?.[0] || ''}`.toUpperCase()
  const colore = coloreAvatar(utente)
  return (
    <span
      className={`${SIZE[size] || SIZE.sm} rounded-md inline-flex items-center justify-center text-white font-bold leading-none shrink-0 tracking-tight`}
      style={{ backgroundColor: colore }}
      aria-hidden="true"
    >
      {iniziali}
    </span>
  )
}
