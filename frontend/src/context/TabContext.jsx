import { createContext, useContext, useReducer, useCallback, useEffect, useRef, useState } from 'react'
import { isTabPersistibile, serializzaTab, risolviComponente } from '../utils/tabRegistry'
// Tab persistibili = tab di consultazione (Pazienti, Ordini, scheda paziente, …).
// I tab "form Nuovo X" non lo sono e quindi non sporcano la history del browser.

const TabContext = createContext(null)

const TABS_STORAGE_KEY = 'tabs.aperti'
const ACTIVE_STORAGE_KEY = 'tabs.attivo'

/** Restituisce lo storage scelto in base alla preferenza filtri (sessione/sempre). */
function getTabStorage() {
  if (typeof window === 'undefined') return null
  const mode = window.localStorage.getItem('filtri-persistenza')
  return mode === 'sempre' ? window.localStorage : window.sessionStorage
}

/** Carica i tab salvati e ricostruisce il riferimento a Component. */
function caricaTabSalvati() {
  if (typeof window === 'undefined') return { tabs: [], activeId: null }
  try {
    const store = getTabStorage()
    const raw = store?.getItem(TABS_STORAGE_KEY)
    const activeId = store?.getItem(ACTIVE_STORAGE_KEY) || null
    if (!raw) return { tabs: [], activeId: null }
    const salvati = JSON.parse(raw)
    if (!Array.isArray(salvati)) return { tabs: [], activeId: null }
    const tabs = salvati
      .map(s => {
        const Component = risolviComponente(s)
        if (!Component) return null
        return { id: s.id, title: s.title, Component, props: s.props || {}, pageKey: s.pageKey, category: s.category }
      })
      .filter(Boolean)
    const validActive = tabs.find(t => t.id === activeId)?.id || (tabs[0]?.id ?? null)
    return { tabs, activeId: validActive }
  } catch {
    return { tabs: [], activeId: null }
  }
}

function salvaTabs(tabs, activeId) {
  try {
    const store = getTabStorage()
    if (!store) return
    const persistibili = tabs.filter(isTabPersistibile).map(serializzaTab)
    store.setItem(TABS_STORAGE_KEY, JSON.stringify(persistibili))
    if (activeId) store.setItem(ACTIVE_STORAGE_KEY, String(activeId))
    else store.removeItem(ACTIVE_STORAGE_KEY)
  } catch {
    // ignora silenziosamente (storage pieno, ecc.)
  }
}

let _tabSeq = 0
const newTabId = () => {
  _tabSeq += 1
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `tab-${crypto.randomUUID()}`
  }
  return `tab-${Date.now()}-${_tabSeq}`
}

function tabsReducer(state, action) {
  switch (action.type) {
    case 'OPEN_PAGE': {
      const { key, title, Component, props } = action
      const existing = state.tabs.find(t => t.pageKey === key)
      if (existing) {
        return { ...state, activeId: existing.id }
      }
      const id = newTabId()
      return {
        tabs: [...state.tabs, { id, title, Component, props, pageKey: key }],
        activeId: id,
      }
    }
    case 'OPEN_TAB': {
      const { title, Component, props, insertAfterId, category, pageKey } = action
      const id = newTabId()
      const tab = { id, title, Component, props, category, pageKey }
      let newTabs
      const idx = insertAfterId ? state.tabs.findIndex(t => t.id === insertAfterId) : -1
      if (idx !== -1) {
        newTabs = [...state.tabs.slice(0, idx + 1), tab, ...state.tabs.slice(idx + 1)]
      } else {
        newTabs = [...state.tabs, tab]
      }
      return { tabs: newTabs, activeId: id }
    }
    case 'CLOSE_TAB': {
      const idx = state.tabs.findIndex(t => t.id === action.id)
      const newTabs = state.tabs.filter(t => t.id !== action.id)
      const newActiveId = state.activeId !== action.id
        ? state.activeId
        : newTabs.length === 0 ? null : newTabs[Math.max(0, idx - 1)].id
      return { tabs: newTabs, activeId: newActiveId }
    }
    case 'CLOSE_ALL_TABS': {
      return { tabs: [], activeId: null }
    }
    case 'SWITCH_TAB': {
      return { ...state, activeId: action.id }
    }
    default:
      return state
  }
}

export function TabProvider({ children }) {
  const [{ tabs, activeId }, dispatch] = useReducer(tabsReducer, undefined, caricaTabSalvati)
  const [confirmDuplicate, setConfirmDuplicate] = useState(null)

  // Mirroring tabs su storage (sessionStorage o localStorage in base alla preferenza)
  useEffect(() => {
    salvaTabs(tabs, activeId)
  }, [tabs, activeId])

  const tabsRef = useRef(tabs)
  const activeIdRef = useRef(activeId)
  const confirmDuplicateRef = useRef(confirmDuplicate)
  // Cronologia tab in stile Word undo/redo: array di tabId con un indice di posizione.
  // Aprire/cliccare un tab: navHistory[idx+1..] viene troncato e activeId pushato in coda.
  // Indietro/avanti: idx-- / idx++ e si attiva navHistory[idx].
  const navHistoryRef = useRef([])
  const navIdxRef = useRef(-1)
  const isProgrammaticRef = useRef(false)
  // sessionId cambia quando svuotiamo la cronologia (es. chiudi tutte le schede).
  // Le entries di history del browser con sessionId obsoleto vengono ignorate dal popstate.
  const sessionIdRef = useRef(Date.now())

  useEffect(() => {
    tabsRef.current = tabs
    activeIdRef.current = activeId
    confirmDuplicateRef.current = confirmDuplicate
  })

  // Registra ogni cambio di tab attivo in navHistory (tranne quelli causati da back/forward)
  useEffect(() => {
    if (!activeId) return
    if (isProgrammaticRef.current) {
      isProgrammaticRef.current = false
      return
    }
    // Tronca forward e push
    navHistoryRef.current = navHistoryRef.current.slice(0, navIdxRef.current + 1)
    navHistoryRef.current.push(activeId)
    navIdxRef.current = navHistoryRef.current.length - 1
    // Sincronizza con la history del browser per supportare i pulsanti back/forward del browser
    // e i tasti del mouse. Replace al primo, push ai successivi.
    const stato = { spa: true, idx: navIdxRef.current, session: sessionIdRef.current }
    if (history.state?.spa && history.state?.session === sessionIdRef.current) history.pushState(stato, '')
    else history.replaceState(stato, '')
    // Notifica NavArrowOverlay (e altri eventuali listener) del nuovo idx
    window.dispatchEvent(new CustomEvent('spa-nav-push', { detail: { idx: navIdxRef.current } }))
  }, [activeId])

  // Ascolta back/forward dal browser/mouse/tastiera
  useEffect(() => {
    const handlePop = (e) => {
      if (!e.state?.spa) return
      // Ignora entries di una sessione precedente (es. dopo "chiudi tutte le schede")
      if (e.state.session !== sessionIdRef.current) return
      const newIdx = e.state.idx
      if (typeof newIdx !== 'number' || newIdx === navIdxRef.current) return
      const tabId = navHistoryRef.current[newIdx]
      if (!tabId) return
      // Salta entry il cui tab non esiste più (tab chiuso): non cambiare nulla
      if (!tabsRef.current.find(t => t.id === tabId)) return
      navIdxRef.current = newIdx
      isProgrammaticRef.current = true
      dispatch({ type: 'SWITCH_TAB', id: tabId })
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  // Quando un tab viene chiuso, rimuovilo da navHistory e aggiusta l'indice
  useEffect(() => {
    const tabIds = new Set(tabs.map(t => t.id))
    const oldHistory = navHistoryRef.current
    const oldIdx = navIdxRef.current
    if (oldHistory.every(id => tabIds.has(id))) return  // niente da pulire
    let newIdx = -1
    const newHistory = []
    oldHistory.forEach((id, i) => {
      if (tabIds.has(id)) {
        newHistory.push(id)
        if (i <= oldIdx) newIdx = newHistory.length - 1
      }
    })
    navHistoryRef.current = newHistory
    navIdxRef.current = newIdx
  }, [tabs])

  useEffect(() => {
    if (activeId) window.dispatchEvent(new CustomEvent('dental-tab-activated'))
  }, [activeId])

  const openPage = useCallback((key, title, Component, props = {}) => {
    dispatch({ type: 'OPEN_PAGE', key, title, Component, props })
  }, [])

  const openTab = useCallback((title, Component, props = {}, category = '') => {
    dispatch({ type: 'OPEN_TAB', title, Component, props, insertAfterId: activeIdRef.current, category })
  }, [])

  const openTabDedup = useCallback((title, Component, props = {}, category = '', pageKey) => {
    if (pageKey) {
      const existing = tabsRef.current.find(t => t.pageKey === pageKey)
      if (existing) {
        dispatch({ type: 'SWITCH_TAB', id: existing.id })
        setConfirmDuplicate({ title, Component, props, category })
        return
      }
    }
    dispatch({ type: 'OPEN_TAB', title, Component, props, insertAfterId: activeIdRef.current, category, pageKey })
  }, [])

  const confirmOpenDuplicate = useCallback(() => {
    if (!confirmDuplicateRef.current) return
    const { title, Component, props, category } = confirmDuplicateRef.current
    dispatch({ type: 'OPEN_TAB', title, Component, props, insertAfterId: activeIdRef.current, category })
    setConfirmDuplicate(null)
  }, [])

  const dismissDuplicate = useCallback(() => setConfirmDuplicate(null), [])

  const closeTab = useCallback((id) => {
    dispatch({ type: 'CLOSE_TAB', id })
  }, [])

  const closeAllTabs = useCallback(() => {
    dispatch({ type: 'CLOSE_ALL_TABS' })
    // Svuota la cronologia e invalida le entries di history del browser per questa sessione
    navHistoryRef.current = []
    navIdxRef.current = -1
    sessionIdRef.current = Date.now()
    history.replaceState({ spa: true, idx: -1, session: sessionIdRef.current }, '')
  }, [])

  const switchTab = useCallback((id) => {
    dispatch({ type: 'SWITCH_TAB', id })
  }, [])

  const activePageKey = tabs.find(t => t.id === activeId)?.pageKey ?? null

  return (
    <TabContext.Provider value={{
      tabs, activeId, activePageKey,
      openPage, openTab, openTabDedup, closeTab, closeAllTabs, switchTab,
      confirmDuplicate, confirmOpenDuplicate, dismissDuplicate,
    }}>
      {children}
    </TabContext.Provider>
  )
}

export const useTabs = () => useContext(TabContext)
