import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useTabFocusRefetch } from '../hooks/useTabFocusRefetch'
import { useTabs } from '../context/TabContext'
import { FormAppuntamento } from './Appuntamenti'
import { FormPianoCura, DettaglioPianoCura } from './PianiCura'
import SchedaPreventivo from './SchedaPreventivo'
import { classeEnum, labelEnum } from '../utils/colori'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
import ModalEliminaConferma from '../components/ModalEliminaConferma'
import Odontogramma from '../components/Odontogramma'
dayjs.locale('it')

const coloreStato = {
  prenotato: 'bg-yellow-100 text-yellow-700',
  confermato: 'bg-green-100 text-green-700',
  in_corso: 'bg-blue-100 text-blue-700',
  completato: 'bg-gray-100 text-gray-600',
  annullato: 'bg-red-100 text-red-700',
  non_presentato: 'bg-orange-100 text-orange-700',
}

const colorePagamento = {
  in_attesa: 'bg-yellow-100 text-yellow-700',
  completato: 'bg-green-100 text-green-700',
  fallito: 'bg-red-100 text-red-700',
  rimborsato: 'bg-orange-100 text-orange-700',
}

export default function CartellaPaziente({ pazienteId, onClose, onModifica }) {
  const [sezione, setSezione] = useState('anagrafica')
  const [modalElimina, setModalElimina] = useState(null)
  const [mostraFormPiano, setMostraFormPiano] = useState(false)
  const queryClient = useQueryClient()
  const { openTab, openPage } = useTabs()

  const { data: paziente, isLoading: loadingPaz, refetch: refetchPaz } = useQuery({
    queryKey: ['paziente', pazienteId],
    queryFn: async () => {
      const res = await api.get(`/pazienti/${pazienteId}`)
      return res.data
    },
    enabled: !!pazienteId,
    staleTime: 30_000,
  })

  const { data: appuntamenti, isLoading: loadingApp, refetch: refetchApp } = useQuery({
    queryKey: ['paziente-appuntamenti', pazienteId],
    queryFn: async () => {
      const res = await api.get(`/pazienti/${pazienteId}/appuntamenti?per_pagina=100`)
      return res.data
    },
    enabled: !!pazienteId && sezione === 'appuntamenti',
    staleTime: 30_000,
  })

  const { data: finanze, isLoading: loadingFin, refetch: refetchFin } = useQuery({
    queryKey: ['paziente-finanze', pazienteId],
    queryFn: async () => {
      const res = await api.get(`/pazienti/${pazienteId}/pagamenti`)
      return res.data
    },
    enabled: !!pazienteId && sezione === 'pagamenti',
    staleTime: 30_000,
  })

  const { data: ordini, isLoading: loadingOrd, refetch: refetchOrd } = useQuery({
    queryKey: ['paziente-ordini', pazienteId],
    queryFn: async () => {
      const res = await api.get(`/pazienti/${pazienteId}/ordini?per_pagina=100`)
      return res.data
    },
    enabled: !!pazienteId && sezione === 'ordini',
    staleTime: 30_000,
  })

  const { data: piani, isLoading: loadingPiani, refetch: refetchPiani } = useQuery({
    queryKey: ['paziente-piani-cura', pazienteId],
    queryFn: async () => {
      const res = await api.get(`/piani-cura?paziente_id=${pazienteId}&per_pagina=100`)
      return res.data
    },
    enabled: !!pazienteId && sezione === 'piani_cura',
    staleTime: 30_000,
  })

  const { data: preventivi, isLoading: loadingPrev, refetch: refetchPrev } = useQuery({
    queryKey: ['paziente-preventivi', pazienteId],
    queryFn: async () => {
      const res = await api.get(`/preventivi?paziente_id=${pazienteId}&per_pagina=100`)
      return res.data
    },
    enabled: !!pazienteId && sezione === 'preventivi',
    staleTime: 30_000,
  })

  useTabFocusRefetch(refetchPaz, refetchApp, refetchFin, refetchOrd, refetchPiani, refetchPrev)

  const eliminaMutation = useMutation({
    mutationFn: () => api.delete(`/pazienti/${pazienteId}/elimina`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pazienti'] })
      setModalElimina(null)
      onClose?.()
    },
    onError: (e) => {
      const detail = e.response?.data?.detail
      if (e.response?.status === 409 && detail?.referenze) {
        setModalElimina(prev => ({ ...prev, referenze: detail.referenze }))
      }
    }
  })

  if (loadingPaz) {
    return <div className="p-4 text-center text-gray-400 text-sm">Caricamento...</div>
  }

  if (!paziente) {
    return <div className="p-4 text-center text-gray-400 text-sm">Paziente non trovato</div>
  }

  const sezioni = [
    { key: 'anagrafica', label: 'Anagrafica' },
    { key: 'odontogramma', label: 'Odontogramma' },
    { key: 'piani_cura', label: 'Piani di cura' },
    { key: 'preventivi', label: 'Preventivi' },
    { key: 'appuntamenti', label: 'Appuntamenti' },
    { key: 'ordini', label: 'Ordini' },
    { key: 'pagamenti', label: 'Pagamenti' },
  ]

  return (
    <div className="p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {paziente.cognome} {paziente.nome}
          </h1>
          <p className="text-gray-500 text-xs mt-0.5">
            {paziente.codice_fiscale && <span className="mr-3">CF: {paziente.codice_fiscale}</span>}
            {paziente.data_nascita && <span>Nato il {dayjs(paziente.data_nascita).format('DD/MM/YYYY')}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!paziente.attivo && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Inattivo</span>
          )}
          {paziente.anonimizzato && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Anonimizzato</span>
          )}
          {onModifica && !paziente.anonimizzato && (
            <button
              onClick={() => onModifica(paziente)}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Modifica
            </button>
          )}
          {!paziente.anonimizzato && (
            <button
              onClick={() => setModalElimina({ nome: `${paziente.cognome} ${paziente.nome}`, referenze: null })}
              className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              Elimina
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {sezioni.map(s => (
          <button
            key={s.key}
            onClick={() => setSezione(s.key)}
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

      {sezione === 'anagrafica' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Dati personali</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-32 text-gray-500 shrink-0">Telefono</dt>
                <dd className="text-gray-900">{paziente.telefono || '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-32 text-gray-500 shrink-0">Email</dt>
                <dd className="text-gray-900">{paziente.email || '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-32 text-gray-500 shrink-0">Sesso</dt>
                <dd className="text-gray-900">
                  {paziente.sesso === 'M' ? 'Maschio' : paziente.sesso === 'F' ? 'Femmina' : paziente.sesso || '—'}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-32 text-gray-500 shrink-0">Indirizzo</dt>
                <dd className="text-gray-900">
                  {[paziente.indirizzo, paziente.citta, paziente.cap, paziente.provincia]
                    .filter(Boolean).join(', ') || '—'}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-32 text-gray-500 shrink-0">Registrato il</dt>
                <dd className="text-gray-900">{dayjs(paziente.created_at).format('DD/MM/YYYY')}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Dati clinici</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500 mb-1">Anamnesi</dt>
                <dd className="text-gray-900 bg-gray-50 rounded p-2 text-xs whitespace-pre-wrap">
                  {paziente.anamnesi || 'Non compilata'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 mb-1">Allergie</dt>
                <dd className="text-gray-900 bg-gray-50 rounded p-2 text-xs whitespace-pre-wrap">
                  {paziente.allergie || 'Nessuna allergia registrata'}
                </dd>
              </div>
              {paziente.note && (
                <div>
                  <dt className="text-gray-500 mb-1">Note</dt>
                  <dd className="text-gray-900 bg-gray-50 rounded p-2 text-xs whitespace-pre-wrap">{paziente.note}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 lg:col-span-2">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Consensi (L. 219/2017 — GDPR)</h3>
            <div className="flex gap-4 flex-wrap">
              {[
                { key: 'consenso_trattamento', label: 'Trattamento sanitario' },
                { key: 'consenso_privacy', label: 'Trattamento dati personali' },
                { key: 'consenso_marketing', label: 'Marketing' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    paziente[key] ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                  }`}>
                    {paziente[key] ? '✓' : '✗'}
                  </span>
                  <span className="text-sm text-gray-700">{label}</span>
                </div>
              ))}
              {paziente.data_consenso && (
                <span className="text-xs text-gray-400 ml-auto">
                  Consensi acquisiti il {dayjs(paziente.data_consenso).format('DD/MM/YYYY')}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {sezione === 'odontogramma' && (
        <Odontogramma pazienteId={pazienteId} />
      )}

      {sezione === 'piani_cura' && (
        <div className="space-y-3">
          <div>
            <button
              onClick={() => setMostraFormPiano(true)}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              + Crea piano di cura
            </button>
          </div>
          <div className="tbl-count">{piani?.items?.length ?? 0} risultati{piani?.totale != null && piani.totale !== piani?.items?.length ? ` di ${piani.totale}` : ''}</div>
          <div className="tbl-card">
            {loadingPiani ? (
              <div className="tbl-empty">Caricamento...</div>
            ) : !piani?.items?.length ? (
              <div className="tbl-empty">Nessun piano di cura</div>
            ) : (
              <table className="tbl">
                <thead className="tbl-thead">
                  <tr>
                    <th scope="col" className="tbl-th">Numero</th>
                    <th scope="col" className="tbl-th">Titolo</th>
                    <th scope="col" className="tbl-th">Referente</th>
                    <th scope="col" className="tbl-th">Stato</th>
                    <th scope="col" className="tbl-th">Sedute</th>
                    <th scope="col" className="tbl-th">Aperto il</th>
                    <th scope="col" className="tbl-th"></th>
                  </tr>
                </thead>
                <tbody className="tbl-tbody">
                  {piani.items.map(p => (
                    <tr key={p.id}>
                      <td className="tbl-td font-mono text-xs">{p.numero}</td>
                      <td className="tbl-td">{p.titolo}</td>
                      <td className="tbl-td text-gray-600">{p.dentista_referente_cognome ? `Dr. ${p.dentista_referente_cognome}` : '—'}</td>
                      <td className="tbl-td">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${classeEnum('stato_piano_cura', p.stato)}`}>
                          {labelEnum(p.stato)}
                        </span>
                      </td>
                      <td className="tbl-td">{p.n_appuntamenti_completati}/{p.n_appuntamenti_totali}</td>
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
          </div>
        </div>
      )}

      {sezione === 'preventivi' && (
        <>
          <div className="tbl-count">{preventivi?.items?.length ?? 0} risultati{preventivi?.totale != null && preventivi.totale !== preventivi?.items?.length ? ` di ${preventivi.totale}` : ''}</div>
          <div className="tbl-card">
            {loadingPrev ? (
              <div className="tbl-empty">Caricamento...</div>
            ) : !preventivi?.items?.length ? (
              <div className="tbl-empty">Nessun preventivo</div>
            ) : (
              <table className="tbl">
                <thead className="tbl-thead">
                  <tr>
                    <th scope="col" className="tbl-th">Numero</th>
                    <th scope="col" className="tbl-th">Versione</th>
                    <th scope="col" className="tbl-th">Piano</th>
                    <th scope="col" className="tbl-th">Stato</th>
                    <th scope="col" className="tbl-th">Totale</th>
                    <th scope="col" className="tbl-th">Attivo</th>
                    <th scope="col" className="tbl-th">Emesso il</th>
                    <th scope="col" className="tbl-th"></th>
                  </tr>
                </thead>
                <tbody className="tbl-tbody">
                  {preventivi.items.map(p => (
                    <tr key={p.id}>
                      <td className="tbl-td font-mono text-xs">{p.numero}</td>
                      <td className="tbl-td">v{p.versione}</td>
                      <td className="tbl-td text-gray-600">{p.piano_cura_numero || '—'}</td>
                      <td className="tbl-td">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${classeEnum('stato_preventivo', p.stato)}`}>
                          {labelEnum(p.stato)}
                        </span>
                      </td>
                      <td className="tbl-td">€{Number(p.totale).toFixed(2)}</td>
                      <td className="tbl-td">{p.attivo ? '✓' : '—'}</td>
                      <td className="tbl-td text-gray-600 whitespace-nowrap">{p.data_emissione ? dayjs(p.data_emissione).format('DD/MM/YYYY') : '—'}</td>
                      <td className="tbl-td">
                        <button
                          onClick={() => openTab(`Preventivo ${p.numero}`, SchedaPreventivo, { preventivoId: p.id }, 'scheda-preventivo')}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium whitespace-nowrap">
                          Dettaglio
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {sezione === 'appuntamenti' && (
        <div className="space-y-3">
          <div>
            <button
              onClick={() => openTab('Nuovo appuntamento', FormAppuntamento, { initialPazienteId: pazienteId }, 'appuntamento')}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              + Crea appuntamento
            </button>
          </div>
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
                  <th scope="col" className="tbl-th">Tipo</th>
                  <th scope="col" className="tbl-th">Operatore</th>
                  <th scope="col" className="tbl-th">Note cliniche</th>
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
                      <td className="tbl-td text-gray-700">{a.tipo?.replace('_', ' ')}</td>
                      <td className="tbl-td text-gray-700">
                        {a.dentista_cognome ? `${a.dentista_cognome} ${a.dentista_nome}` : '—'}
                      </td>
                      <td className="tbl-td text-gray-600 max-w-xs">
                        <p className="text-xs whitespace-pre-wrap">{a.note_cliniche || '—'}</p>
                      </td>
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

      {sezione === 'ordini' && (
        <>
        <div className="tbl-count">{ordini?.items?.length ?? 0} risultati{ordini?.totale != null && ordini.totale !== ordini?.items?.length ? ` di ${ordini.totale}` : ''}</div>
        <div className="tbl-card">
          {loadingOrd ? (
            <div className="tbl-empty">Caricamento...</div>
          ) : !ordini?.items?.length ? (
            <div className="tbl-empty">Nessun ordine</div>
          ) : (
            <table className="tbl">
              <thead className="tbl-thead">
                <tr>
                  <th scope="col" className="tbl-th">Numero</th>
                  <th scope="col" className="tbl-th">Totale</th>
                  <th scope="col" className="tbl-th">Pagato</th>
                  <th scope="col" className="tbl-th">Residuo</th>
                  <th scope="col" className="tbl-th">Stato</th>
                </tr>
              </thead>
              <tbody className="tbl-tbody">
                {ordini.items.map(o => (
                  <tr key={o.id}>
                    <td className="tbl-td font-medium text-gray-900">{o.numero}</td>
                    <td className="tbl-td text-gray-900">€{Number(o.totale).toFixed(2)}</td>
                    <td className="tbl-td text-green-600 font-medium">€{Number(o.totale_pagato).toFixed(2)}</td>
                    <td className="tbl-td text-orange-600 font-medium">€{Number(o.totale_residuo).toFixed(2)}</td>
                    <td className="tbl-td">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        o.stato === 'fatturato' ? 'bg-green-100 text-green-700' :
                        o.stato === 'confermato' ? 'bg-blue-100 text-blue-700' :
                        o.stato === 'annullato' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{o.stato}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </>
      )}

      {sezione === 'pagamenti' && (
        <div className="space-y-4">
          {finanze?.riepilogo && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-xs text-gray-500">Incassato</p>
                <p className="text-xl font-bold text-green-600 mt-1">€{Number(finanze.riepilogo.totale_incassato).toFixed(2)}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-xs text-gray-500">In attesa</p>
                <p className="text-xl font-bold text-orange-600 mt-1">€{Number(finanze.riepilogo.totale_in_attesa).toFixed(2)}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <p className="text-xs text-gray-500">Rimborsato</p>
                <p className="text-xl font-bold text-red-600 mt-1">€{Number(finanze.riepilogo.totale_rimborsato).toFixed(2)}</p>
              </div>
            </div>
          )}

          <div className="tbl-count">{finanze?.pagamenti?.items?.length ?? 0} risultati{finanze?.pagamenti?.totale != null && finanze.pagamenti.totale !== finanze?.pagamenti?.items?.length ? ` di ${finanze.pagamenti.totale}` : ''}</div>
          <div className="tbl-card">
            {loadingFin ? (
              <div className="tbl-empty">Caricamento...</div>
            ) : !finanze?.pagamenti?.items?.length ? (
              <div className="tbl-empty">Nessun pagamento</div>
            ) : (
              <table className="tbl">
                <thead className="tbl-thead">
                  <tr>
                    <th scope="col" className="tbl-th">Data</th>
                    <th scope="col" className="tbl-th">Importo</th>
                    <th scope="col" className="tbl-th">Metodo</th>
                    <th scope="col" className="tbl-th">Riferimento</th>
                    <th scope="col" className="tbl-th">Stato</th>
                  </tr>
                </thead>
                <tbody className="tbl-tbody">
                  {finanze.pagamenti.items.map(p => (
                    <tr key={p.id}>
                      <td className="tbl-td text-gray-600 whitespace-nowrap">
                        {p.data_pagamento ? dayjs(p.data_pagamento).format('DD/MM/YYYY HH:mm') : '—'}
                      </td>
                      <td className="tbl-td font-medium text-gray-900">€{Number(p.importo).toFixed(2)}</td>
                      <td className="tbl-td text-gray-600 capitalize">{p.metodo?.replace('_', ' ')}</td>
                      <td className="tbl-td text-gray-500 text-xs">{p.riferimento_transazione || '—'}</td>
                      <td className="tbl-td">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorePagamento[p.stato] || 'bg-gray-100 text-gray-600'}`}>
                          {p.stato}
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
      {modalElimina && (
        <ModalEliminaConferma
          nome={modalElimina.nome}
          referenze={modalElimina.referenze}
          isLoading={eliminaMutation.isPending}
          onConferma={() => eliminaMutation.mutate()}
          onAnnulla={() => setModalElimina(null)}
        />
      )}

      {mostraFormPiano && (
        <FormPianoCura
          onClose={() => { setMostraFormPiano(false); refetchPiani() }}
          pazienteIdIniziale={String(pazienteId)}
        />
      )}
    </div>
  )
}
