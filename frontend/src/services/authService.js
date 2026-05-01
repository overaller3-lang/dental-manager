import api from './api'

export const authService = {
  login: async (username, password) => {
    const response = await api.post('/auth/login', { username, password }, { _silent: true })
    const data = response.data
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('utente', JSON.stringify(data))
    return data
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      localStorage.removeItem('access_token')
      localStorage.removeItem('utente')
      // Rimuove tab aperte e filtri salvati per non esporre info della
      // sessione precedente al prossimo utente sullo stesso browser
      for (const storage of [window.localStorage, window.sessionStorage]) {
        const daRimuovere = []
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i)
          if (k && (k.startsWith('tabs.') || k.startsWith('filtri.'))) daRimuovere.push(k)
        }
        daRimuovere.forEach(k => storage.removeItem(k))
      }
    }
  },

  getMe: async () => {
    const response = await api.get('/auth/me')
    return response.data
  },

  cambiaPassword: async (passwordAttuale, nuovaPassword, confermaPassword) => {
    const response = await api.post('/auth/cambia-password', {
      password_attuale: passwordAttuale,
      nuova_password: nuovaPassword,
      conferma_password: confermaPassword,
    })
    return response.data
  },

  getUtenteLocale: () => {
    const utente = localStorage.getItem('utente')
    return utente ? JSON.parse(utente) : null
  },

  isAuthenticated: () => {
    return !!localStorage.getItem('access_token')
  },
}