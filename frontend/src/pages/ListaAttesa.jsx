import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { usePersistedState } from '../hooks/usePersistedState'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
import ModalEliminaConferma from '../components/ModalEliminaConferma'
import { useTabFocusRefetch } from '../hooks/useTabFocusRefetch'
dayjs.locale('it')

const PRIORITA = [
  { value: 'urgente', label: 'Urgente', color: 'bg-red-100 text-red-700 border-red-300' },
  { value: 'alta',    label: 'Alta',    color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'media',   label: 'Media',   color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'bassa',   label: 'Bassa',   color: 'bg-gray-100 text-gray-600 border-gray-300' },
]
const PRIORITA_BY_VAL = Object.fromEntries(PRIORITA.map(p => [p.value, p]))

const STATI = [
  { value: 'in_attesa',   label: 'In attesa',   color: 'bg-yellow-100 text-yellow-700' },
  { value: 'contattato',  label: 'Contattato',  color: 'bg-blue-100 text-blue-700' },
  { value: 'prenotato',   label: 'Prenotato',   color: 'bg-green-100 text-green-700' },
  { value: 'rifiutato',   label: 'Rifiutato',   color: 'bg-red-100 text-red-700' },
  { value: 'scaduto',     label: 'Scaduto',     color: 'bg-gray-100 text-gray-500' },
]
const STATO_BY_VAL = Object.fromEntries(STATI.map(s => [s.value, s]))

function FormNuovo({ onClose }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    paziente_id: '', dentista_id: '', tipo_appuntamento: 'visita',
    durata_stimata: 30, motivo: '', priorita: 'media', note: '',
  })
  const [errore, setErrore] = useState('')
  const [pazRicerca, setPazRicerca] = useState('')

  const { data: pazienti } = useQuery({
    queryKey: ['pazienti-ricerca-coda', pazRicerca],
    queryFn: async () => {
      const params = new URLSearchParams({ per_pagina: 10 })
      if (pazRicerca) params.append('cerca', pazRicerca)
      return (await api.get(`/pazienti?${params}`)).data
    },
    enabled: pazRicerca.length >= 2,
  })

  const { data: operatori } = useQuery({
    queryKey: ['operatori-coda'],
    queryFn: async () => (await api.get('/utenti/operatori')).data,
  })

  const crea = useMutation({
    mutationFn: (dati) => api.post('/lista-attesa', dati, { _silent: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lista-attesa'] })
      onClose()
    },
    onError: (e) => setErrore(e?.response?.data?.detail || 'Errore'),
  })

  const submit = () => {
    if (!form.paziente_id) { setErrore('Seleziona un paziente'); return }
    crea.mutate({
      ...form,
      paziente_id: Number(form.paziente_id),
      dentista_id: form.dentista_id ? Number(form.dentista_id) : null,
      durata_stimata: form.durata_stimata ? Number(form.durata_stimata) : null,
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Nuova richiesta in lista</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label htmlFor="paz-search" className="block text-xs font-medium text-gray-700 mb-1">Paziente *</label>
          <input
            id="paz-search"
            type="text"
            value={pazRicerca}
            onChange={e => { setPazRicerca(e.target.value); setForm(f => ({ ...f, paziente_id: '' })) }}
            placeholder="Cerca per nome o cognome..."
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {pazienti?.items?.length > 0 && !form.paziente_id && (
            <ul className="mt-1 max-h-32 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {pazienti.items.map(p => (
                <li key={p.id}>
                  <button
                    onClick={() => { setForm(f => ({ ...f, paziente_id: p.id })); setPazRicerca(`${p.cognome} ${p.nome}`) }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50"
                  >
                    {p.cognome} {p.nome} {p.codice_fiscale && <span className="text-gray-400 font-mono ml-2">{p.codice_fiscale}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label htmlFor="dent-sel" className="block text-xs font-medium text-gray-700 mb-1">Operatore (opzionale)</label>
          <select
            id="dent-sel"
            value={form.dentista_id}
            onChange={e => setForm(f => ({ ...f, dentista_id: e.target.value }))}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Qualsiasi</option>
            {operatori?.map(o => (
              <option key={o.id} value={o.id}>{o.cognome} {o.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tipo-sel" className="block text-xs font-medium text-gray-700 mb-1">Tipo appuntamento</label>
          <select
            id="tipo-sel"
            value={form.tipo_appuntamento}
            onChange={e => setForm(f => ({ ...f, tipo_appuntamento: e.target.value }))}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="visita">Visita</option>
            <option value="prima_visita">Prima visita</option>
            <option value="igiene">Igiene</option>
            <option value="controllo">Controllo</option>
            <option value="urgenza">Urgenza</option>
            <option value="intervento">Intervento</option>
          </select>
        </div>
        <div>
          <label htmlFor="durata-input" className="block text-xs font-medium text-gray-700 mb-1">Durata stimata (min)</label>
          <input
            id="durata-input"
            type="number"
            min={10}
            max={480}
            step={5}
            value={form.durata_stimata}
            onChange={e => setForm(f => ({ ...f, durata_stimata: e.target.value }))}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="prio-sel" className="block text-xs font-medium text-gray-700 mb-1">Priorità</label>
          <select
            id="prio-sel"
            value={form.priorita}
            onChange={e => setForm(f => ({ ...f, priorita: e.target.value }))}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PRIORITA.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label htmlFor="motivo-input" className="block text-xs font-medium text-gray-700 mb-1">Motivo</label>
          <input
            id="motivo-input"
            type="text"
            value={form.motivo}
            onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="col-span-2">
          <label htmlFor="note-input" className="block text-xs font-medium text-gray-700 mb-1">Note</label>
          <textarea
            id="note-input"
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            rows={2}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      {errore && <p role="alert" className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{errore}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
        <button onClick={submit} disabled={crea.isPending} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {crea.isPending ? 'Salvataggio...' : 'Aggiungi alla lista'}
        </button>
      </div>
    </div>
  )
}

export default function ListaAttesa() {
  const queryClient = useQueryClient()
  const [filtroStato, setFiltroStato] = usePersistedState('lista-attesa.filtroStato', 'in_attesa')
  const [nuovo, setNuovo] = useState(false)
  const [elimina, setElimina] = useState(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['lista-attesa', filtroStato],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filtroStato) params.append('stato', filtroStato)
      return (await api.get(`/lista-attesa?${params}`)).data
    },
  })
  useTabFocusRefetch(refetch)

  const cambiaStato = useMutation({
    mutationFn: ({ id, stato }) => api.patch(`/lista-attesa/${id}`, { stato }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lista-attesa'] }),
  })

  const eliminaItem = useMutation({
    mutationFn: (id) => api.delete(`/lista-attesa/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lista-attesa'] }); setElimina(null) },
  })

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Lista d'attesa</h1>
          <p className="text-gray-500 text-xs mt-0.5">{STATO_BY_VAL[filtroStato]?.label || 'Tutti gli stati'}</p>
        </div>
        <button onClick={() => setNuovo(true)} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          + Aggiungi paziente
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-3 flex gap-2 items-center">
        <select
          value={filtroStato}
          onChange={e => setFiltroStato(e.target.value)}
          aria-label="Filtra per stato"
          className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${filtroStato !== 'in_attesa' ? 'filtro-attivo' : 'border-gray-300'}`}
        >
          <option value="">Tutti gli stati</option>
          {STATI.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {filtroStato !== 'in_attesa' && (
          <button onClick={() => setFiltroStato('in_attesa')}
            className="px-3 py-2 text-xs font-medium bg-orange-100 border border-orange-700 rounded-lg hover:bg-orange-200 whitespace-nowrap">
            ↻ Reset
          </button>
        )}
      </div>

      {nuovo && <FormNuovo onClose={() => setNuovo(false)} />}

      <div className="tbl-count">{data?.items?.length ?? 0} risultati{data?.totale != null && data.totale !== data?.items?.length ? ` di ${data.totale}` : ''}</div>
      <div className="tbl-card">
        {isLoading ? (
          <div className="tbl-empty" role="status" aria-live="polite">Caricamento...</div>
        ) : !data?.items?.length ? (
          <div className="tbl-empty" role="status">Nessun paziente in lista d'attesa</div>
        ) : (
          <table className="tbl">
            <caption className="sr-only">Pazienti in lista d'attesa</caption>
            <thead className="tbl-thead">
              <tr>
                <th scope="col" className="tbl-th">Priorità</th>
                <th scope="col" className="tbl-th">Paziente</th>
                <th scope="col" className="tbl-th">Telefono</th>
                <th scope="col" className="tbl-th">Tipo</th>
                <th scope="col" className="tbl-th">Operatore</th>
                <th scope="col" className="tbl-th">In coda da</th>
                <th scope="col" className="tbl-th">Stato</th>
                <th scope="col" className="tbl-th">Azioni</th>
              </tr>
            </thead>
            <tbody className="tbl-tbody">
              {data.items.map(item => {
                const prio = PRIORITA_BY_VAL[item.priorita]
                const stato = STATO_BY_VAL[item.stato]
                return (
                  <tr key={item.id}>
                    <td className="tbl-td">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${prio?.color}`}>{prio?.label}</span>
                    </td>
                    <td className="tbl-td font-medium text-gray-900 whitespace-nowrap">{item.paziente_cognome} {item.paziente_nome}</td>
                    <td className="tbl-td text-gray-600 whitespace-nowrap">{item.paziente_telefono || '—'}</td>
                    <td className="tbl-td text-gray-600 capitalize">{item.tipo_appuntamento?.replace('_', ' ') || '—'}</td>
                    <td className="tbl-td text-gray-600 whitespace-nowrap">
                      {item.dentista_cognome ? `${item.dentista_cognome} ${item.dentista_nome}` : 'Qualsiasi'}
                    </td>
                    <td className="tbl-td text-gray-500 whitespace-nowrap">{item.created_at ? dayjs(item.created_at).fromNow?.() || dayjs(item.created_at).format('DD/MM/YYYY') : '—'}</td>
                    <td className="tbl-td">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stato?.color}`}>{stato?.label}</span>
                    </td>
                    <td className="tbl-td">
                      <div className="flex gap-2 text-xs font-medium">
                        {item.stato === 'in_attesa' && (
                          <button
                            onClick={() => cambiaStato.mutate({ id: item.id, stato: 'contattato' })}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Contattato
                          </button>
                        )}
                        {item.stato !== 'rifiutato' && item.stato !== 'prenotato' && (
                          <button
                            onClick={() => cambiaStato.mutate({ id: item.id, stato: 'rifiutato' })}
                            className="text-orange-600 hover:text-orange-800"
                          >
                            Rifiutato
                          </button>
                        )}
                        <button onClick={() => setElimina(item)} className="text-red-600 hover:text-red-800">Elimina</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {elimina && (
        <ModalEliminaConferma
          nome={`${elimina.paziente_cognome} ${elimina.paziente_nome}`}
          isLoading={eliminaItem.isPending}
          onConferma={() => eliminaItem.mutate(elimina.id)}
          onAnnulla={() => setElimina(null)}
        />
      )}
    </div>
  )
}
