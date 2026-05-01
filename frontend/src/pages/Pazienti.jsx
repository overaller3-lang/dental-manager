import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useTabs } from '../context/TabContext'
import { usePersistedState } from '../hooks/usePersistedState'
import CartellaPaziente from './CartellaPaziente'
import Highlight from '../components/Highlight'
import ModalEliminaConferma from '../components/ModalEliminaConferma'
import { useColOrder } from '../hooks/useColOrder'
import { exportToCsv } from '../utils/exportCsv'
import dayjs from 'dayjs'

export function FormPaziente({ paziente, onClose }) {
  const [form, setForm] = useState(paziente ? {
    ...paziente,
    sesso: paziente.sesso === 'ND' ? '' : (paziente.sesso || ''),
  } : {
    nome: '', cognome: '', codice_fiscale: '', data_nascita: '',
    sesso: '', telefono: '', email: '', indirizzo: '', citta: '',
    cap: '', provincia: '', anamnesi: '', allergie: '', note: '',
    consenso_trattamento: false, consenso_privacy: false, consenso_marketing: false
  })
  const [errore, setErrore] = useState('')
  const queryClient = useQueryClient()

  const parseErrore = (e) => {
    if (!e.response) return 'Errore di rete — nessuna risposta dal server'
    const status = e.response.status
    const detail = e.response?.data?.detail
    if (Array.isArray(detail)) return detail.map(d => d.msg || d.type).join('; ')
    if (typeof detail === 'string') return detail
    if (detail) return JSON.stringify(detail)
    return `Errore ${status} — risposta non valida dal server`
  }

  const creaMutation = useMutation({
    mutationFn: (dati) => api.post('/pazienti', dati, { _silent: true }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pazienti'] }); onClose() },
    onError: (e) => setErrore(parseErrore(e))
  })

  const aggiornaMutation = useMutation({
    mutationFn: (dati) => api.patch(`/pazienti/${paziente.id}`, dati, { _silent: true }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pazienti'] }); onClose() },
    onError: (e) => setErrore(parseErrore(e))
  })

  const isPending = creaMutation.isPending || aggiornaMutation.isPending

  const CAMPI_UPDATE = ['nome', 'cognome', 'codice_fiscale', 'data_nascita', 'sesso',
    'indirizzo', 'citta', 'cap', 'provincia', 'telefono', 'email', 'anamnesi', 'allergie', 'note']

  const handleSubmit = (e) => {
    e.preventDefault()
    setErrore('')
    if (paziente) {
      const payload = Object.fromEntries(
        CAMPI_UPDATE.map(k => [k, form[k] === '' ? null : (form[k] ?? null)])
      )
      aggiornaMutation.mutate(payload)
    } else {
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])
      )
      creaMutation.mutate(payload)
    }
  }

  const riempiCasuale = () => {
    const nomi = ['Marco', 'Giulia', 'Luca', 'Sofia', 'Alessandro', 'Chiara', 'Matteo', 'Sara', 'Andrea', 'Francesca']
    const cognomi = ['Rossi', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno']
    const citta = [['Milano', '20100', 'MI'], ['Roma', '00100', 'RM'], ['Napoli', '80100', 'NA'], ['Torino', '10100', 'TO'], ['Bologna', '40100', 'BO']]
    const nome = nomi[Math.floor(Math.random() * nomi.length)]
    const cognome = cognomi[Math.floor(Math.random() * cognomi.length)]
    const sesso = Math.random() > 0.5 ? 'M' : 'F'
    const anniNascita = Math.floor(Math.random() * 60) + 20
    const dataNascita = new Date(new Date().getFullYear() - anniNascita, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1)
    const data_nascita = dataNascita.toISOString().split('T')[0]
    const cf = (cognome.slice(0, 3) + nome.slice(0, 3) + data_nascita.replace(/-/g, '').slice(2, 6) + 'A' + String(Math.floor(Math.random() * 9000) + 1000)).toUpperCase()
    const tel = `3${Math.floor(Math.random() * 9) + 1}${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`
    const [c, cap, prov] = citta[Math.floor(Math.random() * citta.length)]
    setErrore('')
    setForm(f => ({
      ...f, nome, cognome, sesso, data_nascita, codice_fiscale: cf.slice(0, 16),
      telefono: tel, email: `${nome.toLowerCase()}.${cognome.toLowerCase()}@email.it`,
      indirizzo: `Via Roma ${Math.floor(Math.random() * 100) + 1}`, citta: c, cap, provincia: prov,
    }))
  }

  const inp = (label, name, type = 'text', required = false) => (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <input
        type={type}
        value={form[name] || ''}
        onChange={e => setForm({ ...form, [name]: e.target.value })}
        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        required={required}
      />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="p-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-3 mb-3">
        {inp('Nome', 'nome', 'text', true)}
        {inp('Cognome', 'cognome', 'text', true)}
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        {inp('Codice Fiscale', 'codice_fiscale')}
        {inp('Data di Nascita', 'data_nascita', 'date')}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Sesso</label>
          <select
            value={form.sesso === 'M' ? 'M' : form.sesso === 'F' ? 'F' : form.sesso ? 'altro' : ''}
            onChange={e => setForm({ ...form, sesso: e.target.value === 'altro' ? '' : e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
            <option value="">—</option>
            <option value="M">Maschio</option>
            <option value="F">Femmina</option>
            <option value="altro">Altro</option>
          </select>
          {form.sesso !== 'M' && form.sesso !== 'F' && form.sesso !== '' && (
            <input
              type="text"
              value={form.sesso || ''}
              onChange={e => setForm({ ...form, sesso: e.target.value })}
              placeholder="Come ti identifichi?"
              className="mt-1 w-full px-3 py-1.5 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        {inp('Telefono', 'telefono', 'tel')}
        {inp('Email', 'email', 'email')}
      </div>
      <div className="mb-3">
        {inp('Indirizzo', 'indirizzo')}
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        {inp('Città', 'citta')}
        {inp('CAP', 'cap')}
        {inp('Provincia', 'provincia')}
      </div>
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">Anamnesi</label>
        <textarea value={form.anamnesi || ''} onChange={e => setForm({ ...form, anamnesi: e.target.value })}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" rows={3} />
      </div>
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">Allergie</label>
        <textarea value={form.allergie || ''} onChange={e => setForm({ ...form, allergie: e.target.value })}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" rows={2} />
      </div>
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">Note</label>
        <textarea value={form.note || ''} onChange={e => setForm({ ...form, note: e.target.value })}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" rows={2} />
      </div>
      {!paziente && (
        <div className="bg-blue-50 rounded-lg p-4 space-y-2 mb-4">
          <p className="text-xs font-medium text-blue-900 mb-2">Consensi (L. 219/2017)</p>
          {[
            ['consenso_trattamento', 'Consenso al trattamento sanitario', true],
            ['consenso_privacy', 'Consenso al trattamento dati personali (GDPR)', true],
            ['consenso_marketing', 'Consenso marketing (opzionale)', false],
          ].map(([key, label, req]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form[key]} onChange={e => setForm({ ...form, [key]: e.target.checked })} required={req} />
              <span>{label}{req && ' *'}</span>
            </label>
          ))}
        </div>
      )}
      {errore && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-4">{errore}</p>}
      <div className="flex items-center justify-between">
        {!paziente && (
          <button type="button" onClick={riempiCasuale}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-dashed border-gray-300">
            Riempi casuale
          </button>
        )}
        <div className={`flex gap-3 ${paziente ? 'ml-0 w-full justify-end' : 'ml-auto'}`}>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Annulla</button>
          <button type="submit" disabled={isPending} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
            {isPending ? 'Salvataggio...' : paziente ? 'Salva Modifiche' : 'Registra Paziente'}
          </button>
        </div>
      </div>
    </form>
  )
}

const COL_KEYS = ['paziente', 'nascita', 'telefono', 'email', 'codice_fiscale', 'creato', 'azioni']

export default function Pazienti() {
  const [cerca, setCerca] = usePersistedState('pazienti.cerca', '')
  const [pagina, setPagina] = usePersistedState('pazienti.pagina', 1)
  const [sortBy, setSortBy] = usePersistedState('pazienti.sortBy', null)
  const [sortDir, setSortDir] = usePersistedState('pazienti.sortDir', 'asc')
  const [selected, setSelected] = useState(new Set())
  const [modalElimina, setModalElimina] = useState(null)
  const headerRef = useRef(null)
  const queryClient = useQueryClient()
  const { openTab, openTabDedup } = useTabs()
  const { order, headerProps } = useColOrder('pazienti', COL_KEYS)

  const handleSort = (campo) => {
    if (sortBy === campo) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(campo); setSortDir('asc') }
  }
  const si = (campo) => (
    <><span aria-hidden="true" className={`ml-0.5 text-[10px] cursor-pointer ${sortBy === campo ? 'text-blue-600' : 'text-gray-400'}`}>
      {sortBy === campo ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>{sortBy === campo && <span className="sr-only">, ordinato {sortDir === 'asc' ? 'crescente' : 'decrescente'}</span>}</>
  )

  const { data, isLoading } = useQuery({
    queryKey: ['pazienti', pagina, cerca, sortBy, sortDir],
    queryFn: async () => {
      const params = new URLSearchParams({ pagina, per_pagina: 30 })
      if (cerca) params.append('cerca', cerca)
      if (sortBy) { params.append('ordina_per', sortBy); params.append('direzione', sortDir) }
      const res = await api.get(`/pazienti?${params}`)
      return res.data
    }
  })

  const bulkDisattivaMutation = useMutation({
    mutationFn: (ids) => Promise.all(ids.map(id => api.patch(`/pazienti/${id}`, { attivo: false }))),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pazienti'] }); setSelected(new Set()) }
  })

  const eliminaMutation = useMutation({
    mutationFn: (id) => api.delete(`/pazienti/${id}/elimina`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pazienti'] })
      setModalElimina(null)
    },
    onError: (e) => {
      const detail = e.response?.data?.detail
      if (e.response?.status === 409 && detail?.referenze) {
        setModalElimina(prev => ({ ...prev, referenze: detail.referenze }))
      }
    }
  })

  const bulkEliminaMutation = useMutation({
    mutationFn: async (ids) => {
      const results = await Promise.allSettled(ids.map(id => api.delete(`/pazienti/${id}/elimina`)))
      const errors = results.filter(r => r.status === 'rejected').map(r => r.reason)
      if (errors.length) throw errors[0]
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pazienti'] }); setSelected(new Set()) },
    onError: (e) => {
      const detail = e.response?.data?.detail
      if (e.response?.status === 409 && detail?.referenze) {
        setModalElimina({ id: null, nome: 'alcuni pazienti selezionati', referenze: detail.referenze })
      }
    }
  })

  const apri = (paziente = null) => {
    if (paziente) {
      openTabDedup(
        `Modifica - ${paziente.cognome} ${paziente.nome}`,
        FormPaziente,
        { paziente },
        'paziente',
        `paziente-modifica-${paziente.id}`
      )
    } else {
      openTab('Nuovo paziente', FormPaziente, {}, 'paziente')
    }
  }

  const apriCartella = (paziente) => {
    openTabDedup(
      `${paziente.cognome} ${paziente.nome}`,
      CartellaPaziente,
      {
        pazienteId: paziente.id,
        onModifica: (p) => openTabDedup(
          `Modifica - ${p.cognome} ${p.nome}`,
          FormPaziente,
          { paziente: p },
          'paziente',
          `paziente-modifica-${p.id}`
        )
      },
      'scheda-paziente',
      `paziente-${paziente.id}`
    )
  }

  // Ordinamento server-side: il backend restituisce gia' i record ordinati
  // tenendo conto dell'intero dataset, non solo della pagina corrente.
  const sortedItems = data?.items ?? []

  const allSelected = sortedItems.length > 0 && sortedItems.every(p => selected.has(p.id))
  const someSelected = !allSelected && sortedItems.some(p => selected.has(p.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(sortedItems.map(p => p.id)))
  const toggleOne = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  useEffect(() => { if (headerRef.current) headerRef.current.indeterminate = someSelected }, [someSelected])
  useEffect(() => { setSelected(new Set()) }, [data])

  const thClass = (sortKey) =>
    `tbl-th tbl-th-drag${sortKey ? ' hover:bg-gray-100' : ''}`

  const colDefs = {
    paziente: {
      label: 'Paziente', sortKey: 'cognome',
      render: (p) => {
        const mancanti = []
        if (!p.consenso_trattamento) mancanti.push('trattamento sanitario')
        if (!p.consenso_privacy) mancanti.push('privacy/GDPR')
        return (
          <td key="paziente" className="tbl-td">
            <div className="flex items-center gap-1.5">
              <button onClick={() => apriCartella(p)} className="text-left group">
                <p className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors whitespace-nowrap">
                  <Highlight text={`${p.cognome} ${p.nome}`} query={cerca} />
                </p>
              </button>
              {mancanti.length > 0 && (
                <span
                  role="img"
                  aria-label={`Consensi mancanti: ${mancanti.join(', ')}`}
                  title={`Consensi mancanti: ${mancanti.join(', ')}`}
                  className="text-amber-600 text-sm leading-none cursor-help"
                >
                  ⚠
                </span>
              )}
            </div>
          </td>
        )
      }
    },
    nascita: {
      label: 'Nascita', sortKey: 'data_nascita',
      render: (p) => <td key="nascita" className="tbl-td text-gray-600 whitespace-nowrap">{p.data_nascita ?? '—'}</td>
    },
    telefono: {
      label: 'Telefono', sortKey: 'telefono',
      render: (p) => <td key="telefono" className="tbl-td text-gray-600 whitespace-nowrap">{p.telefono ? <Highlight text={p.telefono} query={cerca} /> : '—'}</td>
    },
    email: {
      label: 'Email', sortKey: 'email',
      render: (p) => <td key="email" className="tbl-td text-gray-600">{p.email ? <Highlight text={p.email} query={cerca} /> : '—'}</td>
    },
    codice_fiscale: {
      label: 'Cod. Fiscale', sortKey: 'codice_fiscale',
      render: (p) => <td key="codice_fiscale" className="tbl-td text-gray-600">{p.codice_fiscale ? <Highlight text={p.codice_fiscale} query={cerca} /> : '—'}</td>
    },
    creato: {
      label: 'Creato il', sortKey: 'created_at',
      render: (p) => <td key="creato" className="tbl-td text-gray-300 text-xs whitespace-nowrap" title={p.created_at}>{p.created_at ? dayjs(p.created_at).format('DD/MM/YYYY') : '—'}</td>
    },
    azioni: {
      label: 'Azioni',
      render: (p) => (
        <td key="azioni" className="tbl-td">
          <button onClick={() => setModalElimina({ id: p.id, nome: `${p.cognome} ${p.nome}`, referenze: null })}
            className="text-red-600 hover:text-red-800 text-xs font-medium">
            Elimina
          </button>
        </td>
      )
    },
  }

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pazienti</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToCsv(`pazienti_${dayjs().format('YYYYMMDD')}`, [
              { key: 'cognome', label: 'Cognome' },
              { key: 'nome', label: 'Nome' },
              { key: 'codice_fiscale', label: 'Codice fiscale' },
              { key: 'data_nascita', label: 'Data nascita', format: v => v ? dayjs(v).format('DD/MM/YYYY') : '' },
              { key: 'sesso', label: 'Sesso' },
              { key: 'telefono', label: 'Telefono' },
              { key: 'email', label: 'Email' },
              { key: 'citta', label: 'Città' },
              { key: 'attivo', label: 'Attivo', format: v => v ? 'Sì' : 'No' },
            ], data?.items ?? [])}
            disabled={!data?.items?.length}
            className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            Esporta CSV
          </button>
          <button onClick={() => apri()} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
            + Nuovo Paziente
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-3 flex gap-2 items-center">
        <input type="text" placeholder="Cerca per nome, cognome, codice fiscale, telefono..."
          aria-label="Cerca pazienti per nome, cognome, codice fiscale o telefono"
          value={cerca} onChange={e => { setCerca(e.target.value); setPagina(1) }}
          className={`flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${cerca ? 'filtro-attivo' : 'border-gray-300'}`} />
        {cerca && (
          <button onClick={() => { setCerca(''); setPagina(1) }}
            className="px-3 py-2 text-xs font-medium bg-orange-100 border border-orange-700 rounded-lg hover:bg-orange-200 whitespace-nowrap">
            ↻ Reset
          </button>
        )}
      </div>

      <div className="tbl-count">{sortedItems.length} risultati{data?.totale != null && data.totale !== sortedItems.length ? ` di ${data.totale}` : ''}</div>
      <div className="tbl-card">
        {isLoading ? (
          <div className="tbl-empty" role="status" aria-live="polite">Caricamento...</div>
        ) : !data?.items?.length ? (
          <div className="tbl-empty" role="status" aria-live="polite">Nessun paziente trovato</div>
        ) : (
          <>
          {selected.size > 0 && (
            <div className="tbl-bulkbar">
              <span className="text-xs font-medium text-blue-700">{selected.size} selezionati</span>
              <button onClick={() => { if (confirm(`Disattivare ${selected.size} pazienti?`)) bulkDisattivaMutation.mutate([...selected]) }}
                className="text-xs px-3 py-1 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50" disabled={bulkDisattivaMutation.isPending}>
                Disattiva selezionati
              </button>
              <button onClick={() => { if (confirm(`Eliminare definitivamente ${selected.size} pazienti selezionati?`)) bulkEliminaMutation.mutate([...selected]) }}
                className="text-xs px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50" disabled={bulkEliminaMutation.isPending}>
                Elimina selezionati
              </button>
            </div>
          )}
          <table className="tbl">
            <caption className="sr-only">Elenco pazienti</caption>
            <thead className="tbl-thead">
              <tr>
                <th scope="col" className="tbl-th-cb">
                  <input type="checkbox" ref={headerRef} checked={allSelected} onChange={toggleAll} aria-label="Seleziona tutti i pazienti" className="rounded border-gray-300 cursor-pointer" />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('id')}>ID {si('id')}</th>
                {order.map(key => {
                  const col = colDefs[key]
                  return (
                    <th key={key} scope="col"
                      className={thClass(col.sortKey)}
                      onClick={col.sortKey ? () => handleSort(col.sortKey) : undefined}
                      {...headerProps(key)}>
                      {col.label} {col.sortKey && si(col.sortKey)}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="tbl-tbody">
              {sortedItems.map(p => (
                <tr key={p.id} className={selected.has(p.id) ? 'tbl-row-selected' : ''}>
                  <td className="tbl-td-cb">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} aria-label={`Seleziona paziente ${p.cognome} ${p.nome}`} className="rounded border-gray-300 cursor-pointer" />
                  </td>
                  <td className="tbl-td-id">#{p.id}</td>
                  {order.map(key => colDefs[key].render(p))}
                </tr>
              ))}
            </tbody>
          </table>
          </>
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

      {modalElimina && (
        <ModalEliminaConferma
          nome={modalElimina.nome}
          referenze={modalElimina.referenze}
          isLoading={eliminaMutation.isPending}
          onConferma={() => eliminaMutation.mutate(modalElimina.id)}
          onAnnulla={() => setModalElimina(null)}
        />
      )}
    </div>
  )
}
