export default function ModalEliminaConferma({ nome, referenze, onConferma, onAnnulla, isLoading }) {
  return (
    <div className="fixed inset-0 bg-gray-900/10 flex items-center justify-center z-50" onClick={onAnnulla}>
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        {referenze ? (
          <>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Impossibile eliminare</h2>
            <p className="text-sm text-gray-600 mb-3">
              <span className="font-medium">{nome}</span> ha record collegati che devono essere rimossi prima:
            </p>
            <ul className="text-sm space-y-1 mb-4 bg-red-50 rounded-lg p-3 border border-red-100">
              {Object.entries(referenze).map(([k, v]) => (
                <li key={k} className="flex justify-between items-center">
                  <span className="text-gray-700 capitalize">{k.replace(/_/g, ' ')}</span>
                  <span className="font-bold text-red-600 ml-4">{v}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button onClick={onAnnulla} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700">
                Chiudi
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Conferma eliminazione</h2>
            <p className="text-sm text-gray-600 mb-4">
              Eliminare definitivamente <span className="font-medium">{nome}</span>?
              Questa operazione non può essere annullata.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={onAnnulla} disabled={isLoading}
                className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 disabled:opacity-50">
                Annulla
              </button>
              <button onClick={onConferma} disabled={isLoading}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 rounded-lg text-white disabled:opacity-50">
                {isLoading ? 'Eliminazione...' : 'Elimina'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
