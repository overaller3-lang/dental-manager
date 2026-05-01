import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useTabs } from '../context/TabContext'
import { useTabFocusRefetch } from '../hooks/useTabFocusRefetch'
import { FormAppuntamento } from './Appuntamenti'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
dayjs.locale('it')

const STATI_LABEL = {
  prenotato: 'Prenotato',
  confermato: 'Confermato',
  in_corso: 'In corso',
  completato: 'Completato',
  annullato: 'Annullato',
  non_presentato: 'Non presentato',
  rinviato: 'Rinviato',
}

const coloreStato = {
  prenotato: 'bg-yellow-100 text-yellow-700',
  confermato: 'bg-blue-100 text-blue-700',
  in_corso: 'bg-orange-100 text-orange-700',
  completato: 'bg-green-100 text-green-700',
  annullato: 'bg-red-100 text-red-700',
  non_presentato: 'bg-gray-200 text-gray-600',
  rinviato: 'bg-purple-100 text-purple-700',
}

function Riga({ etichetta, valore }) {
  return (
    <div className="flex gap-3 py-1.5 border-b border-gray-100 last:border-0">
      <dt className="w-40 text-xs text-gray-500 shrink-0 pt-0.5">{etichetta}</dt>
      <dd className="text-sm text-gray-900 whitespace-pre-wrap flex-1">
        {valore !== null && valore !== undefined && valore !== '' ? valore : <span className="text-gray-400">—</span>}
      </dd>
    </div>
  )
}

function Sezione({ titolo, children }) {
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-3">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{titolo}</h3>
      <dl>{children}</dl>
    </section>
  )
}

export default function SchedaAppuntamento({ appuntamentoId, onClose }) {
  const queryClient = useQueryClient()
  const { openTab } = useTabs()

  const { data: a, isLoading, refetch } = useQuery({
    queryKey: ['appuntamento', appuntamentoId],
    queryFn: async () => (await api.get(`/appuntamenti/${appuntamentoId}`)).data,
    enabled: !!appuntamentoId,
    staleTime: 30_000,
  })

  // Verifica se esiste già un ordine collegato a questo appuntamento
  const { data: ordini } = useQuery({
    queryKey: ['ordini-da-appuntamento', appuntamentoId],
    queryFn: async () => (await api.get(`/ordini?per_pagina=100`)).data?.items ?? [],
    enabled: !!appuntamentoId && a?.stato === 'completato',
  })
  const ordineEsistente = ordini?.find(o => o.appuntamento_id === appuntamentoId)

  useTabFocusRefetch(refetch)

  const creaOrdineMutation = useMutation({
    mutationFn: () => api.post('/ordini/da-appuntamento', { appuntamento_id: appuntamentoId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordini'] })
      queryClient.invalidateQueries({ queryKey: ['ordini-da-appuntamento', appuntamentoId] })
    },
  })

  if (isLoading) return <div className="p-4 text-center text-gray-400 text-sm">Caricamento...</div>
  if (!a) return <div className="p-4 text-center text-gray-400 text-sm">Appuntamento non trovato</div>

  const inizio = dayjs(a.data_ora_inizio)
  const fine = dayjs(a.data_ora_fine)
  const isFaseVisita = a.stato === 'in_corso' || a.stato === 'completato'

  const apriModifica = () => {
    openTab(
      `Modifica — ${a.paziente_cognome} ${inizio.format('DD/MM')}`,
      FormAppuntamento,
      { appuntamento: a },
      'appuntamento'
    )
  }

  return (
    <div className="p-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs text-gray-500 uppercase">{a.tipo?.replace('_', ' ')}</p>
          <h1 className="text-lg font-bold text-gray-900">
            {a.paziente_cognome} {a.paziente_nome}
          </h1>
          <p className="text-sm text-gray-600 capitalize">
            {inizio.format('dddd D MMMM YYYY')} • {inizio.format('HH:mm')} – {fine.format('HH:mm')}
          </p>
          <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${coloreStato[a.stato] || 'bg-gray-100 text-gray-600'}`}>
            {STATI_LABEL[a.stato] || a.stato}
          </span>
        </div>
        <div className="flex gap-2">
          {a.stato === 'completato' && !ordineEsistente && (
            <button
              onClick={() => creaOrdineMutation.mutate()}
              disabled={creaOrdineMutation.isPending}
              className="px-3 py-1.5 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50">
              {creaOrdineMutation.isPending ? 'Creazione...' : '+ Crea ordine'}
            </button>
          )}
          {a.stato === 'completato' && ordineEsistente && (
            <span className="px-3 py-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
              Ordine: {ordineEsistente.numero}
            </span>
          )}
          <button onClick={apriModifica} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
            Modifica
          </button>
        </div>
      </div>

      <Sezione titolo="Dati appuntamento">
        <Riga etichetta="Paziente" valore={`${a.paziente_cognome} ${a.paziente_nome}`} />
        <Riga etichetta="Operatore" valore={a.dentista_cognome ? `${a.dentista_cognome} ${a.dentista_nome}` : null} />
        <Riga etichetta="Data" valore={inizio.format('DD/MM/YYYY')} />
        <Riga etichetta="Orario" valore={`${inizio.format('HH:mm')} – ${fine.format('HH:mm')}`} />
        <Riga etichetta="Stanza" valore={a.sala} />
        <Riga etichetta="Tipo" valore={a.tipo?.replace('_', ' ')} />
        <Riga etichetta="Motivo" valore={a.motivo} />
        {a.preventivo_id && <Riga etichetta="Preventivo collegato" valore={`#${a.preventivo_id}`} />}
      </Sezione>

      {a.note_segreteria && (
        <Sezione titolo="Note organizzative">
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{a.note_segreteria}</p>
        </Sezione>
      )}

      {isFaseVisita && (
        <Sezione titolo="Visita">
          <Riga etichetta="Anamnesi (aggiornamento)" valore={a.anamnesi_aggiornamento} />
          <Riga etichetta="Esame obiettivo" valore={a.esame_obiettivo} />
          <Riga etichetta="Diagnosi" valore={a.diagnosi} />
          <Riga etichetta="Trattamenti eseguiti" valore={a.trattamenti_eseguiti} />
          <Riga etichetta="Note cliniche" valore={a.note_cliniche} />
          <Riga
            etichetta="Prossimo controllo"
            valore={a.prossimo_controllo_data
              ? `${dayjs(a.prossimo_controllo_data).format('DD/MM/YYYY')}${a.prossimo_controllo_note ? ` — ${a.prossimo_controllo_note}` : ''}`
              : null}
          />
        </Sezione>
      )}
    </div>
  )
}
