import { useState, useRef, useEffect, useMemo } from 'react'
import { usePersistedState } from '../hooks/usePersistedState'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { useTabs } from '../context/TabContext'
import Highlight from '../components/Highlight'
import FocusTrap from '../components/FocusTrap'
import ModalEliminaConferma from '../components/ModalEliminaConferma'
import { useColOrder } from '../hooks/useColOrder'
import { FESTIVITA_BASE } from '../utils/festivita'
import SchedaAppuntamento from './SchedaAppuntamento'
import { FormDettaglioOrdine } from './Ordini'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
dayjs.locale('it')

// ── helpers ──────────────────────────────────────────────────────────────────

function parseMin(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function getValidTimes(oraApertura = '08:00', oraChiusura = '20:00', pausaAttiva = false, pausaInizio = '13:00', pausaFine = '14:00') {
  const start = parseMin(oraApertura)
  const end = parseMin(oraChiusura)
  const pi = pausaAttiva ? parseMin(pausaInizio) : null
  const pf = pausaAttiva ? parseMin(pausaFine) : null
  const times = []
  for (let m = start; m <= end; m += 10) {
    if (pi !== null && m >= pi && m < pf) continue
    times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  return times
}

function getPausaTimes(oraApertura = '08:00', oraChiusura = '20:00', pausaAttiva = false, pausaInizio = '13:00', pausaFine = '14:00') {
  // Per ora_inizio: includi pausaInizio, escludi pausaFine. [pi, pf)
  if (!pausaAttiva) return []
  const start = Math.max(parseMin(oraApertura), parseMin(pausaInizio))
  const end = Math.min(parseMin(oraChiusura), parseMin(pausaFine))
  const times = []
  for (let m = start; m < end; m += 10) {
    times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  return times
}

function getValidTimesFine(oraApertura = '08:00', oraChiusura = '20:00', pausaAttiva = false, pausaInizio = '13:00', pausaFine = '14:00') {
  // Per ora_fine: pausa = (pi, pf]. Quindi pausaInizio è valido (l'appuntamento può finire all'inizio pausa).
  const start = parseMin(oraApertura)
  const end = parseMin(oraChiusura)
  const pi = pausaAttiva ? parseMin(pausaInizio) : null
  const pf = pausaAttiva ? parseMin(pausaFine) : null
  const times = []
  for (let m = start; m <= end; m += 10) {
    if (pi !== null && m > pi && m <= pf) continue
    times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  return times
}

function getPausaTimesFine(oraApertura = '08:00', oraChiusura = '20:00', pausaAttiva = false, pausaInizio = '13:00', pausaFine = '14:00') {
  // Per ora_fine: pausa = (pi, pf]. Quindi escludi pausaInizio, includi pausaFine.
  if (!pausaAttiva) return []
  const start = Math.max(parseMin(oraApertura), parseMin(pausaInizio) + 10)
  const end = Math.min(parseMin(oraChiusura), parseMin(pausaFine))
  const times = []
  for (let m = start; m <= end; m += 10) {
    times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  return times
}

function getHours(validTimes) {
  const set = new Set()
  validTimes.forEach(t => set.add(parseInt(t.split(':')[0])))
  return Array.from(set).sort((a, b) => a - b)
}

function getMinutes(validTimes, selectedHour) {
  if (selectedHour === '' || selectedHour === null || selectedHour === undefined || isNaN(selectedHour)) return []
  const h = String(parseInt(selectedHour)).padStart(2, '0')
  return validTimes.filter(t => t.startsWith(`${h}:`)).map(t => t.split(':')[1])
}

function addMinutes(ora, minuti) {
  const [h, m] = ora.split(':').map(Number)
  const total = Math.min(h * 60 + m + minuti, 23 * 60 + 55)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function diffMinutes(oraFine, oraInizio) {
  return parseMin(oraFine) - parseMin(oraInizio)
}

function durataLabel(min) {
  const h = Math.floor(min / 60), m = min % 60
  if (h === 0) return `${min} min`
  if (m === 0) return `${h} or${h === 1 ? 'a' : 'e'}`
  return `${h}h ${m}min`
}

const DURATE_ALL = Array.from({ length: (240 - 10) / 10 + 1 }, (_, i) => 10 + i * 10)

function durateLimitLabel(oraInizio, impostazioni, durate) {
  if (!oraInizio || durate.length === DURATE_ALL.length) return null
  const startMin = parseMin(oraInizio)
  const pausaAttiva = impostazioni?.pausa_attiva
  const piMin = pausaAttiva ? parseMin(impostazioni?.ora_inizio_pausa || '13:00') : null
  if (piMin !== null && startMin < piMin) return 'PAUSA'
  return 'FINE GIORNATA'
}

function isGiornoLavorativo(dataStr, impostazioni) {
  if (!impostazioni || !dataStr) return true
  const d = dayjs(dataStr)
  const mesGiorno = d.format('MM-DD')
  if (impostazioni.giorni_extra_aperti?.includes(dataStr)) return true
  if (impostazioni.giorni_extra_chiusi?.includes(dataStr)) return false
  // festività = base + personalizzate + patrono (chiuse a meno che non siano in festivita_disabilitate)
  const festivitaAttive = [
    ...FESTIVITA_BASE.map(f => f.data),
    ...(impostazioni.festivita_personalizzate || []).map(f => f.data),
    ...(impostazioni.patrono_data ? [impostazioni.patrono_data] : []),
  ]
  if (festivitaAttive.includes(mesGiorno) && !impostazioni.festivita_disabilitate?.includes(mesGiorno)) return false
  // dayjs .day(): 0=Dom…6=Sab → converti a 0=Lun…6=Dom (convenzione impostazioni)
  const dayjsDay = d.day()
  const impDay = dayjsDay === 0 ? 6 : dayjsDay - 1
  const giorni = impostazioni.giorni_lavorativi ?? [0, 1, 2, 3, 4]
  return giorni.includes(impDay)
}

function generaDate(dataBase, tipo, numTotale) {
  const base = dayjs(dataBase)
  const n = Math.ceil(base.date() / 7)
  const dow = base.day()
  const date = []
  for (let i = 1; i < numTotale; i++) {
    let next
    if (tipo === 'ogni_settimana')    next = base.add(i * 7, 'day')
    else if (tipo === 'ogni_2_sett')  next = base.add(i * 14, 'day')
    else if (tipo === 'ogni_3_sett')  next = base.add(i * 21, 'day')
    else if (tipo === 'ogni_4_sett')  next = base.add(i * 28, 'day')
    else if (tipo === 'mensile_giorno') next = base.add(i, 'month')
    else {
      // mensile_settimana: stesso giorno-della-settimana (es. 1° lunedì)
      const mese = base.add(i, 'month').startOf('month')
      let offset = (dow - mese.day() + 7) % 7
      next = mese.add(offset + (n - 1) * 7, 'day')
      if (next.month() !== mese.month()) next = next.subtract(7, 'day')
    }
    date.push(next)
  }
  return date
}

function durateFiltrate(oraInizio, impostazioni) {
  if (!oraInizio) return DURATE_ALL
  const startMin = parseMin(oraInizio)
  const closeMin = parseMin(impostazioni?.ora_chiusura || '20:00')
  const pausaAttiva = impostazioni?.pausa_attiva
  const piMin = pausaAttiva ? parseMin(impostazioni?.ora_inizio_pausa || '13:00') : null
  const pfMin = pausaAttiva ? parseMin(impostazioni?.ora_fine_pausa || '14:00') : null
  return DURATE_ALL.filter(d => {
    const endMin = startMin + d
    if (endMin > closeMin) return false
    // Esclude le durate la cui fine cade in (piMin, pfMin]
    if (piMin !== null && endMin > piMin && endMin <= pfMin) return false
    return true
  })
}

function durateInPausa(oraInizio, impostazioni) {
  if (!oraInizio || !impostazioni?.pausa_attiva) return new Set()
  const startMin = parseMin(oraInizio)
  const closeMin = parseMin(impostazioni?.ora_chiusura || '20:00')
  const piMin = parseMin(impostazioni?.ora_inizio_pausa || '13:00')
  const pfMin = parseMin(impostazioni?.ora_fine_pausa || '14:00')
  return new Set(DURATE_ALL.filter(d => {
    const endMin = startMin + d
    if (endMin > closeMin) return false
    return endMin > piMin && endMin <= pfMin
  }))
}

const STATI_LABEL = {
  prenotato: 'Prenotato',
  confermato: 'Confermato',
  in_corso: 'In corso',
  completato: 'Completato',
  annullato: 'Annullato',
  non_presentato: 'Non presentato',
  rinviato: 'Rinviato',
}

// Colori degli stati e dei tipi di appuntamento centralizzati in utils/colori.js
import { classeEnum, labelEnum } from '../utils/colori'

// ── ics / qr ─────────────────────────────────────────────────────────────────

function fmtICS(dt) {
  return dayjs(dt).utc ? dayjs(dt).toDate().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') : ''
}

function generaICS(appuntamenti, studio = {}) {
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}@dental`
  const nomeStudio = studio.nome_studio || 'Studio Dentistico'
  const indirizzoStudio = studio.indirizzo || ''
  const events = appuntamenti.map(a => {
    const dtStart = dayjs(a.data_ora_inizio).toDate().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const dtEnd   = dayjs(a.data_ora_fine).toDate().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const paziente = [a.paziente_cognome, a.paziente_nome].filter(Boolean).join(' ')
    const dentista = [a.dentista_cognome, a.dentista_nome].filter(Boolean).join(' ')
    const summary  = nomeStudio
    const descParts = []
    if (paziente) descParts.push(`Paziente: ${paziente}`)
    if (dentista) descParts.push(`Operatore: ${dentista}`)
    if (a.tipo) descParts.push(`Tipo: ${a.tipo.replace(/_/g, ' ')}`)
    if (a.motivo) descParts.push(`Motivo: ${a.motivo}`)
    const desc = descParts.join('\\n')
    const location = indirizzoStudio || a.sala || ''
    return [
      'BEGIN:VEVENT',
      `UID:${uid()}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${summary}`,
      desc && `DESCRIPTION:${desc}`,
      location && `LOCATION:${location}`,
      'END:VEVENT',
    ].filter(Boolean).join('\r\n')
  })
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DentalManager//IT', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n')
}

function downloadICS(appuntamenti, filename = 'appuntamento.ics', studio = {}) {
  const blob = new Blob([generaICS(appuntamenti, studio)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function ModaleICS({ appuntamenti, onClose }) {
  const { data: impostazioni } = useQuery({ queryKey: ['impostazioni'], queryFn: async () => (await api.get('/impostazioni')).data })
  const studio = impostazioni || {}

  const singolo = appuntamenti.length === 1
  const a0 = appuntamenti[0]
  const titolo = singolo
    ? `Calendario - ${a0.paziente_cognome} ${a0.paziente_nome} ${dayjs(a0.data_ora_inizio).format('DD/MM/YYYY HH:mm')}`
    : `Calendario - ${appuntamenti.length} appuntamenti`
  const filename = singolo
    ? `appuntamento-${a0.paziente_cognome?.toLowerCase()}-${dayjs(a0.data_ora_inizio).format('YYYYMMDD')}.ics`
    : `appuntamenti-${dayjs(a0.data_ora_inizio).format('YYYYMMDD')}.ics`

  const ids = appuntamenti.map(a => a.id).filter(Boolean)
  const qrUrl = ids.length > 0
    ? `${window.location.origin}/api/appuntamenti/ics?ids=${ids.join(',')}`
    : null

  return (
    <div className="fixed inset-0 bg-gray-900/10 flex items-center justify-center z-[60] p-4" aria-hidden="false">
      <FocusTrap>
        <div role="dialog" aria-modal="true" aria-labelledby="modale-ics-titolo" className="bg-white rounded-xl shadow-xl w-full max-w-sm">
          <div className="p-4 border-b border-gray-100">
            <h2 id="modale-ics-titolo" className="text-sm font-semibold text-gray-900">{titolo}</h2>
          </div>
          <div className="p-5 flex flex-col items-center gap-4">
            {qrUrl ? (
              <>
                <div className="p-3 bg-white border border-gray-200 rounded-xl shadow-inner">
                  <QRCodeSVG value={qrUrl} size={210} level="M" />
                </div>
                <p className="text-xs text-gray-500 text-center">
                  Inquadra con il telefono per aggiungere al calendario
                </p>
              </>
            ) : (
              <p className="text-xs text-amber-600 text-center bg-amber-50 rounded-lg px-3 py-2">
                QR non disponibile - gli appuntamenti appena creati verranno esportati con il pulsante qui sotto
              </p>
            )}
            <div className="w-full bg-blue-50 rounded-lg p-2 max-h-48 overflow-y-auto space-y-2">
              {appuntamenti.map((a, i) => {
                const paziente = [a.paziente_cognome, a.paziente_nome].filter(Boolean).join(' ')
                const dentista = [a.dentista_cognome, a.dentista_nome].filter(Boolean).join(' ')
                return (
                  <div key={i} className={`text-xs text-blue-800 ${appuntamenti.length > 1 ? 'pb-2 border-b border-blue-100 last:border-0 last:pb-0' : ''}`}>
                    <p className="font-semibold">{appuntamenti.length > 1 ? `${i + 1}. ` : ''}{dayjs(a.data_ora_inizio).format('ddd DD/MM/YYYY')} - {dayjs(a.data_ora_inizio).format('HH:mm')} - {dayjs(a.data_ora_fine).format('HH:mm')}</p>
                    {paziente && <p className="text-blue-600">Paziente: {paziente}</p>}
                    {dentista && <p className="text-blue-600">Operatore: {dentista}</p>}
                    {a.tipo && <p className="text-blue-600">Tipo: {a.tipo.replace(/_/g, ' ')}</p>}
                    {a.motivo && <p className="text-blue-600">Motivo: {a.motivo}</p>}
                  </div>
                )
              })}
            </div>
            <button
              onClick={() => downloadICS(appuntamenti, filename, studio)}
              className="w-full px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
            >
              Scarica file .ics (su questo PC)
            </button>
            <p className="text-xs text-gray-400 text-center -mt-2">
              Funziona con Google Calendar, Apple Calendar, Outlook
            </p>
          </div>
          <div className="px-4 pb-4 flex justify-end">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Chiudi</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  )
}

// ── calendario personalizzato ────────────────────────────────────────────────

function CalendarioInput({ value, onChange, impostazioni }) {
  const [aperto, setAperto] = useState(false)
  const [meseVisibile, setMeseVisibile] = useState(
    () => (value ? dayjs(value) : dayjs()).startOf('month')
  )
  const containerRef = useRef(null)

  useEffect(() => {
    const handle = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setAperto(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const giorniLav = impostazioni?.giorni_lavorativi ?? [0, 1, 2, 3, 4]
  // Ordine italiano: 0=Lun…6=Dom (stesso del modello impostazioni)
  const labelsSettimana = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

  const primoGiorno = meseVisibile.startOf('month')
  // dayjs .day(): 0=Dom…6=Sab → converto a 0=Lun offset
  const offset = (primoGiorno.day() + 6) % 7
  const celle = []
  for (let i = 0; i < offset; i++) celle.push(null)
  for (let d = 1; d <= meseVisibile.daysInMonth(); d++) celle.push(d)
  while (celle.length % 7 !== 0) celle.push(null)

  const handleWheel = (e) => {
    e.preventDefault()
    setMeseVisibile(m => e.deltaY > 0 ? m.add(1, 'month') : m.subtract(1, 'month'))
  }

  const seleziona = (d) => {
    onChange(meseVisibile.date(d).format('YYYY-MM-DD'))
    setAperto(false)
  }

  const nonLavSelezionato = value && !isGiornoLavorativo(value, impostazioni)
  const passatoSelezionato = value && value < dayjs().format('YYYY-MM-DD')
  const hasWarning = nonLavSelezionato || passatoSelezionato

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!aperto && value) setMeseVisibile(dayjs(value).startOf('month'))
          setAperto(v => !v)
        }}
        className={`w-full px-3 py-1.5 border rounded-lg text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          hasWarning ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
        }`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value ? dayjs(value).format('ddd DD/MM/YYYY') : 'Seleziona data...'}
        </span>
        <span className="text-gray-400 text-[10px]" aria-hidden="true">▼</span>
      </button>
      {nonLavSelezionato && <p className="text-xs text-red-500 mt-0.5">Giorno non lavorativo</p>}
      {!nonLavSelezionato && passatoSelezionato && <p className="text-xs text-red-500 mt-0.5">Data nel passato</p>}

      {aperto && (
        <div
          className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-72 select-none"
          onWheel={handleWheel}
        >
          {/* Header mese */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => setMeseVisibile(m => m.subtract(1, 'month'))}
              aria-label={`Mese precedente: ${meseVisibile.subtract(1, 'month').format('MMMM YYYY')}`}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg leading-none"><span aria-hidden="true">‹</span></button>
            <span className="text-sm font-semibold text-gray-800 capitalize" aria-live="polite">
              {meseVisibile.format('MMMM YYYY')}
            </span>
            <button type="button" onClick={() => setMeseVisibile(m => m.add(1, 'month'))}
              aria-label={`Mese successivo: ${meseVisibile.add(1, 'month').format('MMMM YYYY')}`}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg leading-none"><span aria-hidden="true">›</span></button>
          </div>

          {/* Etichette giorni settimana */}
          <div className="grid grid-cols-7 mb-1">
            {labelsSettimana.map((label, i) => (
              <span key={i} className={`text-center text-xs font-semibold py-0.5 ${
                giorniLav.includes(i) ? 'text-blue-500' : 'text-red-500'
              }`}>
                {label}
              </span>
            ))}
          </div>

          {/* Griglia giorni */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {celle.map((d, i) => {
              if (!d) return <div key={i} />
              const dataStr = meseVisibile.date(d).format('YYYY-MM-DD')
              const isSelected = value === dataStr
              const isOggi = dataStr === dayjs().format('YYYY-MM-DD')
              const nonLav = !isGiornoLavorativo(dataStr, impostazioni)
              return (
                <button key={i} type="button" onClick={() => seleziona(d)}
                  className={`h-8 w-full rounded-lg text-xs font-medium transition-colors ${
                    isSelected ? 'bg-blue-600 text-white' :
                    nonLav ? 'text-red-400 hover:bg-red-50' :
                    isOggi ? 'text-blue-600 font-bold hover:bg-blue-50 ring-1 ring-blue-300' :
                    'text-gray-700 hover:bg-blue-50'
                  }`}>
                  {d}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="mt-2 pt-2 border-t border-gray-100 text-center">
            <button type="button"
              onClick={() => { onChange(dayjs().format('YYYY-MM-DD')); setAperto(false) }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium">
              Oggi
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── selettore ore:minuti ─────────────────────────────────────────────────────

// Dropdown custom con voce "── pausa ──" che, al click, espande le opzioni in pausa
// senza chiudere il menu. Posizionata fra ultima non-pausa e prima pausa.
function PausaSelect({ value, onChange, options, hasError = false, disabled = false, width = 'w-full', center = false, alwaysExpanded = false }) {
  const [open, setOpen] = useState(false)
  const [pausaShown, setPausaShown] = useState(false)
  const ref = useRef()

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const sorted = [...options].sort((a, b) => Number(a.value) - Number(b.value))
  const currentOpt = sorted.find(o => String(o.value) === String(value))
  const currentInPausa = currentOpt?.inPausa ?? false
  const showPausa = alwaysExpanded || pausaShown || currentInPausa
  const firstPausaIdx = sorted.findIndex(o => o.inPausa)
  const hasPausa = firstPausaIdx >= 0

  let displayList
  if (showPausa || !hasPausa) {
    displayList = sorted
  } else {
    const nonPausa = sorted.filter(o => !o.inPausa)
    displayList = [...nonPausa]
    displayList.splice(firstPausaIdx, 0, { value: '__pausa_toggle__', label: 'pausa', isToggle: true })
  }

  const border = hasError ? 'border-red-400' : (currentInPausa ? 'border-red-500' : 'border-gray-300')
  const align = center ? 'text-center' : 'text-left'

  return (
    <div ref={ref} className={`relative ${width}`}>
      <button type="button" onClick={() => !disabled && setOpen(o => !o)} disabled={disabled}
        className={`${width} px-2 py-1.5 border ${border} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white ${align} disabled:opacity-50 cursor-pointer`}>
        {currentOpt?.label ?? '--'}
      </button>
      {open && (
        <div className={`absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-30 max-h-96 overflow-y-auto ${width}`}>
          {displayList.map((o, i) => (
            <button key={i} type="button"
              onClick={() => {
                if (o.isToggle) { setPausaShown(true); return }
                onChange(o.value)
                setOpen(false)
              }}
              className={`block w-full px-2 py-1 hover:bg-blue-50 text-sm ${align} ${o.inPausa || o.isToggle ? 'text-red-600' : 'text-gray-900'}`}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TimePickerHM({ value, onChange, validTimes, pausaTimes = [], hasError = false }) {
  const selectedH = value ? parseInt(value.split(':')[0]) : ''
  const selectedM = value ? value.split(':')[1] : ''
  const validHours = getHours(validTimes)
  const pausaHours = getHours(pausaTimes)
  const validMinutes = getMinutes(validTimes, selectedH)
  const pausaMinutes = getMinutes(pausaTimes, selectedH)

  const hoursOptions = [...new Set([...validHours, ...pausaHours])].sort((a, b) => a - b).map(h => ({
    value: h,
    label: String(h),
    inPausa: pausaHours.includes(h) && !validHours.includes(h),
  }))
  const minutesOptions = [...new Set([...validMinutes, ...pausaMinutes])].sort().map(m => ({
    value: m,
    label: m,
    inPausa: pausaMinutes.includes(m) && !validMinutes.includes(m),
  }))

  const handleH = (h) => {
    if (h === '' || h === undefined) { onChange(''); return }
    const mins = getMinutes(validTimes, h)
    const fallbackMins = mins.length ? mins : getMinutes(pausaTimes, h)
    const newM = fallbackMins.includes(selectedM) ? selectedM : (fallbackMins[0] || '00')
    onChange(`${String(parseInt(h)).padStart(2, '0')}:${newM}`)
  }
  const handleM = (m) => {
    onChange(`${String(parseInt(selectedH)).padStart(2, '0')}:${m}`)
  }

  return (
    <div className="flex items-center gap-1">
      <PausaSelect value={selectedH} onChange={handleH} options={hoursOptions} hasError={hasError} width="w-16" center />
      <span className="text-gray-500 font-semibold select-none">:</span>
      <PausaSelect value={selectedM} onChange={handleM} options={minutesOptions} hasError={hasError} disabled={selectedH === ''} width="w-16" center />
    </div>
  )
}

// ── mini-modal nuova stanza ──────────────────────────────────────────────────

function ModaleNuovaStanza({ onClose, onCreata }) {
  const [nome, setNome] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post('/stanze', { nome, descrizione: descrizione || null, attiva: true })
      onCreata(res.data)
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/10 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Nuova Stanza</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="es. Studio 1"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" required autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Descrizione</label>
            <input type="text" value={descrizione} onChange={e => setDescrizione(e.target.value)} placeholder="opzionale"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Annulla</button>
            <button type="submit" disabled={loading} className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60">
              {loading ? 'Salvataggio...' : 'Aggiungi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── dialog avvisi (non-working day / pausa) ───────────────────────────────────

function ModaleAvvisi({ avvisi, onAnnulla, onProcedi }) {
  return (
    <div className="fixed inset-0 bg-gray-900/10 flex items-center justify-center z-[60] p-4">
      <FocusTrap>
        <div role="dialog" aria-modal="true" aria-labelledby="modale-avvisi-titolo" className="bg-white rounded-xl shadow-xl w-full max-w-md">
          <div className="p-4 border-b border-amber-100 bg-amber-50 rounded-t-xl flex items-center gap-3">
            <span aria-hidden="true" className="text-xl">⚠️</span>
            <h2 id="modale-avvisi-titolo" className="text-sm font-semibold text-amber-800">Attenzione</h2>
          </div>
          <div className="p-4 space-y-2">
            <p className="text-sm text-gray-700">Sono stati rilevati i seguenti problemi:</p>
            <ul className="list-disc list-inside space-y-1 pl-1">
              {avvisi.map((a, i) => <li key={i} className="text-sm text-amber-700">{a}</li>)}
            </ul>
            <p className="text-sm text-gray-500 pt-1">Vuoi procedere comunque?</p>
          </div>
          <div className="flex justify-end gap-3 p-4 border-t border-gray-100">
            <button onClick={onAnnulla} className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Annulla</button>
            <button onClick={onProcedi} className="px-3 py-1.5 text-sm text-white bg-amber-600 hover:bg-amber-700 rounded-lg">Procedi comunque</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  )
}

// ── dialog conferma data passata ─────────────────────────────────────────────

function DialogConfermaPassato({ dataOraAppuntamento, onAnnulla, onConferma }) {
  const now = dayjs()
  const appData = dayjs(dataOraAppuntamento)
  return (
    <div className="fixed inset-0 bg-gray-900/10 flex items-center justify-center z-[60] p-4">
      <FocusTrap>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-passato-titolo"
          className="bg-white rounded-xl shadow-xl w-full max-w-md"
        >
          <div className="p-4 border-b border-amber-100 bg-amber-50 rounded-t-xl flex items-center gap-3">
            <span aria-hidden="true" className="text-xl">⚠️</span>
            <h2 id="dialog-passato-titolo" className="text-sm font-semibold text-amber-800">Data nel passato</h2>
          </div>
          <div className="p-4 space-y-2 text-sm text-gray-700">
            <p>Stai creando un appuntamento con data/ora <strong>precedente al momento attuale</strong>.</p>
            <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-gray-500">Ora corrente:</span>
                <span className="font-semibold text-gray-800">{now.format('DD/MM/YYYY HH:mm')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Inizio appuntamento:</span>
                <span className="font-semibold text-red-600">{appData.format('DD/MM/YYYY HH:mm')}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 p-4 border-t border-gray-100">
            <button onClick={onAnnulla} className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Modifica data</button>
            <button onClick={onConferma} className="px-3 py-1.5 text-sm text-white bg-amber-600 hover:bg-amber-700 rounded-lg">Conferma ugualmente</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  )
}

// ── modale conflitti (stanza / operatore / paziente occupati) ─────────────────

function ModaleConflitti({ conflitti, onClose }) {
  const fmtApp = (a) => (
    <div key={a.id} className="flex items-center gap-3 py-1.5 border-b border-red-100 last:border-0">
      <div className="min-w-28 shrink-0">
        <p className="text-xs font-semibold text-gray-700">{dayjs(a.data_ora_inizio).format('DD/MM/YYYY')}</p>
        <p className="text-xs text-gray-500">{dayjs(a.data_ora_inizio).format('HH:mm')} — {dayjs(a.data_ora_fine).format('HH:mm')}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-800 truncate">{a.paziente_cognome} {a.paziente_nome}</p>
        <p className="text-xs text-gray-500 truncate">{a.dentista_cognome} {a.dentista_nome}{a.sala ? ` — ${a.sala}` : ''}</p>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${classeEnum('stato_appuntamento', a.stato)}`}>
        {STATI_LABEL[a.stato] || a.stato}
      </span>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-gray-900/10 flex items-center justify-center z-[60] p-4">
      <FocusTrap>
        <div role="dialog" aria-modal="true" aria-labelledby="modale-conflitti-titolo" className="bg-white rounded-xl shadow-xl w-full max-w-lg">
          <div className="p-4 border-b border-red-100 bg-red-50 rounded-t-xl flex items-center gap-3">
            <span aria-hidden="true" className="text-xl">🚫</span>
            <h2 id="modale-conflitti-titolo" className="text-sm font-semibold text-red-800">Impossibile salvare l'appuntamento</h2>
          </div>
          <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {conflitti.sala_occupata?.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">Stanza occupata negli orari selezionati</h3>
                <div className="bg-red-50 rounded-lg px-3">{conflitti.sala_occupata.map(fmtApp)}</div>
              </div>
            )}
            {conflitti.operatore_occupato?.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">Operatore occupato negli orari selezionati</h3>
                <div className="bg-red-50 rounded-lg px-3">{conflitti.operatore_occupato.map(fmtApp)}</div>
              </div>
            )}
            {conflitti.paziente_occupato?.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">Il paziente ha già appuntamenti in quegli orari</h3>
                <div className="bg-red-50 rounded-lg px-3">{conflitti.paziente_occupato.map(fmtApp)}</div>
              </div>
            )}
          </div>
          <div className="flex justify-end p-4 border-t border-gray-100">
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg">OK</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  )
}

// ── modale conferma spostamento appuntamento ──────────────────────────────────

function ModaleConfermaRinvio({ appuntamentoOriginale, nuovoOrario, onAnnulla, onConferma }) {
  const origInizio = dayjs(appuntamentoOriginale.data_ora_inizio)
  const origFine = dayjs(appuntamentoOriginale.data_ora_fine)
  return (
    <div className="fixed inset-0 bg-gray-900/10 flex items-center justify-center z-[60] p-4">
      <FocusTrap>
        <div role="dialog" aria-modal="true" aria-labelledby="modale-spostamento-titolo" className="bg-white rounded-xl shadow-xl w-full max-w-md">
          <div className="p-4 border-b border-blue-100 bg-blue-50 rounded-t-xl flex items-center gap-3">
            <span aria-hidden="true" className="text-xl">📅</span>
            <h2 id="modale-spostamento-titolo" className="text-sm font-semibold text-blue-800">Vuoi spostare l'appuntamento?</h2>
          </div>
          <div className="p-4 space-y-3 text-sm">
            <p className="text-gray-600">La data/ora è stata modificata. L'appuntamento originale verrà marcato come <strong>rinviato</strong> e ne sarà creato uno nuovo con i nuovi orari.</p>
            <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <div className="text-gray-400 mb-1 font-sans font-semibold">Originale</div>
                <div className="font-semibold text-gray-700">{origInizio.format('DD/MM/YYYY')}</div>
                <div className="text-gray-600">{origInizio.format('HH:mm')} — {origFine.format('HH:mm')}</div>
              </div>
              <div>
                <div className="text-gray-400 mb-1 font-sans font-semibold">Nuovo</div>
                <div className="font-semibold text-blue-700">{dayjs(nuovoOrario.data).format('DD/MM/YYYY')}</div>
                <div className="text-blue-600">{nuovoOrario.ora_inizio} — {nuovoOrario.ora_fine}</div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 p-4 border-t border-gray-100">
            <button onClick={onAnnulla} className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Annulla</button>
            <button onClick={onConferma} className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Conferma spostamento</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  )
}

// ── riga batch con editing inline ────────────────────────────────────────────

function BatchItemRow({ idx, item, stanze, operatori, impostazioni, onUpdate }) {
  const [editField, setEditField] = useState(null)

  const nonLav = !isGiornoLavorativo(item.data, impostazioni)
  const hasConf = (f) => !!item.conflittiCampi?.[f]

  const cellClass = (field) => {
    const base = 'px-2 py-1.5 align-middle'
    if (hasConf(field)) return `${base} text-red-600 font-medium cursor-pointer hover:bg-red-50`
    return `${base} text-gray-700`
  }

  const renderCell = (field, display, editor) => {
    if (editField === field) {
      return (
        <td className="px-1 py-1 align-middle">
          {editor(() => setEditField(null))}
        </td>
      )
    }
    return (
      <td className={cellClass(field)} onClick={() => setEditField(field)} title={hasConf(field) ? 'Clicca per modificare' : undefined}>
        {display || <span className="text-gray-400">—</span>}
        {hasConf(field) && <span className="ml-1 text-red-400">⚠</span>}
      </td>
    )
  }

  const operatoreLabel = (id) => {
    const op = operatori?.find(o => o.id === parseInt(id))
    return op ? `${op.cognome} ${op.nome}` : '—'
  }

  return (
    <tr className={nonLav ? 'bg-amber-50/40' : ''}>
      <td className="px-2 py-1.5 text-gray-400 align-middle">{idx + 1}</td>
      <td className="px-2 py-1.5 text-gray-700 align-middle">
        {dayjs(item.data).format('ddd DD/MM')}
        {nonLav && <span className="ml-1 text-amber-500 text-xs">⚠</span>}
      </td>
      {renderCell('ora_inizio', item.ora_inizio, (done) => (
        <select autoFocus className="w-20 px-1 py-0.5 border border-blue-400 rounded text-xs"
          value={item.ora_inizio}
          onChange={e => { onUpdate(idx, 'ora_inizio', e.target.value); done() }}>
          {getValidTimes(
            impostazioni?.ora_apertura || '08:00',
            impostazioni?.ora_chiusura || '20:00',
            impostazioni?.pausa_attiva,
            impostazioni?.ora_inizio_pausa,
            impostazioni?.ora_fine_pausa
          ).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      ))}
      {renderCell('ora_fine', item.ora_fine, (done) => (
        <select autoFocus className="w-20 px-1 py-0.5 border border-blue-400 rounded text-xs"
          value={item.ora_fine}
          onChange={e => { onUpdate(idx, 'ora_fine', e.target.value); done() }}>
          {getValidTimes(
            impostazioni?.ora_apertura || '08:00',
            impostazioni?.ora_chiusura || '20:00',
            impostazioni?.pausa_attiva,
            impostazioni?.ora_inizio_pausa,
            impostazioni?.ora_fine_pausa
          ).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      ))}
      {renderCell('sala', item.sala || '—', (done) => (
        <select autoFocus className="w-24 px-1 py-0.5 border border-blue-400 rounded text-xs"
          value={item.sala || ''}
          onChange={e => { onUpdate(idx, 'sala', e.target.value); done() }}>
          <option value="">Nessuna</option>
          {stanze?.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
        </select>
      ))}
      {renderCell('dentista_id', operatoreLabel(item.dentista_id), (done) => (
        <select autoFocus className="w-32 px-1 py-0.5 border border-blue-400 rounded text-xs"
          value={item.dentista_id || ''}
          onChange={e => { onUpdate(idx, 'dentista_id', e.target.value); done() }}>
          <option value="">—</option>
          {operatori?.map(o => <option key={o.id} value={o.id}>{o.cognome} {o.nome}</option>)}
        </select>
      ))}
    </tr>
  )
}

// ── form appuntamento (renderizzato in tab, non modale) ───────────────────────

export function FormAppuntamento({ appuntamento, onClose, initialPazienteId = '', initialDentistaId = '', initialPianoCuraId = '' }) {
  const queryClient = useQueryClient()

  const initState = () => {
    if (appuntamento) {
      const dtI = dayjs(appuntamento.data_ora_inizio)
      const dtF = dayjs(appuntamento.data_ora_fine)
      const durMin = Math.max(10, Math.round(dtF.diff(dtI, 'minute') / 5) * 5)
      return {
        paziente_id: appuntamento.paziente_id ?? '',
        dentista_id: appuntamento.dentista_id ?? '',
        piano_cura_id: appuntamento.piano_cura_id ?? '',
        data: dtI.format('YYYY-MM-DD'),
        ora_inizio: dtI.format('HH:mm'),
        durata: durMin,
        ora_fine: dtF.format('HH:mm'),
        sala: appuntamento.sala || '',
        tipo: appuntamento.tipo || 'visita',
        motivo: appuntamento.motivo || '',
        note_segreteria: appuntamento.note_segreteria || '',
        // Campi clinici
        anamnesi_aggiornamento: appuntamento.anamnesi_aggiornamento || '',
        esame_obiettivo: appuntamento.esame_obiettivo || '',
        diagnosi: appuntamento.diagnosi || '',
        trattamenti_eseguiti: appuntamento.trattamenti_eseguiti || '',
        note_cliniche: appuntamento.note_cliniche || '',
        prossimo_controllo_data: appuntamento.prossimo_controllo_data || '',
        prossimo_controllo_note: appuntamento.prossimo_controllo_note || '',
      }
    }
    return {
      paziente_id: initialPazienteId,
      dentista_id: initialDentistaId,
      piano_cura_id: initialPianoCuraId,
      data: dayjs().format('YYYY-MM-DD'),
      ora_inizio: '', durata: 60, ora_fine: '',
      sala: '', tipo: 'visita', motivo: '', note_segreteria: '',
      anamnesi_aggiornamento: '', esame_obiettivo: '', diagnosi: '',
      trattamenti_eseguiti: '', note_cliniche: '',
      prossimo_controllo_data: '', prossimo_controllo_note: '',
    }
  }

  const isFaseVisita = !!appuntamento && (appuntamento.stato === 'in_corso' || appuntamento.stato === 'completato')

  const [form, setForm] = useState(initState)
  const [errore, setErrore] = useState('')
  const [avvisi, setAvvisi] = useState([])
  const [mostraConfermaPassato, setMostraConfermaPassato] = useState(false)
  const [mostraNuovaStanza, setMostraNuovaStanza] = useState(false)
  const [mostraSpostamento, setMostraSpostamento] = useState(false)
  const [mostraConflitti, setMostraConflitti] = useState(false)
  const [conflitti, setConflitti] = useState({ sala_occupata: [], operatore_occupato: [], paziente_occupato: [] })
  const [ricorrente, setRicorrente] = useState(false)
  const [tipoRicorrenza, setTipoRicorrenza] = useState('ogni_settimana')
  const [numTotale, setNumTotale] = useState(4)
  const [risultatiBatch, setRisultatiBatch] = useState(null)
  const [qrBatch, setQRBatch] = useState(null)
  const [batchItems, setBatchItems] = useState([])
  const [batchChecking, setBatchChecking] = useState(false)

  const isOrarioChanged = !!appuntamento && (() => {
    const dtI = dayjs(appuntamento.data_ora_inizio)
    const dtF = dayjs(appuntamento.data_ora_fine)
    return form.data !== dtI.format('YYYY-MM-DD') ||
           form.ora_inizio !== dtI.format('HH:mm') ||
           form.ora_fine !== dtF.format('HH:mm')
  })()

  const { data: pazienti } = useQuery({ queryKey: ['pazienti-lista'], queryFn: async () => (await api.get('/pazienti?per_pagina=100')).data.items })
  const { data: operatori } = useQuery({ queryKey: ['operatori-lista'], queryFn: async () => (await api.get('/utenti/operatori')).data })
  const { data: pianiPaziente } = useQuery({
    queryKey: ['piani-cura-paziente', form.paziente_id],
    queryFn: async () => (await api.get(`/piani-cura?paziente_id=${form.paziente_id}&per_pagina=50`)).data.items ?? [],
    enabled: !!form.paziente_id,
  })
  const { data: operatoriDelPaziente } = useQuery({
    queryKey: ['paziente-operatori', form.paziente_id],
    queryFn: async () => (await api.get(`/pazienti/${form.paziente_id}/operatori`)).data,
    enabled: !!form.paziente_id,
  })
  const { data: impostazioni } = useQuery({ queryKey: ['impostazioni'], queryFn: async () => (await api.get('/impostazioni')).data })
  const { data: stanze } = useQuery({ queryKey: ['stanze-attive'], queryFn: async () => (await api.get('/stanze?solo_attive=true')).data })

  const salaCheckEnabled = !!(form.sala && form.data && form.ora_inizio && form.ora_fine)
  const { data: salaDisp } = useQuery({
    queryKey: ['sala-disp', form.sala, form.data, form.ora_inizio, form.ora_fine, appuntamento?.id],
    queryFn: async () => {
      const params = new URLSearchParams({
        sala: form.sala,
        data_ora_inizio: dayjs(`${form.data}T${form.ora_inizio}`).toISOString(),
        data_ora_fine: dayjs(`${form.data}T${form.ora_fine}`).toISOString(),
      })
      if (appuntamento?.id) params.append('escludi_id', appuntamento.id)
      return (await api.get(`/appuntamenti/verifica-sala?${params}`)).data
    },
    enabled: salaCheckEnabled
  })

  const validTimes = getValidTimes(
    impostazioni?.ora_apertura || '08:00',
    impostazioni?.ora_chiusura || '20:00',
    impostazioni?.pausa_attiva || false,
    impostazioni?.ora_inizio_pausa || '13:00',
    impostazioni?.ora_fine_pausa || '14:00'
  )
  const pausaTimes = getPausaTimes(
    impostazioni?.ora_apertura || '08:00',
    impostazioni?.ora_chiusura || '20:00',
    impostazioni?.pausa_attiva || false,
    impostazioni?.ora_inizio_pausa || '13:00',
    impostazioni?.ora_fine_pausa || '14:00'
  )
  const validTimesFine = getValidTimesFine(
    impostazioni?.ora_apertura || '08:00',
    impostazioni?.ora_chiusura || '20:00',
    impostazioni?.pausa_attiva || false,
    impostazioni?.ora_inizio_pausa || '13:00',
    impostazioni?.ora_fine_pausa || '14:00'
  )
  const pausaTimesFine = getPausaTimesFine(
    impostazioni?.ora_apertura || '08:00',
    impostazioni?.ora_chiusura || '20:00',
    impostazioni?.pausa_attiva || false,
    impostazioni?.ora_inizio_pausa || '13:00',
    impostazioni?.ora_fine_pausa || '14:00'
  )

  const durate = durateFiltrate(form.ora_inizio, impostazioni)
  const durateBlocked = durateInPausa(form.ora_inizio, impostazioni)
  const durateOptions = [...new Set([...durate, ...durateBlocked])].sort((a, b) => a - b).map(d => ({
    value: d, label: durataLabel(d), inPausa: durateBlocked.has(d),
  }))

  const creaMutation = useMutation({
    mutationFn: (dati) => api.post('/appuntamenti', dati, { _silent: true }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appuntamenti'] }); onClose() },
    onError: (e) => setErrore(e.response?.data?.detail || 'Errore nella creazione')
  })

  const aggiornaMutation = useMutation({
    mutationFn: (dati) => api.patch(`/appuntamenti/${appuntamento.id}`, dati, { _silent: true }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appuntamenti'] }); onClose() },
    onError: (e) => setErrore(e.response?.data?.detail || 'Errore nel salvataggio')
  })

  const spostaMutation = useMutation({
    mutationFn: async (payload) => {
      await api.patch(`/appuntamenti/${appuntamento.id}`, { stato: 'rinviato' }, { _silent: true })
      return api.post('/appuntamenti', payload, { _silent: true })
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appuntamenti'] }); onClose() },
    onError: (e) => setErrore(e.response?.data?.detail?.messaggio || e.response?.data?.detail || 'Errore nello spostamento')
  })

  const batchMutation = useMutation({
    mutationFn: (payloads) => api.post('/appuntamenti/batch', payloads, { _silent: true }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['appuntamenti'] })
      const d = res.data
      if (d.creati === d.totale) onClose()
      else setRisultatiBatch(d)
    },
    onError: (e) => setErrore(e.response?.data?.detail || 'Errore nella creazione')
  })

  const isPending = creaMutation.isPending || aggiornaMutation.isPending || batchMutation.isPending || spostaMutation.isPending || batchChecking

  const handleOraInizio = (oraInizio) => {
    setErrore('')
    if (!oraInizio) { setForm(f => ({ ...f, ora_inizio: '', ora_fine: '' })); return }
    const durateDispo = durateFiltrate(oraInizio, impostazioni)
    if (durateDispo.length === 0) {
      const startMin = parseMin(oraInizio)
      const piMin = impostazioni?.pausa_attiva ? parseMin(impostazioni.ora_inizio_pausa || '13:00') : null
      const motivo = piMin !== null && startMin < piMin
        ? 'alla pausa'
        : 'alla fine della giornata lavorativa'
      setForm(f => ({ ...f, ora_inizio: oraInizio, ora_fine: '' }))
      setErrore(`Nessuna durata disponibile: l'orario è troppo vicino ${motivo}`)
      return
    }
    const durataOk = durateDispo.includes(form.durata) ? form.durata : durateDispo[0]
    setForm(f => ({ ...f, ora_inizio: oraInizio, durata: durataOk, ora_fine: addMinutes(oraInizio, durataOk) }))
  }

  const handleDurata = (durata) => {
    setErrore('')
    const oraFine = form.ora_inizio ? addMinutes(form.ora_inizio, durata) : form.ora_fine
    setForm(f => ({ ...f, durata, ora_fine: oraFine }))
  }

  const handleOraFine = (oraFine) => {
    if (form.ora_inizio) {
      const diff = diffMinutes(oraFine, form.ora_inizio)
      if (diff <= 0) {
        setErrore("L'orario di fine deve essere successivo all'orario di inizio")
        setForm(f => ({ ...f, ora_fine: oraFine }))
        return
      }
      if (diff < 10) {
        setErrore('La durata minima è 10 minuti')
        setForm(f => ({ ...f, ora_fine: oraFine }))
        return
      }
      setErrore('')
      setForm(f => ({ ...f, ora_fine: oraFine, durata: Math.round(diff / 5) * 5 }))
    } else {
      setForm(f => ({ ...f, ora_fine: oraFine }))
    }
  }

  const riempiCasuale = () => {
    if (!pazienti?.length || !operatori?.length) return
    const paz = pazienti[Math.floor(Math.random() * pazienti.length)]
    const op = operatori[Math.floor(Math.random() * operatori.length)]
    const giorniAvanti = Math.floor(Math.random() * 14) + 1
    const data = dayjs().add(giorniAvanti, 'day').format('YYYY-MM-DD')
    const slotIdx = Math.floor(Math.random() * Math.floor(validTimes.length * 0.6))
    const oraInizio = validTimes[slotIdx] || '09:00'
    const durateRandom = [30, 45, 60, 90]
    const dur = durateRandom[Math.floor(Math.random() * durateRandom.length)]
    const oraFine = addMinutes(oraInizio, dur)
    const tipi = ['prima_visita', 'visita', 'igiene', 'intervento', 'controllo']
    const tipo = tipi[Math.floor(Math.random() * tipi.length)]
    const sala = stanze?.length ? stanze[Math.floor(Math.random() * stanze.length)].nome : ''
    const motivi = ['Controllo periodico', 'Dolore ai denti', 'Pulizia professionale', 'Controllo ortodonzia', '']
    const motivo = motivi[Math.floor(Math.random() * motivi.length)]
    setErrore('')
    setForm(f => ({ ...f, paziente_id: paz.id, dentista_id: op.id, data, ora_inizio: oraInizio, durata: dur, ora_fine: oraFine, sala, tipo, motivo }))
  }

  const buildPayload = () => {
    const base = {
      piano_cura_id: parseInt(form.piano_cura_id),
      paziente_id: parseInt(form.paziente_id),
      dentista_id: parseInt(form.dentista_id),
      data_ora_inizio: dayjs(`${form.data}T${form.ora_inizio}`).toISOString(),
      data_ora_fine: dayjs(`${form.data}T${form.ora_fine}`).toISOString(),
      sala: form.sala || null,
      tipo: form.tipo,
      motivo: form.motivo || null,
      note_segreteria: form.note_segreteria || null,
    }
    // I campi clinici si inviano solo in fase visita (in_corso/completato)
    if (isFaseVisita) {
      base.anamnesi_aggiornamento = form.anamnesi_aggiornamento || null
      base.esame_obiettivo = form.esame_obiettivo || null
      base.diagnosi = form.diagnosi || null
      base.trattamenti_eseguiti = form.trattamenti_eseguiti || null
      base.note_cliniche = form.note_cliniche || null
      base.prossimo_controllo_data = form.prossimo_controllo_data || null
      base.prossimo_controllo_note = form.prossimo_controllo_note || null
    }
    return base
  }

  const validateHard = () => {
    if (!form.paziente_id || !form.dentista_id) return 'Seleziona paziente e operatore'
    if (!form.piano_cura_id) return 'Seleziona un piano di cura. Se non esiste, crealo prima dalla pagina "Piani di cura".'
    const opSel = operatori?.find(o => String(o.id) === String(form.dentista_id))
    if (opSel && opSel.attivo === false) {
      return `L'operatore selezionato (${opSel.cognome} ${opSel.nome}) è disattivato. Seleziona un altro operatore o riattivalo dalla pagina Utenti.`
    }
    if (!form.sala) return 'Seleziona una stanza'
    if (!form.data || !form.ora_inizio || !form.ora_fine) return 'Compila tutti i campi obbligatori'
    if (diffMinutes(form.ora_fine, form.ora_inizio) <= 0) return "L'orario di fine deve essere successivo all'orario di inizio"
    if (diffMinutes(form.ora_fine, form.ora_inizio) < 10) return 'La durata minima è 10 minuti'
    return ''
  }

  const getWarnings = () => {
    const warns = []
    if (!isGiornoLavorativo(form.data, impostazioni)) warns.push('La data selezionata è un giorno non lavorativo')
    if (form.data === dayjs().format('YYYY-MM-DD') && form.ora_inizio &&
        parseMin(form.ora_inizio) < parseMin(dayjs().format('HH:mm'))) {
      warns.push("L'orario di inizio è già passato")
    }
    if (impostazioni?.pausa_attiva) {
      const piMin = parseMin(impostazioni.ora_inizio_pausa || '13:00')
      const pfMin = parseMin(impostazioni.ora_fine_pausa || '14:00')
      const startMin = parseMin(form.ora_inizio)
      const endMin = parseMin(form.ora_fine)
      if (startMin >= piMin && startMin < pfMin) warns.push("L'orario di inizio è durante la pausa pranzo")
      else if (startMin < piMin && endMin > piMin) warns.push("L'appuntamento sconfina nella pausa pranzo")
    }
    return warns
  }

  const checkSingleItem = async (item) => {
    try {
      const params = new URLSearchParams({
        data_ora_inizio: dayjs(`${item.data}T${item.ora_inizio}`).toISOString(),
        data_ora_fine: dayjs(`${item.data}T${item.ora_fine}`).toISOString(),
      })
      if (item.sala) params.append('sala', item.sala)
      if (item.dentista_id) params.append('dentista_id', String(item.dentista_id))
      if (form.paziente_id) params.append('paziente_id', String(form.paziente_id))
      const res = await api.get(`/appuntamenti/verifica-conflitti?${params}`)
      const c = res.data
      const conflittiCampi = {}
      if (c.sala_occupata?.length) conflittiCampi.sala = c.sala_occupata
      if (c.operatore_occupato?.length) conflittiCampi.dentista_id = c.operatore_occupato
      return { ...item, conflittiCampi }
    } catch {
      return { ...item, conflittiCampi: {} }
    }
  }

  useEffect(() => {
    if (!ricorrente || !form.data || !form.ora_inizio || !form.ora_fine) {
      setBatchItems([])
      return
    }
    let cancelled = false
    const date = [dayjs(form.data), ...generaDate(form.data, tipoRicorrenza, numTotale)]
    const items = date.map(d => ({
      data: d.format('YYYY-MM-DD'),
      ora_inizio: form.ora_inizio,
      ora_fine: form.ora_fine,
      sala: form.sala,
      dentista_id: form.dentista_id,
      conflittiCampi: {},
    }))
    setBatchItems(items)
    setBatchChecking(true)
    ;(async () => {
      const checked = []
      for (const item of items) {
        if (cancelled) return
        checked.push(await checkSingleItem(item))
      }
      if (!cancelled) { setBatchItems(checked); setBatchChecking(false) }
    })()
    return () => { cancelled = true }
  }, [ricorrente, form.data, form.ora_inizio, form.ora_fine, form.sala, form.dentista_id, form.paziente_id, tipoRicorrenza, numTotale])

  const updateBatchItemField = async (idx, field, value) => {
    const updated = batchItems.map((it, i) => i === idx ? { ...it, [field]: value } : it)
    setBatchItems(updated)
    const rechecked = await checkSingleItem(updated[idx])
    setBatchItems(prev => prev.map((it, i) => i === idx ? rechecked : it))
  }

  const verificaEProcedi = async (callback) => {
    try {
      const params = new URLSearchParams({
        data_ora_inizio: dayjs(`${form.data}T${form.ora_inizio}`).toISOString(),
        data_ora_fine: dayjs(`${form.data}T${form.ora_fine}`).toISOString(),
      })
      if (form.sala) params.append('sala', form.sala)
      if (form.dentista_id) params.append('dentista_id', String(form.dentista_id))
      if (form.paziente_id) params.append('paziente_id', String(form.paziente_id))
      if (appuntamento?.id) params.append('escludi_id', String(appuntamento.id))
      const res = await api.get(`/appuntamenti/verifica-conflitti?${params}`)
      const c = res.data
      const hasConflicts = (c.sala_occupata?.length || 0) + (c.operatore_occupato?.length || 0) + (c.paziente_occupato?.length || 0) > 0
      if (hasConflicts) { setConflitti(c); setMostraConflitti(true) }
      else callback()
    } catch (e) {
      const status = e?.response?.status
      const detail = e?.response?.data?.detail
      if (typeof detail === 'string') { setErrore(detail); return }
      if (detail?.messaggio) { setErrore(detail.messaggio); return }
      if (status === 404) { setErrore('Endpoint verifica-conflitti non trovato — riavviare il backend'); return }
      if (status === 422) { setErrore(`Parametri non validi (422): ${JSON.stringify(e?.response?.data)}`); return }
      if (status) { setErrore(`Errore ${status} nella verifica disponibilità`); return }
      setErrore(e?.message || 'Errore di rete nella verifica disponibilità')
    }
  }

  const proseguiDopo = () => {
    if (appuntamento && isOrarioChanged) { setMostraSpostamento(true); return }
    if (dayjs(`${form.data}T${form.ora_inizio}`).isBefore(dayjs())) { setMostraConfermaPassato(true); return }
    if (ricorrente) { doSalva(); return }
    verificaEProcedi(doSalva)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const err = validateHard()
    if (err) { setErrore(err); return }
    setErrore('')
    const warns = getWarnings()
    if (warns.length > 0) { setAvvisi(warns); return }
    proseguiDopo()
  }

  const doSalva = () => {
    const payload = buildPayload()
    if (appuntamento) { aggiornaMutation.mutate(payload); return }
    if (!ricorrente) { creaMutation.mutate(payload); return }
    const payloads = batchItems.map(item => ({
      piano_cura_id: parseInt(form.piano_cura_id),
      paziente_id: parseInt(form.paziente_id),
      dentista_id: parseInt(item.dentista_id || form.dentista_id),
      data_ora_inizio: dayjs(`${item.data}T${item.ora_inizio}`).toISOString(),
      data_ora_fine: dayjs(`${item.data}T${item.ora_fine}`).toISOString(),
      sala: item.sala || null,
      tipo: form.tipo,
      motivo: form.motivo || null,
      note_segreteria: form.note_segreteria || null,
    }))
    batchMutation.mutate(payloads)
  }

  const doSpostamento = () => spostaMutation.mutate(buildPayload())

  const handleStanzaCreata = (s) => {
    queryClient.invalidateQueries({ queryKey: ['stanze-attive'] })
    setForm(f => ({ ...f, sala: s.nome }))
    setMostraNuovaStanza(false)
  }

  return (
    <div className="p-4 max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Paziente *</label>
          <select value={form.paziente_id} onChange={e => setForm({ ...form, paziente_id: e.target.value, piano_cura_id: '' })}
            disabled={!!appuntamento}
            className={`w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${appuntamento ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            required>
            <option value="">Seleziona paziente...</option>
            {pazienti?.map(p => <option key={p.id} value={p.id}>{p.cognome} {p.nome}</option>)}
          </select>
        </div>
        {form.paziente_id && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Piano di cura *</label>
            <select value={form.piano_cura_id} onChange={e => {
                const nuovoPiano = pianiPaziente?.find(p => String(p.id) === e.target.value)
                const pianoPrecedente = pianiPaziente?.find(p => String(p.id) === String(form.piano_cura_id))
                const referentePrecedente = pianoPrecedente?.dentista_referente_id ?? null
                const nuovoReferente = nuovoPiano?.dentista_referente_id ?? null
                // L'operatore segue il referente del piano solo se non è stato scelto a mano:
                // ovvero se è vuoto, oppure se coincide col referente del piano precedente.
                const seguiReferente = !form.dentista_id || String(form.dentista_id) === String(referentePrecedente)
                setForm(f => ({
                  ...f,
                  piano_cura_id: e.target.value,
                  dentista_id: seguiReferente ? (nuovoReferente ?? '') : f.dentista_id,
                }))
              }}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" required>
              <option value="">— Seleziona piano —</option>
              {pianiPaziente?.filter(p => !['completato', 'abbandonato'].includes(p.stato)).map(p => (
                <option key={p.id} value={p.id}>{p.numero} — {p.titolo} ({p.stato})</option>
              ))}
            </select>
            {pianiPaziente && pianiPaziente.filter(p => !['completato', 'abbandonato'].includes(p.stato)).length === 0 && (
              <p className="text-xs text-amber-600 mt-1">Nessun piano attivo per questo paziente. Crea un piano dalla pagina "Piani di cura" prima di prenotare.</p>
            )}
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Operatore *</label>
          <select value={form.dentista_id} onChange={e => {
              setForm({ ...form, dentista_id: e.target.value })
              if (/dentista non|non attivo|disattivat|operatore selezionato|^l['']operatore/i.test(errore)) setErrore('')
            }}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" required>
            <option value="">Seleziona operatore...</option>
            {(() => {
              if (!operatori) return null
              const pianoSel = pianiPaziente?.find(p => String(p.id) === String(form.piano_cura_id))
              const referenteId = pianoSel?.dentista_referente_id ?? null
              const conteggi = new Map((operatoriDelPaziente ?? []).map(r => [r.dentista_id, r.n_appuntamenti]))

              const labelOp = (o) => `${o.cognome} ${o.nome}${o.ruoli?.length ? ` — ${o.ruoli[0]}` : ''}${o.attivo === false ? ' (disattivato)' : ''}`
              const styleOp = (o) => o.attivo === false ? { color: '#dc2626' } : undefined

              const referente = referenteId ? operatori.find(o => o.id === referenteId) : null
              // Esclude il referente dalle altre liste per evitare duplicati
              const visti = operatori
                .filter(o => conteggi.has(o.id) && o.id !== referenteId)
                .sort((a, b) => conteggi.get(b.id) - conteggi.get(a.id))
              const altri = operatori.filter(o => !conteggi.has(o.id) && o.id !== referenteId)
              return (
                <>
                  {referente && (
                    <>
                      <option value={referente.id} style={styleOp(referente)}>
                        ★ {labelOp(referente)} (referente del piano)
                      </option>
                      {(visti.length > 0 || altri.length > 0) && <option disabled>──────────</option>}
                    </>
                  )}
                  {visti.map(o => (
                    <option key={o.id} value={o.id} style={styleOp(o)}>
                      {labelOp(o)} ({conteggi.get(o.id)})
                    </option>
                  ))}
                  {visti.length > 0 && altri.length > 0 && (
                    <option disabled>──────────</option>
                  )}
                  {altri.map(o => (
                    <option key={o.id} value={o.id} style={styleOp(o)}>
                      {labelOp(o)}
                    </option>
                  ))}
                </>
              )
            })()}
          </select>
          {(() => {
            if (!operatori) return null
            const op = form.dentista_id ? operatori.find(o => String(o.id) === String(form.dentista_id)) : null
            const opInattivo = op && op.attivo === false
            const erroreOpRelated = /dentista non|non attivo|disattivat|operatore selezionato|^l['']operatore/i.test(errore)
            if (opInattivo) {
              return <p className="text-xs text-red-600 mt-1">⚠ Utente non attivo — selezionarne un altro per poter creare l'appuntamento.</p>
            }
            if (erroreOpRelated && errore) {
              return <p className="text-xs text-red-600 mt-1">⚠ {errore}</p>
            }
            return null
          })()}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Data *</label>
          <CalendarioInput
            value={form.data}
            onChange={data => {
              setForm(f => ({ ...f, data }))
              setErrore('')
            }}
            impostazioni={impostazioni}
          />
          {errore && /data|giorno|lavorativ|festiv/i.test(errore) && (
            <div role="alert" className="mt-1 flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs">
              <span>⚠</span><span>{errore}</span>
            </div>
          )}
        </div>
        <div>
          <div className="grid grid-cols-3 gap-2 mb-1">
            <label className="text-xs font-medium text-gray-700">Inizio *</label>
            <label className="text-xs font-medium text-gray-700">Durata</label>
            <label className="text-xs font-medium text-gray-700">Fine *</label>
          </div>
          <div className="grid grid-cols-3 gap-2 items-center">
            <TimePickerHM value={form.ora_inizio} onChange={handleOraInizio} validTimes={validTimes} pausaTimes={pausaTimes} hasError={!!errore} />
            <PausaSelect value={form.durata} onChange={(v) => handleDurata(parseInt(v))}
              options={durateOptions} width="w-full" />
            <TimePickerHM value={form.ora_fine} onChange={handleOraFine} validTimes={validTimesFine} pausaTimes={pausaTimesFine} hasError={!!errore} />
          </div>
          {(() => {
            // Mostra qui pausa + orario passato. Il giorno non lavorativo è già evidenziato dal CalendarioInput.
            const avvisi = getWarnings().filter(w => !/non lavorativo/i.test(w))
            return avvisi.length > 0 && (
              <div className="mt-1 flex items-start gap-2 text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs">
                <span>⚠</span>
                <div>
                  {avvisi.map((w, i) => <div key={i}>{w}</div>)}
                </div>
              </div>
            )
          })()}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
            <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
              <option value="prima_visita">Prima Visita</option>
              <option value="visita">Visita</option>
              <option value="igiene">Igiene</option>
              <option value="intervento">Intervento</option>
              <option value="urgenza">Urgenza</option>
              <option value="controllo">Controllo</option>
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">Stanza <span className="text-red-500">*</span></label>
              {salaCheckEnabled && salaDisp !== undefined && (
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${salaDisp.disponibile ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {salaDisp.disponibile ? 'Disponibile' : 'Occupata'}
                </span>
              )}
            </div>
            <select value={form.sala}
              onChange={e => {
                if (e.target.value === '__nuova__') setMostraNuovaStanza(true)
                else setForm({ ...form, sala: e.target.value })
              }}
              required
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
              <option value="">Seleziona stanza...</option>
              {stanze?.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
              <option value="__nuova__">+ Aggiungi nuova stanza</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Motivo della visita</label>
          <textarea value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" rows={2} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Note organizzative</label>
          <textarea value={form.note_segreteria} onChange={e => setForm({ ...form, note_segreteria: e.target.value })}
            placeholder="Promemoria interni, preparazione sala, materiali necessari…"
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" rows={2} />
        </div>

        {isFaseVisita && (
          <div className="border border-blue-200 bg-blue-50/40 rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-blue-700">Visita</span>
              <span className="text-xs text-gray-500">— compilato da inizio visita</span>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Anamnesi (aggiornamento)</label>
              <textarea value={form.anamnesi_aggiornamento} onChange={e => setForm({ ...form, anamnesi_aggiornamento: e.target.value })}
                placeholder="Eventuali aggiornamenti anamnestici emersi in seduta…"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" rows={2} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Esame obiettivo</label>
              <textarea value={form.esame_obiettivo} onChange={e => setForm({ ...form, esame_obiettivo: e.target.value })}
                placeholder="Rilievi clinici dell'esame intraorale ed extraorale…"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" rows={2} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Diagnosi</label>
              <textarea value={form.diagnosi} onChange={e => setForm({ ...form, diagnosi: e.target.value })}
                placeholder="Diagnosi formulata dal clinico…"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" rows={2} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Trattamenti eseguiti</label>
              <textarea value={form.trattamenti_eseguiti} onChange={e => setForm({ ...form, trattamenti_eseguiti: e.target.value })}
                placeholder="Cosa è stato effettivamente fatto durante la seduta…"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" rows={2} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Note cliniche</label>
              <textarea value={form.note_cliniche} onChange={e => setForm({ ...form, note_cliniche: e.target.value })}
                placeholder="Annotazioni libere del clinico…"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Prossimo controllo</label>
                <input type="date" value={form.prossimo_controllo_data} onChange={e => setForm({ ...form, prossimo_controllo_data: e.target.value })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Note prossimo controllo</label>
                <input type="text" value={form.prossimo_controllo_note} onChange={e => setForm({ ...form, prossimo_controllo_note: e.target.value })}
                  placeholder="es. portare radiografia"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
            </div>
          </div>
        )}

        {!appuntamento && (
          <div className="border border-gray-200 rounded-lg p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input type="checkbox" checked={ricorrente} onChange={e => { setRicorrente(e.target.checked); setRisultatiBatch(null) }} />
              Appuntamenti ricorrenti
            </label>
            {ricorrente && form.data && form.ora_inizio && form.ora_fine && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Frequenza</label>
                    <select value={tipoRicorrenza} onChange={e => setTipoRicorrenza(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="ogni_settimana">Ogni settimana</option>
                      <option value="ogni_2_sett">Ogni 2 settimane</option>
                      <option value="ogni_3_sett">Ogni 3 settimane</option>
                      <option value="ogni_4_sett">Ogni 4 settimane</option>
                      <option value="mensile_giorno">Ogni mese — stesso giorno ({dayjs(form.data).format('D')} del mese)</option>
                      <option value="mensile_settimana">Ogni mese — stesso giorno della settimana ({['Dom','Lun','Mar','Mer','Gio','Ven','Sab'][dayjs(form.data).day()]})</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Totale appuntamenti</label>
                    <select value={numTotale} onChange={e => setNumTotale(parseInt(e.target.value))}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {[2,3,4,5,6,7,8,10,12,16,20,24].map(n => (
                        <option key={n} value={n}>{n} appuntamenti</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between px-2 py-1.5 bg-gray-50 border-b border-gray-200">
                    <span className="text-xs font-semibold text-gray-700">Anteprima appuntamenti</span>
                    {batchChecking
                      ? <span className="text-xs text-blue-600 animate-pulse">Verifica conflitti…</span>
                      : (() => {
                          const nConflitti = batchItems.filter(it => Object.keys(it.conflittiCampi).length > 0).length
                          return nConflitti > 0
                            ? <span className="text-xs text-red-600 font-medium">{nConflitti} con conflitti</span>
                            : <span className="text-xs text-green-600 font-medium">Nessun conflitto</span>
                        })()
                    }
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1 text-left text-gray-500 font-medium">#</th>
                          <th className="px-2 py-1 text-left text-gray-500 font-medium">Data</th>
                          <th className="px-2 py-1 text-left text-gray-500 font-medium">Inizio</th>
                          <th className="px-2 py-1 text-left text-gray-500 font-medium">Fine</th>
                          <th className="px-2 py-1 text-left text-gray-500 font-medium">Stanza</th>
                          <th className="px-2 py-1 text-left text-gray-500 font-medium">Operatore</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {batchItems.map((item, idx) => (
                          <BatchItemRow
                            key={idx}
                            idx={idx}
                            item={item}
                            stanze={stanze}
                            operatori={operatori}
                            impostazioni={impostazioni}
                            onUpdate={updateBatchItemField}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {risultatiBatch ? (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className={`px-3 py-2 text-sm font-medium ${risultatiBatch.creati === risultatiBatch.totale ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
              {risultatiBatch.creati}/{risultatiBatch.totale} appuntamenti creati
            </div>
            <div className="max-h-40 overflow-y-auto divide-y divide-gray-100">
              {risultatiBatch.risultati.map((r, i) => (
                <div key={i} className={`flex items-center gap-2 px-3 py-1.5 text-xs ${r.ok ? 'text-green-700 bg-green-50/40' : 'text-red-600 bg-red-50/40'}`}>
                  <span className="shrink-0">{r.ok ? '✓' : '✗'}</span>
                  <span className="font-medium">{dayjs(r.data_ora_inizio).format('ddd DD/MM/YYYY — HH:mm')}</span>
                  {!r.ok && <span className="text-gray-400 ml-1">— {r.errore}</span>}
                </div>
              ))}
            </div>
            <div className="px-3 py-2 border-t flex items-center justify-between">
              {risultatiBatch.creati > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const appOk = risultatiBatch.risultati.filter(r => r.ok).map(r => ({
                      data_ora_inizio: r.data_ora_inizio,
                      data_ora_fine: r.data_ora_fine,
                      paziente_cognome: form.paziente_id ? pazienti?.find(p => p.id === parseInt(form.paziente_id))?.cognome : '',
                      paziente_nome: form.paziente_id ? pazienti?.find(p => p.id === parseInt(form.paziente_id))?.nome : '',
                      dentista_cognome: '', dentista_nome: '',
                      tipo: form.tipo, motivo: form.motivo || null, sala: form.sala || null,
                    }))
                    setQRBatch(appOk)
                  }}
                  className="px-3 py-1.5 text-sm bg-blue-50 hover:bg-blue-100 rounded-lg text-blue-700 font-medium"
                >
                  Esporta .ics
                </button>
              )}
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 ml-auto">Chiudi</button>
            </div>
          </div>
        ) : (
          <>
          {errore && !/data|giorno|lavorativ|festiv|dentista non|non attivo|disattivat|operatore selezionato|^l['']operatore/i.test(errore) && (
            <div role="alert" className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs">
              <span>⚠</span><span>{errore}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2">
            {!appuntamento && (
              <button type="button" onClick={riempiCasuale}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-dashed border-gray-300">
                Riempi casuale
              </button>
            )}
            <div className={`flex gap-3 ${appuntamento ? 'ml-0 w-full justify-end' : 'ml-auto'}`}>
              <button type="button" onClick={onClose} className="px-4 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Annulla</button>
              <button type="submit"
                disabled={isPending || (ricorrente && batchItems.some(it => Object.keys(it.conflittiCampi).length > 0))}
                className="px-4 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
                {batchChecking ? 'Verifica conflitti…' : isPending ? 'Salvataggio...' : appuntamento ? 'Salva Modifiche' : ricorrente ? `Crea ${batchItems.length} Appuntamenti` : 'Crea Appuntamento'}
              </button>
            </div>
          </div>
          </>
        )}
      </form>
      {mostraNuovaStanza && <ModaleNuovaStanza onClose={() => setMostraNuovaStanza(false)} onCreata={handleStanzaCreata} />}
      {avvisi.length > 0 && (
        <ModaleAvvisi
          avvisi={avvisi}
          onAnnulla={() => setAvvisi([])}
          onProcedi={() => { setAvvisi([]); proseguiDopo() }}
        />
      )}
      {mostraConfermaPassato && (
        <DialogConfermaPassato
          dataOraAppuntamento={`${form.data}T${form.ora_inizio}`}
          onAnnulla={() => setMostraConfermaPassato(false)}
          onConferma={() => { setMostraConfermaPassato(false); verificaEProcedi(doSalva) }}
        />
      )}
      {mostraSpostamento && appuntamento && (
        <ModaleConfermaRinvio
          appuntamentoOriginale={appuntamento}
          nuovoOrario={{ data: form.data, ora_inizio: form.ora_inizio, ora_fine: form.ora_fine }}
          onAnnulla={() => setMostraSpostamento(false)}
          onConferma={() => { setMostraSpostamento(false); verificaEProcedi(doSpostamento) }}
        />
      )}
      {mostraConflitti && (
        <ModaleConflitti
          conflitti={conflitti}
          onClose={() => setMostraConflitti(false)}
        />
      )}
      {qrBatch && <ModaleICS appuntamenti={qrBatch} onClose={() => setQRBatch(null)} />}
    </div>
  )
}

// ── pagina principale ────────────────────────────────────────────────────────

export default function Appuntamenti({ initialDataDa = '', initialDataA = '', soloOggi = false, soloData = '' }) {
  const [pagina, setPagina] = usePersistedState('appuntamenti.pagina', 1)
  const [filtroStato, setFiltroStato] = usePersistedState('appuntamenti.filtroStato', '')
  const [filtroPaziente, setFiltroPaziente] = usePersistedState('appuntamenti.filtroPaziente', '')
  const [filtroOperatore, setFiltroOperatore] = usePersistedState('appuntamenti.filtroOperatore', '')
  const [filtroStanza, setFiltroStanza] = usePersistedState('appuntamenti.filtroStanza', '')
  const [cerca, setCerca] = usePersistedState('appuntamenti.cerca', '')
  const [dataDa, setDataDa] = usePersistedState('appuntamenti.dataDa', initialDataDa)
  const [dataA, setDataA] = usePersistedState('appuntamenti.dataA', initialDataA)
  const queryDa = soloOggi ? dayjs().format('YYYY-MM-DD') : (soloData || dataDa)
  const queryA = soloOggi ? dayjs().format('YYYY-MM-DD') : (soloData || dataA)

  // Permette al Dashboard (e altri) di pre-impostare i filtri data
  // anche quando il tab è già aperto. Funziona insieme alla scrittura su storage
  // (che gestisce il caso in cui il tab apre da zero).
  useEffect(() => {
    const handler = (e) => {
      const { dataDa: nuovoDa, dataA: nuovoA } = e.detail || {}
      if (nuovoDa !== undefined) setDataDa(nuovoDa)
      if (nuovoA !== undefined) setDataA(nuovoA)
    }
    window.addEventListener('apply-filter-appuntamenti', handler)
    return () => window.removeEventListener('apply-filter-appuntamenti', handler)
  }, [setDataDa, setDataA])
  const [sortBy, setSortBy] = usePersistedState('appuntamenti.sortBy', null)
  const [sortDir, setSortDir] = usePersistedState('appuntamenti.sortDir', 'asc')
  const [daVedereQR, setDaVedereQR] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [modalElimina, setModalElimina] = useState(null)
  const headerRef = useRef(null)
  const queryClient = useQueryClient()
  const { isAdmin, isDentista } = useAuth()
  const { openTab } = useTabs()
  const puoModificare = isAdmin() || isDentista()
  const { order, headerProps } = useColOrder('appuntamenti', ['data', 'inizio', 'fine', 'paziente', 'stanza', 'operatore', 'tipo', 'stato', 'creato', 'qr', 'azioni'])

  const { data: impostazioni } = useQuery({
    queryKey: ['impostazioni'],
    queryFn: async () => (await api.get('/impostazioni')).data
  })

  const [pazienteQuery, setPazienteQuery] = useState('')
  const [pazienteOpen, setPazienteOpen] = useState(false)
  const { data: pazienteSelObj } = useQuery({
    queryKey: ['paziente-selezionato', filtroPaziente],
    queryFn: async () => (await api.get(`/pazienti/${filtroPaziente}`)).data,
    enabled: !!filtroPaziente,
  })
  const { data: pazientiAutocomplete } = useQuery({
    queryKey: ['pazienti-autocomplete', pazienteQuery],
    queryFn: async () => (await api.get(`/pazienti?cerca=${encodeURIComponent(pazienteQuery)}&per_pagina=15`)).data.items,
    enabled: pazienteQuery.length >= 2,
  })
  const { data: operatoriLista } = useQuery({ queryKey: ['operatori-lista'], queryFn: async () => (await api.get('/utenti/operatori')).data })
  const { data: stanzeLista } = useQuery({ queryKey: ['stanze-attive'], queryFn: async () => (await api.get('/stanze?solo_attive=true')).data })
  // Mappa nome stanza → colore di sfondo per la cella della tabella.
  const coloreStanze = useMemo(() => Object.fromEntries((stanzeLista || []).map(s => [s.nome, s.colore])), [stanzeLista])

  const { data, isLoading } = useQuery({
    queryKey: ['appuntamenti', pagina, filtroStato, filtroPaziente, filtroOperatore, filtroStanza, cerca, queryDa, queryA, sortBy, sortDir],
    queryFn: async () => {
      const params = new URLSearchParams({ pagina, per_pagina: 30 })
      if (filtroStato) params.append('stato', filtroStato)
      if (filtroPaziente) params.append('paziente_id', filtroPaziente)
      if (filtroOperatore) params.append('dentista_id', filtroOperatore)
      if (filtroStanza) params.append('sala', filtroStanza)
      if (cerca) params.append('cerca', cerca)
      if (queryDa) params.append('data_da', `${queryDa}T00:00:00`)
      if (queryA) params.append('data_a', `${queryA}T23:59:59`)
      if (sortBy) { params.append('ordina_per', sortBy); params.append('direzione', sortDir) }
      return (await api.get(`/appuntamenti?${params}`)).data
    }
  })

  const cambiaStatoMutation = useMutation({
    mutationFn: ({ id, stato }) => api.patch(`/appuntamenti/${id}`, { stato }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appuntamenti'] })
  })

  const bulkAnnullaMutation = useMutation({
    mutationFn: (ids) => Promise.all(ids.map(id => api.patch(`/appuntamenti/${id}`, { stato: 'annullato' }))),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appuntamenti'] }); setSelected(new Set()) }
  })

  const eliminaMutation = useMutation({
    mutationFn: (id) => api.delete(`/appuntamenti/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appuntamenti'] })
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
      const results = await Promise.allSettled(ids.map(id => api.delete(`/appuntamenti/${id}`)))
      const errors = results.filter(r => r.status === 'rejected').map(r => r.reason)
      if (errors.length) throw errors[0]
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['appuntamenti'] }); setSelected(new Set()) },
    onError: (e) => {
      const detail = e.response?.data?.detail
      if (e.response?.status === 409 && detail?.referenze) {
        setModalElimina({ id: null, nome: 'alcuni appuntamenti selezionati', referenze: detail.referenze })
      }
    }
  })

  const handleSort = (campo) => {
    if (sortBy === campo) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(campo); setSortDir('asc') }
  }
  const si = (campo) => (
    <><span aria-hidden="true" className={`ml-0.5 text-[10px] cursor-pointer ${sortBy === campo ? 'text-blue-600' : 'text-gray-400'}`}>
      {sortBy === campo ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>{sortBy === campo && <span className="sr-only">, ordinato {sortDir === 'asc' ? 'crescente' : 'decrescente'}</span>}</>
  )

  // Ordinamento server-side: il backend restituisce gia' ordinato l'intero dataset.
  const sortedItems = data?.items ?? []

  const allSelected = sortedItems.length > 0 && sortedItems.every(a => selected.has(a.id))
  const someSelected = !allSelected && sortedItems.some(a => selected.has(a.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(sortedItems.map(a => a.id)))
  const toggleOne = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  useEffect(() => { if (headerRef.current) headerRef.current.indeterminate = someSelected }, [someSelected])
  useEffect(() => { setSelected(new Set()) }, [data])

  const apriForm = (appuntamento = null) => {
    const title = appuntamento
      ? `Modifica - ${appuntamento.paziente_cognome} ${dayjs(appuntamento.data_ora_inizio).format('DD/MM')}`
      : 'Nuovo Appuntamento'
    openTab(title, FormAppuntamento, { appuntamento }, 'appuntamento')
  }

  const apriScheda = (a) => {
    openTab(
      `${a.paziente_cognome} ${dayjs(a.data_ora_inizio).format('DD/MM')}`,
      SchedaAppuntamento,
      { appuntamentoId: a.id },
      'scheda-appuntamento'
    )
  }

  const creaOrdineMutation = useMutation({
    mutationFn: (id) => api.post('/ordini/da-appuntamento', { appuntamento_id: id }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ordini'] })
      queryClient.invalidateQueries({ queryKey: ['appuntamenti'] })
      const ordine = res.data
      openTab(`Ordine ${ordine.numero}`, FormDettaglioOrdine, { ordineId: ordine.id }, 'ordine-detail')
    },
    onError: (e) => {
      alert(e.response?.data?.detail || 'Errore nella creazione dell\'ordine')
    },
  })

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{soloOggi ? 'Appuntamenti oggi' : (soloData ? `Appuntamenti del ${dayjs(soloData).format('DD/MM/YYYY')}` : 'Appuntamenti')}</h1>
          {soloOggi && <p className="text-gray-500 text-xs mt-0.5">{dayjs().format('dddd D MMMM YYYY')}</p>}
          {soloData && <p className="text-gray-500 text-xs mt-0.5">{dayjs(soloData).format('dddd D MMMM YYYY')}</p>}
        </div>
        <button onClick={() => apriForm()} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
          + Nuovo Appuntamento
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-3 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Cerca per paziente, operatore, sala..."
          aria-label="Cerca appuntamenti per paziente, operatore o sala"
          value={cerca}
          onChange={e => { setCerca(e.target.value); setPagina(1) }}
          className={`flex-1 min-w-40 px-3 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${cerca ? 'filtro-attivo' : 'border-gray-300'}`}
        />
        {soloOggi ? (
          <span className="font-bold text-sm text-gray-700">Oggi</span>
        ) : soloData ? (
          <span className="font-bold text-sm text-gray-700">{dayjs(soloData).format('DD/MM/YYYY')}</span>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500 shrink-0">Dal</label>
              <input type="date" value={dataDa} onChange={e => { setDataDa(e.target.value); setPagina(1) }}
                className={`px-2 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${dataDa ? 'filtro-attivo' : 'border-gray-300'}`} />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500 shrink-0">Al</label>
              <input type="date" value={dataA} onChange={e => { setDataA(e.target.value); setPagina(1) }}
                className={`px-2 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${dataA ? 'filtro-attivo' : 'border-gray-300'}`} />
            </div>
          </>
        )}
        <select value={filtroStato} onChange={e => { setFiltroStato(e.target.value); setPagina(1) }}
          className={`px-3 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${filtroStato ? 'filtro-attivo' : 'border-gray-300'}`}>
          <option value="">Tutti gli stati</option>
          {Object.entries(STATI_LABEL).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <div className="relative">
          {filtroPaziente && pazienteSelObj ? (
            <div className={`px-3 py-1.5 border rounded-lg text-sm flex items-center gap-2 filtro-attivo`}>
              <span className="whitespace-nowrap">{pazienteSelObj.cognome} {pazienteSelObj.nome}</span>
              <button type="button" onClick={() => { setFiltroPaziente(''); setPazienteQuery(''); setPagina(1) }}
                className="text-gray-500 hover:text-red-600 leading-none" aria-label="Rimuovi filtro paziente">×</button>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Tutti i pazienti"
                value={pazienteQuery}
                onChange={e => { setPazienteQuery(e.target.value); setPazienteOpen(true) }}
                onFocus={() => setPazienteOpen(true)}
                onBlur={() => setTimeout(() => setPazienteOpen(false), 150)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-44"
              />
              {pazienteOpen && pazienteQuery.length >= 2 && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto min-w-44 w-max">
                  {!pazientiAutocomplete?.length ? (
                    <div className="px-3 py-2 text-xs text-gray-400">Nessun risultato</div>
                  ) : pazientiAutocomplete.map(p => (
                    <button key={p.id} type="button"
                      onMouseDown={() => { setFiltroPaziente(String(p.id)); setPazienteQuery(''); setPazienteOpen(false); setPagina(1) }}
                      className="block w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 whitespace-nowrap">
                      {p.cognome} {p.nome}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <select value={filtroOperatore} onChange={e => { setFiltroOperatore(e.target.value); setPagina(1) }}
          className={`px-3 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${filtroOperatore ? 'filtro-attivo' : 'border-gray-300'}`}>
          <option value="">Tutti gli operatori</option>
          {operatoriLista?.map(o => <option key={o.id} value={o.id}>{o.cognome} {o.nome}</option>)}
        </select>
        <select value={filtroStanza} onChange={e => { setFiltroStanza(e.target.value); setPagina(1) }}
          className={`px-3 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${filtroStanza ? 'filtro-attivo' : 'border-gray-300'}`}>
          <option value="">Tutte le stanze</option>
          {stanzeLista?.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
        </select>
        {(cerca || filtroStato || filtroPaziente || filtroOperatore || filtroStanza || (!soloOggi && (dataDa || dataA))) && (
          <button onClick={() => {
            setCerca(''); setFiltroStato(''); setFiltroPaziente(''); setFiltroOperatore(''); setFiltroStanza('')
            if (!soloOggi) { setDataDa(''); setDataA('') }
            setPagina(1)
          }}
            className="px-3 py-1.5 text-xs font-medium bg-orange-100 border border-orange-700 rounded-lg hover:bg-orange-200 whitespace-nowrap">
            ↻ Reset
          </button>
        )}
      </div>

      <div className="tbl-count">{data?.items?.length ?? 0} risultati{data?.totale != null && data.totale !== data?.items?.length ? ` di ${data.totale}` : ''}</div>
      <div className="tbl-card">
        {isLoading ? (
          <div className="tbl-empty" role="status" aria-live="polite">Caricamento...</div>
        ) : !data?.items?.length ? (
          <div className="tbl-empty" role="status" aria-live="polite">Nessun appuntamento trovato</div>
        ) : (
          <>
          {selected.size > 0 && (
            <div className="tbl-bulkbar">
              <span className="text-xs font-medium text-blue-700">{selected.size} selezionati</span>
              <button onClick={() => { if (confirm(`Annullare ${selected.size} appuntamenti?`)) bulkAnnullaMutation.mutate([...selected]) }}
                className="text-xs px-3 py-1 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50" disabled={bulkAnnullaMutation.isPending}>
                Annulla selezionati
              </button>
              <button onClick={() => { if (confirm(`Eliminare definitivamente ${selected.size} appuntamenti selezionati?`)) bulkEliminaMutation.mutate([...selected]) }}
                className="text-xs px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50" disabled={bulkEliminaMutation.isPending}>
                Elimina selezionati
              </button>
              <button onClick={() => setDaVedereQR(sortedItems.filter(a => selected.has(a.id)))}
                className="text-xs px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Esporta .ics
              </button>
            </div>
          )}
          {(() => {
            const thC = (sortKey) => `tbl-th tbl-th-drag${sortKey ? ' hover:bg-gray-100' : ''}`
            const colDefs = {
              data: { label: 'Data', sortKey: 'data_ora_inizio',
                render: (a) => <td key="data" className="tbl-td text-gray-900 whitespace-nowrap">{dayjs(a.data_ora_inizio).format('DD/MM/YYYY')}</td> },
              inizio: { label: 'Inizio', sortKey: 'data_ora_inizio',
                render: (a) => <td key="inizio" className="tbl-td text-gray-600 whitespace-nowrap">{dayjs(a.data_ora_inizio).format('HH:mm')}</td> },
              fine: { label: 'Fine', sortKey: 'data_ora_fine',
                render: (a) => <td key="fine" className="tbl-td text-gray-600 whitespace-nowrap">{dayjs(a.data_ora_fine).format('HH:mm')}</td> },
              paziente: { label: 'Paziente', sortKey: 'paziente_cognome',
                render: (a) => (
                  <td key="paziente" className="tbl-td">
                    <button onClick={() => apriScheda(a)}
                      className="font-medium text-gray-900 hover:text-blue-600 transition-colors whitespace-nowrap text-left">
                      <Highlight text={`${a.paziente_cognome} ${a.paziente_nome}`} query={cerca} />
                    </button>
                  </td>
                ) },
              stanza: { label: 'Stanza', sortKey: 'sala',
                render: (a) => {
                  const bg = coloreStanze[a.sala]
                  return <td key="stanza" className="tbl-td text-gray-700 font-medium" style={bg ? { backgroundColor: bg } : undefined}>{a.sala ? <Highlight text={a.sala} query={cerca} /> : '—'}</td>
                } },
              operatore: { label: 'Operatore', sortKey: 'dentista_cognome',
                render: (a) => <td key="operatore" className="tbl-td text-gray-600">{a.dentista_cognome ? <Highlight text={`${a.dentista_cognome} ${a.dentista_nome}`} query={cerca} /> : '—'}</td> },
              tipo: { label: 'Tipo', sortKey: 'tipo',
                render: (a) => <td key="tipo" className="tbl-td"><span className={`text-xs px-2 py-0.5 rounded font-medium ${classeEnum('tipo_appuntamento', a.tipo)}`}>{labelEnum(a.tipo)}</span></td> },
              stato: { label: 'Stato', sortKey: 'stato',
                render: (a) => (
                  <td key="stato" className="tbl-td">
                    {puoModificare ? (
                      <select value={a.stato}
                        onChange={e => { if (e.target.value !== a.stato) cambiaStatoMutation.mutate({ id: a.id, stato: e.target.value }) }}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 ${classeEnum('stato_appuntamento', a.stato)}`}>
                        {Object.entries(STATI_LABEL).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                      </select>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${classeEnum('stato_appuntamento', a.stato)}`}>
                        {STATI_LABEL[a.stato] || a.stato}
                      </span>
                    )}
                  </td>
                )},
              creato: { label: 'Creato il', sortKey: 'created_at',
                render: (a) => <td key="creato" className="tbl-td text-gray-300 text-xs whitespace-nowrap" title={a.created_at}>{a.created_at ? dayjs(a.created_at).format('DD/MM/YYYY') : '—'}</td> },
              qr: { label: 'Share',
                render: (a) => (
                  <td key="qr" className="tbl-td text-center">
                    <button
                      onClick={() => setDaVedereQR([a])}
                      className="text-base hover:scale-125 transition-transform cursor-pointer"
                      title="Mostra QR per esportare in calendario"
                      aria-label={`Esporta in calendario l'appuntamento di ${a.paziente_cognome} ${a.paziente_nome}`}
                    >
                      🔗
                    </button>
                  </td>
                )},
              azioni: { label: 'Azioni',
                render: (a) => (
                  <td key="azioni" className="tbl-td">
                    <div className="flex gap-3 flex-wrap">
                      <button onClick={() => apriForm(a)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Modifica</button>
                      {a.stato === 'completato' && (
                        a.ordine_id ? (
                          <button
                            onClick={() => openTab(`Ordine ${a.ordine_numero}`, FormDettaglioOrdine, { ordineId: a.ordine_id }, 'ordine-detail')}
                            className="text-green-600 hover:text-green-800 text-xs font-medium">
                            Visualizza ordine
                          </button>
                        ) : (
                          <button onClick={() => creaOrdineMutation.mutate(a.id)}
                            disabled={creaOrdineMutation.isPending}
                            className="text-green-600 hover:text-green-800 text-xs font-medium disabled:opacity-50">
                            Crea ordine
                          </button>
                        )
                      )}
                      <button onClick={() => setModalElimina({ id: a.id, nome: `${a.paziente_cognome} ${dayjs(a.data_ora_inizio).format('DD/MM/YYYY')}`, referenze: null })}
                        className="text-red-600 hover:text-red-800 text-xs font-medium">Elimina</button>
                    </div>
                  </td>
                )},
            }
            return (
              <table className="tbl">
                <caption className="sr-only">Elenco appuntamenti</caption>
                <thead className="tbl-thead">
                  <tr>
                    <th scope="col" className="tbl-th-cb">
                      <input type="checkbox" ref={headerRef} checked={allSelected} onChange={toggleAll} aria-label="Seleziona tutti gli appuntamenti" className="rounded border-gray-300 cursor-pointer" />
                    </th>
                    <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('id')}>ID {si('id')}</th>
                    {order.map(key => {
                      const col = colDefs[key]
                      return (
                        <th key={key} scope="col" className={thC(col.sortKey)}
                          onClick={col.sortKey ? () => handleSort(col.sortKey) : undefined}
                          {...headerProps(key)}>
                          {col.label} {col.sortKey && si(col.sortKey)}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody className="tbl-tbody">
                  {sortedItems.map(a => (
                    <tr key={a.id} className={selected.has(a.id) ? 'tbl-row-selected' : ''}>
                      <td className="tbl-td-cb">
                        <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleOne(a.id)} aria-label={`Seleziona appuntamento di ${a.paziente_cognome} ${a.paziente_nome}`} className="rounded border-gray-300 cursor-pointer" />
                      </td>
                      <td className="tbl-td-id">#{a.id}</td>
                      {order.map(key => colDefs[key].render(a))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          })()}
          </>
        )}
        {data?.pagine_totali > 1 && (
          <div className="tbl-pagination">
            <p className="text-xs text-gray-500">Pagina {pagina} di {data.pagine_totali}</p>
            <div className="flex gap-2">
              <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50">← Prec.</button>
              <button onClick={() => setPagina(p => Math.min(data.pagine_totali, p + 1))} disabled={pagina === data.pagine_totali} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50">Succ. →</button>
            </div>
          </div>
        )}
      </div>

      {daVedereQR && (
        <ModaleICS appuntamenti={daVedereQR} onClose={() => setDaVedereQR(null)} />
      )}
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
