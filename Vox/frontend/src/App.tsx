import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './auth/AuthContext'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Intake from './pages/Intake'
import Reviews from './pages/Reviews'
import CallReview from './pages/CallReview'
import Policy from './pages/Policy'
import Status from './pages/Status'
import NotFound from './pages/NotFound'
import { LogoMark } from './components/icons'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 4000,
    },
  },
})

function Splash() {
  return (
    <div className="vs-shell flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-12 w-12 animate-pulse items-center justify-center rounded-[14px] bg-primary text-white">
          <LogoMark size={24} />
        </span>
        <p className="text-[11.5px] font-medium text-muted">Checking your session…</p>
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <Splash />
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <Intake />
            </RequireAuth>
          }
        />
        <Route
          path="/app/reviews"
          element={
            <RequireAuth>
              <Reviews />
            </RequireAuth>
          }
        />
        <Route
          path="/app/calls/:callId"
          element={
            <RequireAuth>
              <CallReview />
            </RequireAuth>
          }
        />
        <Route
          path="/app/policy"
          element={
            <RequireAuth>
              <Policy />
            </RequireAuth>
          }
        />
        <Route
          path="/app/status"
          element={
            <RequireAuth>
              <Status />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </QueryClientProvider>
  )
}
