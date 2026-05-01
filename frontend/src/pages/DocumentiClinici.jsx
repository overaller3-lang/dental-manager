import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { useTabs } from '../context/TabContext'
import CartellaPaziente from './CartellaPaziente'
import dayjs from 'dayjs'
import 'dayjs/locale/it'

dayjs.locale('it')

const ICONA_TIPO = {
  diario_visita: '📅',
  consenso_firmato: '📝',
}

const TIPO_LABEL = {
  prima_visita: 'Prima visita',
  visita: 'Visita',
  igiene: 'Igiene',
  intervento: 'Intervento',
  urgenza: 'Urgenza',
  controllo: 'Controllo',
}

function PazienteSearch({ onSelect, selectedId }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const { data: results } = useQuery({
    queryKey: ['pazienti-cartella-search', query],
    queryFn: async () => {
      const r = await api.get('/pazienti', {
        params: { cerca: query.trim() || undefined, per_pagina: 15 }
      })
      return r.data?.items || []
    },
  })

  const items = results || []

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Seleziona paziente
      </label>
      <input
        type="text"
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Cerca per nome, cognome, codice fiscale..."
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && items.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-gray-300 rounded-md shadow-lg">
          {items.map(p => (
            <li
              key={p.id}
              className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${selectedId === p.id ? 'bg-blue-100' : ''}`}
              onMouseDown={() => { onSelect(p.id); setQuery(`${p.cognome} ${p.nome}`); setOpen(false) }}
            >
              <span className="font-medium">{p.cognome} {p.nome}</span>
              {p.codice_fiscale && <span className="text-xs text-gray-500 ml-2">{p.codice_fiscale}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function HeaderAnagrafica({ paziente, onApriScheda }) {
  if (!paziente) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900">
            {paziente.cognome} {paziente.nome}
          </h2>
          <div className="text-sm text-gray-600 mt-1 space-x-3">
            {paziente.sesso && <span>{paziente.sesso}</span>}
            {paziente.data_nascita && (
              <span>
                {dayjs(paziente.data_nascita).format('D MMM YYYY')}
                {paziente.eta != null && ` (${paziente.eta} anni)`}
              </span>
            )}
            {paziente.codice_fiscale && <span className="font-mono text-xs">{paziente.codice_fiscale}</span>}
          </div>
          {paziente.allergie && (
            <div className="mt-2 text-sm">
              <span className="font-medium text-red-700">⚠ Allergie: </span>
              <span className="text-gray-800">{paziente.allergie}</span>
            </div>
          )}
          {paziente.anamnesi_storica && (
            <div className="mt-2 text-sm">
              <span className="font-medium text-gray-700">Anamnesi storica: </span>
              <span className="text-gray-800">{paziente.anamnesi_storica}</span>
            </div>
          )}
        </div>
        <button
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 whitespace-nowrap"
          onClick={onApriScheda}
        >
          📋 Apri scheda completa
        </button>
      </div>
    </div>
  )
}

function CardOdontogramma({ odontogramma, onApri }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900">🦷 Odontogramma</h3>
          <p className="text-sm text-gray-600 mt-1">
            {odontogramma?.presente
              ? `Compilato: ${odontogramma.denti_registrati} ${odontogramma.denti_registrati === 1 ? 'dente registrato' : 'denti registrati'}`
              : 'Non ancora compilato per questo paziente'}
          </p>
        </div>
        <button
          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded whitespace-nowrap"
          onClick={onApri}
        >
          Apri odontogramma
        </button>
      </div>
    </div>
  )
}

function VoceDiarioVisita({ voce }) {
  const tipoLabel = TIPO_LABEL[voce.titolo?.replace('Visita ', '')] || voce.titolo
  return (
    <div className="border border-gray-200 rounded p-3 bg-white">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <span className="mr-2">{ICONA_TIPO.diario_visita}</span>
          <span className="font-medium text-gray-900">
            {dayjs(voce.data).format('D MMMM YYYY, HH:mm')}
          </span>
          <span className="ml-2 text-sm text-gray-600">{tipoLabel}</span>
        </div>
        {voce.operatore && (
          <span className="text-xs text-gray-500">Operatore: {voce.operatore}</span>
        )}
      </div>
      <dl className="text-sm space-y-1 ml-6">
        {voce.dati.anamnesi_aggiornamento && (
          <div><dt className="inline font-medium text-gray-700">Aggiornamento anamnesi: </dt><dd className="inline text-gray-800">{voce.dati.anamnesi_aggiornamento}</dd></div>
        )}
        {voce.dati.esame_obiettivo && (
          <div><dt className="inline font-medium text-gray-700">Esame obiettivo: </dt><dd className="inline text-gray-800">{voce.dati.esame_obiettivo}</dd></div>
        )}
        {voce.dati.diagnosi && (
          <div><dt className="inline font-medium text-gray-700">Diagnosi: </dt><dd className="inline text-gray-800">{voce.dati.diagnosi}</dd></div>
        )}
        {voce.dati.trattamenti_eseguiti && (
          <div><dt className="inline font-medium text-gray-700">Trattamenti eseguiti: </dt><dd className="inline text-gray-800">{voce.dati.trattamenti_eseguiti}</dd></div>
        )}
        {voce.dati.note_cliniche && (
          <div><dt className="inline font-medium text-gray-700">Note cliniche: </dt><dd className="inline text-gray-800">{voce.dati.note_cliniche}</dd></div>
        )}
        {voce.dati.prossimo_controllo_data && (
          <div>
            <dt className="inline font-medium text-gray-700">Prossimo controllo: </dt>
            <dd className="inline text-gray-800">
              {dayjs(voce.dati.prossimo_controllo_data).format('D MMMM YYYY')}
              {voce.dati.prossimo_controllo_note && ` — ${voce.dati.prossimo_controllo_note}`}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}

function VoceConsenso({ voce }) {
  return (
    <div className="border border-gray-200 rounded p-3 bg-white">
      <div className="flex items-baseline justify-between mb-1">
        <div>
          <span className="mr-2">{ICONA_TIPO.consenso_firmato}</span>
          <span className="font-medium text-gray-900">
            {dayjs(voce.data).format('D MMMM YYYY')}
          </span>
          <span className="ml-2 text-sm text-gray-600">Consenso informato firmato</span>
        </div>
      </div>
      <div className="text-sm ml-6 text-gray-700">
        Riferito al preventivo <span className="font-mono">{voce.dati.preventivo_numero}</span>
        {voce.dati.preventivo_descrizione && ` — ${voce.dati.preventivo_descrizione}`}
      </div>
    </div>
  )
}

export default function DocumentiClinici() {
  const [pazienteId, setPazienteId] = useState(null)
  const { openTab } = useTabs()

  const { data: cartella, isLoading } = useQuery({
    queryKey: ['cartella-clinica', pazienteId],
    queryFn: async () => {
      const r = await api.get(`/cartella-clinica/${pazienteId}`)
      return r.data
    },
    enabled: !!pazienteId,
  })

  const apriScheda = () => {
    if (!cartella?.paziente) return
    const p = cartella.paziente
    openTab(`${p.cognome} ${p.nome}`, CartellaPaziente, { pazienteId: p.id }, 'scheda-paziente')
  }

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Documenti clinici</h1>

      <div className="mb-4">
        <PazienteSearch onSelect={setPazienteId} selectedId={pazienteId} />
      </div>

      {pazienteId && isLoading && (
        <div className="text-gray-500">Caricamento cartella clinica…</div>
      )}

      {cartella && (
        <>
          <HeaderAnagrafica paziente={cartella.paziente} onApriScheda={apriScheda} />

          <CardOdontogramma
            odontogramma={cartella.odontogramma}
            onApri={apriScheda}
          />

          <div>
            <h3 className="font-semibold text-gray-900 mb-2">
              Cronologia clinica
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({cartella.totale_voci} {cartella.totale_voci === 1 ? 'voce' : 'voci'})
              </span>
            </h3>

            {cartella.timeline.length === 0 ? (
              <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded p-4">
                Nessuna voce clinica registrata per questo paziente. Le voci compaiono
                automaticamente quando un appuntamento viene completato con dati clinici
                o un preventivo viene firmato.
              </div>
            ) : (
              <ul className="space-y-2">
                {cartella.timeline.map((voce, i) => (
                  <li key={`${voce.tipo}-${i}-${voce.data}`}>
                    {voce.tipo === 'diario_visita' && <VoceDiarioVisita voce={voce} />}
                    {voce.tipo === 'consenso_firmato' && <VoceConsenso voce={voce} />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {!pazienteId && (
        <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded p-6 text-center">
          Seleziona un paziente per consultare la sua cartella clinica.
        </div>
      )}
    </div>
  )
}
