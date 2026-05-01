import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from './LoadingSpinner'

export default function ProtectedRoute({ children, ruoliRichiesti = [] }) {
  const { isAuthenticated, loading, hasRole } = useAuth()

  if (loading) return <LoadingSpinner />

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (ruoliRichiesti.length > 0 && !ruoliRichiesti.some(r => hasRole(r))) {
    return <Navigate to="/" replace />
  }

  return children
}