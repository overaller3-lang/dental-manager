// Registry tab → componente. Permette di ricostruire i tab dopo un refresh
// del browser, dato che il riferimento al componente non è serializzabile.
//
// PAGE_REGISTRY: per le voci della sidebar (`pageKey`)
// CATEGORY_REGISTRY: per i tab "fly-in" aperti da bottoni dentro le pagine

import Dashboard from '../pages/Dashboard'
import Pazienti from '../pages/Pazienti'
import Appuntamenti from '../pages/Appuntamenti'
import ListaAttesa from '../pages/ListaAttesa'
import Preventivi from '../pages/Preventivi'
import Ordini, { FormDettaglioOrdine } from '../pages/Ordini'
import Pagamenti from '../pages/Pagamenti'
import Utenti from '../pages/Utenti'
import Log from '../pages/Log'
import RuoliPermessi from '../pages/RuoliPermessi'
import Impostazioni from '../pages/Impostazioni'
import DocumentiClinici from '../pages/DocumentiClinici'
import CartellaPaziente from '../pages/CartellaPaziente'
import SchedaUtente from '../pages/SchedaUtente'
import SchedaAppuntamento from '../pages/SchedaAppuntamento'
import SchedaPreventivo from '../pages/SchedaPreventivo'

export const PAGE_REGISTRY = {
  '/': Dashboard,
  '/pazienti': Pazienti,
  '/appuntamenti': Appuntamenti,
  '/appuntamenti-oggi': Appuntamenti,
  '/lista-attesa': ListaAttesa,
  '/preventivi': Preventivi,
  '/ordini': Ordini,
  '/pagamenti': Pagamenti,
  '/utenti': Utenti,
  '/log': Log,
  '/ruoli-permessi': RuoliPermessi,
  '/impostazioni': Impostazioni,
  '/documenti-clinici': DocumentiClinici,
}

// Solo tab di consultazione/dettaglio. I form di creazione/modifica
// non vengono ripristinati (i dati in compilazione sarebbero comunque persi).
export const CATEGORY_REGISTRY = {
  'scheda-utente': SchedaUtente,
  'scheda-paziente': CartellaPaziente,
  'scheda-appuntamento': SchedaAppuntamento,
  'scheda-preventivo': SchedaPreventivo,
  'ordine-detail': FormDettaglioOrdine,
}

/**
 * True se il tab può essere persistito tra refresh.
 * Restituisce false per i tab "form nuovo X" e per quelli con props non serializzabili.
 */
export function isTabPersistibile(tab) {
  if (!tab) return false
  if (tab.pageKey && PAGE_REGISTRY[tab.pageKey]) return true
  if (tab.category && CATEGORY_REGISTRY[tab.category]) return true
  return false
}

/**
 * Estrae solo i campi serializzabili di un tab e droppa le props non JSON-safe.
 */
export function serializzaTab(tab) {
  return {
    id: tab.id,
    title: tab.title,
    pageKey: tab.pageKey,
    category: tab.category,
    props: propsSerializzabili(tab.props),
  }
}

function propsSerializzabili(props) {
  if (!props || typeof props !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'function') continue        // funzioni non serializzabili
    if (typeof v === 'symbol') continue
    if (v instanceof HTMLElement) continue
    out[k] = v
  }
  return out
}

/**
 * Trova il componente corrispondente a un tab serializzato.
 * @returns {React.ComponentType|null}
 */
export function risolviComponente(tab) {
  if (tab.pageKey && PAGE_REGISTRY[tab.pageKey]) return PAGE_REGISTRY[tab.pageKey]
  if (tab.category && CATEGORY_REGISTRY[tab.category]) return CATEGORY_REGISTRY[tab.category]
  return null
}
