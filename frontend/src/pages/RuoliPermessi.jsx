import { useState, useEffect, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuth } from '../hooks/useAuth'

const TIPO_RUOLO = {
  admin: { label: 'Sistema', color: 'bg-red-100 text-red-700' },
  titolare: { label: 'Direzione', color: 'bg-purple-100 text-purple-700' },
  dir_sanitario: { label: 'Direzione', color: 'bg-purple-100 text-purple-700' },
  clinic_manager: { label: 'Direzione', color: 'bg-purple-100 text-purple-700' },
  dentista: { label: 'Sanitario', color: 'bg-blue-100 text-blue-700' },
  igienista: { label: 'Sanitario', color: 'bg-blue-100 text-blue-700' },
  ortodontista: { label: 'Sanitario', color: 'bg-blue-100 text-blue-700' },
  endodontista: { label: 'Sanitario', color: 'bg-blue-100 text-blue-700' },
  parodontologo: { label: 'Sanitario', color: 'bg-blue-100 text-blue-700' },
  medico_estetico: { label: 'Sanitario', color: 'bg-blue-100 text-blue-700' },
  protesista: { label: 'Sanitario', color: 'bg-blue-100 text-blue-700' },
  aso: { label: 'Sanitario', color: 'bg-blue-100 text-blue-700' },
  segreteria: { label: 'Amministrativo', color: 'bg-green-100 text-green-700' },
  segretario: { label: 'Amministrativo', color: 'bg-green-100 text-green-700' },
  amministrativo: { label: 'Amministrativo', color: 'bg-green-100 text-green-700' },
  contabile: { label: 'Amministrativo', color: 'bg-green-100 text-green-700' },
  paziente: { label: 'Paziente', color: 'bg-yellow-100 text-yellow-700' },
  laboratorista: { label: 'Supporto', color: 'bg-orange-100 text-orange-700' },
  marketing: { label: 'Supporto', color: 'bg-orange-100 text-orange-700' },
  it_support: { label: 'Supporto', color: 'bg-orange-100 text-orange-700' },
  addetto_pulizie: { label: 'Supporto', color: 'bg-gray-100 text-gray-500' },
}

function getTipo(nome) {
  return TIPO_RUOLO[nome] || { label: 'Altro', color: 'bg-gray-100 text-gray-600' }
}

export default function RuoliPermessi() {
  const [ruoloSelezionato, setRuoloSelezionato] = useState(null)
  const [modificheLocali, setModificheLocali] = useState({})
  const [modificaAttiva, setModificaAttiva] = useState(false)
  const [sortRuoli, setSortRuoli] = useState('asc')
  const [sortRuoliBy, setSortRuoliBy] = useState('nome')
  const queryClient = useQueryClient()
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin')

  useEffect(() => {
    setModificheLocali({})
    setModificaAttiva(false)
  }, [ruoloSelezionato])

  const { data: ruoli, isLoading: loadingRuoli } = useQuery({
    queryKey: ['ruoli'],
    queryFn: async () => {
      const res = await api.get('/ruoli')
      return res.data
    }
  })

  const { data: dettagli, isLoading: loadingDettagli } = useQuery({
    queryKey: ['ruolo-privilegi', ruoloSelezionato],
    queryFn: async () => {
      const res = await api.get(`/ruoli/${ruoloSelezionato}/privilegi`)
      return res.data
    },
    enabled: !!ruoloSelezionato
  })

  const salvaMutation = useMutation({
    mutationFn: (dati) => api.put(`/ruoli/${ruoloSelezionato}/privilegi`, dati),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ruolo-privilegi', ruoloSelezionato] })
      setModificaAttiva(false)
      setModificheLocali({})
    }
  })

  const getPrivilegio = (funzioneId, campo) => {
    if (funzioneId in modificheLocali) return modificheLocali[funzioneId][campo]
    const p = dettagli?.privilegi?.find(pr => pr.funzione_id === funzioneId)
    return p ? p[campo] : false
  }

  const togglePrivilegio = (funzioneId, campo) => {
    setModificheLocali(prev => {
      const p = dettagli?.privilegi?.find(pr => pr.funzione_id === funzioneId)
      const current = prev[funzioneId] || {
        can_read: p?.can_read ?? false,
        can_write: p?.can_write ?? false,
        can_delete: p?.can_delete ?? false,
      }
      return { ...prev, [funzioneId]: { ...current, [campo]: !current[campo] } }
    })
  }

  const handleSalva = () => {
    if (!dettagli) return
    const privilegi = dettagli.privilegi.map(p => ({
      funzione_id: p.funzione_id,
      can_read: modificheLocali[p.funzione_id]?.can_read ?? p.can_read,
      can_write: modificheLocali[p.funzione_id]?.can_write ?? p.can_write,
      can_delete: modificheLocali[p.funzione_id]?.can_delete ?? p.can_delete,
    }))
    salvaMutation.mutate({ privilegi })
  }

  const [sortPriv, setSortPriv] = useState('asc')
  const toggleSortPriv = () => setSortPriv(d => d === 'asc' ? 'desc' : 'asc')

  const moduli = dettagli ? [...new Set(dettagli.privilegi.map(p => p.funzione_modulo))] : []

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ruoli e Permessi</h1>
          <p className="text-gray-500 text-xs mt-0.5">Gestione dei ruoli e delle autorizzazioni per modulo</p>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* Lista ruoli */}
        <div className="w-72 shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Ruoli disponibili</h2>
              <p className="text-xs text-gray-400 mt-0.5">{ruoli?.length ?? 0} ruoli</p>
            </div>
            {loadingRuoli ? (
              <div className="py-8 text-center text-gray-400 text-sm">Caricamento...</div>
            ) : (
              <>
              <div className="flex items-center border-b border-gray-200 bg-gray-100 text-xs font-medium text-gray-700 uppercase divide-x divide-gray-200">
                <button className="flex-1 text-left px-3 py-2 hover:bg-gray-200 select-none flex items-center gap-1"
                  onClick={() => { setSortRuoliBy('nome'); setSortRuoli(d => sortRuoliBy === 'nome' ? (d === 'asc' ? 'desc' : 'asc') : 'asc') }}>
                  Ruolo
                  <span className={`text-[10px] cursor-pointer ${sortRuoliBy === 'nome' ? 'text-blue-500' : 'text-gray-300'}`}>
                    {sortRuoliBy === 'nome' ? (sortRuoli === 'asc' ? '▲' : '▼') : '⇅'}
                  </span>
                </button>
                <button className="w-24 text-left px-3 py-2 hover:bg-gray-200 select-none flex items-center gap-1"
                  onClick={() => { setSortRuoliBy('tipo'); setSortRuoli(d => sortRuoliBy === 'tipo' ? (d === 'asc' ? 'desc' : 'asc') : 'asc') }}>
                  Tipo
                  <span className={`text-[10px] cursor-pointer ${sortRuoliBy === 'tipo' ? 'text-blue-500' : 'text-gray-300'}`}>
                    {sortRuoliBy === 'tipo' ? (sortRuoli === 'asc' ? '▲' : '▼') : '⇅'}
                  </span>
                </button>
              </div>
              <ul className="divide-y divide-gray-50 max-h-[calc(100vh-250px)] overflow-y-auto">
                {[...(ruoli ?? [])].sort((a, b) => {
                  const va = sortRuoliBy === 'tipo' ? getTipo(a.nome).label : a.nome
                  const vb = sortRuoliBy === 'tipo' ? getTipo(b.nome).label : b.nome
                  const cmp = va.localeCompare(vb, 'it')
                  return sortRuoli === 'asc' ? cmp : -cmp
                }).map(r => {
                  const tipo = getTipo(r.nome)
                  return (
                    <li key={r.id}>
                      <button
                        onClick={() => setRuoloSelezionato(r.id)}
                        className={`w-full text-left px-3 py-1.5 hover:bg-blue-50 transition-colors ${
                          ruoloSelezionato === r.id ? 'bg-blue-50 border-l-4 border-blue-600' : 'border-l-4 border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-800 truncate">{r.nome}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 font-medium ${tipo.color}`}>
                            {tipo.label}
                          </span>
                        </div>
                        {r.descrizione && (
                          <p className="text-xs text-gray-400 truncate">{r.descrizione}</p>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
              </>
            )}
          </div>
        </div>

        {/* Matrice permessi */}
        <div className="flex-1 min-w-0">
          {!ruoloSelezionato ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center h-64 gap-2">
              <span className="text-3xl">🔐</span>
              <p className="text-gray-400 text-sm">Seleziona un ruolo per visualizzare i permessi</p>
            </div>
          ) : loadingDettagli ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center h-64">
              <p className="text-gray-400 text-sm">Caricamento permessi...</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-gray-700">Permessi: {dettagli?.nome}</h2>
                    {dettagli && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTipo(dettagli.nome).color}`}>
                        {getTipo(dettagli.nome).label}
                      </span>
                    )}
                  </div>
                  {dettagli?.descrizione && (
                    <p className="text-xs text-gray-400 mt-0.5">{dettagli.descrizione}</p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    {modificaAttiva ? (
                      <>
                        <button
                          onClick={() => { setModificaAttiva(false); setModificheLocali({}) }}
                          className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Annulla
                        </button>
                        <button
                          onClick={handleSalva}
                          disabled={salvaMutation.isPending}
                          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {salvaMutation.isPending ? 'Salvataggio...' : 'Salva modifiche'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setModificaAttiva(true)}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Modifica permessi
                      </button>
                    )}
                  </div>
                )}
              </div>

              {salvaMutation.isError && (
                <div className="mx-4 mt-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                  Errore nel salvataggio. Riprova.
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead className="tbl-thead">
                    <tr>
                      <th scope="col" className="tbl-th tbl-th-sort" onClick={toggleSortPriv}>
                        Funzione <span className="ml-0.5 text-[10px] text-blue-500">{sortPriv === 'asc' ? '▲' : '▼'}</span>
                      </th>
                      <th scope="col" className="tbl-th !text-center w-24">Lettura</th>
                      <th scope="col" className="tbl-th !text-center w-24">Scrittura</th>
                      <th scope="col" className="tbl-th !text-center w-24">Cancella</th>
                    </tr>
                  </thead>
                  <tbody className="tbl-tbody">
                    {moduli.map(modulo => (
                      <Fragment key={modulo}>
                        <tr className="!hover:bg-gray-50">
                          <td colSpan={4} className="tbl-td bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                            {modulo}
                          </td>
                        </tr>
                        {[...( dettagli?.privilegi.filter(p => p.funzione_modulo === modulo) ?? [])]
                          .sort((a, b) => {
                            const cmp = a.funzione_nome.localeCompare(b.funzione_nome, 'it')
                            return sortPriv === 'asc' ? cmp : -cmp
                          })
                          .map(p => (
                            <tr key={p.funzione_id}>
                              <td className="tbl-td">
                                <p className="text-gray-800">{p.funzione_nome}</p>
                                {p.funzione_descrizione && (
                                  <p className="text-xs text-gray-400">{p.funzione_descrizione}</p>
                                )}
                              </td>
                              {['can_read', 'can_write', 'can_delete'].map(campo => {
                                const val = getPrivilegio(p.funzione_id, campo)
                                return (
                                  <td key={campo} className="tbl-td text-center">
                                    {modificaAttiva ? (
                                      <input
                                        type="checkbox"
                                        checked={val}
                                        onChange={() => togglePrivilegio(p.funzione_id, campo)}
                                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                                      />
                                    ) : (
                                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                                        val ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-300'
                                      }`}>
                                        {val ? '✓' : '–'}
                                      </span>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
