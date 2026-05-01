import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTabs } from '../context/TabContext'
import UserAvatar from './UserAvatar'
import Dashboard from '../pages/Dashboard'
import Pazienti from '../pages/Pazienti'
import Appuntamenti from '../pages/Appuntamenti'
import ListaAttesa from '../pages/ListaAttesa'
import PianiCura from '../pages/PianiCura'
import DocumentiClinici from '../pages/DocumentiClinici'
import Preventivi from '../pages/Preventivi'
import Ordini from '../pages/Ordini'
import Pagamenti from '../pages/Pagamenti'
import Fiscale from '../pages/Fiscale'
import Utenti from '../pages/Utenti'
import Log from '../pages/Log'
import Impostazioni from '../pages/Impostazioni'
import RuoliPermessi from '../pages/RuoliPermessi'

const voci = [
  { key: '/', label: 'Dashboard', icona: '🏠', Component: Dashboard, ruoli: [] },
  { key: '/lista-attesa', label: "Lista d'attesa", icona: '⏳', Component: ListaAttesa, ruoli: [] },
  { sep: true },
  // Anagrafica e cartelle
  { key: '/pazienti', label: 'Pazienti', icona: '👤', Component: Pazienti, ruoli: [] },
  { key: '/piani-cura', label: 'Piani di cura', icona: '🩺', Component: PianiCura, ruoli: [] },
  { key: '/documenti-clinici', label: 'Documenti clinici', icona: '🩹', Component: DocumentiClinici, ruoli: [] },
  { sep: true },
  // Agenda e amministrativo
  { key: '/appuntamenti', label: 'Appuntamenti', icona: '📅', Component: Appuntamenti, ruoli: [] },
  { key: '/preventivi', label: 'Preventivi', icona: '📋', Component: Preventivi, ruoli: [] },
  { key: '/ordini', label: 'Ordini', icona: '🧾', Component: Ordini, ruoli: [] },
  { key: '/pagamenti', label: 'Pagamenti', icona: '💳', Component: Pagamenti, ruoli: [] },
  { key: '/fiscale', label: 'Fiscale', icona: '📄', Component: Fiscale, ruoli: [] },
  { sep: true },
  // Sistema (admin)
  { key: '/utenti', label: 'Utenti', icona: '👥', Component: Utenti, ruoli: ['admin'] },
  { key: '/log', label: 'Log Sistema', icona: '📊', Component: Log, ruoli: ['admin'] },
  { key: '/ruoli-permessi', label: 'Ruoli e Permessi', icona: '🔐', Component: RuoliPermessi, ruoli: ['admin'] },
  { sep: true },
  { key: '/impostazioni', label: 'Impostazioni', icona: '⚙️', Component: Impostazioni, ruoli: [] },
]

export default function Sidebar() {
  const { utente, logout, hasRole } = useAuth()
  const { openPage, activePageKey } = useTabs()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    // Reload completo: scarta TabContext, cache TanStack Query e ogni altro
    // stato in-memory residuo della sessione precedente
    window.location.href = '/login'
  }

  const vociVisibili = voci.filter(v =>
    v.sep || v.ruoli.length === 0 || v.ruoli.some(r => hasRole(r))
  )

  return (
    <aside className="w-[200px] text-white flex flex-col h-full flex-shrink-0" style={{ backgroundColor: 'rgb(50, 50, 50)' }} aria-label="Barra laterale">
      {/* Logo */}
      <div className="px-2 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-xl">🦷</span>
          <div>
            <p className="font-bold text-base leading-tight">Dental Manager</p>
            <p className="text-gray-400 text-xs">Gestionale Studio Dentistico</p>
          </div>
        </div>
      </div>

      {/* Navigazione */}
      <nav className="flex-1 p-1.5 space-y-0.5 overflow-y-auto" aria-label="Navigazione principale">
        {vociVisibili.map((voce, i) => {
          if (voce.sep) return <hr key={`sep-${i}`} className="border-gray-700 my-1.5" />
          const isActive = activePageKey === voce.key
          return (
            <button
              key={voce.key}
              onClick={() => openPage(voce.key, voce.label, voce.Component, {})}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                isActive
                  ? 'bg-gray-700 text-white font-semibold border-l-4 border-white pl-2'
                  : 'text-gray-200 hover:bg-gray-700 hover:text-white border-l-4 border-transparent pl-2'
              }`}
            >
              <span aria-hidden="true">{voce.icona}</span>
              <span>{voce.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Utente e logout */}
      <div className="p-1.5 border-t border-gray-700">
        <div className="flex items-center gap-2 mb-2" aria-label={`Utente: ${utente?.nome} ${utente?.cognome}`}>
          <UserAvatar utente={utente} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{utente?.nome} {utente?.cognome}</p>
            <p className="text-xs text-gray-400 truncate">{utente?.ruoli?.[0]}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 hover:text-white rounded-lg transition-colors"
        >
          <span aria-hidden="true">🚪</span> Esci
        </button>
      </div>
    </aside>
  )
}
