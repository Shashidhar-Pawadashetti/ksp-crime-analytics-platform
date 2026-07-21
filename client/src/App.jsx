import { useEffect, lazy, Suspense } from 'react'
import { useAuth } from './hooks/useAuth'
import { useUI } from './hooks/useUI'
import Sidebar from './components/Layout/Sidebar'
import ChatArea from './components/Chat/ChatArea'
import EvidencePanel from './components/Citations/EvidencePanel'
import DashboardView from './components/Dashboard/DashboardView'

// Lazy-loaded stubs for views created in subsequent plans
const GraphView = lazy(() => import('./components/Graph/GraphView'))
const HotspotMapView = lazy(() => import('./components/Dashboard/hotspot/HotspotMapView'))

function ViewFallback() {
  return <div className="flex h-full items-center justify-center text-foreground/40 font-body">Loading view...</div>
}

function App() {
  const { isAuthenticated, isLoading, dispatch, employee, login } = useAuth()
  const { evidencePanelOpen, activeView } = useUI()
  const skipAuth = import.meta.env.VITE_SKIP_AUTH === 'true'

  useEffect(() => {
    if (skipAuth && !employee) {
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          employee: { employee_id: 'DEV001', name: 'Dev User', rank: 'Developer', unit: 'Development' },
          sessionToken: null,
          sessionId: 'mock_session_001'
        }
      })
    }
  }, [skipAuth, employee, dispatch])

  const canAccess = skipAuth || isAuthenticated

  if (!skipAuth && isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-dominant text-foreground font-body">
        Loading...
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-dominant">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {canAccess ? (
          <div className="h-full w-full">
            {activeView === 'chat' && (
              <div className="animate-[fade-in_200ms_ease-out] h-full">
                <ChatArea />
              </div>
            )}
            {activeView === 'dashboard' && (
              <div className="animate-[fade-in_200ms_ease-out] h-full">
                <DashboardView />
              </div>
            )}
            {activeView === 'graph' && (
              <div className="animate-[fade-in_200ms_ease-out] h-full">
                <Suspense fallback={<ViewFallback />}>
                  <GraphView />
                </Suspense>
              </div>
            )}
            {activeView === 'hotspots' && (
              <div className="animate-[fade-in_200ms_ease-out] h-full">
                <Suspense fallback={<ViewFallback />}>
                  <HotspotMapView />
                </Suspense>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <h1 className="font-heading text-[28px] font-semibold text-foreground">KSP Crime Analytics</h1>
            <p className="font-body text-sm text-foreground/70">Please log in to access the crime database query interface.</p>
            <button
              className="rounded-md bg-accent px-6 py-2 font-body text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              onClick={login}
            >
              Log In with Catalyst Account
            </button>
          </div>
        )}
      </main>
      <EvidencePanel />
    </div>
  )
}

export default App
