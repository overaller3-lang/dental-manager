import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'

// Notazione FDI (ISO 3950).
// Quadranti: 1=sup-dx, 2=sup-sx, 3=inf-sx, 4=inf-dx (visione del dentista).
// Per la dentatura permanente i denti sono numerati 1-8 da centrale a 3°molare.
// In UI mostriamo solo permanenti (16 denti × 2 archi).
const QUADRANTI_SUP = [
  { q: 1, denti: [8, 7, 6, 5, 4, 3, 2, 1] },  // mostrato da sx a dx
  { q: 2, denti: [1, 2, 3, 4, 5, 6, 7, 8] },
]
const QUADRANTI_INF = [
  { q: 4, denti: [8, 7, 6, 5, 4, 3, 2, 1] },
  { q: 3, denti: [1, 2, 3, 4, 5, 6, 7, 8] },
]

const STATI = [
  { value: 'sano',          label: 'Sano',          color: 'bg-white text-gray-600 border-gray-300' },
  { value: 'carie',         label: 'Carie',         color: 'bg-red-100 text-red-700 border-red-400' },
  { value: 'otturato',      label: 'Otturato',      color: 'bg-blue-100 text-blue-700 border-blue-400' },
  { value: 'devitalizzato', label: 'Devitalizzato', color: 'bg-purple-100 text-purple-700 border-purple-400' },
  { value: 'protesi',       label: 'Protesi',       color: 'bg-yellow-100 text-yellow-700 border-yellow-400' },
  { value: 'impianto',      label: 'Impianto',      color: 'bg-emerald-100 text-emerald-700 border-emerald-500' },
  { value: 'estratto',      label: 'Estratto',      color: 'bg-gray-200 text-gray-500 border-gray-400 line-through' },
  { value: 'da_estrarre',   label: 'Da estrarre',   color: 'bg-orange-100 text-orange-700 border-orange-400' },
  { value: 'fratturato',    label: 'Fratturato',    color: 'bg-pink-100 text-pink-700 border-pink-400' },
  { value: 'mobile',        label: 'Mobile',        color: 'bg-amber-100 text-amber-700 border-amber-400' },
]

const STATO_BY_VAL = Object.fromEntries(STATI.map(s => [s.value, s]))

function codice(q, n) { return `${q}${n}` }

export default function Odontogramma({ pazienteId }) {
  const queryClient = useQueryClient()
  const [selezionato, setSelezionato] = useState(null)
  const [statoForm, setStatoForm] = useState('sano')
  const [noteForm, setNoteForm] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['odontogramma', pazienteId],
    queryFn: async () => (await api.get(`/pazienti/${pazienteId}/odontogramma`)).data,
    enabled: !!pazienteId,
  })

  const mappa = useMemo(() => {
    const m = {}
    for (const d of data?.denti ?? []) m[d.dente_codice] = d
    return m
  }, [data])

  const upsert = useMutation({
    mutationFn: ({ dente, stato, note }) =>
      api.put(`/pazienti/${pazienteId}/odontogramma/${dente}`, { dente_codice: dente, stato, note }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['odontogramma', pazienteId] }),
  })

  const reset = useMutation({
    mutationFn: (dente) => api.delete(`/pazienti/${pazienteId}/odontogramma/${dente}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['odontogramma', pazienteId] }),
  })

  const apri = (dente) => {
    setSelezionato(dente)
    const corrente = mappa[dente]
    setStatoForm(corrente?.stato ?? 'sano')
    setNoteForm(corrente?.note ?? '')
  }

  const salva = () => {
    if (statoForm === 'sano' && !noteForm) {
      reset.mutate(selezionato, { onSuccess: () => setSelezionato(null) })
    } else {
      upsert.mutate({ dente: selezionato, stato: statoForm, note: noteForm },
        { onSuccess: () => setSelezionato(null) })
    }
  }

  if (isLoading) return <div className="text-center py-6 text-gray-400 text-sm">Caricamento odontogramma...</div>

  const renderDente = (q, n) => {
    const c = codice(q, n)
    const stato = mappa[c]?.stato || 'sano'
    const colore = STATO_BY_VAL[stato].color
    return (
      <button
        key={c}
        onClick={() => apri(c)}
        title={`Dente ${c} — ${STATO_BY_VAL[stato].label}${mappa[c]?.note ? ' — ' + mappa[c].note : ''}`}
        className={`w-9 h-12 border-2 rounded text-[10px] font-mono leading-tight flex flex-col items-center justify-center transition-transform hover:scale-110 hover:z-10 ${colore} ${selezionato === c ? 'ring-2 ring-blue-500' : ''}`}
      >
        <span className="font-bold">{c}</span>
        <span className="text-[8px] opacity-70">{STATO_BY_VAL[stato].label.slice(0, 4)}</span>
      </button>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Odontogramma (FDI)</h3>
        <span className="text-xs text-gray-400">Click su un dente per modificare lo stato</span>
      </div>

      <div className="flex flex-col items-center gap-1 select-none">
        <div className="flex gap-2">
          {QUADRANTI_SUP.map(({ q, denti }) => (
            <div key={q} className="flex gap-0.5">
              {denti.map(n => renderDente(q, n))}
            </div>
          ))}
        </div>
        <div className="w-full border-t border-dashed border-gray-300 my-1" />
        <div className="flex gap-2">
          {QUADRANTI_INF.map(({ q, denti }) => (
            <div key={q} className="flex gap-0.5">
              {denti.map(n => renderDente(q, n))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {STATI.map(s => (
          <span key={s.value} className={`px-2 py-0.5 rounded border ${s.color}`}>{s.label}</span>
        ))}
      </div>

      {selezionato && (
        <div className="mt-4 p-3 border border-blue-200 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-blue-900">Dente {selezionato}</h4>
            <button onClick={() => setSelezionato(null)} className="text-xs text-gray-500 hover:text-gray-700">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label htmlFor="dente-stato" className="block text-xs font-medium text-gray-700 mb-1">Stato</label>
              <select
                id="dente-stato"
                value={statoForm}
                onChange={e => setStatoForm(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {STATI.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <label htmlFor="dente-note" className="block text-xs font-medium text-gray-700 mb-1">Note</label>
          <textarea
            id="dente-note"
            value={noteForm}
            onChange={e => setNoteForm(e.target.value)}
            rows={2}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Note opzionali sul trattamento..."
          />
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setSelezionato(null)} className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">
              Annulla
            </button>
            <button
              onClick={salva}
              disabled={upsert.isPending || reset.isPending}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {upsert.isPending || reset.isPending ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
