import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import dayjs from 'dayjs'
import { useTableSort } from '../hooks/useTableSort'
import { usePersistedState } from '../hooks/usePersistedState'
import { useTabs } from '../context/TabContext'
import SortIcon from '../components/SortIcon'
import { exportToCsv } from '../utils/exportCsv'
import { FormAppuntamento } from './Appuntamenti'
import SchedaPreventivo from './SchedaPreventivo'
import { classeEnum, labelEnum } from '../utils/colori'

const STATI = ['bozza', 'inviato', 'accettato', 'rifiutato', 'scaduto']

const VOCE_VUOTA = { descrizione: '', quantita: '1', prezzo_unitario: '', aliquota_iva: '22', sconto_pct: '0', sconto_eur: '0', note: '' }

// Calcola lo sconto in € a partire da imponibile lordo (q × pu) e percentuale.
const _calcEur = (q, pu, pct) => {
  const sub = (parseFloat(q) || 0) * (parseFloat(pu) || 0)
  const p = parseFloat(pct) || 0
  return (sub * p / 100).toFixed(2)
}
// Calcola lo sconto in % a partire da imponibile lordo e sconto in €.
const _calcPct = (q, pu, eur) => {
  const sub = (parseFloat(q) || 0) * (parseFloat(pu) || 0)
  const e = parseFloat(eur) || 0
  if (sub <= 0) return '0'
  return ((e / sub) * 100).toFixed(2)
}

export function FormPreventivo({ preventivo, template, initialPianoCuraId = '', initialPazienteId = '', initialDentistaId = '', onClose }) {
  const isEdit = !!preventivo
  // template = preventivo esistente da clonare come base per una nuova versione
  // (modalità creazione, ma con i campi pre-popolati e nuova_versione attivo)
  const sorgente = preventivo || template
  const queryClient = useQueryClient()
  const [errore, setErrore] = useState('')

  const [form, setForm] = useState(() => {
    if (sorgente) {
      return {
        piano_cura_id: String(sorgente.piano_cura_id ?? ''),
        paziente_id: String(sorgente.paziente_id ?? ''),
        dentista_id: String(sorgente.dentista_id ?? ''),
        descrizione: sorgente.descrizione ?? '',
        note: sorgente.note ?? '',
        data_scadenza: sorgente.data_scadenza && isEdit
          ? dayjs(sorgente.data_scadenza).format('YYYY-MM-DD')
          : dayjs().add(30, 'day').format('YYYY-MM-DD'),
        nuova_versione: !!template,
        voci: sorgente.voci?.length
          ? sorgente.voci.map(v => {
              const sconto_pct = String(v.sconto_percentuale ?? '0')
              return {
                descrizione: v.descrizione ?? '',
                quantita: String(v.quantita ?? '1'),
                prezzo_unitario: String(v.prezzo_unitario ?? ''),
                aliquota_iva: String(v.aliquota_iva ?? '22'),
                sconto_pct,
                sconto_eur: _calcEur(v.quantita, v.prezzo_unitario, sconto_pct),
                note: v.note ?? '',
              }
            })
          : [{ ...VOCE_VUOTA }],
      }
    }
    return {
      piano_cura_id: String(initialPianoCuraId || ''),
      paziente_id: String(initialPazienteId || ''),
      dentista_id: String(initialDentistaId || ''),
      descrizione: '',
      note: '',
      data_scadenza: dayjs().add(30, 'day').format('YYYY-MM-DD'),
      nuova_versione: false,
      voci: [{ ...VOCE_VUOTA }],
    }
  })

  // Piani di cura attivi del paziente selezionato (per il select)
  const { data: pianiPaziente } = useQuery({
    queryKey: ['piani-paziente', form.paziente_id],
    queryFn: async () => (await api.get(`/piani-cura?paziente_id=${form.paziente_id}&per_pagina=50`)).data.items ?? [],
    enabled: !!form.paziente_id && !isEdit,
  })

  // Preventivo attivo del piano selezionato (per decidere se serve nuova_versione)
  const pianoSelezionato = pianiPaziente?.find(p => String(p.id) === String(form.piano_cura_id))
  const hasPreventivoAttivo = (pianoSelezionato?.n_preventivi ?? 0) > 0

  const { data: pazienti } = useQuery({
    queryKey: ['pazienti-lista-form'],
    queryFn: async () => {
      const all = []
      for (let pagina = 1; pagina <= 50; pagina++) {
        const res = await api.get(`/pazienti?pagina=${pagina}&per_pagina=100`)
        all.push(...(res.data.items ?? []))
        if (pagina >= (res.data.pagine_totali ?? 1)) break
      }
      return all
    },
  })

  const { data: operatori } = useQuery({
    queryKey: ['operatori-lista'],
    queryFn: async () => (await api.get('/utenti/operatori')).data ?? [],
  })

  const setVoce = (i, campo, valore) => setForm(f => {
    const voci = [...f.voci]
    voci[i] = { ...voci[i], [campo]: valore }
    const v = voci[i]
    // Mantieni in sync sconto% e €sconto col resto della riga.
    // Sorgente di verità: sconto_pct.
    if (campo === 'sconto_pct') {
      voci[i].sconto_eur = _calcEur(v.quantita, v.prezzo_unitario, valore)
    } else if (campo === 'sconto_eur') {
      voci[i].sconto_pct = _calcPct(v.quantita, v.prezzo_unitario, valore)
    } else if (campo === 'quantita' || campo === 'prezzo_unitario') {
      // Cambiando q o pu, ricalcolo €sconto a partire dalla % (più "stable").
      voci[i].sconto_eur = _calcEur(v.quantita, v.prezzo_unitario, v.sconto_pct)
    }
    return { ...f, voci }
  })
  const aggiungiVoce = () => setForm(f => ({ ...f, voci: [...f.voci, { ...VOCE_VUOTA }] }))
  const rimuoviVoce = (i) => setForm(f => ({ ...f, voci: f.voci.filter((_, j) => j !== i) }))

  const totali = useMemo(() => {
    let imponibile = 0, iva = 0
    for (const v of form.voci) {
      const q = parseFloat(v.quantita) || 0
      const pu = parseFloat(v.prezzo_unitario) || 0
      const al = parseFloat(v.aliquota_iva) || 0
      const pct = parseFloat(v.sconto_pct) || 0
      const sub = q * pu
      const subScontato = sub - (sub * pct / 100)
      imponibile += subScontato
      iva += subScontato * al / 100
    }
    return { imponibile, iva, totale: imponibile + iva }
  }, [form.voci])

  const salvaMutation = useMutation({
    mutationFn: async (payload) => {
      if (isEdit) return (await api.patch(`/preventivi/${preventivo.id}`, payload, { _silent: true })).data
      return (await api.post('/preventivi', payload, { _silent: true })).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preventivi'] })
      onClose()
    },
    onError: (e) => setErrore(e.response?.data?.detail || 'Errore nel salvataggio'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setErrore('')
    if (!isEdit && !form.paziente_id) {
      setErrore('Seleziona il paziente')
      return
    }
    if (!isEdit && !form.piano_cura_id) {
      setErrore('Seleziona un piano di cura. Se non esiste, crealo prima dalla pagina "Piani di cura".')
      return
    }
    const vociValide = form.voci.filter(v => v.descrizione.trim() && parseFloat(v.prezzo_unitario) > 0)
    if (!vociValide.length) {
      setErrore('Inserisci almeno una voce con descrizione e prezzo')
      return
    }
    const voci = vociValide.map((v, idx) => ({
      descrizione: v.descrizione.trim(),
      quantita: parseFloat(v.quantita) || 1,
      prezzo_unitario: parseFloat(v.prezzo_unitario),
      aliquota_iva: parseFloat(v.aliquota_iva) || 0,
      sconto_percentuale: parseFloat(v.sconto_pct) || 0,
      note: v.note?.trim() || null,
      ordine: idx,
    }))
    const dentista_id = form.dentista_id ? parseInt(form.dentista_id) : null
    if (isEdit) {
      salvaMutation.mutate({
        dentista_id,
        descrizione: form.descrizione || null,
        note: form.note || null,
        data_scadenza: form.data_scadenza ? `${form.data_scadenza}T23:59:59` : null,
        voci,
      })
    } else {
      salvaMutation.mutate({
        piano_cura_id: parseInt(form.piano_cura_id),
        paziente_id: parseInt(form.paziente_id),
        dentista_id,
        descrizione: form.descrizione || null,
        note: form.note || null,
        data_scadenza: form.data_scadenza ? `${form.data_scadenza}T23:59:59` : null,
        nuova_versione: form.nuova_versione,
        voci,
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 max-w-3xl">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Paziente <span className="text-red-500">*</span></label>
          <select value={form.paziente_id} onChange={e => setForm(f => ({ ...f, paziente_id: e.target.value, piano_cura_id: '' }))}
            disabled={isEdit}
            className={`w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${isEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            required>
            <option value="">Seleziona paziente...</option>
            {pazienti?.map(p => <option key={p.id} value={p.id}>{p.cognome} {p.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Operatore</label>
          <select value={form.dentista_id} onChange={e => setForm(f => ({ ...f, dentista_id: e.target.value }))}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
            <option value="">— Non assegnato —</option>
            {operatori?.map(o => <option key={o.id} value={o.id}>{o.cognome} {o.nome}{o.ruoli?.length ? ` — ${o.ruoli[0]}` : ''}</option>)}
          </select>
        </div>
      </div>

      {!isEdit && form.paziente_id && (
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-700 mb-1">Piano di cura <span className="text-red-500">*</span></label>
          <select value={form.piano_cura_id} onChange={e => setForm(f => ({ ...f, piano_cura_id: e.target.value, nuova_versione: false }))}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" required>
            <option value="">— Seleziona piano —</option>
            {pianiPaziente?.filter(p => !['completato', 'abbandonato'].includes(p.stato)).map(p => (
              <option key={p.id} value={p.id}>{p.numero} — {p.titolo} ({p.stato})</option>
            ))}
          </select>
          {pianiPaziente && pianiPaziente.filter(p => !['completato', 'abbandonato'].includes(p.stato)).length === 0 && (
            <p className="text-xs text-amber-600 mt-1">Nessun piano attivo per questo paziente. Crea prima un piano dalla pagina "Piani di cura".</p>
          )}
          {hasPreventivoAttivo && (
            <label className="flex items-center gap-2 mt-2 text-xs">
              <input type="checkbox" checked={form.nuova_versione} onChange={e => setForm(f => ({ ...f, nuova_versione: e.target.checked }))} />
              <span>Crea come <strong>nuova versione</strong> (sostituisce il preventivo attivo del piano)</span>
            </label>
          )}
        </div>
      )}

      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">Descrizione</label>
        <input type="text" value={form.descrizione} onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))}
          placeholder="Es. Piano di cura per carie multipla"
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">Scadenza</label>
        <input type="date" value={form.data_scadenza} onChange={e => setForm(f => ({ ...f, data_scadenza: e.target.value }))}
          className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-gray-700">Voci preventivo <span className="text-red-500">*</span></label>
          <button type="button" onClick={aggiungiVoce} className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700">+ Aggiungi voce</button>
        </div>
        <div className="tbl-card !w-full">
          <table className="tbl w-full">
            <thead className="tbl-thead">
              <tr>
                <th className="tbl-th min-w-[260px]">Descrizione</th>
                <th className="tbl-th !text-right w-16">Q.tà</th>
                <th className="tbl-th !text-right w-24">Prezzo €</th>
                <th className="tbl-th !text-right w-14">IVA %</th>
                <th className="tbl-th !text-right w-16">Sconto %</th>
                <th className="tbl-th !text-right w-20">Sconto €</th>
                <th className="tbl-th !text-right w-24">Totale</th>
                <th className="tbl-th w-8" />
              </tr>
            </thead>
            <tbody className="tbl-tbody">
              {form.voci.map((v, i) => {
                const q = parseFloat(v.quantita) || 0
                const pu = parseFloat(v.prezzo_unitario) || 0
                const al = parseFloat(v.aliquota_iva) || 0
                const pct = parseFloat(v.sconto_pct) || 0
                const sub = q * pu
                const subScontato = sub - (sub * pct / 100)
                const tot = subScontato + subScontato * al / 100
                return (
                  <tr key={i}>
                    <td className="!p-0">
                      <input type="text" value={v.descrizione} onChange={e => setVoce(i, 'descrizione', e.target.value)}
                        placeholder="Es. Otturazione 14"
                        className="cell-input w-full h-full px-3 py-1.5 bg-transparent border-0 text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-500" />
                    </td>
                    <td className="!p-0">
                      <input type="number" min="0" step="0.01" value={v.quantita} onChange={e => setVoce(i, 'quantita', e.target.value)}
                        className="no-spinner cell-input w-full h-full px-3 py-1.5 bg-transparent border-0 text-sm text-right focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-500" />
                    </td>
                    <td className="!p-0">
                      <input type="number" min="0" step="0.01" value={v.prezzo_unitario} onChange={e => setVoce(i, 'prezzo_unitario', e.target.value)}
                        className="no-spinner cell-input w-full h-full px-3 py-1.5 bg-transparent border-0 text-sm text-right focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-500" />
                    </td>
                    <td className="!p-0">
                      <input type="number" min="0" step="0.01" value={v.aliquota_iva} onChange={e => setVoce(i, 'aliquota_iva', e.target.value)}
                        className="no-spinner cell-input w-full h-full px-3 py-1.5 bg-transparent border-0 text-sm text-right focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-500" />
                    </td>
                    <td className="!p-0">
                      <input type="number" min="0" max="100" step="0.01" value={v.sconto_pct} onChange={e => setVoce(i, 'sconto_pct', e.target.value)}
                        className="no-spinner cell-input w-full h-full px-3 py-1.5 bg-transparent border-0 text-sm text-right focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-500" />
                    </td>
                    <td className="!p-0">
                      <input type="number" min="0" step="0.01" value={v.sconto_eur} onChange={e => setVoce(i, 'sconto_eur', e.target.value)}
                        disabled={sub <= 0}
                        className="no-spinner cell-input w-full h-full px-3 py-1.5 bg-transparent border-0 text-sm text-right focus:outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed" />
                    </td>
                    <td className="tbl-td text-right text-sm font-medium text-gray-900">€{tot.toFixed(2)}</td>
                    <td className="tbl-td">
                      {form.voci.length > 1 && (
                        <button type="button" onClick={() => rimuoviVoce(i)} aria-label="Rimuovi voce"
                          className="text-red-500 hover:text-red-700 text-lg leading-none">×</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-100 border-t border-gray-300">
              <tr>
                <td colSpan={6} className="tbl-td text-right text-xs text-gray-600">Imponibile</td>
                <td className="tbl-td text-right text-sm">€{totali.imponibile.toFixed(2)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={6} className="tbl-td text-right text-xs text-gray-600">IVA</td>
                <td className="tbl-td text-right text-sm">€{totali.iva.toFixed(2)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={6} className="tbl-td text-right text-sm font-semibold text-gray-900">Totale</td>
                <td className="tbl-td text-right text-sm font-semibold text-gray-900">€{totali.totale.toFixed(2)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">Note</label>
        <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
          rows={2}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
      </div>

      {errore && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-3">{errore}</p>}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Annulla</button>
        <button type="submit" disabled={salvaMutation.isPending}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {salvaMutation.isPending ? 'Salvataggio...' : (isEdit ? 'Salva modifiche' : 'Crea Preventivo')}
        </button>
      </div>
    </form>
  )
}

export default function Preventivi() {
  const [pagina, setPagina] = usePersistedState('preventivi.pagina', 1)
  const [filtroStato, setFiltroStato] = usePersistedState('preventivi.filtroStato', '')
  const [cerca, setCerca] = usePersistedState('preventivi.cerca', '')
  const [selected, setSelected] = useState(new Set())
  const headerRef = useRef(null)
  const queryClient = useQueryClient()
  const { openTab } = useTabs()

  const { sortBy, sortDir, handleSort } = useTableSort(null, null, 'asc', { server: true })

  const { data, isLoading } = useQuery({
    queryKey: ['preventivi', pagina, filtroStato, cerca, sortBy, sortDir],
    queryFn: async () => {
      const params = new URLSearchParams({ pagina, per_pagina: 30 })
      if (filtroStato) params.append('stato', filtroStato)
      if (cerca) params.append('cerca', cerca)
      if (sortBy) { params.append('ordina_per', sortBy); params.append('direzione', sortDir) }
      const res = await api.get(`/preventivi?${params}`)
      return res.data
    }
  })

  // Ordinamento server-side: backend restituisce gia' ordinato.
  const sortedItems = data?.items ?? []

  const inviaMutation = useMutation({
    mutationFn: (id) => api.post(`/preventivi/${id}/invia`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['preventivi'] })
  })

  const firmaMutation = useMutation({
    mutationFn: (id) => api.post(`/preventivi/${id}/firma-consenso`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['preventivi'] })
  })

  const bulkInviaMutation = useMutation({
    mutationFn: (ids) => Promise.all(ids.map(id => api.post(`/preventivi/${id}/invia`))),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['preventivi'] }); setSelected(new Set()) }
  })

  const bulkFirmaMutation = useMutation({
    mutationFn: (ids) => Promise.all(ids.map(id => api.post(`/preventivi/${id}/firma-consenso`))),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['preventivi'] }); setSelected(new Set()) }
  })

  const allSelected = sortedItems.length > 0 && sortedItems.every(p => selected.has(p.id))
  const someSelected = !allSelected && sortedItems.some(p => selected.has(p.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(sortedItems.map(p => p.id)))
  const toggleOne = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  useEffect(() => { if (headerRef.current) headerRef.current.indeterminate = someSelected }, [someSelected])
  useEffect(() => { setSelected(new Set()) }, [data])

  const exportCsv = () => {
    exportToCsv(`preventivi_${dayjs().format('YYYYMMDD')}`, [
      { key: 'numero', label: 'Numero' },
      { key: 'paziente_cognome', label: 'Paziente cognome' },
      { key: 'paziente_nome', label: 'Paziente nome' },
      { key: 'dentista_cognome', label: 'Operatore cognome' },
      { key: 'dentista_nome', label: 'Operatore nome' },
      { key: 'totale', label: 'Totale', format: v => Number(v).toFixed(2) },
      { key: 'data_scadenza', label: 'Scadenza', format: v => v ? dayjs(v).format('DD/MM/YYYY') : '' },
      { key: 'stato', label: 'Stato' },
      { key: 'consenso_firmato', label: 'Consenso firmato', format: v => v ? 'Sì' : 'No' },
    ], sortedItems)
  }

  const idsPerInvio = useMemo(
    () => [...selected].filter(id => sortedItems.find(p => p.id === id)?.stato === 'bozza'),
    [selected, sortedItems]
  )
  const idsPerFirma = useMemo(
    () => [...selected].filter(id => !sortedItems.find(p => p.id === id)?.consenso_firmato),
    [selected, sortedItems]
  )

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Preventivi</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            disabled={!sortedItems.length}
            className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            Esporta CSV
          </button>
          <button
            onClick={() => openTab('Nuovo preventivo', FormPreventivo, {}, 'preventivo')}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            + Nuovo Preventivo
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-3 flex gap-2 items-center">
        <input
          type="text"
          value={cerca}
          onChange={e => { setCerca(e.target.value); setPagina(1) }}
          placeholder="Cerca per numero, descrizione, paziente..."
          className={`flex-1 min-w-0 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${cerca ? 'filtro-attivo' : 'border-gray-300'}`}
          aria-label="Cerca preventivi"
        />
        <select
          value={filtroStato}
          onChange={e => { setFiltroStato(e.target.value); setPagina(1) }}
          className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${filtroStato ? 'filtro-attivo' : 'border-gray-300'}`}
          aria-label="Filtra per stato"
        >
          <option value="">Tutti gli stati</option>
          {STATI.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        {(filtroStato || cerca) && (
          <button onClick={() => { setFiltroStato(''); setCerca(''); setPagina(1) }}
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
          <div className="tbl-empty" role="status" aria-live="polite">Nessun preventivo trovato</div>
        ) : (
          <>
          {selected.size > 0 && (
            <div className="tbl-bulkbar">
              <span className="text-xs font-medium text-blue-700">{selected.size} selezionati</span>
              <button onClick={() => bulkInviaMutation.mutate(idsPerInvio)}
                className="text-xs px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                disabled={bulkInviaMutation.isPending || !idsPerInvio.length}>
                Invia bozze selezionate
              </button>
              <button onClick={() => bulkFirmaMutation.mutate(idsPerFirma)}
                className="text-xs px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                disabled={bulkFirmaMutation.isPending || !idsPerFirma.length}>
                Firma consenso selezionati
              </button>
            </div>
          )}
          <table className="tbl">
            <caption className="sr-only">Elenco preventivi</caption>
            <thead className="tbl-thead">
              <tr>
                <th scope="col" className="tbl-th-cb">
                  <input type="checkbox" ref={headerRef} checked={allSelected} onChange={toggleAll} aria-label="Seleziona tutti i preventivi" className="rounded border-gray-300 cursor-pointer" />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('id')}>
                  ID <SortIcon active={sortBy === 'id'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('numero')}>
                  Numero <SortIcon active={sortBy === 'numero'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('paziente_cognome')}>
                  Paziente <SortIcon active={sortBy === 'paziente_cognome'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('dentista_cognome')}>
                  Operatore <SortIcon active={sortBy === 'dentista_cognome'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('totale')}>
                  Totale <SortIcon active={sortBy === 'totale'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('data_scadenza')}>
                  Scadenza <SortIcon active={sortBy === 'data_scadenza'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('stato')}>
                  Stato <SortIcon active={sortBy === 'stato'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('consenso_firmato')}>
                  Consenso <SortIcon active={sortBy === 'consenso_firmato'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('created_at')}>
                  Creato il <SortIcon active={sortBy === 'created_at'} dir={sortDir} />
                </th>
                <th scope="col" className="tbl-th">Azioni</th>
              </tr>
            </thead>
            <tbody className="tbl-tbody">
              {sortedItems.map(p => (
                <tr key={p.id} className={selected.has(p.id) ? 'tbl-row-selected' : ''}>
                  <td className="tbl-td-cb">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} aria-label={`Seleziona preventivo ${p.numero} di ${p.paziente_cognome} ${p.paziente_nome}`} className="rounded border-gray-300 cursor-pointer" />
                  </td>
                  <td className="tbl-td-id">#{p.id}</td>
                  <td className="tbl-td">
                    <button
                      onClick={() => openTab(`Preventivo ${p.numero}`, SchedaPreventivo, { preventivoId: p.id }, 'scheda-preventivo')}
                      className="font-medium text-gray-900 hover:text-blue-600 transition-colors text-left">
                      {p.numero}
                    </button>
                  </td>
                  <td className="tbl-td text-gray-600">{p.paziente_cognome} {p.paziente_nome}</td>
                  <td className="tbl-td text-gray-600">
                    {p.dentista_cognome ? `${p.dentista_cognome} ${p.dentista_nome}` : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="tbl-td font-medium text-gray-900">€{Number(p.totale).toFixed(2)}</td>
                  <td className="tbl-td text-gray-600">
                    {p.data_scadenza ? dayjs(p.data_scadenza).format('DD/MM/YYYY') : '—'}
                  </td>
                  <td className="tbl-td">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${classeEnum('stato_preventivo', p.stato)}`}>{p.stato}</span>
                  </td>
                  <td className="tbl-td">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.consenso_firmato ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {p.consenso_firmato ? '✓ Firmato' : '✗ Mancante'}
                    </span>
                  </td>
                  <td className="tbl-td text-gray-300 text-xs whitespace-nowrap" title={p.created_at}>
                    {p.created_at ? dayjs(p.created_at).format('DD/MM/YYYY') : '—'}
                  </td>
                  <td className="tbl-td">
                    <div className="flex gap-2 flex-wrap">
                      {(p.stato === 'bozza' || p.stato === 'inviato') && (
                        <button onClick={() => openTab(`Preventivo ${p.numero}`, FormPreventivo, { preventivo: p }, 'preventivo')}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium">Modifica</button>
                      )}
                      {p.stato === 'bozza' && (
                        <button onClick={() => inviaMutation.mutate(p.id)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Invia</button>
                      )}
                      {!p.consenso_firmato && p.stato !== 'rifiutato' && (
                        <button onClick={() => firmaMutation.mutate(p.id)} className="text-green-600 hover:text-green-800 text-xs font-medium">Firma consenso</button>
                      )}
                      {p.stato !== 'rifiutato' && p.stato !== 'scaduto' && (
                        <button
                          onClick={() => openTab(
                            `Nuovo appuntamento — ${p.paziente_cognome}`,
                            FormAppuntamento,
                            {
                              initialPazienteId: p.paziente_id,
                              initialDentistaId: p.dentista_id || '',
                              initialPianoCuraId: p.piano_cura_id,
                            },
                            'appuntamento'
                          )}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                          Crea appuntamento
                        </button>
                      )}
                    </div>
                  </td>
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
    </div>
  )
}
