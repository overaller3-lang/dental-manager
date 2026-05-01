import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useTabFocusRefetch } from '../hooks/useTabFocusRefetch'
import { useTabs } from '../context/TabContext'
import { FormAppuntamento } from './Appuntamenti'
import CartellaPaziente from './CartellaPaziente'
import ModalEliminaConferma from '../components/ModalEliminaConferma'
import StatisticheOperatore from '../components/StatisticheOperatore'
import UserAvatar from '../components/UserAvatar'
import { classeRuolo, PALETTE_AVATAR, coloreAvatar } from '../utils/colori'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
dayjs.locale('it')

const RUOLI_OPERATORI = new Set([
  'dentista', 'igienista', 'ortodontista', 'endodontista',
  'parodontologo', 'medico_estetico', 'aso', 'titolare',
  'dir_sanitario', 'protesista',
])

const coloreStato = {
  prenotato: 'bg-yellow-100 text-yellow-700',
  confermato: 'bg-green-100 text-green-700',
  in_corso: 'bg-blue-100 text-blue-700',
  completato: 'bg-gray-100 text-gray-600',
  annullato: 'bg-red-100 text-red-700',
  non_presentato: 'bg-orange-100 text-orange-700',
}

function parseApiError(e, def = 'Errore nel salvataggio') {
  const detail = e?.response?.data?.detail
  if (!detail) return e?.message || def
  if (typeof detail === 'string') return detail
  if (detail?.messaggio) return detail.messaggio
  if (Array.isArray(detail)) return detail.map(d => d.msg || JSON.stringify(d)).join('; ')
  return JSON.stringify(detail)
}

export default function SchedaUtente({ utenteId, onClose }) {
  const queryClient = useQueryClient()
  const { openTab } = useTabs()
  const [sezione, setSezione] = useState('dati')
  const [modifica, setModifica] = useState(false)
  const [form, setForm] = useState({})
  const [errore, setErrore] = useState('')
  const [modalElimina, setModalElimina] = useState(null)

  const { data: utente, isLoading, refetch } = useQuery({
    queryKey: ['utente', utenteId],
    queryFn: async () => (await api.get(`/utenti/${utenteId}`)).data,
    enabled: !!utenteId,
    staleTime: 30_000,
  })

  const { data: appuntamenti, isLoading: loadingApp, refetch: refetchApp } = useQuery({
    queryKey: ['utente-appuntamenti-tutti', utenteId],
    queryFn: async () => {
      const params = new URLSearchParams({ dentista_id: utenteId, pagina: 1, per_pagina: 100 })
      return (await api.get(`/appuntamenti?${params}`)).data
    },
    enabled: !!utenteId && sezione === 'appuntamenti',
    staleTime: 30_000,
  })

  const { data: pazientiVisitati, isLoading: loadingPazienti } = useQuery({
    queryKey: ['utente-pazienti', utenteId],
    queryFn: async () => (await api.get(`/utenti/${utenteId}/pazienti`)).data,
    enabled: !!utenteId && sezione === 'pazienti',
    staleTime: 30_000,
  })

  useTabFocusRefetch(refetch, refetchApp)

  const aggiornaMutation = useMutation({
    mutationFn: (dati) => api.patch(`/utenti/${utenteId}`, dati, { _silent: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['utente', utenteId] })
      queryClient.invalidateQueries({ queryKey: ['utenti'] })
      setModifica(false)
      setErrore('')
    },
    onError: (e) => setErrore(parseApiError(e)),
  })

  const eliminaMutation = useMutation({
    mutationFn: () => api.delete(`/utenti/${utenteId}/elimina`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['utenti'] })
      setModalElimina(null)
      onClose?.()
    },
    onError: (e) => {
      const detail = e.response?.data?.detail
      if (e.response?.status === 409 && detail?.referenze) {
        setModalElimina(prev => ({ ...prev, referenze: detail.referenze }))
      }
    },
  })

  const apriModifica = () => {
    setForm({
      nome: utente.nome || '',
      cognome: utente.cognome || '',
      email_login: utente.email_login || '',
      codice_fiscale: utente.codice_fiscale || '',
      indirizzo: utente.indirizzo || '',
      citta: utente.citta || '',
      cap: utente.cap || '',
      provincia: utente.provincia || '',
      colore_avatar: utente.colore_avatar || coloreAvatar(utente),
    })
    setErrore('')
    setModifica(true)
  }

  if (isLoading) return <div className="p-4 text-center text-gray-400 text-sm">Caricamento...</div>
  if (!utente) return <div className="p-4 text-center text-gray-400 text-sm">Utente non trovato</div>

  const isOperatore = utente.ruoli?.some(r => RUOLI_OPERATORI.has(r))

  const sezioni = [
    { key: 'dati', label: 'Dati' },
    { key: 'appuntamenti', label: 'Appuntamenti' },
    ...(isOperatore ? [{ key: 'pazienti', label: 'Pazienti' }] : []),
    ...(isOperatore ? [{ key: 'statistiche', label: 'Statistiche' }] : []),
  ]

  const inp = (label, key) => (
    <div key={key}>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={key === 'email_login' ? 'email' : 'text'}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )

  return (
    <div className="p-4">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <UserAvatar utente={utente} size="lg" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">{utente.cognome} {utente.nome}</h1>
            <p className="text-sm text-gray-500">@{utente.username}</p>
            <div className="flex gap-1 mt-1 flex-wrap">
              {utente.ruoli?.map(r => (
                <span key={r} className={`text-xs px-2 py-0.5 rounded-full font-medium ${classeRuolo(r)}`}>{r}</span>
              ))}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${utente.attivo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {utente.attivo ? 'Attivo' : 'Inattivo'}
              </span>
            </div>
          </div>
        </div>
        {!modifica && sezione === 'dati' && (
          <button onClick={apriModifica} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Modifica
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {sezioni.map(s => (
          <button
            key={s.key}
            onClick={() => { setSezione(s.key); setModifica(false) }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              sezione === s.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {sezione === 'dati' && (
        modifica ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-3 max-w-lg">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Modifica dati</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {inp('Cognome', 'cognome')}
                {inp('Nome', 'nome')}
              </div>
              {inp('Email login', 'email_login')}
              {inp('Codice fiscale', 'codice_fiscale')}
              {inp('Indirizzo', 'indirizzo')}
              <div className="grid grid-cols-3 gap-2">
                {inp('Città', 'citta')}
                {inp('CAP', 'cap')}
                {inp('Provincia', 'provincia')}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Colore avatar</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PALETTE_AVATAR.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, colore_avatar: c }))}
                      aria-label={`Seleziona colore ${c}`}
                      className={`w-8 h-8 rounded-md border-2 transition-transform hover:scale-110 ${form.colore_avatar === c ? 'border-gray-900 ring-2 ring-gray-300' : 'border-gray-200'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={form.colore_avatar || '#2563eb'}
                    onChange={e => setForm(f => ({ ...f, colore_avatar: e.target.value }))}
                    className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                    aria-label="Colore personalizzato"
                  />
                  <div className="ml-2 px-2 py-1 rounded-md text-white text-xs font-bold" style={{ backgroundColor: form.colore_avatar }}>
                    {utente.cognome?.[0]}{utente.nome?.[0]}
                  </div>
                </div>
              </div>
            </div>
            {errore && (
              <p role="alert" className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{errore}</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setModifica(false); setErrore('') }}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Annulla
              </button>
              <button
                onClick={() => aggiornaMutation.mutate(form)}
                disabled={aggiornaMutation.isPending}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {aggiornaMutation.isPending ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 max-w-lg">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Dati account</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-28 text-gray-500 shrink-0">Email login</dt>
                <dd className="text-gray-900">{utente.email_login || '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 text-gray-500 shrink-0">Username</dt>
                <dd className="text-gray-900 font-mono">{utente.username}</dd>
              </div>
              {utente.indirizzo && (
                <div className="flex gap-2">
                  <dt className="w-28 text-gray-500 shrink-0">Indirizzo</dt>
                  <dd className="text-gray-900">{utente.indirizzo}{utente.citta ? `, ${utente.citta}` : ''}{utente.cap ? ` ${utente.cap}` : ''}{utente.provincia ? ` (${utente.provincia})` : ''}</dd>
                </div>
              )}
              {utente.codice_fiscale && (
                <div className="flex gap-2">
                  <dt className="w-28 text-gray-500 shrink-0">Cod. fiscale</dt>
                  <dd className="text-gray-900 font-mono">{utente.codice_fiscale}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="w-28 text-gray-500 shrink-0">ID</dt>
                <dd className="text-gray-400 font-mono text-xs">#{utente.id}</dd>
              </div>
            </dl>
          </div>
        )
      )}

      {sezione === 'appuntamenti' && (
        <div className="space-y-3">
          {isOperatore && (
            <div>
              <button
                onClick={() => openTab('Nuovo appuntamento', FormAppuntamento, { initialDentistaId: utenteId }, 'appuntamento')}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                + Crea appuntamento
              </button>
            </div>
          )}
          <div className="tbl-count">{appuntamenti?.items?.length ?? 0} risultati{appuntamenti?.totale != null && appuntamenti.totale !== appuntamenti?.items?.length ? ` di ${appuntamenti.totale}` : ''}</div>
          <div className="tbl-card">
            {loadingApp ? (
              <div className="tbl-empty">Caricamento...</div>
            ) : !appuntamenti?.items?.length ? (
              <div className="tbl-empty">Nessun appuntamento</div>
            ) : (
              <table className="tbl">
                <thead className="tbl-thead">
                  <tr>
                    <th scope="col" className="tbl-th">Data</th>
                    <th scope="col" className="tbl-th">Paziente</th>
                    <th scope="col" className="tbl-th">Tipo</th>
                    <th scope="col" className="tbl-th">Sala</th>
                    <th scope="col" className="tbl-th">Stato</th>
                  </tr>
                </thead>
                <tbody className="tbl-tbody">
                  {[...appuntamenti.items]
                    .sort((a, b) => new Date(b.data_ora_inizio) - new Date(a.data_ora_inizio))
                    .map(a => (
                      <tr key={a.id}>
                        <td className="tbl-td text-gray-700 whitespace-nowrap">
                          <p>{dayjs(a.data_ora_inizio).format('DD/MM/YYYY')}</p>
                          <p className="text-xs text-gray-400">
                            {dayjs(a.data_ora_inizio).format('HH:mm')} – {dayjs(a.data_ora_fine).format('HH:mm')}
                          </p>
                        </td>
                        <td className="tbl-td text-gray-700 whitespace-nowrap">
                          {a.paziente_cognome ? `${a.paziente_cognome} ${a.paziente_nome}` : '—'}
                        </td>
                        <td className="tbl-td text-gray-700">{a.tipo?.replace('_', ' ')}</td>
                        <td className="tbl-td text-gray-600">{a.sala || '—'}</td>
                        <td className="tbl-td">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${coloreStato[a.stato] || 'bg-gray-100 text-gray-600'}`}>
                            {a.stato}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {sezione === 'pazienti' && isOperatore && (
        <>
        <div className="tbl-count">{pazientiVisitati?.length ?? 0} risultati</div>
        <div className="tbl-card">
          {loadingPazienti ? (
            <div className="tbl-empty">Caricamento...</div>
          ) : !pazientiVisitati?.length ? (
            <div className="tbl-empty">Nessun paziente visitato</div>
          ) : (
            <table className="tbl">
              <thead className="tbl-thead">
                <tr>
                  <th scope="col" className="tbl-th">Paziente</th>
                  <th scope="col" className="tbl-th">Telefono</th>
                  <th scope="col" className="tbl-th">Email</th>
                  <th scope="col" className="tbl-th !text-right">Visite</th>
                  <th scope="col" className="tbl-th">Ultima visita</th>
                </tr>
              </thead>
              <tbody className="tbl-tbody">
                {pazientiVisitati.map(p => (
                  <tr key={p.id}>
                    <td className="tbl-td">
                      <button onClick={() => openTab(`${p.cognome} ${p.nome}`, CartellaPaziente, { pazienteId: p.id }, 'scheda-paziente')}
                        className="font-medium text-gray-900 hover:text-blue-600 transition-colors text-left whitespace-nowrap">
                        {p.cognome} {p.nome}
                      </button>
                    </td>
                    <td className="tbl-td text-gray-600 whitespace-nowrap">{p.telefono || '—'}</td>
                    <td className="tbl-td text-gray-600">{p.email || '—'}</td>
                    <td className="tbl-td text-right font-medium text-gray-900">{p.totale_appuntamenti}</td>
                    <td className="tbl-td text-gray-600 whitespace-nowrap">
                      {p.ultimo_appuntamento ? dayjs(p.ultimo_appuntamento).format('DD/MM/YYYY') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </>
      )}

      {sezione === 'statistiche' && isOperatore && (
        <StatisticheOperatore utenteId={utenteId} />
      )}

      <div className="mt-8 pt-4 border-t border-gray-100">
        <button
          onClick={() => setModalElimina({ nome: `${utente.cognome} ${utente.nome}`, referenze: null })}
          className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
          Elimina utente
        </button>
      </div>

      {modalElimina && (
        <ModalEliminaConferma
          nome={modalElimina.nome}
          referenze={modalElimina.referenze}
          isLoading={eliminaMutation.isPending}
          onConferma={() => eliminaMutation.mutate()}
          onAnnulla={() => setModalElimina(null)}
        />
      )}
    </div>
  )
}
