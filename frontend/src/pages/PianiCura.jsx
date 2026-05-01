import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import dayjs from 'dayjs'
import { useTabs } from '../context/TabContext'
import { useTableSort } from '../hooks/useTableSort'
import { usePersistedState } from '../hooks/usePersistedState'
import SortIcon from '../components/SortIcon'
import { classeEnum, labelEnum } from '../utils/colori'
import { FormPreventivo } from './Preventivi'
import { FormAppuntamento } from './Appuntamenti'
import SchedaPreventivo from './SchedaPreventivo'
import SchedaAppuntamento from './SchedaAppuntamento'
import { FormDettaglioOrdine } from './Ordini'

const STATI = ['proposto', 'accettato', 'in_corso', 'completato', 'sospeso', 'abbandonato']

// Helper: usa classeEnum/labelEnum dall'utility centralizzata.
const labelStato = (s) => labelEnum(s)

function SelettorePaziente({ value, onChange, disabled = false, required = false, placeholder = 'Cerca paziente (nome, cognome, CF)…' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const { data: selObj } = useQuery({
    queryKey: ['paziente-sel', value],
    queryFn: async () => (await api.get(`/pazienti/${value}`)).data,
    enabled: !!value,
  })

  const { data: results } = useQuery({
    queryKey: ['pazienti-auto', query],
    queryFn: async () => (await api.get(`/pazienti?cerca=${encodeURIComponent(query)}&per_pagina=15`)).data.items,
    enabled: query.length >= 2,
  })

  if (value && selObj) {
    return (
      <div className={`px-3 py-1.5 border rounded-lg text-sm flex items-center gap-2 ${disabled ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-300'}`}>
        <span className="whitespace-nowrap flex-1">
          {selObj.cognome} {selObj.nome}
          {selObj.codice_fiscale && <span className="text-gray-400 ml-2 font-mono text-xs">{selObj.codice_fiscale}</span>}
        </span>
        {!disabled && (
          <button type="button" onClick={() => { onChange(''); setQuery('') }}
            className="text-gray-500 hover:text-red-600 leading-none" aria-label="Rimuovi paziente">×</button>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        disabled={disabled}
        required={required}
        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
      />
      {open && query.length >= 2 && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto w-full min-w-max">
          {!results?.length ? (
            <div className="px-3 py-2 text-xs text-gray-400">Nessun risultato</div>
          ) : results.map(p => (
            <button key={p.id} type="button"
              onMouseDown={() => { onChange(String(p.id)); setQuery(''); setOpen(false) }}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 whitespace-nowrap">
              <span className="font-medium">{p.cognome} {p.nome}</span>
              {p.codice_fiscale && <span className="text-gray-400 ml-2 font-mono text-xs">{p.codice_fiscale}</span>}
            </button>
          ))}
        </div>
      )}
      {open && query.length > 0 && query.length < 2 && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 px-3 py-2 text-xs text-gray-400">
          Digita almeno 2 caratteri…
        </div>
      )}
    </div>
  )
}

export default function PianiCura() {
  const { openPage } = useTabs()
  const [pagina, setPagina] = usePersistedState('piani-cura.pagina', 1)
  const [pazienteFiltro, setPazienteFiltro] = usePersistedState('piani-cura.paziente', '')
  const [statoFiltro, setStatoFiltro] = usePersistedState('piani-cura.stato', '')
  const [mostraForm, setMostraForm] = useState(false)

  const sortState = useTableSort(null, 'data_apertura', 'desc', { server: true })
  const { sortBy, sortDir, handleSort } = sortState

  const { data: piani, isLoading } = useQuery({
    queryKey: ['piani-cura', pagina, pazienteFiltro, statoFiltro, sortBy, sortDir],
    queryFn: async () => {
      const params = new URLSearchParams({ pagina, per_pagina: 30 })
      if (pazienteFiltro) params.append('paziente_id', pazienteFiltro)
      if (statoFiltro) params.append('stato', statoFiltro)
      if (sortBy) { params.append('ordina_per', sortBy); params.append('direzione', sortDir) }
      return (await api.get(`/piani-cura?${params}`)).data
    },
  })

  // Ordinamento server-side: backend restituisce gia' ordinato.
  const items = piani?.items ?? []
  const filtriAttivi = !!(pazienteFiltro || statoFiltro)

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Piani di cura</h1>
        <button onClick={() => setMostraForm(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          + Nuovo piano
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-3 flex gap-2 items-center">
        <div className="flex-1 min-w-0 max-w-md">
          <SelettorePaziente value={pazienteFiltro} onChange={(v) => { setPazienteFiltro(v); setPagina(1) }} placeholder="Filtra per paziente…" />
        </div>
        <select value={statoFiltro} onChange={e => { setStatoFiltro(e.target.value); setPagina(1) }}
          className={`px-3 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${statoFiltro ? 'filtro-attivo' : 'border-gray-300'}`}>
          <option value="">Tutti gli stati</option>
          {STATI.map(s => <option key={s} value={s}>{labelStato(s)}</option>)}
        </select>
        {filtriAttivi && (
          <button onClick={() => { setPazienteFiltro(''); setStatoFiltro(''); setPagina(1) }}
            className="px-3 py-2 text-xs font-medium bg-orange-100 border border-orange-700 rounded-lg hover:bg-orange-200 whitespace-nowrap">
            ↻ Reset
          </button>
        )}
      </div>

      <div className="tbl-count">{items.length} risultati{piani?.totale != null && piani.totale !== items.length ? ` di ${piani.totale}` : ''}</div>
      <div className="tbl-card">
        {isLoading ? (
          <div className="tbl-empty" role="status" aria-live="polite">Caricamento…</div>
        ) : !items.length ? (
          <div className="tbl-empty" role="status" aria-live="polite">Nessun piano di cura</div>
        ) : (
          <table className="tbl">
            <caption className="sr-only">Elenco piani di cura</caption>
            <thead className="tbl-thead">
              <tr>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('numero')}>
                  Numero <SortIcon active={sortBy === 'numero'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('titolo')}>
                  Titolo <SortIcon active={sortBy === 'titolo'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('paziente_cognome')}>
                  Paziente <SortIcon active={sortBy === 'paziente_cognome'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('dentista_referente_cognome')}>
                  Referente <SortIcon active={sortBy === 'dentista_referente_cognome'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('stato')}>
                  Stato <SortIcon active={sortBy === 'stato'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('n_appuntamenti_completati')}>
                  Sedute <SortIcon active={sortBy === 'n_appuntamenti_completati'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('ordine_totale')}>
                  Ordine <SortIcon active={sortBy === 'ordine_totale'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('data_apertura')}>
                  Aperto il <SortIcon active={sortBy === 'data_apertura'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th"></th>
              </tr>
            </thead>
            <tbody className="tbl-tbody">
              {items.map(p => (
                <tr key={p.id}>
                  <td className="tbl-td font-mono text-xs">{p.numero}</td>
                  <td className="tbl-td">{p.titolo}</td>
                  <td className="tbl-td">{p.paziente_cognome} {p.paziente_nome}</td>
                  <td className="tbl-td text-gray-600">{p.dentista_referente_cognome ? `Dr. ${p.dentista_referente_cognome}` : '—'}</td>
                  <td className="tbl-td">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${classeEnum('stato_piano_cura', p.stato)}`}>
                      {labelEnum(p.stato)}
                    </span>
                  </td>
                  <td className="tbl-td">{p.n_appuntamenti_completati}/{p.n_appuntamenti_totali}</td>
                  <td className="tbl-td">{p.ordine_id ? `€${(p.ordine_totale ?? 0).toFixed(2)}` : '—'}</td>
                  <td className="tbl-td text-gray-600 whitespace-nowrap">{dayjs(p.data_apertura).format('DD/MM/YYYY')}</td>
                  <td className="tbl-td">
                    <button
                      onClick={() => openPage(`/piani-cura/${p.id}`, p.numero, DettaglioPianoCura, { pianoId: p.id })}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium whitespace-nowrap">
                      Dettaglio
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {piani?.pagine_totali > 1 && (
          <div className="tbl-pagination">
            <p className="text-sm text-gray-500">Pagina {piani.pagina} di {piani.pagine_totali}</p>
            <div className="flex gap-2">
              <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50">← Precedente</button>
              <button onClick={() => setPagina(p => Math.min(piani.pagine_totali, p + 1))} disabled={pagina >= piani.pagine_totali} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50">Successiva →</button>
            </div>
          </div>
        )}
      </div>

      {mostraForm && (
        <FormPianoCura onClose={() => setMostraForm(false)} />
      )}
    </div>
  )
}


export function FormPianoCura({ onClose, pazienteIdIniziale = '' }) {
  const queryClient = useQueryClient()
  const [errore, setErrore] = useState('')
  const [form, setForm] = useState({
    paziente_id: pazienteIdIniziale,
    dentista_referente_id: '',
    titolo: '',
    diagnosi: '',
    obiettivo: '',
    note: '',
  })

  const { data: operatori } = useQuery({
    queryKey: ['operatori-lista'],
    queryFn: async () => (await api.get('/utenti/operatori')).data ?? [],
  })

  const mutation = useMutation({
    mutationFn: (dati) => api.post('/piani-cura', dati, { _silent: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['piani-cura'] })
      onClose()
    },
    onError: (e) => setErrore(e.response?.data?.detail || 'Errore nella creazione'),
  })

  const submit = (e) => {
    e.preventDefault()
    if (!form.paziente_id || !form.titolo) {
      setErrore('Paziente e titolo sono obbligatori')
      return
    }
    mutation.mutate({
      paziente_id: parseInt(form.paziente_id),
      dentista_referente_id: form.dentista_referente_id ? parseInt(form.dentista_referente_id) : null,
      titolo: form.titolo,
      diagnosi: form.diagnosi || null,
      obiettivo: form.obiettivo || null,
      note: form.note || null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-4 space-y-3">
        <h2 className="text-lg font-bold">Nuovo piano di cura</h2>
        {errore && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">{errore}</div>}
        <form onSubmit={submit} className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Paziente <span className="text-red-500">*</span></label>
            <SelettorePaziente
              value={form.paziente_id}
              onChange={(v) => setForm(f => ({ ...f, paziente_id: v }))}
              disabled={!!pazienteIdIniziale}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Titolo <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.titolo}
              onChange={(e) => setForm({...form, titolo: e.target.value})}
              placeholder="es. Implantologia settore 4"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Dentista referente</label>
            <select
              value={form.dentista_referente_id}
              onChange={(e) => setForm({...form, dentista_referente_id: e.target.value})}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— nessuno —</option>
              {operatori?.map(o => (
                <option key={o.id} value={o.id}>Dr. {o.cognome} {o.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Diagnosi</label>
            <textarea
              value={form.diagnosi}
              onChange={(e) => setForm({...form, diagnosi: e.target.value})}
              rows={2}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Obiettivo</label>
            <textarea
              value={form.obiettivo}
              onChange={(e) => setForm({...form, obiettivo: e.target.value})}
              rows={2}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
            <button type="submit" disabled={mutation.isPending} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {mutation.isPending ? 'Creazione…' : 'Crea piano'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


export function DettaglioPianoCura({ pianoId }) {
  const queryClient = useQueryClient()
  const { openTab } = useTabs()
  const [tab, setTab] = useState('preventivi')

  const { data: piano, isLoading } = useQuery({
    queryKey: ['piano-cura', pianoId],
    queryFn: async () => (await api.get(`/piani-cura/${pianoId}`)).data,
  })

  const { data: preventivi } = useQuery({
    queryKey: ['preventivi-piano', pianoId],
    queryFn: async () => (await api.get(`/preventivi?piano_cura_id=${pianoId}&per_pagina=50`)).data.items ?? [],
    enabled: !!pianoId,
  })

  const { data: appuntamenti } = useQuery({
    queryKey: ['appuntamenti-piano', pianoId],
    queryFn: async () => {
      // Prendo tutti gli appuntamenti del paziente e filtro per piano
      if (!piano?.paziente_id) return []
      const res = await api.get(`/appuntamenti?paziente_id=${piano.paziente_id}&per_pagina=100`)
      return (res.data.items ?? []).filter(a => a.piano_cura_id === pianoId)
    },
    enabled: !!piano?.paziente_id,
  })

  const { data: stanzeLista } = useQuery({
    queryKey: ['stanze-attive'],
    queryFn: async () => (await api.get('/stanze?solo_attive=true')).data,
  })
  const coloreStanze = useMemo(
    () => Object.fromEntries((stanzeLista || []).map(s => [s.nome, s.colore])),
    [stanzeLista]
  )

  const cambiaStato = useMutation({
    mutationFn: (nuovoStato) => api.patch(`/piani-cura/${pianoId}`, { stato: nuovoStato }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['piani-cura'] })
      queryClient.invalidateQueries({ queryKey: ['piano-cura', pianoId] })
    },
  })

  const prevSort = useTableSort(preventivi, 'data_emissione', 'desc')
  const appSort = useTableSort(appuntamenti, 'data_ora_inizio', 'desc')

  if (isLoading || !piano) return <div className="p-4 text-sm text-gray-500">Caricamento…</div>

  return (
    <div className="p-3 space-y-3">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm">{piano.numero}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${classeEnum('stato_piano_cura', piano.stato)}`}>
                {labelEnum(piano.stato)}
              </span>
            </div>
            <h2 className="text-lg font-bold">{piano.titolo}</h2>
            <p className="text-sm text-gray-600">
              {piano.paziente_cognome} {piano.paziente_nome}
              {piano.dentista_referente_cognome && ` — Referente: Dr. ${piano.dentista_referente_cognome}`}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Aperto il {dayjs(piano.data_apertura).format('DD/MM/YYYY')}
              {piano.data_chiusura && ` · Chiuso il ${dayjs(piano.data_chiusura).format('DD/MM/YYYY')}`}
            </p>
          </div>
          <div>
            <select
              value={piano.stato}
              onChange={(e) => cambiaStato.mutate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATI.map(s => <option key={s} value={s}>{labelStato(s)}</option>)}
            </select>
          </div>
        </div>
        {piano.diagnosi && <p className="text-sm mt-2"><strong>Diagnosi:</strong> {piano.diagnosi}</p>}
        {piano.obiettivo && <p className="text-sm"><strong>Obiettivo:</strong> {piano.obiettivo}</p>}
      </div>

      <div className="border-b border-gray-200 flex gap-1">
        {[
          ['preventivi', `Preventivi (${preventivi?.length ?? 0})`],
          ['appuntamenti', `Appuntamenti (${appuntamenti?.length ?? 0})`],
          ['ordine', `Ordine ${piano.ordine_id ? '✓' : ''}`],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 text-sm ${tab === k ? 'border-b-2 border-blue-600 text-blue-600 font-semibold' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'preventivi' && (
        <div className="flex gap-2 items-start">
        <div className="tbl-card">
          {!preventivi?.length ? (
              <div className="tbl-empty">Nessun preventivo per questo piano.</div>
            ) : (
              <table className="tbl">
                <thead className="tbl-thead">
                  <tr>
                    <th scope="col" className="tbl-th tbl-th-sort" onClick={() => prevSort.handleSort('numero')}>
                      Numero <SortIcon active={prevSort.sortBy === 'numero'} dir={prevSort.sortDir} />
                    </th>
                    <th scope="col" className="tbl-th tbl-th-sort" onClick={() => prevSort.handleSort('versione')}>
                      Versione <SortIcon active={prevSort.sortBy === 'versione'} dir={prevSort.sortDir} />
                    </th>
                    <th scope="col" className="tbl-th tbl-th-sort" onClick={() => prevSort.handleSort('stato')}>
                      Stato <SortIcon active={prevSort.sortBy === 'stato'} dir={prevSort.sortDir} />
                    </th>
                    <th scope="col" className="tbl-th tbl-th-sort" onClick={() => prevSort.handleSort('totale')}>
                      Totale <SortIcon active={prevSort.sortBy === 'totale'} dir={prevSort.sortDir} />
                    </th>
                    <th scope="col" className="tbl-th tbl-th-sort" onClick={() => prevSort.handleSort('attivo')}>
                      Attivo <SortIcon active={prevSort.sortBy === 'attivo'} dir={prevSort.sortDir} />
                    </th>
                    <th scope="col" className="tbl-th tbl-th-sort" onClick={() => prevSort.handleSort('data_emissione')}>
                      Emesso il <SortIcon active={prevSort.sortBy === 'data_emissione'} dir={prevSort.sortDir} />
                    </th>
                  </tr>
                </thead>
                <tbody className="tbl-tbody">
                  {prevSort.sortedItems.map(p => (
                    <tr key={p.id}
                      onClick={() => openTab(`Preventivo ${p.numero}`, SchedaPreventivo, { preventivoId: p.id }, 'scheda-preventivo')}
                      className="cursor-pointer hover:bg-blue-50">
                      <td className="tbl-td font-mono text-xs">{p.numero}</td>
                      <td className="tbl-td">v{p.versione}</td>
                      <td className="tbl-td">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${classeEnum('stato_preventivo', p.stato)}`}>
                          {labelEnum(p.stato)}
                        </span>
                      </td>
                      <td className="tbl-td">€{Number(p.totale).toFixed(2)}</td>
                      <td className="tbl-td">{p.attivo ? '✓' : '—'}</td>
                      <td className="tbl-td text-gray-600 whitespace-nowrap">{dayjs(p.data_emissione).format('DD/MM/YYYY')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
        <button
          onClick={() => openTab(
            `Nuovo preventivo — ${piano.paziente_cognome}`,
            FormPreventivo,
            {
              initialPianoCuraId: piano.id,
              initialPazienteId: piano.paziente_id,
              initialDentistaId: piano.dentista_referente_id || '',
            },
            'preventivo'
          )}
          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg whitespace-nowrap shrink-0">
          + Nuovo preventivo
        </button>
        </div>
      )}

      {tab === 'appuntamenti' && (
        <div className="flex gap-2 items-start">
        <div className="tbl-card">
          {!appuntamenti?.length ? (
              <div className="tbl-empty">Nessun appuntamento per questo piano.</div>
            ) : (
              <table className="tbl">
                <thead className="tbl-thead">
                  <tr>
                    <th scope="col" className="tbl-th tbl-th-sort" onClick={() => appSort.handleSort('data_ora_inizio')}>
                      Data <SortIcon active={appSort.sortBy === 'data_ora_inizio'} dir={appSort.sortDir} />
                    </th>
                    <th scope="col" className="tbl-th tbl-th-sort" onClick={() => appSort.handleSort('dentista_cognome')}>
                      Operatore <SortIcon active={appSort.sortBy === 'dentista_cognome'} dir={appSort.sortDir} />
                    </th>
                    <th scope="col" className="tbl-th tbl-th-sort" onClick={() => appSort.handleSort('tipo')}>
                      Tipo <SortIcon active={appSort.sortBy === 'tipo'} dir={appSort.sortDir} />
                    </th>
                    <th scope="col" className="tbl-th tbl-th-sort" onClick={() => appSort.handleSort('stato')}>
                      Stato <SortIcon active={appSort.sortBy === 'stato'} dir={appSort.sortDir} />
                    </th>
                    <th scope="col" className="tbl-th tbl-th-sort" onClick={() => appSort.handleSort('sala')}>
                      Sala <SortIcon active={appSort.sortBy === 'sala'} dir={appSort.sortDir} />
                    </th>
                  </tr>
                </thead>
                <tbody className="tbl-tbody">
                  {appSort.sortedItems.map(a => {
                    const bgSala = coloreStanze[a.sala]
                    return (
                    <tr key={a.id}
                      onClick={() => openTab(
                        `${a.paziente_cognome} ${dayjs(a.data_ora_inizio).format('DD/MM')}`,
                        SchedaAppuntamento,
                        { appuntamentoId: a.id },
                        'scheda-appuntamento'
                      )}
                      className="cursor-pointer hover:bg-blue-50">
                      <td className="tbl-td whitespace-nowrap">{dayjs(a.data_ora_inizio).format('DD/MM/YYYY HH:mm')}</td>
                      <td className="tbl-td">Dr. {a.dentista_cognome}</td>
                      <td className="tbl-td">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${classeEnum('tipo_appuntamento', a.tipo)}`}>
                          {labelEnum(a.tipo)}
                        </span>
                      </td>
                      <td className="tbl-td">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${classeEnum('stato_appuntamento', a.stato)}`}>
                          {labelEnum(a.stato)}
                        </span>
                      </td>
                      <td className="tbl-td text-gray-700 font-medium" style={bgSala ? { backgroundColor: bgSala } : undefined}>
                        {a.sala || '—'}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
        </div>
        <button
          onClick={() => openTab(
            `Nuovo appuntamento — ${piano.paziente_cognome}`,
            FormAppuntamento,
            {
              initialPianoCuraId: piano.id,
              initialPazienteId: piano.paziente_id,
              initialDentistaId: piano.dentista_referente_id || '',
            },
            'appuntamento'
          )}
          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg whitespace-nowrap shrink-0">
          + Nuovo appuntamento
        </button>
        </div>
      )}

      {tab === 'ordine' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          {piano.ordine_id ? (
            <div className="space-y-2">
              <p className="text-sm">
                Ordine collegato — totale: <strong>€{(piano.ordine_totale ?? 0).toFixed(2)}</strong>
              </p>
              <button
                onClick={() => openTab(`Ordine ${piano.ordine_numero || piano.ordine_id}`, FormDettaglioOrdine, { ordineId: piano.ordine_id }, 'ordine-detail')}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                Apri scheda ordine
              </button>
              <p className="text-xs text-gray-500">
                L'ordine è generato automaticamente al primo appuntamento completato e cresce man mano che vengono completate le sedute.
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Nessun ordine ancora. L'ordine verrà creato automaticamente al primo appuntamento completato del piano.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
