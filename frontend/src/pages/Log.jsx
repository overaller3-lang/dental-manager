import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { usePersistedState } from '../hooks/usePersistedState'
import dayjs from 'dayjs'

const coloreOperazione = {
  INSERT: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  LOGIN: 'bg-purple-100 text-purple-700',
  LOGOUT: 'bg-gray-100 text-gray-600',
  ACCESS_DENIED: 'bg-orange-100 text-orange-700',
}

export default function Log() {
  const [pagina, setPagina] = usePersistedState('log.pagina', 1)
  const [cerca, setCerca] = usePersistedState('log.cerca', '')
  const [filtroOperazione, setFiltroOperazione] = usePersistedState('log.filtroOperazione', '')
  const [filtroModulo, setFiltroModulo] = usePersistedState('log.filtroModulo', '')
  const [sortBy, setSortBy] = usePersistedState('log.sortBy', null)
  const [sortDir, setSortDir] = usePersistedState('log.sortDir', 'asc')

  const handleSort = (campo) => {
    if (sortBy === campo) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(campo); setSortDir('asc') }
  }
  const si = (campo) => (
    <><span aria-hidden="true" className={`ml-0.5 text-[10px] ${sortBy === campo ? 'text-blue-600' : 'text-gray-400'}`}>
      {sortBy === campo ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>{sortBy === campo && <span className="sr-only">, ordinato {sortDir === 'asc' ? 'crescente' : 'decrescente'}</span>}</>
  )

  const { data, isLoading } = useQuery({
    queryKey: ['log', pagina, cerca, filtroOperazione, filtroModulo, sortBy, sortDir],
    queryFn: async () => {
      const params = new URLSearchParams({ pagina, per_pagina: 50 })
      if (cerca) params.append('cerca', cerca)
      if (filtroOperazione) params.append('operazione', filtroOperazione)
      if (filtroModulo) params.append('modulo', filtroModulo)
      if (sortBy) { params.append('ordina_per', sortBy); params.append('direzione', sortDir) }
      const res = await api.get(`/log/eventi?${params}`)
      return res.data
    }
  })

  return (
    <div className="p-3">
      <div className="mb-3">
        <h1 className="text-xl font-bold text-gray-900">Log di Sistema</h1>
        <p className="text-gray-500 text-xs mt-0.5">Audit trail completo</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
        <strong>Nota GDPR:</strong> Questo registro è mantenuto in conformità al Regolamento UE 2016/679 (GDPR) art. 9
        per la tracciabilità degli accessi e delle modifiche ai dati sanitari (categoria speciale).
        Accesso riservato agli amministratori di sistema.
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-3 flex gap-2 items-center">
        <input
          type="text"
          value={cerca}
          onChange={e => { setCerca(e.target.value); setPagina(1) }}
          placeholder="Cerca per username, tabella, modulo, ID record..."
          className={`flex-1 min-w-0 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${cerca ? 'filtro-attivo' : 'border-gray-300'}`}
          aria-label="Cerca log"
        />
        <select value={filtroOperazione} onChange={e => { setFiltroOperazione(e.target.value); setPagina(1) }}
          className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${filtroOperazione ? 'filtro-attivo' : 'border-gray-300'}`}>
          <option value="">Tutte le operazioni</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
          <option value="LOGIN">LOGIN</option>
          <option value="LOGOUT">LOGOUT</option>
          <option value="ACCESS_DENIED">ACCESS DENIED</option>
        </select>
        <select value={filtroModulo} onChange={e => { setFiltroModulo(e.target.value); setPagina(1) }}
          className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${filtroModulo ? 'filtro-attivo' : 'border-gray-300'}`}>
          <option value="">Tutti i moduli</option>
          <option value="auth">Auth</option>
          <option value="pazienti">Pazienti</option>
          <option value="appuntamenti">Appuntamenti</option>
          <option value="preventivi">Preventivi</option>
          <option value="ordini">Ordini</option>
          <option value="pagamenti">Pagamenti</option>
          <option value="utenti">Utenti</option>
        </select>
        {(cerca || filtroOperazione || filtroModulo) && (
          <button onClick={() => { setCerca(''); setFiltroOperazione(''); setFiltroModulo(''); setPagina(1) }}
            className="px-3 py-2 text-xs font-medium bg-orange-100 border border-orange-700 rounded-lg hover:bg-orange-200 whitespace-nowrap">
            ↻ Reset
          </button>
        )}
      </div>

      <div className="tbl-count">{data?.items?.length ?? 0} risultati{data?.totale != null && data.totale !== data?.items?.length ? ` di ${data.totale}` : ''}</div>
      <div className="tbl-card">
        {isLoading ? (
          <div className="tbl-empty">Caricamento...</div>
        ) : !data?.items?.length ? (
          <div className="tbl-empty">Nessun evento trovato</div>
        ) : (
          <table className="tbl">
            <thead className="tbl-thead">
              <tr>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('created_at')}>Timestamp {si('created_at')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('utente_username')}>Utente {si('utente_username')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('operazione')}>Operazione {si('operazione')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('modulo')}>Modulo {si('modulo')}</th>
                <th scope="col" className="tbl-th">Tabella</th>
                <th scope="col" className="tbl-th">Record</th>
                <th scope="col" className="tbl-th">Esito</th>
              </tr>
            </thead>
            <tbody className="tbl-tbody">
              {/* Ordinamento server-side: backend restituisce gia' ordinato */}
              {(data?.items ?? []).map(e => (
                <tr key={e.id}>
                  <td className="tbl-td text-xs text-gray-500 whitespace-nowrap">
                    {dayjs(e.created_at).format('DD/MM/YYYY HH:mm:ss')}
                  </td>
                  <td className="tbl-td text-gray-600">{e.utente_username || '—'}</td>
                  <td className="tbl-td">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${coloreOperazione[e.operazione] || 'bg-gray-100 text-gray-600'}`}>
                      {e.operazione}
                    </span>
                  </td>
                  <td className="tbl-td text-gray-600">{e.modulo || '—'}</td>
                  <td className="tbl-td text-gray-600">{e.tabella || '—'}</td>
                  <td className="tbl-td text-gray-600">{e.record_id || '—'}</td>
                  <td className="tbl-td">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.successo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {e.successo ? '✓ OK' : '✗ Errore'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data?.pagine_totali > 1 && (
          <div className="tbl-pagination">
            <p className="text-sm text-gray-500">Pagina {pagina} di {data.pagine_totali}</p>
            <div className="flex gap-2">
              <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50">← Precedente</button>
              <button onClick={() => setPagina(p => Math.min(data.pagine_totali, p + 1))} disabled={pagina === data.pagine_totali} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50">Successiva →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
