import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { usePersistedState } from '../hooks/usePersistedState'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
import { useTabs } from '../context/TabContext'
import { classeEnum, labelEnum } from '../utils/colori'
dayjs.locale('it')

// Lista delle fatture emesse sull'ordine (può essere 0..N).
const getFatture = (ordine) => (ordine?.documenti_fiscali || []).filter(d => d.tipo === 'fattura')

// Somma dei totali delle fatture già emesse sull'ordine.
const totaleFatturato = (ordine) =>
  getFatture(ordine).reduce((acc, d) => acc + Number(d.totale || 0), 0)

// Quanto resta da fatturare sull'ordine: ordine.totale - somma fatture.
const residuoFatturabile = (ordine) =>
  Math.max(0, Number(ordine?.totale || 0) - totaleFatturato(ordine))

export function InfoOrdineLazy({ onClose }) {
  return (
    <div className="p-6 max-w-md">
      <h2 className="text-lg font-bold mb-2">Come si crea un ordine</h2>
      <p className="text-sm text-gray-700 mb-3">
        Gli ordini si creano <strong>automaticamente</strong> al primo appuntamento
        del piano di cura segnato come <em>completato</em>. Le voci vengono aggiunte
        man mano che le sedute vengono completate.
      </p>
      <p className="text-sm text-gray-700 mb-4">
        Per generare un ordine: vai su <strong>Appuntamenti</strong>, apri una seduta
        del piano e cliccala come <strong>Completata</strong>. L'ordine apparirà qui sotto.
      </p>
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Chiudi</button>
      </div>
    </div>
  )
}


export function FormEmettiFattura({ ordine, onClose }) {
  const queryClient = useQueryClient()
  const [voci, setVoci] = useState([])
  const [errore, setErrore] = useState('')

  const residuo = residuoFatturabile(ordine)
  const vociOrdine = ordine?.voci || []

  const totaleFattura = voci.reduce((acc, v) => {
    const imp = Number(v.prezzo_unitario || 0) * Number(v.quantita || 0)
    const iva = imp * Number(v.aliquota_iva || 0) / 100
    return acc + imp + iva
  }, 0)

  const residuoDopo = residuo - totaleFattura
  const sfora = totaleFattura - residuo > 0.01

  const aggiungiDaVoceOrdine = (voceOrdine) => {
    setVoci(prev => [...prev, {
      ordine_voce_id: voceOrdine.id,
      descrizione: voceOrdine.descrizione,
      quantita: String(voceOrdine.quantita),
      prezzo_unitario: String(voceOrdine.prezzo_unitario),
      aliquota_iva: String(voceOrdine.aliquota_iva),
    }])
  }

  const aggiungiVoceLibera = () => {
    setVoci(prev => [...prev, {
      ordine_voce_id: null,
      descrizione: '',
      quantita: '1',
      prezzo_unitario: '',
      aliquota_iva: '22',
    }])
  }

  const aggiungiAcconto = () => {
    setVoci(prev => [...prev, {
      ordine_voce_id: null,
      descrizione: `Acconto su ordine ${ordine.numero}`,
      quantita: '1',
      prezzo_unitario: residuo > 0 ? String((residuo / 2).toFixed(2)) : '',
      aliquota_iva: '0',
    }])
  }

  const aggiornaVoce = (idx, campo, valore) => {
    setVoci(prev => prev.map((v, i) => i === idx ? { ...v, [campo]: valore } : v))
  }

  const rimuoviVoce = (idx) => {
    setVoci(prev => prev.filter((_, i) => i !== idx))
  }

  const emettiMutation = useMutation({
    mutationFn: () => api.post(`/ordini/${ordine.id}/emetti-documento`, {
      tipo: 'fattura',
      voci: voci.map(v => ({
        ordine_voce_id: v.ordine_voce_id,
        descrizione: v.descrizione,
        quantita: parseFloat(v.quantita) || 0,
        prezzo_unitario: parseFloat(v.prezzo_unitario) || 0,
        aliquota_iva: parseFloat(v.aliquota_iva) || 0,
      })),
    }, { _silent: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordine', ordine.id] })
      queryClient.invalidateQueries({ queryKey: ['ordini'] })
      queryClient.invalidateQueries({ queryKey: ['documenti-fiscali'] })
      queryClient.invalidateQueries({ queryKey: ['documenti-fiscali-totali'] })
      onClose()
    },
    onError: (e) => setErrore(e.response?.data?.detail || 'Errore emissione fattura')
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setErrore('')
    if (voci.length === 0) {
      setErrore('Aggiungi almeno una voce alla fattura')
      return
    }
    if (sfora) {
      setErrore(`Importo eccede il residuo fatturabile (residuo: €${residuo.toFixed(2)})`)
      return
    }
    if (voci.some(v => !v.descrizione?.trim() || !v.prezzo_unitario)) {
      setErrore('Tutte le voci devono avere descrizione e prezzo')
      return
    }
    emettiMutation.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 max-w-4xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Emetti fattura — Ordine {ordine.numero}</h2>
          <p className="text-xs text-gray-500">
            Totale ordine: €{Number(ordine.totale).toFixed(2)} —
            Già fatturato: €{totaleFatturato(ordine).toFixed(2)} —
            <span className="font-semibold text-orange-600"> Residuo fatturabile: €{residuo.toFixed(2)}</span>
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700 text-sm">Chiudi</button>
      </div>

      {vociOrdine.length > 0 && (
        <div className="bg-blue-50/40 border border-blue-200 rounded-lg p-3 mb-3">
          <div className="text-xs font-semibold text-blue-700 mb-2">Copia da voce ordine</div>
          <div className="flex flex-wrap gap-2">
            {vociOrdine.map(v => (
              <button type="button" key={v.id} onClick={() => aggiungiDaVoceOrdine(v)}
                className="px-2 py-1 text-xs border border-blue-300 bg-white hover:bg-blue-100 rounded text-blue-700">
                + {v.descrizione.length > 40 ? v.descrizione.slice(0, 40) + '…' : v.descrizione} (€{Number(v.totale_voce).toFixed(2)})
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <button type="button" onClick={aggiungiVoceLibera}
          className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg">
          + Voce libera
        </button>
        {residuo > 0 && (
          <button type="button" onClick={aggiungiAcconto}
            className="px-3 py-1.5 text-xs font-medium bg-orange-50 hover:bg-orange-100 border border-orange-300 text-orange-700 rounded-lg">
            + Acconto (50% del residuo)
          </button>
        )}
      </div>

      <div className="tbl-card !w-full mb-3">
        <table className="tbl w-full">
          <thead className="tbl-thead">
            <tr>
              <th className="tbl-th">Descrizione</th>
              <th className="tbl-th !w-20 !text-right">Q.tà</th>
              <th className="tbl-th !w-28 !text-right">Prezzo</th>
              <th className="tbl-th !w-20 !text-right">IVA %</th>
              <th className="tbl-th !w-28 !text-right">Totale</th>
              <th className="tbl-th !w-16"></th>
            </tr>
          </thead>
          <tbody className="tbl-tbody">
            {voci.length === 0 ? (
              <tr><td colSpan={6} className="tbl-empty">Nessuna voce — aggiungi una voce ordine o una voce libera</td></tr>
            ) : voci.map((v, idx) => {
              const imp = (Number(v.prezzo_unitario) || 0) * (Number(v.quantita) || 0)
              const iva = imp * (Number(v.aliquota_iva) || 0) / 100
              const tot = imp + iva
              return (
                <tr key={idx}>
                  <td className="tbl-td">
                    <input type="text" value={v.descrizione} onChange={e => aggiornaVoce(idx, 'descrizione', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm" required />
                  </td>
                  <td className="tbl-td !text-right">
                    <input type="number" step="0.01" min="0.01" value={v.quantita} onChange={e => aggiornaVoce(idx, 'quantita', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right" required />
                  </td>
                  <td className="tbl-td !text-right">
                    <input type="number" step="0.01" min="0" value={v.prezzo_unitario} onChange={e => aggiornaVoce(idx, 'prezzo_unitario', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right" required />
                  </td>
                  <td className="tbl-td !text-right">
                    <input type="number" step="0.01" min="0" max="100" value={v.aliquota_iva} onChange={e => aggiornaVoce(idx, 'aliquota_iva', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right" />
                  </td>
                  <td className="tbl-td !text-right font-medium">€{tot.toFixed(2)}</td>
                  <td className="tbl-td">
                    <button type="button" onClick={() => rimuoviVoce(idx)} className="text-red-600 hover:text-red-800 text-xs">Rimuovi</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-100 border-t border-gray-300">
            <tr>
              <td colSpan={4} className="tbl-td text-right text-sm font-semibold">Totale fattura</td>
              <td className={`tbl-td text-right text-sm font-semibold ${sfora ? 'text-red-600' : 'text-gray-900'}`}>€{totaleFattura.toFixed(2)}</td>
              <td></td>
            </tr>
            <tr>
              <td colSpan={4} className="tbl-td text-right text-xs text-gray-600">Residuo dopo questa fattura</td>
              <td className={`tbl-td text-right text-xs ${sfora ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>€{residuoDopo.toFixed(2)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {errore && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-3">{errore}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Annulla</button>
        <button type="submit" disabled={emettiMutation.isPending || sfora || voci.length === 0}
          className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
          {emettiMutation.isPending ? 'Emissione...' : 'Emetti fattura'}
        </button>
      </div>
    </form>
  )
}


export function FormDettaglioOrdine({ ordineId, onClose }) {
  const queryClient = useQueryClient()
  const [erroreVoce, setErroreVoce] = useState('')
  const [voceForm, setVoceForm] = useState({ articolo_id: '', quantita: '1', note: '' })
  const { openTab } = useTabs()

  const { data: ordine, isLoading } = useQuery({
    queryKey: ['ordine', ordineId],
    queryFn: async () => (await api.get(`/ordini/${ordineId}`)).data,
  })

  const { data: articoli } = useQuery({
    queryKey: ['articoli-attivi'],
    queryFn: async () => (await api.get('/articoli?per_pagina=100&attivo=true')).data.items,
  })

  const aggiungiVoceMutation = useMutation({
    mutationFn: (payload) => api.post(`/ordini/${ordineId}/voci`, payload, { _silent: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordine', ordineId] })
      queryClient.invalidateQueries({ queryKey: ['ordini'] })
      setVoceForm({ articolo_id: '', quantita: '1', note: '' })
    },
    onError: (e) => setErroreVoce(e.response?.data?.detail || 'Errore aggiunta voce')
  })

  const rimuoviVoceMutation = useMutation({
    mutationFn: (voceId) => api.delete(`/ordini/${ordineId}/voci/${voceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordine', ordineId] })
      queryClient.invalidateQueries({ queryKey: ['ordini'] })
    }
  })

  const emettiRicevutaTotaleMutation = useMutation({
    mutationFn: () => api.post(`/ordini/${ordineId}/emetti-documento`, {
      tipo: 'ricevuta',
      voci: (ordine?.voci || []).map(v => ({
        ordine_voce_id: v.id,
        descrizione: v.descrizione,
        quantita: Number(v.quantita),
        prezzo_unitario: Number(v.prezzo_unitario),
        aliquota_iva: Number(v.aliquota_iva),
      })),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordine', ordineId] })
      queryClient.invalidateQueries({ queryKey: ['ordini'] })
      queryClient.invalidateQueries({ queryKey: ['documenti-fiscali'] })
    }
  })

  if (isLoading) return <div className="p-6 text-gray-400">Caricamento...</div>
  if (!ordine) return <div className="p-6 text-gray-400">Ordine non trovato</div>

  const isBozza = ordine.stato === 'bozza'
  const fatture = getFatture(ordine)
  const residuo = residuoFatturabile(ordine)

  const handleAggiungiVoce = (e) => {
    e.preventDefault()
    setErroreVoce('')
    if (!voceForm.articolo_id) { setErroreVoce('Seleziona un articolo'); return }
    aggiungiVoceMutation.mutate({
      articolo_id: parseInt(voceForm.articolo_id),
      quantita: parseFloat(voceForm.quantita) || 1,
      note: voceForm.note || null,
    })
  }

  return (
    <div className="p-4 max-w-3xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Ordine {ordine.numero}</h2>
          <p className="text-xs text-gray-500">
            {ordine.paziente_cognome} {ordine.paziente_nome} —
            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${classeEnum('stato_ordine', ordine.stato)}`}>{ordine.stato}</span>
            <span className="ml-2 text-xs text-gray-500">
              Fatturato: <span className="font-semibold text-green-600">€{totaleFatturato(ordine).toFixed(2)}</span> —
              Residuo: <span className={`font-semibold ${residuo > 0 ? 'text-orange-600' : 'text-gray-400'}`}>€{residuo.toFixed(2)}</span>
            </span>
          </p>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-sm">Chiudi</button>
      </div>

      <div className="tbl-card !w-full mb-3">
        <table className="tbl w-full">
          <thead className="tbl-thead">
            <tr>
              <th className="tbl-th">Descrizione</th>
              <th className="tbl-th !text-right">Q.tà</th>
              <th className="tbl-th !text-right">Prezzo</th>
              <th className="tbl-th !text-right">IVA</th>
              <th className="tbl-th !text-right">Totale</th>
              {isBozza && <th className="tbl-th"></th>}
            </tr>
          </thead>
          <tbody className="tbl-tbody">
            {ordine.voci?.length ? ordine.voci.map(v => (
              <tr key={v.id}>
                <td className="tbl-td text-gray-800">{v.descrizione}</td>
                <td className="tbl-td text-right text-gray-600">{Number(v.quantita)}</td>
                <td className="tbl-td text-right text-gray-600">€{Number(v.prezzo_unitario).toFixed(2)}</td>
                <td className="tbl-td text-right text-gray-600">{Number(v.aliquota_iva)}%</td>
                <td className="tbl-td text-right font-medium text-gray-900">€{Number(v.totale_voce).toFixed(2)}</td>
                {isBozza && (
                  <td className="tbl-td text-right">
                    <button onClick={() => rimuoviVoceMutation.mutate(v.id)}
                      className="text-red-600 hover:text-red-800 text-xs font-medium">Rimuovi</button>
                  </td>
                )}
              </tr>
            )) : (
              <tr><td colSpan={isBozza ? 6 : 5} className="tbl-empty">Nessuna voce</td></tr>
            )}
          </tbody>
          <tfoot className="bg-gray-100 border-t border-gray-300">
            <tr>
              <td colSpan={isBozza ? 4 : 3} className="tbl-td text-right text-xs text-gray-600">Imponibile</td>
              <td className="tbl-td text-right text-sm">€{Number(ordine.totale_imponibile).toFixed(2)}</td>
              {isBozza && <td></td>}
            </tr>
            <tr>
              <td colSpan={isBozza ? 4 : 3} className="tbl-td text-right text-xs text-gray-600">IVA</td>
              <td className="tbl-td text-right text-sm">€{Number(ordine.totale_iva).toFixed(2)}</td>
              {isBozza && <td></td>}
            </tr>
            <tr>
              <td colSpan={isBozza ? 4 : 3} className="tbl-td text-right text-sm font-semibold text-gray-900">Totale</td>
              <td className="tbl-td text-right text-sm font-semibold text-gray-900">€{Number(ordine.totale).toFixed(2)}</td>
              {isBozza && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>

      {isBozza && (
        <form onSubmit={handleAggiungiVoce} className="bg-blue-50/40 border border-blue-200 rounded-lg p-3 mb-3">
          <div className="text-xs font-semibold text-blue-700 mb-2">+ Aggiungi voce dal catalogo</div>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-7">
              <label className="block text-xs text-gray-600 mb-1">Articolo *</label>
              <select value={voceForm.articolo_id} onChange={e => setVoceForm({ ...voceForm, articolo_id: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" required>
                <option value="">Seleziona articolo...</option>
                {articoli?.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.codice} — {a.nome} (€{Number(a.prezzo_base).toFixed(2)})
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Quantità</label>
              <input type="number" step="0.01" min="0.01" value={voceForm.quantita}
                onChange={e => setVoceForm({ ...voceForm, quantita: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
            </div>
            <div className="col-span-3 flex items-end">
              <button type="submit" disabled={aggiungiVoceMutation.isPending}
                className="w-full px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
                {aggiungiVoceMutation.isPending ? 'Aggiungo...' : 'Aggiungi'}
              </button>
            </div>
          </div>
          {erroreVoce && <p className="text-xs text-red-600 mt-2">{erroreVoce}</p>}
        </form>
      )}

      {ordine.documenti_fiscali?.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-3 mb-3">
          <div className="text-xs font-semibold text-gray-700 mb-2">Documenti fiscali emessi ({ordine.documenti_fiscali.length})</div>
          <ul className="space-y-2 text-sm">
            {ordine.documenti_fiscali.map(d => (
              <li key={d.id} className="border-l-2 border-green-300 pl-2">
                <div className="flex items-center justify-between">
                  <span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium uppercase mr-2 ${classeEnum('tipo_documento_fiscale', d.tipo)}`}>{d.tipo}</span>
                    <span className="font-medium">{d.numero}</span> — €{Number(d.totale).toFixed(2)}
                    {d.pagamento_id && <span className="text-xs text-gray-400 ml-2">(pagamento #{d.pagamento_id})</span>}
                  </span>
                  <span className="text-xs text-gray-500">{dayjs(d.data_emissione).format('DD/MM/YYYY')}</span>
                </div>
                {d.voci?.length > 0 && (
                  <ul className="mt-1 ml-2 text-xs text-gray-600 space-y-0.5">
                    {d.voci.map(v => (
                      <li key={v.id} className="flex justify-between">
                        <span className="truncate">• {v.descrizione}</span>
                        <span className="ml-2 whitespace-nowrap">{Number(v.quantita)} × €{Number(v.prezzo_unitario).toFixed(2)} = €{Number(v.totale_voce).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ordine.stato !== 'annullato' && ordine.voci?.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {residuo > 0 && (
            <button onClick={() => openTab(`Emetti fattura — ${ordine.numero}`, FormEmettiFattura, { ordine }, 'emetti-fattura')}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              Emetti Fattura ({fatture.length > 0 ? `+${fatture.length + 1}ª` : '1ª'})
            </button>
          )}
          {residuo <= 0 && fatture.length > 0 && (
            <span className="px-3 py-1.5 text-xs text-gray-500 italic">Ordine completamente fatturato</span>
          )}
          <button onClick={() => emettiRicevutaTotaleMutation.mutate()} disabled={emettiRicevutaTotaleMutation.isPending}
            className="px-3 py-1.5 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg disabled:opacity-50">
            Emetti Ricevuta (su totale ordine)
          </button>
        </div>
      )}
    </div>
  )
}


export default function Ordini() {
  const [pagina, setPagina] = usePersistedState('ordini.pagina', 1)
  const [filtroStato, setFiltroStato] = usePersistedState('ordini.filtroStato', '')
  const [cerca, setCerca] = usePersistedState('ordini.cerca', '')
  const [sortBy, setSortBy] = usePersistedState('ordini.sortBy', null)
  const [sortDir, setSortDir] = usePersistedState('ordini.sortDir', 'asc')
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
    queryKey: ['ordini', pagina, filtroStato, cerca, sortBy, sortDir],
    queryFn: async () => {
      const params = new URLSearchParams({ pagina, per_pagina: 30 })
      if (filtroStato) params.append('stato', filtroStato)
      if (cerca) params.append('cerca', cerca)
      if (sortBy) { params.append('ordina_per', sortBy); params.append('direzione', sortDir) }
      const res = await api.get(`/ordini?${params}`)
      return res.data
    }
  })

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ordini</h1>
        </div>
        <button onClick={() => openTab('Come si crea un ordine', InfoOrdineLazy, {}, 'ordine')}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          ⓘ Come si crea un ordine
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-3 flex gap-2 items-center">
        <input
          type="text"
          value={cerca}
          onChange={e => { setCerca(e.target.value); setPagina(1) }}
          placeholder="Cerca per numero ordine, paziente..."
          className={`flex-1 min-w-0 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${cerca ? 'filtro-attivo' : 'border-gray-300'}`}
          aria-label="Cerca ordini"
        />
        <select value={filtroStato} onChange={e => { setFiltroStato(e.target.value); setPagina(1) }}
          className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${filtroStato ? 'filtro-attivo' : 'border-gray-300'}`}>
          <option value="">Tutti gli stati</option>
          <option value="bozza">Bozza</option>
          <option value="confermato">Confermato</option>
          <option value="fatturato">Fatturato</option>
          <option value="annullato">Annullato</option>
        </select>
        {(filtroStato || cerca) && (
          <button onClick={() => { setFiltroStato(''); setCerca(''); setPagina(1) }}
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
          <div className="tbl-empty">Nessun ordine trovato</div>
        ) : (
          <table className="tbl">
            <thead className="tbl-thead">
              <tr>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('numero')}>Numero {si('numero')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('paziente_cognome')}>Paziente {si('paziente_cognome')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('totale')}>Totale {si('totale')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('totale_pagato')}>Pagato {si('totale_pagato')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('totale_residuo')}>Residuo {si('totale_residuo')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('stato')}>Stato {si('stato')}</th>
                <th scope="col" className="tbl-th">Fatture</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('created_at')}>Creato il {si('created_at')}</th>
                <th scope="col" className="tbl-th">Azioni</th>
              </tr>
            </thead>
            <tbody className="tbl-tbody">
              {/* Ordinamento server-side: backend restituisce gia' ordinato */}
              {(data?.items ?? []).map(o => {
                const fatture = getFatture(o)
                return (
                  <tr key={o.id}>
                    <td className="tbl-td font-medium text-gray-900">{o.numero}</td>
                    <td className="tbl-td text-gray-600">{o.paziente_cognome} {o.paziente_nome}</td>
                    <td className="tbl-td font-medium text-gray-900">€{Number(o.totale).toFixed(2)}</td>
                    <td className="tbl-td text-green-600 font-medium">€{Number(o.totale_pagato).toFixed(2)}</td>
                    <td className="tbl-td text-orange-600 font-medium">€{Number(o.totale_residuo).toFixed(2)}</td>
                    <td className="tbl-td">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${classeEnum('stato_ordine', o.stato)}`}>{o.stato}</span>
                    </td>
                    <td className="tbl-td text-gray-600">
                      {fatture.length === 0 ? '—' : (
                        <span className="text-green-600 text-xs font-medium">
                          {fatture.length === 1 ? `✓ ${fatture[0].numero}` : `✓ ${fatture.length} fatture`}
                        </span>
                      )}
                    </td>
                    <td className="tbl-td text-gray-300 text-xs whitespace-nowrap" title={o.created_at}>
                      {o.created_at ? dayjs(o.created_at).format('DD/MM/YYYY') : '—'}
                    </td>
                    <td className="tbl-td">
                      <button onClick={() => openTab(`Ordine ${o.numero}`, FormDettaglioOrdine, { ordineId: o.id }, 'ordine-detail')}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                        {o.stato === 'bozza' ? 'Modifica' : 'Apri'}
                      </button>
                    </td>
                  </tr>
                )
              })}
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
