import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Interceptor richiesta — aggiunge il token JWT automaticamente
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Estrae un messaggio leggibile da una risposta di errore axios
const messaggioErrore = (e) => {
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail?.messaggio) return detail.messaggio
  if (Array.isArray(detail)) return detail.map(d => d.msg || JSON.stringify(d)).join('; ')
  if (detail) return JSON.stringify(detail)
  return e?.message || 'Errore sconosciuto'
}

// Interceptor risposta:
// - 401: logout automatico (preserva stato SPA via evento)
// - 409 con referenze: silenzioso (gestito da modali di eliminazione)
// - config._silent === true: silenzioso (gestito inline dal form chiamante)
// - tutto il resto: alert con messaggio per non lasciare errori muti
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem('access_token')) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('utente')
      window.dispatchEvent(new CustomEvent('dental-auth-expired'))
      return Promise.reject(error)
    }
    if (error.response?.status === 401) return Promise.reject(error)
    if (error.config?._silent) return Promise.reject(error)
    const detail = error.response?.data?.detail
    const isReferenze = error.response?.status === 409 && detail && typeof detail === 'object' && detail.referenze
    if (isReferenze) return Promise.reject(error)
    alert(`Errore: ${messaggioErrore(error)}`)
    return Promise.reject(error)
  }
)

export default api