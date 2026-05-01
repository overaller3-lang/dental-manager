import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useTabs } from '../context/TabContext'
import { useTabFocusRefetch } from '../hooks/useTabFocusRefetch'
import { FormPreventivo } from './Preventivi'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
dayjs.locale('it')

const STATI_LABEL = {
  bozza: 'Bozza',
  inviato: 'Inviato',
  accettato: 'Accettato',
  rifiutato: 'Rifiutato',
  scaduto: 'Scaduto',
}

const coloreStato = {
  bozza: 'bg-gray-100 text-gray-600',
  inviato: 'bg-blue-100 text-blue-700',
  accettato: 'bg-green-100 text-green-700',
  rifiutato: 'bg-red-100 text-red-700',
  scaduto: 'bg-orange-100 text-orange-700',
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

function Sezione({ titolo, children, right }) {
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">{titolo}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

export default function SchedaPreventivo({ preventivoId, onClose }) {
  const { openTab } = useTabs()
  const queryClient = useQueryClient()

  const { data: p, isLoading, refetch } = useQuery({
    queryKey: ['preventivo', preventivoId],
    queryFn: async () => (await api.get(`/preventivi/${preventivoId}`)).data,
    enabled: !!preventivoId,
    staleTime: 30_000,
  })

  useTabFocusRefetch(refetch)

  const invalidaCache = () => {
    queryClient.invalidateQueries({ queryKey: ['preventivo', preventivoId] })
    queryClient.invalidateQueries({ queryKey: ['preventivi'] })
  }

  const inviaMutation = useMutation({
    mutationFn: () => api.post(`/preventivi/${preventivoId}/invia`),
    onSuccess: invalidaCache,
  })

  const cambiaStatoMutation = useMutation({
    mutationFn: (stato) => api.patch(`/preventivi/${preventivoId}`, { stato }),
    onSuccess: invalidaCache,
  })

  const firmaConsensoMutation = useMutation({
    mutationFn: () => api.post(`/preventivi/${preventivoId}/firma-consenso`),
    onSuccess: invalidaCache,
  })

  if (isLoading) return <div className="p-4 text-center text-gray-400 text-sm">Caricamento...</div>
  if (!p) return <div className="p-4 text-center text-gray-400 text-sm">Preventivo non trovato</div>

  const apriModifica = () => {
    openTab(`Preventivo ${p.numero}`, FormPreventivo, { preventivo: p }, 'preventivo')
  }

  const apriNuovaVersione = () => {
    openTab(`Nuova versione — ${p.numero}`, FormPreventivo, { template: p }, 'preventivo')
  }

  const puoModificare = p.stato === 'bozza' || p.stato === 'inviato'
  const motivoNonModificabile = {
    accettato: 'Preventivo accettato dal paziente: per cambiarlo crea una nuova versione',
    rifiutato: 'Preventivo rifiutato: crea una nuova versione per ripresentarne uno aggiornato',
    scaduto:   'Preventivo scaduto: crea una nuova versione',
  }[p.stato]

  return (
    <div className="p-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs text-gray-500 uppercase">Preventivo</p>
          <h1 className="text-lg font-bold text-gray-900">{p.numero}</h1>
          <p className="text-sm text-gray-600">
            {p.paziente_cognome} {p.paziente_nome}
            {p.dentista_cognome && <> • <span className="text-gray-500">Operatore: {p.dentista_cognome} {p.dentista_nome}</span></>}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${coloreStato[p.stato] || 'bg-gray-100 text-gray-600'}`}>
              {STATI_LABEL[p.stato] || p.stato}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.consenso_firmato ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {p.consenso_firmato ? '✓ Consenso firmato' : '✗ Consenso mancante'}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={apriModifica}
            disabled={!puoModificare}
            title={puoModificare ? 'Modifica i dati e le voci del preventivo' : motivoNonModificabile}
            className={`px-3 py-1.5 text-sm rounded-lg text-white ${
              puoModificare
                ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                : 'bg-gray-300 cursor-not-allowed'
            }`}>
            Modifica preventivo
          </button>
        </div>
      </div>

      <Sezione titolo="Dati preventivo">
        <Riga etichetta="Paziente" valore={`${p.paziente_cognome} ${p.paziente_nome}`} />
        <Riga etichetta="Operatore" valore={p.dentista_cognome ? `${p.dentista_cognome} ${p.dentista_nome}` : null} />
        <Riga etichetta="Descrizione" valore={p.descrizione} />
        <Riga etichetta="Note" valore={p.note} />
        <Riga etichetta="Data emissione" valore={p.data_emissione ? dayjs(p.data_emissione).format('DD/MM/YYYY') : null} />
        <Riga etichetta="Scadenza" valore={p.data_scadenza ? dayjs(p.data_scadenza).format('DD/MM/YYYY') : null} />
        <Riga etichetta="Consenso firmato" valore={p.consenso_firmato ? `Sì${p.data_firma_consenso ? ` (${dayjs(p.data_firma_consenso).format('DD/MM/YYYY')})` : ''}` : 'No'} />
      </Sezione>

      <Sezione titolo={`Voci (${p.voci?.length ?? 0})`}>
        {!p.voci?.length ? (
          <p className="text-sm text-gray-400">Nessuna voce</p>
        ) : (
          <div className="tbl-card !w-full">
            <table className="tbl w-full">
              <thead className="tbl-thead">
                <tr>
                  <th className="tbl-th">Descrizione</th>
                  <th className="tbl-th !text-right">Q.tà</th>
                  <th className="tbl-th !text-right">Prezzo</th>
                  <th className="tbl-th !text-right">IVA</th>
                  <th className="tbl-th !text-right">Sconto %</th>
                  <th className="tbl-th !text-right">Totale</th>
                </tr>
              </thead>
              <tbody className="tbl-tbody">
                {p.voci.map(v => (
                  <tr key={v.id}>
                    <td className="tbl-td text-gray-800">{v.descrizione}</td>
                    <td className="tbl-td text-right text-gray-600">{Number(v.quantita)}</td>
                    <td className="tbl-td text-right text-gray-600">€{Number(v.prezzo_unitario).toFixed(2)}</td>
                    <td className="tbl-td text-right text-gray-600">{Number(v.aliquota_iva)}%</td>
                    <td className="tbl-td text-right text-gray-600">{Number(v.sconto_percentuale ?? 0)}%</td>
                    <td className="tbl-td text-right font-medium text-gray-900">€{Number(v.totale_voce).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan={5} className="tbl-td text-right text-xs text-gray-600">Imponibile</td>
                  <td className="tbl-td text-right text-sm">€{Number(p.totale_imponibile).toFixed(2)}</td>
                </tr>
                <tr>
                  <td colSpan={5} className="tbl-td text-right text-xs text-gray-600">IVA</td>
                  <td className="tbl-td text-right text-sm">€{Number(p.totale_iva).toFixed(2)}</td>
                </tr>
                <tr>
                  <td colSpan={5} className="tbl-td text-right text-sm font-semibold">Totale</td>
                  <td className="tbl-td text-right text-sm font-semibold text-gray-900">€{Number(p.totale).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Sezione>

      {/* Transizioni di stato */}
      <Sezione titolo="Azioni">
        <div className="flex gap-2 flex-wrap">
          {p.stato === 'bozza' && (
            <button onClick={() => inviaMutation.mutate()}
              disabled={inviaMutation.isPending}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg">
              Invia al paziente
            </button>
          )}
          {p.stato === 'inviato' && (
            <>
              <button onClick={() => cambiaStatoMutation.mutate('accettato')}
                disabled={cambiaStatoMutation.isPending}
                className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg">
                Accetta
              </button>
              <button onClick={() => cambiaStatoMutation.mutate('rifiutato')}
                disabled={cambiaStatoMutation.isPending}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg">
                Rifiuta
              </button>
            </>
          )}
          {!p.consenso_firmato && p.stato !== 'rifiutato' && p.stato !== 'scaduto' && (
            <button onClick={() => firmaConsensoMutation.mutate()}
              disabled={firmaConsensoMutation.isPending}
              className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg">
              Firma consenso
            </button>
          )}
          <button onClick={apriNuovaVersione}
            title="Crea un nuovo preventivo per lo stesso piano di cura, copiando le voci come punto di partenza"
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg border border-gray-300">
            Crea nuova versione
          </button>
        </div>
      </Sezione>
    </div>
  )
}
