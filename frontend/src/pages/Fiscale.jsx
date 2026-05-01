import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { usePersistedState } from '../hooks/usePersistedState'
import dayjs from 'dayjs'
import 'dayjs/locale/it'
import { useTabs } from '../context/TabContext'
import { classeEnum, labelEnum } from '../utils/colori'
dayjs.locale('it')

export function FormDettaglioDocumento({ documentoId, onClose }) {
  const { data: doc, isLoading } = useQuery({
    queryKey: ['documento-fiscale', documentoId],
    queryFn: async () => (await api.get(`/documenti-fiscali/${documentoId}`)).data,
  })

  if (isLoading) return <div className="p-6 text-gray-400">Caricamento...</div>
  if (!doc) return <div className="p-6 text-gray-400">Documento non trovato</div>

  return (
    <div className="p-4 max-w-3xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium uppercase mr-2 ${classeEnum('tipo_documento_fiscale', doc.tipo)}`}>{doc.tipo?.replace('_', ' ')}</span>
            {doc.numero}
          </h2>
          <p className="text-xs text-gray-500">
            {doc.paziente_cognome} {doc.paziente_nome} — Ordine {doc.ordine_numero || '—'} — {dayjs(doc.data_emissione).format('DD/MM/YYYY')}
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
            </tr>
          </thead>
          <tbody className="tbl-tbody">
            {doc.voci?.length ? doc.voci.map(v => (
              <tr key={v.id}>
                <td className="tbl-td text-gray-800">{v.descrizione}</td>
                <td className="tbl-td text-right text-gray-600">{Number(v.quantita)}</td>
                <td className="tbl-td text-right text-gray-600">€{Number(v.prezzo_unitario).toFixed(2)}</td>
                <td className="tbl-td text-right text-gray-600">{Number(v.aliquota_iva)}%</td>
                <td className="tbl-td text-right font-medium text-gray-900">€{Number(v.totale_voce).toFixed(2)}</td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="tbl-empty">Nessun dettaglio voci (documento generato dai totali ordine)</td></tr>
            )}
          </tbody>
          <tfoot className="bg-gray-100 border-t border-gray-300">
            <tr>
              <td colSpan={4} className="tbl-td text-right text-xs text-gray-600">Imponibile</td>
              <td className="tbl-td text-right text-sm">€{Number(doc.totale_imponibile).toFixed(2)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="tbl-td text-right text-xs text-gray-600">IVA</td>
              <td className="tbl-td text-right text-sm">€{Number(doc.totale_iva).toFixed(2)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="tbl-td text-right text-sm font-semibold text-gray-900">Totale</td>
              <td className="tbl-td text-right text-sm font-semibold text-gray-900">€{Number(doc.totale).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {doc.pagamento_id && (
        <p className="text-xs text-gray-500 mb-2">Ricevuta legata al pagamento #{doc.pagamento_id}</p>
      )}
      {doc.sdi_inviato && (
        <p className="text-xs text-green-600">✓ Inviato a SDI</p>
      )}
    </div>
  )
}

export default function Fiscale() {
  const [pagina, setPagina] = usePersistedState('fiscale.pagina', 1)
  const [filtroTipo, setFiltroTipo] = usePersistedState('fiscale.filtroTipo', '')
  const [dataDa, setDataDa] = usePersistedState('fiscale.dataDa', '')
  const [dataA, setDataA] = usePersistedState('fiscale.dataA', '')
  const [sortBy, setSortBy] = usePersistedState('fiscale.sortBy', null)
  const [sortDir, setSortDir] = usePersistedState('fiscale.sortDir', 'asc')
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

  const buildParams = () => {
    const params = new URLSearchParams({ pagina, per_pagina: 30 })
    if (filtroTipo) params.append('tipo', filtroTipo)
    if (dataDa) params.append('data_da', dataDa)
    if (dataA) params.append('data_a', dataA)
    if (sortBy) { params.append('ordina_per', sortBy); params.append('direzione', sortDir) }
    return params
  }

  const { data, isLoading } = useQuery({
    queryKey: ['documenti-fiscali', pagina, filtroTipo, dataDa, dataA, sortBy, sortDir],
    queryFn: async () => (await api.get(`/documenti-fiscali?${buildParams()}`)).data,
  })

  const { data: totali } = useQuery({
    queryKey: ['documenti-fiscali-totali', filtroTipo, dataDa, dataA],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filtroTipo) params.append('tipo', filtroTipo)
      if (dataDa) params.append('data_da', dataDa)
      if (dataA) params.append('data_a', dataA)
      const qs = params.toString()
      return (await api.get(`/documenti-fiscali/totali${qs ? `?${qs}` : ''}`)).data
    },
  })

  const haFiltri = !!(filtroTipo || dataDa || dataA)

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fiscale</h1>
          <p className="text-xs text-gray-500">Vista aggregata di fatture e ricevute emesse</p>
        </div>
      </div>

      {totali && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-sm text-gray-500">Documenti</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{totali.conteggio}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-sm text-gray-500">Imponibile</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">€{Number(totali.totale_imponibile).toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-sm text-gray-500">IVA</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">€{Number(totali.totale_iva).toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-sm text-gray-500">Totale</p>
            <p className="text-2xl font-bold text-green-600 mt-1">€{Number(totali.totale).toFixed(2)}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-3 flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Tipo</label>
          <select value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPagina(1) }}
            className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${filtroTipo ? 'filtro-attivo' : 'border-gray-300'}`}>
            <option value="">Tutti</option>
            <option value="fattura">Fatture</option>
            <option value="ricevuta">Ricevute</option>
            <option value="documento_commerciale">Documenti commerciali</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Da</label>
          <input type="date" value={dataDa} onChange={e => { setDataDa(e.target.value); setPagina(1) }}
            className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${dataDa ? 'filtro-attivo' : 'border-gray-300'}`} />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">A</label>
          <input type="date" value={dataA} onChange={e => { setDataA(e.target.value); setPagina(1) }}
            className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${dataA ? 'filtro-attivo' : 'border-gray-300'}`} />
        </div>
        {haFiltri && (
          <button onClick={() => { setFiltroTipo(''); setDataDa(''); setDataA(''); setPagina(1) }}
            className="px-3 py-2 text-xs font-medium bg-orange-100 border border-orange-700 rounded-lg hover:bg-orange-200 whitespace-nowrap">
            ↻ Reset filtri
          </button>
        )}
      </div>

      <div className="tbl-count">{data?.items?.length ?? 0} risultati{data?.totale != null && data.totale !== data?.items?.length ? ` di ${data.totale}` : ''}</div>
      <div className="tbl-card">
        {isLoading ? (
          <div className="tbl-empty">Caricamento...</div>
        ) : !data?.items?.length ? (
          <div className="tbl-empty">Nessun documento fiscale trovato</div>
        ) : (
          <table className="tbl">
            <thead className="tbl-thead">
              <tr>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('numero')}>Numero {si('numero')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('tipo')}>Tipo {si('tipo')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('paziente_cognome')}>Paziente {si('paziente_cognome')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('ordine_numero')}>Ordine {si('ordine_numero')}</th>
                <th scope="col" className="tbl-th tbl-th-sort" onClick={() => handleSort('data_emissione')}>Data {si('data_emissione')}</th>
                <th scope="col" className="tbl-th tbl-th-sort !text-right" onClick={() => handleSort('totale_imponibile')}>Imponibile {si('totale_imponibile')}</th>
                <th scope="col" className="tbl-th tbl-th-sort !text-right" onClick={() => handleSort('totale_iva')}>IVA {si('totale_iva')}</th>
                <th scope="col" className="tbl-th tbl-th-sort !text-right" onClick={() => handleSort('totale')}>Totale {si('totale')}</th>
                <th scope="col" className="tbl-th">Azioni</th>
              </tr>
            </thead>
            <tbody className="tbl-tbody">
              {/* Ordinamento server-side: backend restituisce gia' ordinato */}
              {(data?.items ?? []).map(d => (
                <tr key={d.id}>
                  <td className="tbl-td font-medium text-gray-900">{d.numero}</td>
                  <td className="tbl-td">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium uppercase ${classeEnum('tipo_documento_fiscale', d.tipo)}`}>{d.tipo?.replace('_', ' ')}</span>
                  </td>
                  <td className="tbl-td text-gray-600">{d.paziente_cognome} {d.paziente_nome}</td>
                  <td className="tbl-td text-gray-600">{d.ordine_numero || '—'}</td>
                  <td className="tbl-td text-gray-600 whitespace-nowrap">{dayjs(d.data_emissione).format('DD/MM/YYYY')}</td>
                  <td className="tbl-td text-right text-gray-600">€{Number(d.totale_imponibile).toFixed(2)}</td>
                  <td className="tbl-td text-right text-gray-600">€{Number(d.totale_iva).toFixed(2)}</td>
                  <td className="tbl-td text-right font-semibold text-gray-900">€{Number(d.totale).toFixed(2)}</td>
                  <td className="tbl-td">
                    <button onClick={() => openTab(`${d.tipo} ${d.numero}`, FormDettaglioDocumento, { documentoId: d.id }, 'documento-fiscale')}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                      Apri
                    </button>
                  </td>
                </tr>
              ))}
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
