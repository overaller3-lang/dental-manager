import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, BarChart, Bar
} from 'recharts'
import dayjs from 'dayjs'

const GRANULARITA = [
  { value: 'totale',     label: 'Totale' },
  { value: 'anno',       label: 'Anno' },
  { value: 'mese',       label: 'Mese' },
  { value: 'settimana',  label: 'Settimana' },
  { value: 'giorno',     label: 'Giorno' },
]

const RANGE_PRESETS = [
  { label: '7g',   days: 7 },
  { label: '30g',  days: 30 },
  { label: '90g',  days: 90 },
  { label: '12m',  days: 365 },
]

function formatEuro(n) {
  return `€${Number(n || 0).toFixed(2)}`
}

function Card({ titolo, valore, colore = 'text-gray-900' }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <p className="text-xs text-gray-500">{titolo}</p>
      <p className={`text-xl font-bold mt-1 ${colore}`}>{valore}</p>
    </div>
  )
}

export default function StatisticheOperatore({ utenteId }) {
  const today = dayjs()
  const [dataInizio, setDataInizio] = useState(today.subtract(30, 'day').format('YYYY-MM-DD'))
  const [dataFine, setDataFine] = useState(today.format('YYYY-MM-DD'))
  const [granularita, setGranularita] = useState('mese')

  const applicaPreset = (days) => {
    setDataInizio(dayjs().subtract(days, 'day').format('YYYY-MM-DD'))
    setDataFine(dayjs().format('YYYY-MM-DD'))
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['statistiche-operatore', utenteId, dataInizio, dataFine, granularita],
    queryFn: async () => {
      const params = new URLSearchParams({
        data_inizio: dataInizio,
        data_fine: dataFine,
        granularita,
      })
      return (await api.get(`/statistiche/operatori/${utenteId}?${params}`)).data
    },
    enabled: !!utenteId,
  })

  const serie = useMemo(() => data?.serie_temporale ?? [], [data])

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Da</label>
            <input type="date" value={dataInizio} onChange={e => setDataInizio(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">A</label>
            <input type="date" value={dataFine} onChange={e => setDataFine(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-1">
            {RANGE_PRESETS.map(r => (
              <button key={r.label} onClick={() => applicaPreset(r.days)}
                className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">
                {r.label}
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <label className="block text-xs text-gray-500 mb-1">Granularità</label>
            <div className="flex gap-1">
              {GRANULARITA.map(g => (
                <button key={g.value} onClick={() => setGranularita(g.value)}
                  className={`px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                    granularita === g.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isLoading && <div className="text-center py-6 text-gray-400">Caricamento statistiche...</div>}
      {isError && <div className="text-center py-6 text-red-500 text-sm">Errore caricamento statistiche</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card titolo="Ore lavorate" valore={`${data.ore_lavorate.toFixed(1)} h`} />
            <Card titolo="Appuntamenti" valore={`${data.appuntamenti_completati} / ${data.appuntamenti_totali}`} />
            <Card titolo="Pazienti unici" valore={data.pazienti_unici} />
            <Card titolo="Fatturato generato" valore={formatEuro(data.fatturato_generato)} colore="text-green-600" />
          </div>

          {granularita !== 'totale' && serie.length > 0 && (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Trend fatturato e ore</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line yAxisId="left" type="monotone" dataKey="fatturato" name="Fatturato (€)" stroke="#16a34a" strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="ore" name="Ore" stroke="#2563eb" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Appuntamenti per periodo</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="appuntamenti" name="Appuntamenti" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {granularita !== 'totale' && serie.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center text-gray-400 text-sm">
              Nessun dato per il periodo selezionato.
            </div>
          )}
        </>
      )}
    </div>
  )
}
