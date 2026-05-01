import { createContext, useState, useEffect, useCallback } from 'react'
import { authService } from '../services/authService'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [utente, setUtente] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const utenteLocale = authService.getUtenteLocale()
    if (utenteLocale) {
      setUtente(utenteLocale)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const handler = () => setUtente(null)
    window.addEventListener('dental-auth-expired', handler)
    return () => window.removeEventListener('dental-auth-expired', handler)
  }, [])

  const login = useCallback(async (username, password) => {
    const data = await authService.login(username, password)
    setUtente(data)
    return data
  }, [])

  const logout = useCallback(async () => {
    await authService.logout()
    setUtente(null)
  }, [])

  const hasRole = useCallback((ruolo) => {
    return utente?.ruoli?.includes(ruolo) ?? false
  }, [utente])

  const isAdmin = useCallback(() => hasRole('admin'), [hasRole])
  const isDentista = useCallback(() => hasRole('dentista'), [hasRole])
  const isSegreteria = useCallback(() => hasRole('segreteria'), [hasRole])

  return (
    <AuthContext.Provider value={{
      utente,
      loading,
      login,
      logout,
      hasRole,
      isAdmin,
      isDentista,
      isSegreteria,
      isAuthenticated: !!utente
    }}>
      {children}
    </AuthContext.Provider>
  )
}