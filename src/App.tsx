import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { LoadingScreen } from '@/components/loading-screen'
import { Landing } from '@/pages/Landing'
import { AuthCallback } from '@/pages/AuthCallback'
import { Onboarding } from '@/pages/Onboarding'
import { Inbox } from '@/pages/Inbox'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'

  if (loading) {
    return <LoadingScreen />
  }

  if (!user && !isDemoMode) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inbox"
          element={
            <ProtectedRoute>
              <Inbox />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
