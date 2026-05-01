import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { usePersistedState } from '../hooks/usePersistedState'
import dayjs from 'dayjs'
import { useTabs } from '../context/TabContext'
import { classeEnum, labelEnum } from '../utils/colori'

export function FormRegistraPagamento({ onClose }) {
  const [form, setForm] = useState({
    ordine_id: '', paziente_id: '', importo: '',
    metodo: 'contanti', note: '', riferimento_transazione: ''
  })
  const [errore, setErrore] = useState('')
  const queryClient = useQueryClient()

  const { data: ordini } = useQuery({
    queryKey: ['ordini-aperti'],
    queryFn: async () => {
      const res = await api.get('/ordini?stato=confermato&per_pagina=100')
      return res.data.items
    }
  })

  const registraMutation = useMutation({
    mutationFn: (dati) => api.post('/pagamenti', dati, { _silent: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pagamenti'] })
      queryClient.invalidateQueries({ queryKey: ['riepilogo-pagamenti'] })
      onClose()
    },
    onError: (e) => setErrore(e.response?.data?.detail || 'Errore nel salvataggio')
  })

  const handleOrdineChange = (ordineId) => {
    const ordine = ordini?.find(o => o.id === parseInt(ordineId))
    setForm({ ...form, ordine_id: parseInt(ordineId), paziente_id: ordine?.paziente_id || '', importo: ordine?.totale_residuo || '' })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setErrore('')
    registraMutation.mutate(form)
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 max-w-md">
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">Ordine <span className="text-red-500">*</span></label>
        <select value={form.ordine_id} onChange={e => handleOrdineChange(e.target.value)}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" required>
          <option value="">Seleziona ordine...</option>
          {ordini?.map(o => (
            <option key={o.id} value={o.id}>
              {o.numero} — {o.paziente_cognome} {o.paziente_nome} — Residuo: €{Number(o.totale_residuo).toFixed(2)}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">Importo <span className="text-red-500">*</span></label>
        <input type="number" step="0.01" min="0.01" value={form.importo} onChange={e => setForm({ ...form, importo: e.target.value })}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" required />
      </div>
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">Metodo di pagamento <span className="text-red-500">*</span></label>
        <select value={form.metodo} onChange={e => setForm({ ...form, metodo: e.target.value })}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
          <option value="contanti">Contanti</option>
          <option value="carta_credito">Carta di Credito</option>
          <option value="carta_debito">Carta di Debito</option>
          <option value="bonifico">Bonifico</option>
          <option value="assegno">Assegno</option>
        </select>
      </div>
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">Riferimento transazione</label>
        <input type="text" value={form.riferimento_transazione} onChange={e => setForm({ ...form, riferimento_transazione: e.target.value })}
          placeholder="es. TXN-12345"
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
      </div>
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">Note</label>
        <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" rows={2} />
      </div>
      {errore && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-4">{errore}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Annulla</button>
        <button type="submit" disabled={registraMutation.isPending} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
          {registraMutation.isPending ? 'Registrazione...' : 'Registra Pagamento'}
        </button>
      </div>
    </form>
  )
}

export default function Pagamenti() {
  const [pagina, setPagina] = usePersistedState('pagamenti.pagina', 1)
  const [cerca, setCerca] = usePersistedState('pagamenti.cerca', '')
  const [filtroMetodo, setFiltroMetodo] = usePersistedState('pagamenti.filtroMetodo', '')
  const [sortBy, setSortBy] = usePersistedState('pagamenti.sortBy', null)
  const [sortDir, setSortDir] = usePersistedState('pagamenti.sortDir', 'asc')
  const queryClient = useQueryClient()
  const { openTab } = useTabs()

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
    queryKey: ['pagamenti', pagina, cerca, filtroMetodo, sortBy, sortDir],
    queryFn: async () => {
      const params = new URLSearchParams({ pagina, per_pagina: 30 })
      if (cerca) params.append('cerca', cerca)
      if (filtroMetodo) params.append('metodo', filtroMetodo)
      if (sortBy) { params.append('ordina_per', sortBy); params.append('direzione', sortDir) }
      const res = await api.get(`/pagamenti?${params}`)
      return res.data
    }
  })

  const { data: riepilogo } = useQuery({
    queryKey: ['riepilogo-pagamenti'],
    queryFn: async () => {
      const res = await api.get('/pagamenti/riepilogo')
      return res.data
    }
  })

  const rimborsaMutation = useMutation({
    mutationFn: (id) => api.post(`/pagamenti/${id}/rimborsa`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pagamenti'] })
      queryClient.invalidateQueries({ queryKey: ['riepilogo-pagamenti'] })
    }
  })

  const emettiRicevutaMutation = useMutation({
    mutationFn: ({ ordineId, pagamentoId }) =>
      api.post(`/ordini/${ordineId}/emetti-documento`, {
        tipo: 'ricevuta',
        pagamento_id: pagamentoId,
        voci: [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pagamenti'] })
    }
  })

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pagamenti</h1>
        </div>
        <button onClick={() => openTab('Registra pagamento', FormRegistraPagamento, {}, 'pagamento')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Registra Pagamento
        </button>
      </div>

      {riepilogo && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-sm text-gray-500">Incassato</p>
            <p className="text-2xl font-bold text-green-600 mt-1">€{Number(riepilogo.totale_incassato).toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-sm text-gray-500">In attesa</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">€{Number(riepilogo.totale_in_attesa).toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-sm text-gray-500">Rimborsato</p>
            <p className="text-2xl font-bold text-red-600 mt-1">€{Number(riepilogo.totale_rimborsato).toFixed(2)}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-3 flex gap-2 items-center">
        <input
          type="text"
          value={cerca}
          onChange={e => { setCerca(e.target.value); setPagina(1) }}
          placeholder="Cerca per numero ordine, paziente..."
          className={`flex-1 min-w-0 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${cerca ? 'filtro-attivo' : 'border-gray-300'}`}
          aria-label="Cerca pagamenti"
        />
        <select value={filtroMetodo} onChange={e => { setFiltroMetodo(e.target.value); setPagina(1) }}
          className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${filtroMetodo ? 'filtro-attivo' : 'border-gray-300'}`}>
          <option value="">Tutti i metodi</option>
          <option value="contanti">Contanti</option>
          <option value="carta_credito">Carta di credito</option>
          <option value="carta_debito">Carta di debito</option>
          <option value="bonifico">Bonifico</option>
          <option value="assegno">Assegno</option>
        </select>
        {(cerca || filtroMetodo) && (
          <button onClick={() => { setCerca(''); setFiltroMetodo(''); setPagina(1) }}
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
          <div className="tbl-empty">Nessun pagamento trovato</div>
        ) : (
          <table className="tbl">
            <thead className="tbl-thead">
              <tr>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('data_pagamento')}>Data {si('data_pagamento')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('paziente_cognome')}>Paziente {si('paziente_cognome')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('ordine_numero')}>Ordine {si('ordine_numero')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('importo')}>Importo {si('importo')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('metodo')}>Metodo {si('metodo')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('stato')}>Stato {si('stato')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('ricevuta_numero')}>Ricevuta {si('ricevuta_numero')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('created_at')}>Creato il {si('created_at')}</th>
                <th scope="col" className="tbl-th">Azioni</th>
              </tr>
            </thead>
            <tbody className="tbl-tbody">
              {/* Ordinamento server-side: backend restituisce gia' ordinato */}
              {(data?.items ?? []).map(p => (
                <tr key={p.id}>
                  <td className="tbl-td text-gray-600 whitespace-nowrap">
                    {p.data_pagamento ? dayjs(p.data_pagamento).format('DD/MM/YYYY HH:mm') : '—'}
                  </td>
                  <td className="tbl-td text-gray-900">{p.paziente_cognome} {p.paziente_nome}</td>
                  <td className="tbl-td text-gray-600">{p.ordine_numero || '—'}</td>
                  <td className="tbl-td font-medium text-gray-900">€{Number(p.importo).toFixed(2)}</td>
                  <td className="tbl-td">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${classeEnum('metodo_pagamento', p.metodo)}`}>{labelEnum(p.metodo)}</span>
                  </td>
                  <td className="tbl-td">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${classeEnum('stato_pagamento', p.stato)}`}>{labelEnum(p.stato)}</span>
                  </td>
                  <td className="tbl-td text-gray-600">
                    {p.ricevuta_numero ? (
                      <span className="text-green-600 text-xs font-medium">✓ {p.ricevuta_numero}</span>
                    ) : '—'}
                  </td>
                  <td className="tbl-td text-gray-300 text-xs whitespace-nowrap" title={p.created_at}>
                    {p.created_at ? dayjs(p.created_at).format('DD/MM/YYYY') : '—'}
                  </td>
                  <td className="tbl-td space-x-3">
                    {p.stato === 'completato' && !p.ricevuta_numero && (
                      <button
                        onClick={() => emettiRicevutaMutation.mutate({ ordineId: p.ordine_id, pagamentoId: p.id })}
                        disabled={emettiRicevutaMutation.isPending}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium disabled:opacity-50">
                        Emetti ricevuta
                      </button>
                    )}
                    {p.stato === 'completato' && (
                      <button onClick={() => rimborsaMutation.mutate(p.id)} className="text-orange-600 hover:text-orange-800 text-xs font-medium">
                        Rimborsa
                      </button>
                    )}
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
