import { useEffect, useRef, useState } from 'react'
import { useTabs } from '../context/TabContext'

const CATEGORY_INACTIVE = {
  paziente:          'bg-green-100 border-green-400 text-green-700 hover:bg-green-200 hover:text-green-900',
  'scheda-paziente': 'bg-teal-100 border-teal-400 text-teal-700 hover:bg-teal-200 hover:text-teal-900',
  appuntamento:      'bg-blue-100 border-blue-400 text-blue-700 hover:bg-blue-200 hover:text-blue-900',
  utente:            'bg-amber-100 border-amber-400 text-amber-700 hover:bg-amber-200 hover:text-amber-900',
  'scheda-utente':   'bg-violet-100 border-violet-400 text-violet-700 hover:bg-violet-200 hover:text-violet-900',
  preventivo:        'bg-purple-100 border-purple-400 text-purple-700 hover:bg-purple-200 hover:text-purple-900',
  ordine:            'bg-orange-100 border-orange-400 text-orange-700 hover:bg-orange-200 hover:text-orange-900',
  pagamento:         'bg-indigo-100 border-indigo-400 text-indigo-700 hover:bg-indigo-200 hover:text-indigo-900',
}
const CATEGORY_ACTIVE = {
  paziente:          'bg-gradient-to-b from-green-100 to-white text-green-900',
  'scheda-paziente': 'bg-gradient-to-b from-teal-100 to-white text-teal-900',
  appuntamento:      'bg-gradient-to-b from-blue-100 to-white text-blue-900',
  utente:            'bg-gradient-to-b from-amber-100 to-white text-amber-900',
  'scheda-utente':   'bg-gradient-to-b from-violet-100 to-white text-violet-900',
  preventivo:        'bg-gradient-to-b from-purple-100 to-white text-purple-900',
  ordine:            'bg-gradient-to-b from-orange-100 to-white text-orange-900',
  pagamento:         'bg-gradient-to-b from-indigo-100 to-white text-indigo-900',
}
const DEFAULT_INACTIVE = 'bg-gray-200 border-gray-500 text-gray-500 hover:bg-gray-300 hover:text-gray-700'
const DEFAULT_ACTIVE = 'bg-white text-gray-900'

// Pulsante "▾ Schede" + dropdown con tutte le tab aperte. Compare solo
// quando lo strip va in overflow orizzontale (alcune tab non sono piu'
// visibili senza scroll). Permette di switchare velocemente a una tab
// nascosta senza dover scrollare la barra.
function MenuOverflow({ tabs, activeId, switchTab, closeTab, scripContainerRef }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const seleziona = (id) => {
    switchTab(id)
    setOpen(false)
    // Scroll della tab in vista nello strip per coerenza visiva
    requestAnimationFrame(() => {
      const el = scripContainerRef.current?.querySelector(`[data-tabid="${id}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    })
  }

  return (
    <div ref={wrapperRef} className="flex-shrink-0 self-end mb-px relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Tutte le schede aperte"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${tabs.length} schede aperte`}
        className="px-2 py-0.5 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors whitespace-nowrap"
      >
        ▾ {tabs.length}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 w-72 max-h-[60vh] overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg py-1"
        >
          <div className="px-3 py-1.5 text-xs font-medium text-gray-500 border-b border-gray-100">
            Schede aperte ({tabs.length})
          </div>
          {tabs.map(tab => {
            const isActive = tab.id === activeId
            return (
              <div
                key={tab.id}
                role="menuitem"
                onClick={() => seleziona(tab.id)}
                className={`flex items-center justify-between gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50 ${isActive ? 'bg-blue-100 font-medium' : ''}`}
              >
                <span className="truncate flex-1">{tab.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                  aria-label={`Chiudi ${tab.title}`}
                  className="text-red-400 hover:text-red-600 leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-red-50 flex-shrink-0 text-lg"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function TabBar() {
  const { tabs, activeId, closeTab, closeAllTabs, switchTab } = useTabs()
  const tablistRef = useRef(null)
  const stripRef = useRef(null)
  const [hasOverflow, setHasOverflow] = useState(false)

  // Misura overflow dello strip: se la larghezza richiesta dalle tab supera
  // quella disponibile compare il pulsante ▾ con la lista completa.
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const check = () => setHasOverflow(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tabs])

  const handleTabKeyDown = (e, tabId) => {
    const idx = tabs.findIndex(t => t.id === tabId)
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const next = tabs[(idx + 1) % tabs.length]
      switchTab(next.id)
      tablistRef.current?.querySelector(`[data-tabid="${next.id}"]`)?.focus()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prev = tabs[(idx - 1 + tabs.length) % tabs.length]
      switchTab(prev.id)
      tablistRef.current?.querySelector(`[data-tabid="${prev.id}"]`)?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      switchTab(tabs[0].id)
      tablistRef.current?.querySelector(`[data-tabid="${tabs[0].id}"]`)?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      const last = tabs[tabs.length - 1]
      switchTab(last.id)
      tablistRef.current?.querySelector(`[data-tabid="${last.id}"]`)?.focus()
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {tabs.length > 0 ? (
        <>
          {/* Tab strip */}
          <div className="bg-gray-100 flex-shrink-0 relative" role="tablist" aria-label="Moduli aperti" ref={tablistRef}>
            <div className="flex items-end">
              {tabs.length >= 2 && (
                <button
                  onClick={closeAllTabs}
                  aria-label="Chiudi tutte le schede"
                  className="flex-shrink-0 self-end mb-px ml-2 px-2 py-0.5 text-xs font-bold text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors whitespace-nowrap"
                >
                  Chiudi tutte
                </button>
              )}
            <div ref={stripRef} className="flex-1 flex items-end gap-0 px-2 pt-1.5 overflow-x-auto scrollbar-none min-w-0">
              {tabs.map(tab => {
                const isActive = activeId === tab.id
                return (
                  <div
                    key={tab.id}
                    role="tab"
                    id={`tab-${tab.id}`}
                    aria-selected={isActive}
                    aria-controls={`tabpanel-${tab.id}`}
                    tabIndex={isActive ? 0 : -1}
                    data-tabid={tab.id}
                    onClick={() => switchTab(tab.id)}
                    onKeyDown={e => handleTabKeyDown(e, tab.id)}
                    className={`flex items-center gap-1 px-2 text-sm rounded-t-lg cursor-pointer select-none whitespace-nowrap transition-colors min-w-0 ${
                      isActive
                        ? `border border-gray-800 border-b-0 relative z-[3] py-1.5 flex-shrink-0 ${tab.category ? CATEGORY_ACTIVE[tab.category] ?? DEFAULT_ACTIVE : DEFAULT_ACTIVE}`
                        : `border flex-shrink basis-[200px] ${tab.category ? CATEGORY_INACTIVE[tab.category] ?? DEFAULT_INACTIVE : DEFAULT_INACTIVE} py-1`
                    }`}
                    style={!isActive ? { minWidth: '80px' } : undefined}
                  >
                    <span className="truncate min-w-0">{tab.title}</span>
                    <button
                      onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
                      aria-label={`Chiudi ${tab.title}`}
                      tabIndex={0}
                      className="text-red-400 hover:text-red-600 leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-red-50 flex-shrink-0 text-lg"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>
                )
              })}
            </div>
            {hasOverflow && (
              <MenuOverflow
                tabs={tabs}
                activeId={activeId}
                switchTab={switchTab}
                closeTab={closeTab}
                scripContainerRef={stripRef}
              />
            )}
            </div>

            {/* Linea separatrice */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-800 z-[2]" aria-hidden="true" />
          </div>

          {/* Pannelli contenuto */}
          <div className="flex-1 overflow-hidden relative">
            {tabs.map(tab => (
              <div
                key={tab.id}
                role="tabpanel"
                id={`tabpanel-${tab.id}`}
                aria-labelledby={`tab-${tab.id}`}
                hidden={tab.id !== activeId}
                className={`absolute inset-0 overflow-y-auto bg-gray-50 ${tab.id === activeId ? '' : 'hidden'}`}
              >
                <tab.Component {...tab.props} onClose={() => closeTab(tab.id)} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center" role="status">
          <div className="text-center text-gray-400">
            <p className="text-4xl mb-3" aria-hidden="true">🦷</p>
            <p className="text-base font-medium text-gray-500">Seleziona un modulo</p>
            <p className="text-sm mt-1">Usa la barra laterale per navigare</p>
          </div>
        </div>
      )}
    </div>
  )
}
