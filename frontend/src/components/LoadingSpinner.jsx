export default function LoadingSpinner({ testo = 'Caricamento...' }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50" role="status" aria-live="polite" aria-label={testo}>
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" aria-hidden="true"></div>
      <p className="text-gray-500 text-sm" aria-hidden="true">{testo}</p>
    </div>
  )
}
