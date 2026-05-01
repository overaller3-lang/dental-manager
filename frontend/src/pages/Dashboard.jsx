import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Responsive } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { useAuth } from '../hooks/useAuth'
import { useTabs } from '../context/TabContext'
import api from '../services/api'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
import isoWeek from 'dayjs/plugin/isoWeek'
dayjs.extend(isoWeek)
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import Appuntamenti from './Appuntamenti'
import { useColorScale, colorForValue } from '../utils/colorScale'
dayjs.locale('it')

// Griglia a dimensione FISSA: niente WidthProvider, larghezza calcolata così che
// ogni colonna sia un quadrato di CELL_PX (20×20). Su viewport più stretti il
// container del dashboard ha overflow-x: auto.
const ROW_HEIGHT = 20
const CELL_PX = 20
const COLS = 60
const GRID_MARGIN = 6
const GRID_WIDTH = COLS * CELL_PX + (COLS - 1) * GRID_MARGIN

// Catalogo dei widget disponibili.
// `default` viene usato quando il widget viene riaggiunto dal drawer.
const WIDGET_CATALOG = [
  { id: 'stat-app',             label: 'Appuntamenti oggi',                    gruppo: 'KPI',          default: { x: 0,  y: 0,  w: 9,  h: 3,  minW: 6,  minH: 3 } },
  { id: 'stat-paz',             label: 'Pazienti totali',                      gruppo: 'KPI',          default: { x: 9,  y: 0,  w: 9,  h: 3,  minW: 6,  minH: 3 } },
  { id: 'stat-incassato',       label: 'Incassi totali',                       gruppo: 'KPI',          default: { x: 18, y: 0,  w: 11, h: 3,  minW: 6,  minH: 3 } },
  { id: 'stat-incassare',       label: 'Da incassare',                         gruppo: 'KPI',          default: { x: 29, y: 0,  w: 10, h: 3,  minW: 6,  minH: 3 } },
  { id: 'agenda',               label: 'Agenda di oggi',                       gruppo: 'Liste',        default: { x: 0,  y: 3,  w: 18, h: 9,  minW: 12, minH: 6 } },
  { id: 'calendario',           label: 'Calendario mensile',                   gruppo: 'Appuntamenti', default: { x: 18, y: 3,  w: 14, h: 15, minW: 14, minH: 10 } },
  { id: 'utenti',               label: 'Utenti per ruolo',                     gruppo: 'Liste',        default: { x: 32, y: 3,  w: 7,  h: 25, minW: 6,  minH: 6 } },
  { id: 'chart-app',            label: 'Trend appuntamenti settimanali (8w)',  gruppo: 'Grafici',      default: { x: 0,  y: 12, w: 18, h: 9,  minW: 10, minH: 7 } },
  { id: 'chart-incassi',        label: 'Incassi mensili',                      gruppo: 'Grafici',      default: { x: 18, y: 18, w: 14, h: 10, minW: 10, minH: 7 } },
  { id: 'calendario-settimana', label: 'Calendario settimanale',               gruppo: 'Appuntamenti', default: { x: 0,  y: 21, w: 18, h: 8,  minW: 12, minH: 6 } },
  { id: 'grafico-mensile',      label: 'Grafico appuntamenti — mese',          gruppo: 'Appuntamenti', default: { x: 18, y: 28, w: 18, h: 10, minW: 16, minH: 7 } },
  { id: 'grafico-settimana',    label: 'Grafico appuntamenti — settimana',     gruppo: 'Appuntamenti', default: { x: 0,  y: 29, w: 18, h: 9,  minW: 14, minH: 7 } },
]

const DEFAULT_LAYOUT = WIDGET_CATALOG.map(w => ({ i: w.id, ...w.default }))

// I constraint (minW/minH) sono autoritativi nel catalogo: sovrascrivono quelli
// eventualmente persistiti in un layout salvato in passato, così riducendoli qui
// l'utente li vede applicati senza dover resettare il layout.
function applicaConstraintCatalogo(layout) {
  return layout.map(item => {
    const def = WIDGET_CATALOG.find(w => w.id === item.i)?.default
    if (!def) return item
    return { ...item, minW: def.minW, minH: def.minH }
  })
}

function StatCard({ titolo, valore, icona, colore, onClick }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 px-4 h-full flex items-center gap-3 ${onClick ? 'cursor-pointer hover:border-blue-300 hover:shadow-md transition-all' : ''}`}
      onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}>
      <span className="text-3xl shrink-0" aria-hidden="true">{icona}</span>
      <span className="text-sm text-gray-600 truncate flex-1 min-w-0">{titolo}</span>
      <span className={`text-2xl font-bold whitespace-nowrap shrink-0 ${colore}`}>{valore}</span>
    </div>
  )
}

function EuroTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      <p className="text-emerald-600">€{Number(payload[0].value).toFixed(2)}</p>
    </div>
  )
}

const NOMI_MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

// Formatta "YYYY-MM" in "Mag '26" — compatto per le tick e i tooltip del grafico mensile.
function formatMese(mese) {
  if (!mese || typeof mese !== 'string') return mese
  const parts = mese.split('-')
  if (parts.length !== 2) return mese
  const [y, m] = parts
  const idx = parseInt(m, 10) - 1
  if (idx < 0 || idx > 11) return mese
  return `${NOMI_MESI[idx]} '${y.slice(2)}`
}

// Chart degli incassi mensili. La larghezza disponibile determina il numero
// massimo di mesi visualizzati: il dataset viene troncato agli ultimi N mesi
// e tutte le tick sono mostrate (interval={0}) senza salti.
function IncassiMensiliChart({ data }) {
  const containerRef = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])
  const maxMesi = Math.max(3, Math.floor((width - 40) / 56))
  const dataVisibile = data ? data.slice(-maxMesi) : []

  return (
    <div ref={containerRef} className="flex-1 min-h-0">
      {data ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dataVisibile} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mese" tick={{ fontSize: 11 }} interval={0} tickFormatter={formatMese} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `€${v}`} />
            <Tooltip content={<EuroTooltip />} labelFormatter={formatMese} />
            <Bar dataKey="incassato" fill="#10b981" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-full flex items-center justify-center text-gray-300 text-sm">Caricamento...</div>
      )}
    </div>
  )
}

function AppTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      <p className="text-blue-600">{payload[0].value} appuntamenti</p>
    </div>
  )
}

// Scala il contenuto in base al rapporto dimensione attuale/default del widget.
// Geometric mean di width/height ratio → scaling proporzionale all'area.
function widgetScale(layout, id) {
  const def = DEFAULT_LAYOUT.find(l => l.i === id)
  const cur = layout?.find(l => l.i === id)
  if (!def || !cur) return 1
  return Math.sqrt((cur.w / def.w) * (cur.h / def.h))
}

function Scaled({ scale, children }) {
  return (
    <div className="relative w-full h-full overflow-hidden">
      <div style={{
        width: `${100 / scale}%`,
        height: `${100 / scale}%`,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}>
        {children}
      </div>
    </div>
  )
}

function RemoveX({ id, onRemove }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onRemove(id) }}
      title="Rimuovi widget"
      aria-label="Rimuovi widget"
      className="no-drag absolute top-0 right-1 z-20 text-red-500 hover:text-red-700 text-xl leading-none font-bold"
    >×</button>
  )
}

// Helper: usa /dashboard/conteggio-giornaliero per range arbitrari (settimana, mese spezzato).
// tipo ∈ { 'appuntamenti', 'ordini', 'fatture' }
function useConteggi(dataDa, dataA, queryKey, tipo = 'appuntamenti') {
  return useQuery({
    queryKey: ['conteggi', tipo, queryKey, dataDa, dataA],
    queryFn: async () => {
      const res = await api.get(`/dashboard/conteggio-giornaliero?tipo=${tipo}&data_da=${dataDa}&data_a=${dataA}`)
      return res.data ?? {}
    },
    staleTime: 60_000,
  })
}

const NAV_BTN = 'w-8 h-8 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 text-base'
const NAV_BTN_TXT = 'px-3 h-8 flex items-center border border-gray-300 rounded hover:bg-gray-50 text-sm'

const TIPI_CALENDARIO = [
  { id: 'appuntamenti', label: 'Appuntamenti', sing: 'appuntamento', plur: 'appuntamenti' },
  { id: 'ordini',       label: 'Ordini',       sing: 'ordine',       plur: 'ordini' },
  { id: 'fatture',      label: 'Fatture',      sing: 'fattura',      plur: 'fatture' },
]

function CalendarioSettimanale({ onClickGiorno }) {
  const [settimana, setSettimana] = useState(() => dayjs().startOf('isoWeek'))
  const [tipo, setTipo] = useState('appuntamenti')
  const scale = useColorScale()
  const inizio = settimana.startOf('isoWeek')
  const fine = settimana.endOf('isoWeek')
  const { data: conteggi } = useConteggi(inizio.format('YYYY-MM-DD'), fine.format('YYYY-MM-DD'), 'calendario-settimana', tipo)

  const oggi = dayjs().format('YYYY-MM-DD')
  const giorni = Array.from({ length: 7 }, (_, i) => inizio.add(i, 'day'))
  const meta = TIPI_CALENDARIO.find(t => t.id === tipo)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <h2 className="text-lg font-semibold text-gray-700">
          Settimana {inizio.format('DD/MM')} – {fine.format('DD/MM/YYYY')}
        </h2>
        <div className="flex gap-1 no-drag">
          <button onClick={() => setSettimana(s => s.subtract(1, 'week'))} aria-label="Settimana precedente" className={NAV_BTN}>‹</button>
          <button onClick={() => setSettimana(dayjs().startOf('isoWeek'))} className={NAV_BTN_TXT}>Oggi</button>
          <button onClick={() => setSettimana(s => s.add(1, 'week'))} aria-label="Settimana successiva" className={NAV_BTN}>›</button>
        </div>
      </div>
      <div className="flex gap-1 mb-2 shrink-0 no-drag">
        {TIPI_CALENDARIO.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTipo(t.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              tipo === t.id
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs text-gray-500 mb-2 shrink-0">
        {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(g => (
          <div key={g} className="text-center font-medium">{g}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 flex-1 min-h-0">
        {giorni.map(d => {
          const k = d.format('YYYY-MM-DD')
          const n = conteggi?.[k] ?? 0
          const isOggi = k === oggi
          const cliccabile = tipo === 'appuntamenti'
          return (
            <button key={k} type="button"
              onClick={() => cliccabile && onClickGiorno?.(k)}
              disabled={!cliccabile}
              className={`flex flex-col items-center justify-center border rounded text-sm transition-colors ${
                isOggi ? 'border-blue-500 border-2' : 'border-gray-100'
              } ${cliccabile ? 'cursor-pointer hover:bg-blue-50' : 'cursor-default'}`}
              title={`${d.format('dddd D MMMM')}: ${n} ${n === 1 ? meta.sing : meta.plur}`}>
              <span className="text-xs text-gray-400 leading-none">{d.date()}</span>
              <span className="text-3xl font-bold leading-tight" style={{ color: colorForValue(n, scale) }}>{n}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function GraficoAppuntamentiMensile() {
  const [mese, setMese] = useState(() => dayjs().startOf('month'))
  const inizio = mese.startOf('month')
  const fine = mese.endOf('month')
  const { data: conteggi } = useConteggi(inizio.format('YYYY-MM-DD'), fine.format('YYYY-MM-DD'), 'grafico-mensile')

  const dati = Array.from({ length: fine.date() }, (_, i) => {
    const d = inizio.date(i + 1)
    const k = d.format('YYYY-MM-DD')
    return { giorno: String(i + 1), appuntamenti: conteggi?.[k] ?? 0 }
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <h2 className="text-base font-semibold text-gray-700 capitalize">Appuntamenti — {mese.format('MMMM YYYY')}</h2>
        <div className="flex gap-1 no-drag">
          <button onClick={() => setMese(m => m.subtract(1, 'month'))} aria-label="Mese precedente" className={NAV_BTN}>‹</button>
          <button onClick={() => setMese(dayjs().startOf('month'))} className={NAV_BTN_TXT}>Oggi</button>
          <button onClick={() => setMese(m => m.add(1, 'month'))} aria-label="Mese successivo" className={NAV_BTN}>›</button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dati} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="giorno" tick={{ fontSize: 11 }} interval={1} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip content={<AppTooltip />} />
            <Bar dataKey="appuntamenti" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const GIORNI_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

function GraficoAppuntamentiSettimanale() {
  const [settimana, setSettimana] = useState(() => dayjs().startOf('isoWeek'))
  const inizio = settimana.startOf('isoWeek')
  const fine = settimana.endOf('isoWeek')
  const { data: conteggi } = useConteggi(inizio.format('YYYY-MM-DD'), fine.format('YYYY-MM-DD'), 'grafico-settimana')

  const dati = Array.from({ length: 7 }, (_, i) => {
    const d = inizio.add(i, 'day')
    const k = d.format('YYYY-MM-DD')
    return { giorno: GIORNI_LABELS[i], appuntamenti: conteggi?.[k] ?? 0 }
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <h2 className="text-base font-semibold text-gray-700">Appuntamenti — {inizio.format('DD/MM')} – {fine.format('DD/MM/YYYY')}</h2>
        <div className="flex gap-1 no-drag">
          <button onClick={() => setSettimana(s => s.subtract(1, 'week'))} aria-label="Settimana precedente" className={NAV_BTN}>‹</button>
          <button onClick={() => setSettimana(dayjs().startOf('isoWeek'))} className={NAV_BTN_TXT}>Oggi</button>
          <button onClick={() => setSettimana(s => s.add(1, 'week'))} aria-label="Settimana successiva" className={NAV_BTN}>›</button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dati} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="giorno" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip content={<AppTooltip />} />
            <Bar dataKey="appuntamenti" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function CalendarioMensile({ onClickGiorno }) {
  const [mese, setMese] = useState(() => dayjs().startOf('month'))
  const scale = useColorScale()
  const inizio = mese.startOf('month')
  const fine = mese.endOf('month')

  const { data: conteggi } = useQuery({
    queryKey: ['appuntamenti', 'calendario-mese', inizio.format('YYYY-MM')],
    queryFn: async () => {
      const res = await api.get(`/appuntamenti/conteggio-mensile?anno=${mese.year()}&mese=${mese.month() + 1}`)
      return res.data ?? {}
    },
    staleTime: 60_000,
  })

  const oggi = dayjs().format('YYYY-MM-DD')
  const offsetIniziale = (inizio.day() + 6) % 7
  const giorniMese = fine.date()
  const celle = []
  for (let i = 0; i < offsetIniziale; i++) celle.push(null)
  for (let g = 1; g <= giorniMese; g++) celle.push(inizio.date(g))
  while (celle.length % 7 !== 0) celle.push(null)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h2 className="text-lg font-semibold text-gray-700 capitalize">Appuntamenti {mese.format('MMMM YYYY')}</h2>
        <div className="flex gap-1 no-drag">
          <button onClick={() => setMese(m => m.subtract(1, 'month'))}
            aria-label="Mese precedente"
            className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 text-base">‹</button>
          <button onClick={() => setMese(dayjs().startOf('month'))}
            className="px-3 h-8 flex items-center border border-gray-300 rounded hover:bg-gray-50 text-sm">Oggi</button>
          <button onClick={() => setMese(m => m.add(1, 'month'))}
            aria-label="Mese successivo"
            className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 text-base">›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs text-gray-500 mb-2 shrink-0">
        {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(g => (
          <div key={g} className="text-center font-medium">{g}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 flex-1 min-h-0">
        {celle.map((d, i) => {
          if (!d) return <div key={i} />
          const k = d.format('YYYY-MM-DD')
          const n = conteggi?.[k] ?? 0
          const isOggi = k === oggi
          return (
            <button key={i} type="button"
              onClick={() => onClickGiorno?.(k)}
              className={`flex flex-col items-center justify-center border rounded text-sm cursor-pointer hover:bg-blue-50 transition-colors ${
                isOggi ? 'border-blue-500 border-2' : 'border-gray-100'
              }`}
              title={`${d.format('DD/MM/YYYY')}: ${n} appuntament${n === 1 ? 'o' : 'i'} — click per filtrare`}>
              <span className="text-xs text-gray-400 leading-none">{d.date()}</span>
              <span className="text-2xl font-bold leading-tight" style={{ color: colorForValue(n, scale) }}>{n}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Helper: imposta il filtro data sulla pagina Appuntamenti (storage + event)
// così il filtro si applica sia che il tab sia da aprire sia che sia già aperto.
function applicaFiltroAppuntamenti({ dataDa, dataA }) {
  const mode = window.localStorage.getItem('filtri-persistenza')
  const store = mode === 'sempre' ? window.localStorage : window.sessionStorage
  if (dataDa !== undefined) store.setItem('filtri.appuntamenti.dataDa', JSON.stringify(dataDa))
  if (dataA !== undefined) store.setItem('filtri.appuntamenti.dataA', JSON.stringify(dataA))
  window.dispatchEvent(new CustomEvent('apply-filter-appuntamenti', { detail: { dataDa, dataA } }))
}

export default function Dashboard() {
  const { utente } = useAuth()
  const { openPage } = useTabs()
  const queryClient = useQueryClient()
  const oggi = dayjs().format('YYYY-MM-DD')
  const [sortRuoli, setSortRuoli] = useState('n')
  const [sortRuoliDir, setSortRuoliDir] = useState('desc')
  const [layout, setLayout] = useState(DEFAULT_LAYOUT)
  const saveTimer = useRef(null)
  const isInitialLoad = useRef(true)

  const toggleSortRuoli = (campo) => {
    if (sortRuoli === campo) setSortRuoliDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortRuoli(campo); setSortRuoliDir(campo === 'n' ? 'desc' : 'asc') }
  }

  const { data: agenda } = useQuery({
    queryKey: ['agenda', oggi],
    queryFn: async () => {
      const params = new URLSearchParams({ pagina: '1', per_pagina: '50' })
      params.append('data_da', `${oggi}T00:00:00`)
      params.append('data_a', `${oggi}T23:59:59`)
      const res = await api.get(`/appuntamenti?${params}`)
      return { appuntamenti: res.data.items, totale: res.data.totale }
    },
    enabled: !!utente
  })

  const { data: riepilogoPagamenti } = useQuery({
    queryKey: ['riepilogo-pagamenti'],
    queryFn: async () => (await api.get('/pagamenti/riepilogo')).data
  })

  const { data: pazienti } = useQuery({
    queryKey: ['pazienti-count'],
    queryFn: async () => (await api.get('/pazienti?per_pagina=1')).data
  })

  const { data: statistiche } = useQuery({
    queryKey: ['statistiche'],
    queryFn: async () => (await api.get('/statistiche')).data
  })

  const { data: utenti } = useQuery({
    queryKey: ['utenti-dashboard'],
    queryFn: async () => (await api.get('/utenti?per_pagina=100')).data
  })

  const { data: layoutSalvato } = useQuery({
    queryKey: ['dashboard-layout'],
    queryFn: async () => (await api.get('/dashboard/layout')).data,
  })

  useEffect(() => {
    if (layoutSalvato === undefined) return
    if (layoutSalvato?.layout && Array.isArray(layoutSalvato.layout)) {
      setLayout(applicaConstraintCatalogo(layoutSalvato.layout))
    } else {
      setLayout(DEFAULT_LAYOUT)
    }
    isInitialLoad.current = false
  }, [layoutSalvato])

  const salvaLayoutMutation = useMutation({
    mutationFn: (l) => api.put('/dashboard/layout', { layout: l }),
  })

  const resetMutation = useMutation({
    mutationFn: () => api.delete('/dashboard/layout'),
    onSuccess: () => {
      setLayout(DEFAULT_LAYOUT)
      queryClient.invalidateQueries({ queryKey: ['dashboard-layout'] })
    },
  })

  const onLayoutChange = (nuovo) => {
    setLayout(nuovo)
    if (isInitialLoad.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => salvaLayoutMutation.mutate(nuovo), 500)
  }

  const rimuoviWidget = (id) => {
    const nuovo = layout.filter(w => w.i !== id)
    setLayout(nuovo)
    salvaLayoutMutation.mutate(nuovo)
  }

  const aggiungiWidget = (id) => {
    const def = WIDGET_CATALOG.find(w => w.id === id)
    if (!def) return
    if (layout.some(w => w.i === id)) return  // già presente
    // Posiziona il nuovo widget in basso, allineato a sinistra
    const maxY = Math.max(0, ...layout.map(w => w.y + w.h))
    const nuovo = [...layout, { i: id, ...def.default, x: 0, y: maxY }]
    setLayout(nuovo)
    salvaLayoutMutation.mutate(nuovo)
  }

  const widgetsVisibili = useMemo(() => new Set(layout.map(w => w.i)), [layout])
  const widgetsNascosti = WIDGET_CATALOG.filter(w => !widgetsVisibili.has(w.id))
  const [drawerAperto, setDrawerAperto] = useState(false)

  const ruoliCount = useMemo(() => {
    if (!utenti?.items) return []
    const counts = {}
    utenti.items.forEach(u => {
      if (!u.attivo) return
      const ruoli = u.ruoli?.length ? u.ruoli : ['Nessun ruolo']
      ruoli.forEach(r => { counts[r] = (counts[r] || 0) + 1 })
    })
    return Object.entries(counts)
  }, [utenti])

  const ruoliSorted = useMemo(() => {
    return [...ruoliCount].sort(([ra, na], [rb, nb]) => {
      if (sortRuoli === 'n') return sortRuoliDir === 'desc' ? nb - na : na - nb
      const cmp = ra.localeCompare(rb, 'it')
      return sortRuoliDir === 'asc' ? cmp : -cmp
    })
  }, [ruoliCount, sortRuoli, sortRuoliDir])

  const siR = (campo) => (
    <span className={`text-[10px] ml-0.5 ${sortRuoli === campo ? 'text-blue-500' : 'text-gray-300'}`}>
      {sortRuoli === campo ? (sortRuoliDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  )

  return (
    <div className="p-3 min-h-full overflow-x-auto" style={{ backgroundColor: 'rgb(230, 230, 230)' }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-gray-500 text-xs mt-0.5">
            {dayjs().format('dddd D MMMM YYYY')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setDrawerAperto(true)}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
            + Aggiungi widget {widgetsNascosti.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-white text-blue-600 rounded-full text-[10px]">{widgetsNascosti.length}</span>}
          </button>
          <button
            onClick={() => { if (confirm('Ripristinare il layout di default?')) resetMutation.mutate() }}
            disabled={resetMutation.isPending}
            className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            ↻ Ripristina layout
          </button>
        </div>
      </div>

      <Responsive
        className="layout"
        width={GRID_WIDTH}
        layouts={{ lg: layout, md: layout, sm: layout, xs: layout, xxs: layout }}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: COLS, md: COLS, sm: COLS, xs: COLS, xxs: COLS }}
        rowHeight={ROW_HEIGHT}
        margin={[GRID_MARGIN, GRID_MARGIN]}
        containerPadding={[0, 0]}
        compactType="vertical"
        preventCollision={false}
        onLayoutChange={onLayoutChange}
        draggableCancel="input,select,textarea,button,a,.no-drag"
        resizeHandles={['se']}>

        {widgetsVisibili.has('stat-app') && (
        <div key="stat-app" className="relative">
          <RemoveX id="stat-app" onRemove={rimuoviWidget} />
          <Scaled scale={widgetScale(layout, 'stat-app')}>
            <StatCard
              titolo="Appuntamenti oggi"
              valore={agenda?.totale ?? '—'}
              icona="📅"
              colore="text-blue-600"
              onClick={() => {
                applicaFiltroAppuntamenti({ dataDa: oggi, dataA: oggi })
                openPage('/appuntamenti', 'Appuntamenti', Appuntamenti, {})
              }}
            />
          </Scaled>
        </div>
        )}
        {widgetsVisibili.has('stat-paz') && (
        <div key="stat-paz" className="relative">
          <RemoveX id="stat-paz" onRemove={rimuoviWidget} />
          <Scaled scale={widgetScale(layout, 'stat-paz')}>
            <StatCard titolo="Pazienti totali" valore={pazienti?.totale ?? '—'} icona="👤" colore="text-green-600" />
          </Scaled>
        </div>
        )}
        {widgetsVisibili.has('stat-incassato') && (
        <div key="stat-incassato" className="relative">
          <RemoveX id="stat-incassato" onRemove={rimuoviWidget} />
          <Scaled scale={widgetScale(layout, 'stat-incassato')}>
            <StatCard titolo="Incassi totali" valore={riepilogoPagamenti ? `€${Number(riepilogoPagamenti.totale_incassato).toFixed(2)}` : '—'} icona="💰" colore="text-emerald-600" />
          </Scaled>
        </div>
        )}
        {widgetsVisibili.has('stat-incassare') && (
        <div key="stat-incassare" className="relative">
          <RemoveX id="stat-incassare" onRemove={rimuoviWidget} />
          <Scaled scale={widgetScale(layout, 'stat-incassare')}>
            <StatCard titolo="Da incassare" valore={riepilogoPagamenti ? `€${Number(riepilogoPagamenti.totale_in_attesa).toFixed(2)}` : '—'} icona="⏳" colore="text-orange-600" />
          </Scaled>
        </div>
        )}

        {widgetsVisibili.has('calendario') && (
        <div key="calendario" className="relative">
          <RemoveX id="calendario" onRemove={rimuoviWidget} />
          <Scaled scale={widgetScale(layout, 'calendario')}>
            <CalendarioMensile onClickGiorno={(data) => {
              applicaFiltroAppuntamenti({ dataDa: data, dataA: data })
              openPage('/appuntamenti', 'Appuntamenti', Appuntamenti, {})
            }} />
          </Scaled>
        </div>
        )}

        {widgetsVisibili.has('calendario-settimana') && (
        <div key="calendario-settimana" className="relative">
          <RemoveX id="calendario-settimana" onRemove={rimuoviWidget} />
          <CalendarioSettimanale onClickGiorno={(data) => {
            applicaFiltroAppuntamenti({ dataDa: data, dataA: data })
            openPage('/appuntamenti', 'Appuntamenti', Appuntamenti, {})
          }} />
        </div>
        )}

        {widgetsVisibili.has('grafico-mensile') && (
        <div key="grafico-mensile" className="relative">
          <RemoveX id="grafico-mensile" onRemove={rimuoviWidget} />
          <GraficoAppuntamentiMensile />
        </div>
        )}

        {widgetsVisibili.has('grafico-settimana') && (
        <div key="grafico-settimana" className="relative">
          <RemoveX id="grafico-settimana" onRemove={rimuoviWidget} />
          <GraficoAppuntamentiSettimanale />
        </div>
        )}

        {widgetsVisibili.has('chart-incassi') && (
        <div key="chart-incassi" className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex flex-col overflow-hidden relative">
          <RemoveX id="chart-incassi" onRemove={rimuoviWidget} />
          <h2 className="text-base font-semibold text-gray-700 mb-2 shrink-0">Incassi mensili</h2>
          <IncassiMensiliChart data={statistiche?.incassi_mensili} />
        </div>
        )}

        {widgetsVisibili.has('chart-app') && (
        <div key="chart-app" className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex flex-col overflow-hidden relative">
          <RemoveX id="chart-app" onRemove={rimuoviWidget} />
          <h2 className="text-base font-semibold text-gray-700 mb-2 shrink-0">Appuntamenti settimanali</h2>
          <div className="flex-1 min-h-0">
            {statistiche?.appuntamenti_settimanali ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={statistiche.appuntamenti_settimanali} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="settimana" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip content={<AppTooltip />} />
                  <Line type="monotone" dataKey="appuntamenti" stroke="#3b82f6" strokeWidth={2}
                    dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-300 text-sm">Caricamento...</div>
            )}
          </div>
        </div>
        )}

        {widgetsVisibili.has('agenda') && (
        <div key="agenda" className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex flex-col overflow-hidden relative">
          <RemoveX id="agenda" onRemove={rimuoviWidget} />
          <h2 className="text-base font-semibold text-gray-700 mb-2 shrink-0">Agenda di oggi</h2>
          <div className="flex-1 overflow-auto min-h-0">
            {!agenda?.appuntamenti?.length ? (
              <p className="text-gray-400 text-sm text-center py-4">Nessun appuntamento per oggi</p>
            ) : (
              <table className="tbl w-full">
                <thead className="tbl-thead">
                  <tr>
                    <th className="tbl-th">Inizio</th>
                    <th className="tbl-th">Fine</th>
                    <th className="tbl-th">Paziente</th>
                    <th className="tbl-th">Tipo / Sala</th>
                    <th className="tbl-th">Stato</th>
                  </tr>
                </thead>
                <tbody className="tbl-tbody">
                  {agenda.appuntamenti.map(app => (
                    <tr key={app.id}>
                      <td className="tbl-td font-medium text-blue-600 whitespace-nowrap">{dayjs(app.data_ora_inizio).format('HH:mm')}</td>
                      <td className="tbl-td text-gray-500 whitespace-nowrap">{dayjs(app.data_ora_fine).format('HH:mm')}</td>
                      <td className="tbl-td text-gray-900 whitespace-nowrap">{app.paziente_cognome} {app.paziente_nome}</td>
                      <td className="tbl-td text-gray-600 whitespace-nowrap">{app.tipo}{app.sala ? ` — ${app.sala}` : ''}</td>
                      <td className="tbl-td">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          app.stato === 'confermato' ? 'bg-green-100 text-green-700' :
                          app.stato === 'in_corso' ? 'bg-blue-100 text-blue-700' :
                          app.stato === 'completato' ? 'bg-gray-100 text-gray-600' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>{app.stato}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        )}

        {widgetsVisibili.has('utenti') && (
        <div key="utenti" className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col relative">
          <RemoveX id="utenti" onRemove={rimuoviWidget} />
          <div className="px-3 py-2 border-b border-gray-100 shrink-0">
            <h2 className="text-base font-semibold text-gray-700">Utenti in struttura</h2>
          </div>
          <div className="flex-1 overflow-auto min-h-0">
            {!ruoliCount.length ? (
              <p className="text-gray-400 text-sm text-center py-4">Nessun utente attivo</p>
            ) : (
              <table className="tbl w-full">
                <thead className="tbl-thead">
                  <tr>
                    <th className="tbl-th tbl-th-sort" onClick={() => toggleSortRuoli('ruolo')}>
                      Ruolo {siR('ruolo')}
                    </th>
                    <th className="tbl-th tbl-th-sort !text-right w-12" onClick={() => toggleSortRuoli('n')}>
                      N {siR('n')}
                    </th>
                  </tr>
                </thead>
                <tbody className="tbl-tbody">
                  {ruoliSorted.map(([ruolo, n]) => (
                    <tr key={ruolo}>
                      <td className="tbl-td text-gray-700">{ruolo}</td>
                      <td className="tbl-td text-right">
                        <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{n}</span>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="tbl-td text-xs text-gray-400">Totale attivi</td>
                    <td className="tbl-td text-right text-xs font-semibold text-gray-600">{ruoliCount.reduce((acc, [, n]) => acc + n, 0)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
        )}
      </Responsive>

      {/* Drawer per aggiungere widget rimossi */}
      {drawerAperto && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setDrawerAperto(false)}>
          <div className="bg-black/30 absolute inset-0" />
          <div className="relative w-80 bg-white shadow-2xl h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-base font-semibold text-gray-800">Widget disponibili</h2>
              <button onClick={() => setDrawerAperto(false)} aria-label="Chiudi"
                className="w-7 h-7 rounded hover:bg-gray-100 flex items-center justify-center text-gray-500">×</button>
            </div>
            <div className="p-3">
              {widgetsNascosti.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Tutti i widget sono già in dashboard.</p>
              ) : (
                <ul className="space-y-1">
                  {widgetsNascosti.map(w => (
                    <li key={w.id} className="flex items-center justify-between gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{w.label}</p>
                        <p className="text-[10px] text-gray-400 uppercase">{w.gruppo}</p>
                      </div>
                      <button onClick={() => { aggiungiWidget(w.id); setDrawerAperto(false) }}
                        className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded shrink-0">
                        + Aggiungi
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
