import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { Loader2 } from "lucide-react"

import { useAuthStore } from "../store/authStore"

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)
  const isInitialized = useAuthStore(state => state.isInitialized)
  const location = useLocation()

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}
