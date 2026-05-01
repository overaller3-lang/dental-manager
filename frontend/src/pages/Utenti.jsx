import { useState, useRef, useEffect } from 'react'
import dayjs from 'dayjs'
import { usePersistedState } from '../hooks/usePersistedState'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useTabs } from '../context/TabContext'
import Highlight from '../components/Highlight'
import ModalEliminaConferma from '../components/ModalEliminaConferma'
import { useColOrder } from '../hooks/useColOrder'
import SchedaUtente from './SchedaUtente'
import { FormAppuntamento } from './Appuntamenti'
import UserAvatar from '../components/UserAvatar'
import { classeRuolo } from '../utils/colori'

const FORM_VUOTO = { nome: '', cognome: '', username: '', email_login: '', password: '', ruoli_nomi: [''] }

const RUOLI_OPERATORI = new Set([
  'dentista', 'igienista', 'ortodontista', 'endodontista',
  'parodontologo', 'medico_estetico', 'aso', 'titolare',
  'dir_sanitario', 'protesista',
])

export function FormNuovoUtente({ onClose }) {
  const [form, setForm] = useState(FORM_VUOTO)
  const [errore, setErrore] = useState('')
  const queryClient = useQueryClient()

  const { data: ruoli } = useQuery({
    queryKey: ['ruoli'],
    queryFn: async () => {
      const res = await api.get('/ruoli')
      return res.data
    }
  })

  const creaMutation = useMutation({
    mutationFn: (dati) => api.post('/utenti', dati, { _silent: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['utenti'] })
      onClose()
    },
    onError: (e) => setErrore(e.response?.data?.detail || 'Errore nella creazione')
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setErrore('')
    if (!form.nome.trim() || !form.cognome.trim() || !form.username.trim() || !form.email_login.trim() || !form.password.trim()) {
      setErrore('Compila tutti i campi obbligatori')
      return
    }
    creaMutation.mutate({ ...form, ruoli_nomi: form.ruoli_nomi.filter(r => r) })
  }

  const setRuolo = (i, val) => setForm(f => {
    const r = [...f.ruoli_nomi]; r[i] = val; return { ...f, ruoli_nomi: r }
  })
  const aggiungiRuolo = () => setForm(f => ({ ...f, ruoli_nomi: [...f.ruoli_nomi, ''] }))
  const rimuoviRuolo = (i) => setForm(f => ({ ...f, ruoli_nomi: f.ruoli_nomi.filter((_, j) => j !== i) }))

  const inp = (label, name, type = 'text') => (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label} <span className="text-red-500">*</span></label>
      <input type={type} value={form[name]} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoComplete={type === 'password' ? 'new-password' : 'off'} />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="p-4 max-w-md">
      <div className="grid grid-cols-2 gap-3 mb-3">
        {inp('Nome', 'nome')}
        {inp('Cognome', 'cognome')}
      </div>
      <div className="space-y-3 mb-3">
        {inp('Username', 'username')}
        {inp('Email', 'email_login', 'email')}
        {inp('Password', 'password', 'password')}
      </div>
      <div className="mb-4 space-y-2">
        <label className="block text-xs font-medium text-gray-700">Ruoli</label>
        {form.ruoli_nomi.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <select value={r} onChange={e => setRuolo(i, e.target.value)}
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Nessun ruolo —</option>
              {ruoli?.map(ro => <option key={ro.id} value={ro.nome}>{ro.nome}</option>)}
            </select>
            {form.ruoli_nomi.length > 1 && (
              <button type="button" onClick={() => rimuoviRuolo(i)} aria-label="Rimuovi ruolo"
                className="text-red-500 hover:text-red-700 text-lg leading-none w-6 h-6 flex items-center justify-center"><span aria-hidden="true">×</span></button>
            )}
            {i === form.ruoli_nomi.length - 1 && (
              <button type="button" onClick={aggiungiRuolo} aria-label="Aggiungi un altro ruolo"
                className="w-6 h-6 flex items-center justify-center bg-blue-600 text-white rounded text-sm hover:bg-blue-700"><span aria-hidden="true">+</span></button>
            )}
          </div>
        ))}
      </div>
      {errore && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-4">{errore}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
        <button type="submit" disabled={creaMutation.isPending} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {creaMutation.isPending ? 'Creazione...' : 'Crea Utente'}
        </button>
      </div>
    </form>
  )
}

const COL_KEYS = ['utente', 'ruolo', 'username', 'password', 'email', 'stato', 'creato', 'azioni']

export default function Utenti() {
  const [cerca, setCerca] = usePersistedState('utenti.cerca', '')
  const [sortBy, setSortBy] = usePersistedState('utenti.sortBy', 'cognome')
  const [sortDir, setSortDir] = usePersistedState('utenti.sortDir', 'asc')
  const [selected, setSelected] = useState(new Set())
  const [modalElimina, setModalElimina] = useState(null)
  const [openDropdownId, setOpenDropdownId] = useState(null)
  const headerRef = useRef(null)
  const queryClient = useQueryClient()
  const { openTab, openTabDedup } = useTabs()
  const { order, headerProps } = useColOrder('utenti', COL_KEYS)

  const handleSort = (campo) => {
    if (sortBy === campo) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(campo); setSortDir('asc') }
  }
  const si = (campo) => (
    <><span aria-hidden="true" className={`ml-0.5 text-[10px] cursor-pointer ${sortBy === campo ? 'text-blue-600' : 'text-gray-400'}`}>
      {sortBy === campo ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>{sortBy === campo && <span className="sr-only">, ordinato {sortDir === 'asc' ? 'crescente' : 'decrescente'}</span>}</>
  )

  useEffect(() => {
    const close = () => setOpenDropdownId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['utenti', cerca, sortBy, sortDir],
    queryFn: async () => {
      const params = new URLSearchParams({ pagina: 1, per_pagina: 100 })
      if (cerca) params.append('cerca', cerca)
      if (sortBy) { params.append('ordina_per', sortBy); params.append('direzione', sortDir) }
      const res = await api.get(`/utenti?${params}`)
      return res.data
    }
  })

  const disattivaMutation = useMutation({
    mutationFn: (id) => api.delete(`/utenti/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['utenti'] })
  })

  const riattivaMutation = useMutation({
    mutationFn: (id) => api.post(`/utenti/${id}/riattiva`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['utenti'] })
  })

  const eliminaMutation = useMutation({
    mutationFn: (id) => api.delete(`/utenti/${id}/elimina`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['utenti'] })
      setModalElimina(null)
    },
    onError: (e) => {
      const detail = e.response?.data?.detail
      if (e.response?.status === 409 && detail?.referenze) {
        setModalElimina(prev => ({ ...prev, referenze: detail.referenze }))
      }
    }
  })

  const bulkDisattivaMutation = useMutation({
    mutationFn: (ids) => Promise.all(ids.map(id => api.delete(`/utenti/${id}`))),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['utenti'] }); setSelected(new Set()) }
  })

  const bulkRiattivaMutation = useMutation({
    mutationFn: (ids) => Promise.all(ids.map(id => api.post(`/utenti/${id}/riattiva`))),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['utenti'] }); setSelected(new Set()) }
  })

  const bulkEliminaMutation = useMutation({
    mutationFn: async (ids) => {
      const results = await Promise.allSettled(ids.map(id => api.delete(`/utenti/${id}/elimina`)))
      const errors = results.filter(r => r.status === 'rejected').map(r => r.reason)
      if (errors.length) throw errors[0]
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['utenti'] }); setSelected(new Set()) },
    onError: (e) => {
      const detail = e.response?.data?.detail
      if (e.response?.status === 409 && detail?.referenze) {
        setModalElimina({ id: null, nome: 'alcuni utenti selezionati', referenze: detail.referenze })
      }
    }
  })

  // Ordinamento server-side: il backend restituisce gia' ordinato l'intero
  // dataset. Il sort per "ruoli" (array) non e' supportato a livello SQL e
  // viene ignorato dal backend (la query ricade sull'ordinamento di default).
  const utentiOrdinati = data?.items ?? []

  const allSelected = utentiOrdinati.length > 0 && utentiOrdinati.every(u => selected.has(u.id))
  const someSelected = !allSelected && utentiOrdinati.some(u => selected.has(u.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(utentiOrdinati.map(u => u.id)))
  const toggleOne = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  useEffect(() => { if (headerRef.current) headerRef.current.indeterminate = someSelected }, [someSelected])
  useEffect(() => { setSelected(new Set()) }, [data])

  const thClass = (sortKey) =>
    `tbl-th tbl-th-drag${sortKey ? ' hover:bg-gray-100' : ''}`

  const colDefs = {
    utente: {
      label: 'Utente', sortKey: 'cognome',
      render: (u) => (
        <td key="utente" className="tbl-td">
          <button onClick={() => openTabDedup(`${u.cognome} ${u.nome}`, SchedaUtente, { utenteId: u.id }, 'scheda-utente', `utente-${u.id}`)} className="text-left group flex items-center gap-2">
            <UserAvatar utente={u} size="sm" />
            <p className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors"><Highlight text={`${u.cognome} ${u.nome}`} query={cerca} /></p>
          </button>
        </td>
      )
    },
    ruolo: {
      label: 'Ruolo', sortKey: 'ruoli',
      render: (u) => (
        <td key="ruolo" className="tbl-td">
          <div className="flex gap-1 flex-wrap">
            {u.ruoli?.map(r => (
              <span key={r} className={`text-xs px-2 py-0.5 rounded-full ${classeRuolo(r)}`}>{r}</span>
            ))}
          </div>
        </td>
      )
    },
    username: {
      label: 'Username', sortKey: 'username',
      render: (u) => <td key="username" className="tbl-td text-gray-600"><Highlight text={u.username} query={cerca} /></td>
    },
    password: {
      label: 'Password',
      render: (u) => <td key="password" className="tbl-td text-gray-400 font-mono tracking-widest" title="Le password sono hashate, non recuperabili">••••••••</td>
    },
    email: {
      label: 'Email', sortKey: 'email_login',
      render: (u) => <td key="email" className="tbl-td text-gray-600"><Highlight text={u.email_login} query={cerca} /></td>
    },
    stato: {
      label: 'Stato', sortKey: 'attivo',
      render: (u) => (
        <td key="stato" className="tbl-td">
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setOpenDropdownId(id => id === u.id ? null : u.id) }}
              className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 transition-colors ${
                u.attivo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
            >
              {u.attivo ? 'Attivo' : 'Disattivo'}
              <span className="text-[9px] opacity-60">▾</span>
            </button>
            {openDropdownId === u.id && (
              <div className="absolute left-0 top-full mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-0.5 min-w-max">
                {u.attivo ? (
                  <button
                    onClick={() => { disattivaMutation.mutate(u.id); setOpenDropdownId(null) }}
                    disabled={disattivaMutation.isPending}
                    className="block px-3 py-1.5 text-xs text-orange-600 hover:bg-orange-50 w-full text-left rounded-lg disabled:opacity-50">
                    Disattiva
                  </button>
                ) : (
                  <button
                    onClick={() => { riattivaMutation.mutate(u.id); setOpenDropdownId(null) }}
                    disabled={riattivaMutation.isPending}
                    className="block px-3 py-1.5 text-xs text-green-600 hover:bg-green-50 w-full text-left rounded-lg disabled:opacity-50">
                    Attiva
                  </button>
                )}
              </div>
            )}
          </div>
        </td>
      )
    },
    creato: {
      label: 'Creato il', sortKey: 'created_at',
      render: (u) => <td key="creato" className="tbl-td text-gray-300 text-xs whitespace-nowrap" title={u.created_at}>{u.created_at ? dayjs(u.created_at).format('DD/MM/YYYY') : '—'}</td>
    },
    azioni: {
      label: 'Azioni',
      render: (u) => {
        const isOp = u.ruoli?.some(r => RUOLI_OPERATORI.has(r))
        return (
          <td key="azioni" className="tbl-td">
            {isOp ? (
              <button
                onClick={() => openTab('Nuovo appuntamento', FormAppuntamento, { initialDentistaId: u.id }, 'appuntamento')}
                className="text-blue-600 hover:text-blue-800 text-xs font-medium whitespace-nowrap">
                Crea appuntamento
              </button>
            ) : <span className="text-gray-300 text-xs">—</span>}
          </td>
        )
      }
    },
  }

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Utenti</h1>
        </div>
        <button onClick={() => openTab('Nuovo utente', FormNuovoUtente, {}, 'utente')}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          + Nuovo Utente
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-3 flex gap-2 items-center">
        <input type="text" placeholder="Cerca per nome, cognome, username, email..."
          aria-label="Cerca utenti per nome, cognome, username o email"
          value={cerca} onChange={e => setCerca(e.target.value)}
          className={`flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${cerca ? 'filtro-attivo' : 'border-gray-300'}`} />
        {cerca && (
          <button onClick={() => setCerca('')}
            className="px-3 py-2 text-xs font-medium bg-orange-100 border border-orange-700 rounded-lg hover:bg-orange-200 whitespace-nowrap">
            ↻ Reset
          </button>
        )}
      </div>

      <div className="tbl-count">{utentiOrdinati.length} risultati{data?.totale != null && data.totale !== utentiOrdinati.length ? ` di ${data.totale}` : ''}</div>
      <div className="tbl-card">
        {isLoading ? (
          <div className="tbl-empty" role="status" aria-live="polite">Caricamento...</div>
        ) : !utentiOrdinati.length ? (
          <div className="tbl-empty" role="status" aria-live="polite">Nessun utente trovato</div>
        ) : (
          <>
          {selected.size > 0 && (
            <div className="tbl-bulkbar">
              <span className="text-xs font-medium text-blue-700">{selected.size} selezionati</span>
              <button onClick={() => { if (confirm(`Disattivare ${selected.size} utenti?`)) bulkDisattivaMutation.mutate([...selected].filter(id => utentiOrdinati.find(u => u.id === id)?.attivo)) }}
                className="text-xs px-3 py-1 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50" disabled={bulkDisattivaMutation.isPending}>
                Disattiva selezionati
              </button>
              <button onClick={() => bulkRiattivaMutation.mutate([...selected].filter(id => !utentiOrdinati.find(u => u.id === id)?.attivo))}
                className="text-xs px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50" disabled={bulkRiattivaMutation.isPending}>
                Riattiva selezionati
              </button>
              <button onClick={() => { if (confirm(`Eliminare definitivamente ${selected.size} utenti selezionati?`)) bulkEliminaMutation.mutate([...selected]) }}
                className="text-xs px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50" disabled={bulkEliminaMutation.isPending}>
                Elimina selezionati
              </button>
            </div>
          )}
          <table className="tbl">
            <caption className="sr-only">Elenco utenti registrati</caption>
            <thead className="tbl-thead">
              <tr>
                <th scope="col" className="tbl-th-cb">
                  <input type="checkbox" ref={headerRef} checked={allSelected} onChange={toggleAll} aria-label="Seleziona tutti gli utenti" className="rounded border-gray-300 cursor-pointer" />
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
              {utentiOrdinati.map(u => (
                <tr key={u.id} className={selected.has(u.id) ? 'tbl-row-selected' : ''}>
                  <td className="tbl-td-cb">
                    <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} aria-label={`Seleziona ${u.cognome} ${u.nome}`} className="rounded border-gray-300 cursor-pointer" />
                  </td>
                  <td className="tbl-td-id">#{u.id}</td>
                  {order.map(key => colDefs[key].render(u))}
                </tr>
              ))}
            </tbody>
          </table>
          </>
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
