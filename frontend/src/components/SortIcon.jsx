// Icona di ordinamento per le intestazioni di tabella.
// Mostra ▲/▼ se la colonna è quella attiva, altrimenti ⇅ in grigio.
// Annuncia anche lo stato a screen reader via .sr-only.
export default function SortIcon({ active, dir }) {
  return (
    <>
      <span aria-hidden="true" className={`ml-0.5 text-[10px] ${active ? 'text-blue-600' : 'text-gray-400'}`}>
        {active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
      {active && (
        <span className="sr-only">
          , ordinato {dir === 'asc' ? 'crescente' : 'decrescente'}
        </span>
      )}
    </>
  )
}
