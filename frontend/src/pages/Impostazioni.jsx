import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import ModalEliminaConferma from '../components/ModalEliminaConferma'
import { FESTIVITA_BASE } from '../utils/festivita'
import { migraFiltri } from '../hooks/usePersistedState'
import { loadScale, saveScale, colorForValue, DEFAULT_SCALE } from '../utils/colorScale'

const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
const MINUTI_STEP = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

function BasicTimePicker({ value, onChange, label }) {
  const hours = Array.from({ length: 17 }, (_, i) => i + 6)
  const selectedH = value ? parseInt(value.split(':')[0]) : ''
  const selectedM = value ? value.split(':')[1] : '00'
  return (
    <div>
      {label && <label className="block text-xs text-gray-600 mb-1">{label}</label>}
      <div className="flex items-center gap-1">
        <select value={selectedH}
          onChange={e => { const h = e.target.value; if (!h) { onChange(''); return }; onChange(`${String(parseInt(h)).padStart(2,'0')}:${selectedM}`) }}
          className="w-14 px-1 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-center">
          <option value="">--</option>
          {hours.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <span className="text-gray-500 font-semibold select-none">:</span>
        <select value={selectedM}
          onChange={e => onChange(`${String(selectedH).padStart(2,'0')}:${e.target.value}`)}
          disabled={selectedH === ''}
          className="w-14 px-1 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-center disabled:opacity-50">
          {MINUTI_STEP.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
    </div>
  )
}

function SectionHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between mb-3">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

function SaveButton({ loading, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={loading || disabled}
      className={`px-4 py-1.5 text-sm rounded-lg transition-colors whitespace-nowrap ${
        disabled || loading
          ? 'text-gray-400 bg-gray-100 cursor-not-allowed'
          : 'text-white bg-blue-600 hover:bg-blue-700'
      }`}>
      {loading ? 'Salvataggio...' : 'Salva modifiche'}
    </button>
  )
}

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

function giorniInMese(m) {
  if (m === 2) return 29
  if ([4,6,9,11].includes(m)) return 30
  return 31
}

function ModalePatrono({ form, setForm, onClose }) {
  const initMese = form.patrono_data ? parseInt(form.patrono_data.split('-')[0]) : 1
  const initGiorno = form.patrono_data ? parseInt(form.patrono_data.split('-')[1]) : 1
  const [mese, setMese] = useState(initMese)
  const [giorno, setGiorno] = useState(initGiorno)
  const [nome, setNome] = useState(form.patrono_nome || '')

  const giorni = Array.from({ length: giorniInMese(mese) }, (_, i) => i + 1)

  const handleSalva = () => {
    const mmdd = `${String(mese).padStart(2,'0')}-${String(giorno).padStart(2,'0')}`
    setForm(f => ({ ...f, patrono_data: mmdd, patrono_nome: nome }))
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-gray-900/10 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Santo Patrono locale</h3>
          <p className="text-xs text-gray-500 mt-0.5">Ricorrenza annuale — il 29 febbraio vale solo negli anni bisestili</p>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Giorno e mese</label>
            <div className="flex gap-2">
              <select value={mese} onChange={e => { setMese(parseInt(e.target.value)); setGiorno(1) }}
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {MESI.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
              <select value={giorno} onChange={e => setGiorno(parseInt(e.target.value))}
                className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {giorni.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nome del Santo (opzionale)</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)}
              placeholder="es. San Giovanni"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex items-center justify-between p-4 border-t border-gray-100">
          {form.patrono_data && (
            <button type="button" onClick={() => { setForm(f => ({ ...f, patrono_data: '', patrono_nome: '' })); onClose() }}
              className="text-xs text-red-500 hover:text-red-700">Rimuovi patrono</button>
          )}
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Annulla</button>
            <button type="button" onClick={handleSalva} className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Salva</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModaleAggiungiFestvita({ onSalva, onClose }) {
  const [mese, setMese] = useState(1)
  const [giorno, setGiorno] = useState(1)
  const [nome, setNome] = useState('')

  const giorni = Array.from({ length: giorniInMese(mese) }, (_, i) => i + 1)

  const handleSalva = () => {
    if (!nome.trim()) return
    const mmdd = `${String(mese).padStart(2,'0')}-${String(giorno).padStart(2,'0')}`
    onSalva({ data: mmdd, nome: nome.trim() })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-gray-900/10 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Aggiungi festività</h3>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Giorno e mese</label>
            <div className="flex gap-2">
              <select value={mese} onChange={e => { setMese(parseInt(e.target.value)); setGiorno(1) }}
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {MESI.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
              <select value={giorno} onChange={e => setGiorno(parseInt(e.target.value))}
                className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {giorni.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nome della festività *</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)}
              placeholder="es. Festa del patrono"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Annulla</button>
          <button type="button" onClick={handleSalva} disabled={!nome.trim()}
            className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">Aggiungi</button>
        </div>
      </div>
    </div>
  )
}

// ── sezione orari & calendario ────────────────────────────────────────────────
function fromImpOrari(imp) {
  return {
    ora_apertura: imp.ora_apertura || '08:00',
    ora_chiusura: imp.ora_chiusura || '20:00',
    giorni_lavorativi: imp.giorni_lavorativi || [0, 1, 2, 3, 4],
    festivita_disabilitate: imp.festivita_disabilitate || [],
    giorni_extra_chiusi: imp.giorni_extra_chiusi || [],
    giorni_extra_aperti: imp.giorni_extra_aperti || [],
    pausa_attiva: imp.pausa_attiva ?? false,
    ora_inizio_pausa: imp.ora_inizio_pausa || '13:00',
    ora_fine_pausa: imp.ora_fine_pausa || '14:00',
    patrono_data: imp.patrono_data || '',
    patrono_nome: imp.patrono_nome || '',
    festivita_personalizzate: imp.festivita_personalizzate || [],
  }
}

function SezioneOrari({ impostazioni, onSalva, saving }) {
  const [form, setForm] = useState(() => fromImpOrari(impostazioni))
  const [nuovoGiornoChiuso, setNuovoGiornoChiuso] = useState('')
  const [nuovoGiornoAperto, setNuovoGiornoAperto] = useState('')
  const [modalePatrono, setModalePatrono] = useState(false)
  const [modaleAggiungi, setModaleAggiungi] = useState(false)
  const isDirty = JSON.stringify(form) !== JSON.stringify(fromImpOrari(impostazioni))

  const toggleGiorno = (idx) => {
    const g = form.giorni_lavorativi.includes(idx)
      ? form.giorni_lavorativi.filter(x => x !== idx)
      : [...form.giorni_lavorativi, idx].sort()
    setForm(f => ({ ...f, giorni_lavorativi: g }))
  }

  const toggleFestivita = (data) => {
    const dis = form.festivita_disabilitate.includes(data)
      ? form.festivita_disabilitate.filter(x => x !== data)
      : [...form.festivita_disabilitate, data]
    setForm(f => ({ ...f, festivita_disabilitate: dis }))
  }

  const addGiornoChiuso = () => {
    if (!nuovoGiornoChiuso || form.giorni_extra_chiusi.includes(nuovoGiornoChiuso)) return
    setForm(f => ({ ...f, giorni_extra_chiusi: [...f.giorni_extra_chiusi, nuovoGiornoChiuso].sort() }))
    setNuovoGiornoChiuso('')
  }

  const addGiornoAperto = () => {
    if (!nuovoGiornoAperto || form.giorni_extra_aperti.includes(nuovoGiornoAperto)) return
    setForm(f => ({ ...f, giorni_extra_aperti: [...f.giorni_extra_aperti, nuovoGiornoAperto].sort() }))
    setNuovoGiornoAperto('')
  }

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Orari & Calendario"
        subtitle="Configura gli orari e i giorni di apertura dello studio"
        right={<SaveButton loading={saving} onClick={() => onSalva(form)} disabled={!isDirty} />}
      />

      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <h3 className="font-medium text-gray-800 mb-3 text-sm">Orario di apertura</h3>
        <div className="flex gap-4">
          <BasicTimePicker label="Apertura" value={form.ora_apertura} onChange={v => setForm(f => ({ ...f, ora_apertura: v }))} />
          <BasicTimePicker label="Chiusura" value={form.ora_chiusura} onChange={v => setForm(f => ({ ...f, ora_chiusura: v }))} />
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-medium text-gray-800 text-sm">Pausa pranzo</h3>
            <p className="text-xs text-gray-500 mt-0.5">Gli slot durante la pausa vengono esclusi dal form appuntamenti</p>
          </div>
          <button type="button"
            onClick={() => setForm(f => ({ ...f, pausa_attiva: !f.pausa_attiva }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.pausa_attiva ? 'bg-blue-600' : 'bg-gray-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${form.pausa_attiva ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {form.pausa_attiva && (
          <div className="flex gap-4 mt-2">
            <BasicTimePicker label="Inizio pausa" value={form.ora_inizio_pausa} onChange={v => setForm(f => ({ ...f, ora_inizio_pausa: v }))} />
            <BasicTimePicker label="Fine pausa" value={form.ora_fine_pausa} onChange={v => setForm(f => ({ ...f, ora_fine_pausa: v }))} />
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <h3 className="font-medium text-gray-800 mb-3 text-sm">Giorni lavorativi</h3>
        <div className="flex flex-wrap gap-2">
          {GIORNI.map((nome, idx) => {
            const attivo = form.giorni_lavorativi.includes(idx)
            return (
              <button key={idx} type="button" onClick={() => toggleGiorno(idx)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${attivo ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                {nome.substring(0, 3)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <h3 className="font-medium text-gray-800 mb-0.5 text-sm">Festività nazionali</h3>
        <p className="text-xs text-gray-500 mb-3">Le festività attive sono chiuse per default. Clicca per aprire lo studio in quel giorno.</p>
        <div className="space-y-0">
          {FESTIVITA_BASE.map(f => {
            const disabilitata = form.festivita_disabilitate.includes(f.data)
            return (
              <div key={f.data} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${disabilitata ? 'bg-gray-300' : 'bg-red-400'}`} />
                  <span className="text-sm text-gray-800">{f.nome}</span>
                  <span className="text-xs text-gray-400">{f.data.split('-').reverse().join('/')}</span>
                </div>
                <button type="button" onClick={() => toggleFestivita(f.data)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors shrink-0 ${disabilitata ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'}`}>
                  {disabilitata ? 'Studio aperto' : 'Chiuso'}
                </button>
              </div>
            )
          })}
          {form.festivita_personalizzate.map((f, idx) => {
            const disabilitata = form.festivita_disabilitate.includes(f.data)
            return (
              <div key={`custom-${idx}`} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${disabilitata ? 'bg-gray-300' : 'bg-red-400'}`} />
                  <span className="text-sm text-gray-800">{f.nome}</span>
                  <span className="text-xs text-gray-400">{f.data.split('-').reverse().join('/')}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button"
                    onClick={() => setForm(prev => ({ ...prev, festivita_personalizzate: prev.festivita_personalizzate.filter((_, i) => i !== idx) }))}
                    className="text-xs text-red-400 hover:text-red-600 underline">Elimina</button>
                  <button type="button" onClick={() => toggleFestivita(f.data)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${disabilitata ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'}`}>
                    {disabilitata ? 'Studio aperto' : 'Chiuso'}
                  </button>
                </div>
              </div>
            )
          })}
          {/* Santo Patrono — riga fissa in fondo */}
          {(() => {
            const patronoDisabilitato = form.patrono_data && form.festivita_disabilitate.includes(form.patrono_data)
            return (
              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${!form.patrono_data || patronoDisabilitato ? 'bg-gray-300' : 'bg-red-400'}`} />
                  <span className="text-sm text-gray-800">Santo Patrono</span>
                  {form.patrono_data && (
                    <span className="text-xs bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded text-gray-500">
                      data: {form.patrono_data.split('-').reverse().join('/')}
                    </span>
                  )}
                  {form.patrono_nome && (
                    <span className="text-xs bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded text-gray-500">
                      santo: {form.patrono_nome}
                    </span>
                  )}
                  <button type="button" onClick={() => setModalePatrono(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 underline">Modifica</button>
                </div>
                <button type="button"
                  disabled={!form.patrono_data}
                  onClick={() => form.patrono_data && toggleFestivita(form.patrono_data)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                    patronoDisabilitato ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                  }`}>
                  {patronoDisabilitato ? 'Studio aperto' : 'Chiuso'}
                </button>
              </div>
            )
          })()}
        </div>
        <div className="mt-2 pt-2 border-t border-gray-100">
          <button type="button" onClick={() => setModaleAggiungi(true)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Aggiungi festività</button>
        </div>
      </div>

      {modalePatrono && (
        <ModalePatrono form={form} setForm={setForm} onClose={() => setModalePatrono(false)} />
      )}
      {modaleAggiungi && (
        <ModaleAggiungiFestvita
          onSalva={(f) => setForm(prev => ({ ...prev, festivita_personalizzate: [...prev.festivita_personalizzate, f] }))}
          onClose={() => setModaleAggiungi(false)}
        />
      )}

      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <h3 className="font-medium text-gray-800 mb-0.5 text-sm">Chiusure straordinarie</h3>
        <p className="text-xs text-gray-500 mb-2">Date specifiche in cui lo studio è chiuso.</p>
        <div className="flex gap-2 mb-2">
          <input type="date" value={nuovoGiornoChiuso} onChange={e => setNuovoGiornoChiuso(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          <button type="button" onClick={addGiornoChiuso} className="px-3 py-1.5 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700">Aggiungi</button>
        </div>
        {form.giorni_extra_chiusi.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {form.giorni_extra_chiusi.map(d => (
              <span key={d} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-3 py-1 rounded-full">
                {d.split('-').reverse().join('/')}
                <button type="button" onClick={() => setForm(f => ({ ...f, giorni_extra_chiusi: f.giorni_extra_chiusi.filter(x => x !== d) }))} aria-label={`Rimuovi chiusura ${d.split('-').reverse().join('/')}`} className="ml-1 text-gray-400 hover:text-red-500"><span aria-hidden="true">×</span></button>
              </span>
            ))}
          </div>
        ) : <p className="text-xs text-gray-400">Nessuna chiusura straordinaria</p>}
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <h3 className="font-medium text-gray-800 mb-0.5 text-sm">Aperture straordinarie</h3>
        <p className="text-xs text-gray-500 mb-2">Date in cui lo studio è aperto anche se normalmente chiuso.</p>
        <div className="flex gap-2 mb-2">
          <input type="date" value={nuovoGiornoAperto} onChange={e => setNuovoGiornoAperto(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          <button type="button" onClick={addGiornoAperto} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Aggiungi</button>
        </div>
        {form.giorni_extra_aperti.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {form.giorni_extra_aperti.map(d => (
              <span key={d} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-3 py-1 rounded-full">
                {d.split('-').reverse().join('/')}
                <button type="button" onClick={() => setForm(f => ({ ...f, giorni_extra_aperti: f.giorni_extra_aperti.filter(x => x !== d) }))} aria-label={`Rimuovi apertura ${d.split('-').reverse().join('/')}`} className="ml-1 text-blue-300 hover:text-red-500"><span aria-hidden="true">×</span></button>
              </span>
            ))}
          </div>
        ) : <p className="text-xs text-gray-400">Nessuna apertura straordinaria</p>}
      </div>
    </div>
  )
}

// ── sezione gestione stanze ───────────────────────────────────────────────────
function SezioneStanze() {
  const queryClient = useQueryClient()
  const [modaleStanza, setModaleStanza] = useState(null)
  const [formStanza, setFormStanza] = useState({ nome: '', descrizione: '', attiva: true })
  const [errore, setErrore] = useState('')
  const [daEliminare, setDaEliminare] = useState(null)

  const { data: stanze, isLoading } = useQuery({
    queryKey: ['stanze-tutte'],
    queryFn: async () => (await api.get('/stanze?solo_attive=false')).data
  })

  const creaMutation = useMutation({
    mutationFn: (d) => api.post('/stanze', d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['stanze-tutte'] }); queryClient.invalidateQueries({ queryKey: ['stanze-attive'] }); setModaleStanza(null) }
  })
  const aggiornaMutation = useMutation({
    mutationFn: ({ id, d }) => api.patch(`/stanze/${id}`, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['stanze-tutte'] }); queryClient.invalidateQueries({ queryKey: ['stanze-attive'] }); setModaleStanza(null) }
  })
  const eliminaMutation = useMutation({
    mutationFn: (id) => api.delete(`/stanze/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stanze-tutte'] })
      queryClient.invalidateQueries({ queryKey: ['stanze-attive'] })
      setDaEliminare(null)
    },
    onError: (e) => {
      const detail = e.response?.data?.detail
      if (e.response?.status === 409 && detail?.referenze) {
        setDaEliminare(prev => ({ ...prev, referenze: detail.referenze }))
      }
    }
  })

  const apriNuova = () => { setFormStanza({ nome: '', descrizione: '', colore: '#dbeafe', attiva: true }); setErrore(''); setModaleStanza('nuova') }
  const apriModifica = (s) => { setFormStanza({ nome: s.nome, descrizione: s.descrizione || '', colore: s.colore || '#dbeafe', attiva: s.attiva }); setErrore(''); setModaleStanza(s) }

  const handleSalva = () => {
    if (!formStanza.nome.trim()) { setErrore('Il nome è obbligatorio'); return }
    const payload = {
      nome: formStanza.nome.trim(),
      descrizione: formStanza.descrizione || null,
      colore: formStanza.colore || null,
      attiva: formStanza.attiva,
    }
    if (modaleStanza === 'nuova') creaMutation.mutate(payload)
    else aggiornaMutation.mutate({ id: modaleStanza.id, d: payload })
  }

  return (
    <div className="space-y-3">
      <SectionHeader title="Gestione Stanze" subtitle="Stanze e spazi disponibili per gli appuntamenti" />
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-medium text-gray-700">{stanze?.length ?? 0} stanze</span>
          <button onClick={apriNuova} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">+ Nuova stanza</button>
        </div>
        {isLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">Caricamento...</div>
        ) : !stanze?.length ? (
          <div className="text-center py-8 text-gray-400 text-sm">Nessuna stanza. Aggiungine una!</div>
        ) : (
          <table className="tbl w-full">
            <thead className="tbl-thead">
              <tr>
                <th scope="col" className="tbl-th">Nome</th>
                <th scope="col" className="tbl-th">Descrizione</th>
                <th scope="col" className="tbl-th">Colore</th>
                <th scope="col" className="tbl-th">Stato</th>
                <th scope="col" className="tbl-th" />
              </tr>
            </thead>
            <tbody className="tbl-tbody">
              {stanze.map(s => (
                <tr key={s.id}>
                  <td className="tbl-td font-medium text-gray-900" style={s.colore ? { backgroundColor: s.colore } : undefined}>{s.nome}</td>
                  <td className="tbl-td text-gray-500">{s.descrizione || '—'}</td>
                  <td className="tbl-td">
                    {s.colore ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-5 h-5 rounded border border-gray-300" style={{ backgroundColor: s.colore }} />
                        <span className="text-xs text-gray-500 font-mono">{s.colore}</span>
                      </span>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="tbl-td">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.attiva ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.attiva ? 'Attiva' : 'Disattiva'}
                    </span>
                  </td>
                  <td className="tbl-td">
                    <div className="flex justify-end gap-3">
                      <button onClick={() => apriModifica(s)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Modifica</button>
                      <button onClick={() => setDaEliminare({ id: s.id, nome: s.nome, referenze: null })} className="text-red-500 hover:text-red-700 text-xs font-medium">Elimina</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modaleStanza && (
        <div className="fixed inset-0 bg-gray-900/10 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">{modaleStanza === 'nuova' ? 'Nuova Stanza' : `Modifica: ${modaleStanza.nome}`}</h3>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input type="text" value={formStanza.nome} onChange={e => { setFormStanza(f => ({ ...f, nome: e.target.value })); setErrore('') }}
                  placeholder="es. Studio 1" autoFocus className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
                <input type="text" value={formStanza.descrizione} onChange={e => setFormStanza(f => ({ ...f, descrizione: e.target.value }))}
                  placeholder="opzionale" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Colore</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={formStanza.colore || '#dbeafe'}
                    onChange={e => setFormStanza(f => ({ ...f, colore: e.target.value }))}
                    className="w-12 h-9 border border-gray-300 rounded cursor-pointer" />
                  <input type="text" value={formStanza.colore || ''}
                    onChange={e => setFormStanza(f => ({ ...f, colore: e.target.value }))}
                    placeholder="#dbeafe"
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono" />
                  <span className="text-xs text-gray-500">colore di sfondo nelle tabelle</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="stanza-attiva" checked={formStanza.attiva} onChange={e => setFormStanza(f => ({ ...f, attiva: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded border-gray-300" />
                <label htmlFor="stanza-attiva" className="text-sm text-gray-700">Stanza attiva</label>
              </div>
              {errore && <p className="text-red-600 text-sm">{errore}</p>}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-gray-100">
              <button onClick={() => setModaleStanza(null)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Annulla</button>
              <button onClick={handleSalva} disabled={creaMutation.isPending || aggiornaMutation.isPending}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60">
                {(creaMutation.isPending || aggiornaMutation.isPending) ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}
      {daEliminare && (
        <ModalEliminaConferma
          nome={daEliminare.nome}
          referenze={daEliminare.referenze}
          isLoading={eliminaMutation.isPending}
          onConferma={() => eliminaMutation.mutate(daEliminare.id)}
          onAnnulla={() => setDaEliminare(null)}
        />
      )}
    </div>
  )
}

// ── sezione dati studio ───────────────────────────────────────────────────────
function fromImpStudio(imp) {
  return {
    nome_studio: imp.nome_studio || '',
    indirizzo: imp.indirizzo || '',
    telefono: imp.telefono || '',
    email: imp.email || '',
    sito_web: imp.sito_web || '',
    partita_iva: imp.partita_iva || '',
    codice_fiscale: imp.codice_fiscale || '',
  }
}

function SezioneDatiStudio({ impostazioni, onSalva, saving }) {
  const [form, setForm] = useState(() => fromImpStudio(impostazioni))
  const isDirty = JSON.stringify(form) !== JSON.stringify(fromImpStudio(impostazioni))

  const F = (label, key, placeholder = '', type = 'text') => (
    <div key={key}>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
    </div>
  )

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Dati Studio"
        subtitle="Informazioni anagrafiche e fiscali dello studio"
        right={<SaveButton loading={saving} onClick={() => onSalva(form)} disabled={!isDirty} />}
      />
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm space-y-3">
        {F('Nome dello studio', 'nome_studio', 'Studio Dentistico Rossi')}
        {F('Indirizzo', 'indirizzo', 'Via Roma 1, 20100 Milano')}
        <div className="grid grid-cols-2 gap-3">
          {F('Telefono', 'telefono', '02 1234567', 'tel')}
          {F('Email', 'email', 'info@studiodentistico.it', 'email')}
        </div>
        {F('Sito web', 'sito_web', 'https://studiodentistico.it')}
        <div className="grid grid-cols-2 gap-3">
          {F('Partita IVA', 'partita_iva', '01234567890')}
          {F('Codice Fiscale', 'codice_fiscale', 'RSSMRA80A01H501U')}
        </div>
      </div>
    </div>
  )
}

// ── sezione notifiche ─────────────────────────────────────────────────────────
function fromImpNotifiche(imp) {
  return {
    promemoria_abilitato: imp.promemoria_abilitato ?? true,
    promemoria_ore_prima: imp.promemoria_ore_prima ?? 24,
    promemoria_email: imp.promemoria_email ?? true,
    promemoria_sms: imp.promemoria_sms ?? false,
  }
}

function SezioneNotifiche({ impostazioni, onSalva, saving }) {
  const [form, setForm] = useState(() => fromImpNotifiche(impostazioni))
  const isDirty = JSON.stringify(form) !== JSON.stringify(fromImpNotifiche(impostazioni))

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Notifiche e Promemoria"
        subtitle="Configura l'invio automatico di promemoria ai pazienti"
        right={<SaveButton loading={saving} onClick={() => onSalva(form)} disabled={!isDirty} />}
      />
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">Promemoria appuntamenti</p>
            <p className="text-xs text-gray-500 mt-0.5">Notifica automatica ai pazienti prima dell'appuntamento</p>
          </div>
          <button type="button" onClick={() => setForm(f => ({ ...f, promemoria_abilitato: !f.promemoria_abilitato }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.promemoria_abilitato ? 'bg-blue-600' : 'bg-gray-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${form.promemoria_abilitato ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {form.promemoria_abilitato && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Anticipo promemoria</label>
              <select value={form.promemoria_ore_prima} onChange={e => setForm(f => ({ ...f, promemoria_ore_prima: parseInt(e.target.value) }))}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm max-w-xs">
                <option value={1}>1 ora prima</option>
                <option value={2}>2 ore prima</option>
                <option value={6}>6 ore prima</option>
                <option value={12}>12 ore prima</option>
                <option value={24}>24 ore prima (1 giorno)</option>
                <option value={48}>48 ore prima (2 giorni)</option>
                <option value={72}>72 ore prima (3 giorni)</option>
              </select>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-700">Canali di notifica</p>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="prom-email" checked={form.promemoria_email} onChange={e => setForm(f => ({ ...f, promemoria_email: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded border-gray-300" />
                <label htmlFor="prom-email" className="text-sm text-gray-700">Email</label>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="prom-sms" checked={form.promemoria_sms} onChange={e => setForm(f => ({ ...f, promemoria_sms: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded border-gray-300" />
                <label htmlFor="prom-sms" className="text-sm text-gray-700">SMS</label>
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Richiede integrazione</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── scala colore contatori calendario ─────────────────────────────────────────

function ScalaColoreContatori() {
  const [scale, setScale] = useState(loadScale)

  const update = (changes) => {
    const next = { ...scale, ...changes }
    setScale(next)
    saveScale(next)
  }

  const min = Number.isFinite(parseInt(scale.min)) ? parseInt(scale.min) : 0
  const max = Number.isFinite(parseInt(scale.max)) ? parseInt(scale.max) : 0
  const range = max > min ? max - min : 0
  // limita la barra a max 50 stop per evitare DOM enormi se l'utente mette 0..1000
  const step = range > 50 ? Math.ceil(range / 50) : 1
  const stops = []
  if (range > 0) {
    for (let v = min; v <= max; v += step) stops.push(v)
    if (stops[stops.length - 1] !== max) stops.push(max)
  }

  const handleStopClick = (v) => {
    if (v <= min || v >= max) return
    if (scale.midVal === v) {
      update({ midVal: null, colorMid: null })
    } else {
      update({ midVal: v, colorMid: scale.colorMid || colorForValue(v, scale) })
    }
  }

  const reset = () => { saveScale(DEFAULT_SCALE); setScale(DEFAULT_SCALE) }

  return (
    <div className="pt-3 border-t border-gray-100">
      <label className="block text-sm font-medium text-gray-800 mb-1">Scala colore contatori calendario (dashboard)</label>
      <p className="text-xs text-gray-500 mb-3">
        Personalizza il gradiente dei numeri nel calendario degli appuntamenti. Clicca su un valore della barra per impostare un punto centrale.
      </p>

      <div className="flex items-center gap-2 mb-2">
        <input type="number" value={scale.min}
          onChange={e => update({ min: parseInt(e.target.value) || 0 })}
          className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center" />
        <input type="color" value={scale.colorMin}
          onChange={e => update({ colorMin: e.target.value })}
          className="w-10 h-8 rounded cursor-pointer border border-gray-300" />
        <div className="flex flex-1 h-8 rounded overflow-hidden border border-gray-300">
          {stops.length === 0 ? (
            <div className="flex-1 bg-gray-100 flex items-center justify-center text-xs text-gray-400">max ≤ min</div>
          ) : stops.map(v => (
            <button key={v} type="button" onClick={() => handleStopClick(v)}
              title={`Valore ${v}${scale.midVal === v ? ' (centro)' : ''}`}
              disabled={v === min || v === max}
              style={{ background: colorForValue(v, scale), flex: 1 }}
              className={`relative ${scale.midVal === v ? 'ring-2 ring-blue-500 ring-inset z-10' : ''} ${v === min || v === max ? 'cursor-default' : 'cursor-pointer'}`} />
          ))}
        </div>
        <input type="color" value={scale.colorMax}
          onChange={e => update({ colorMax: e.target.value })}
          className="w-10 h-8 rounded cursor-pointer border border-gray-300" />
        <input type="number" value={scale.max}
          onChange={e => update({ max: parseInt(e.target.value) || 0 })}
          className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center" />
      </div>

      {scale.midVal != null && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-gray-600 w-16">Centro:</span>
          <input type="number" value={scale.midVal}
            onChange={e => update({ midVal: parseInt(e.target.value) || 0 })}
            className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center" />
          <input type="color" value={scale.colorMid || '#fbbf24'}
            onChange={e => update({ colorMid: e.target.value })}
            className="w-10 h-8 rounded cursor-pointer border border-gray-300" />
          <button onClick={() => update({ midVal: null, colorMid: null })}
            className="text-xs text-red-500 hover:text-red-700 ml-2">Rimuovi centro</button>
        </div>
      )}

      <button onClick={reset}
        className="text-xs text-gray-500 hover:text-gray-700 underline">Ripristina default</button>
    </div>
  )
}

// ── sezione preferenze locali ─────────────────────────────────────────────────

function SezionePreferenze() {
  const [modoFiltri, setModoFiltri] = useState(
    () => localStorage.getItem('filtri-persistenza') || 'sessione'
  )
  const [feedback, setFeedback] = useState('')

  const cambiaModo = (nuovo) => {
    if (nuovo === modoFiltri) return
    localStorage.setItem('filtri-persistenza', nuovo)
    migraFiltri(nuovo)
    setModoFiltri(nuovo)
    setFeedback(nuovo === 'sempre'
      ? 'I filtri saranno mantenuti anche dopo la chiusura del browser.'
      : 'I filtri saranno mantenuti solo durante la sessione corrente.')
    setTimeout(() => setFeedback(''), 4000)
  }

  const pulisciFiltri = () => {
    if (!confirm('Sicuro di voler resettare tutti i filtri salvati?')) return
    const tutti = [localStorage, sessionStorage]
    for (const store of tutti) {
      const chiavi = []
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i)
        if (k && k.startsWith('filtri.')) chiavi.push(k)
      }
      chiavi.forEach(k => store.removeItem(k))
    }
    setFeedback('Tutti i filtri sono stati resettati. Aggiorna la pagina per vedere il cambio.')
    setTimeout(() => setFeedback(''), 4000)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <SectionHeader
        title="Preferenze locali"
        subtitle="Queste impostazioni sono memorizzate sul tuo browser, non sul server."
      />

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-1">Persistenza filtri delle tabelle</label>
          <p className="text-xs text-gray-500 mb-2">
            Decide se i filtri (ricerca, stato, ordinamento, pagina) devono essere ripristinati al ricaricamento.
          </p>
          <div className="space-y-1.5">
            <label className="flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input type="radio" name="modoFiltri" value="sessione"
                checked={modoFiltri === 'sessione'}
                onChange={() => cambiaModo('sessione')}
                className="mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-800">Solo nella sessione corrente</p>
                <p className="text-xs text-gray-500">I filtri sopravvivono al refresh ma si resettano alla chiusura del browser. (Default)</p>
              </div>
            </label>
            <label className="flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input type="radio" name="modoFiltri" value="sempre"
                checked={modoFiltri === 'sempre'}
                onChange={() => cambiaModo('sempre')}
                className="mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-800">Anche dopo la chiusura del browser</p>
                <p className="text-xs text-gray-500">I filtri vengono mantenuti finché non li resetti esplicitamente.</p>
              </div>
            </label>
          </div>
        </div>

        <div className="pt-3 border-t border-gray-100">
          <button onClick={pulisciFiltri}
            className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
            Resetta tutti i filtri salvati
          </button>
        </div>

        <ScalaColoreContatori />

        {feedback && (
          <div role="status" className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            {feedback}
          </div>
        )}
      </div>
    </div>
  )
}

// ── pagina principale ─────────────────────────────────────────────────────────
const TABS = [
  { id: 'orari', label: 'Orari & Calendario', icona: '🕐' },
  { id: 'stanze', label: 'Stanze', icona: '🏠' },
  { id: 'studio', label: 'Dati Studio', icona: '🏥' },
  { id: 'notifiche', label: 'Notifiche', icona: '🔔' },
  { id: 'preferenze', label: 'Preferenze', icona: '🎛️' },
]

export default function Impostazioni() {
  const [tab, setTab] = useState('orari')
  const queryClient = useQueryClient()

  const { data: impostazioni, isLoading } = useQuery({
    queryKey: ['impostazioni'],
    queryFn: async () => (await api.get('/impostazioni')).data
  })

  const salvaMutation = useMutation({
    mutationFn: (dati) => api.put('/impostazioni', dati),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['impostazioni'] })
  })

  if (isLoading || !impostazioni) return <div className="p-6 text-center text-gray-400">Caricamento impostazioni...</div>

  return (
    <div className="p-3">
      <div className="mb-3">
        <h1 className="text-xl font-bold text-gray-900">Impostazioni</h1>
        <p className="text-gray-500 text-xs mt-0.5">Configura lo studio, gli orari e le preferenze</p>
      </div>
      <div className="flex gap-4 items-start">
        <div className="w-48 flex-shrink-0">
          <nav className="space-y-0.5">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${tab === t.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}>
                <span>{t.icona}</span><span>{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="w-fit min-w-[440px] max-w-3xl">
          {tab === 'orari' && <SezioneOrari impostazioni={impostazioni} onSalva={d => salvaMutation.mutate(d)} saving={salvaMutation.isPending} />}
          {tab === 'stanze' && <SezioneStanze />}
          {tab === 'studio' && <SezioneDatiStudio impostazioni={impostazioni} onSalva={d => salvaMutation.mutate(d)} saving={salvaMutation.isPending} />}
          {tab === 'notifiche' && <SezioneNotifiche impostazioni={impostazioni} onSalva={d => salvaMutation.mutate(d)} saving={salvaMutation.isPending} />}
          {tab === 'preferenze' && <SezionePreferenze />}
        </div>
      </div>
    </div>
  )
}
