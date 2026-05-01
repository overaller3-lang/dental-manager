import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
})

// Refresh dati al cambio tab: TabContext emette `dental-tab-activated` ad ogni
// switch; invalidando tutte le query, react-query rifa il fetch solo di quelle
// effettivamente montate sul tab che si sta aprendo. Garantisce che dashboard
// e pagine mostrino sempre dati allineati alle ultime modifiche.
if (typeof window !== 'undefined') {
  window.addEventListener('dental-tab-activated', () => {
    queryClient.invalidateQueries()
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)