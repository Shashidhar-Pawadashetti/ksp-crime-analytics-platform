import { useAuth } from './hooks/useAuth'
import { useUI } from './hooks/useUI'
import { showEmbeddedAuth } from './services/auth'
import Sidebar from './components/Layout/Sidebar'
import ChatArea from './components/Chat/ChatArea'

function App() {
  const { isAuthenticated, isLoading } = useAuth()
  const { evidencePanelOpen } = useUI()

  if (isLoading) {
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
        {isAuthenticated ? (
          <ChatArea />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <h1 className="font-heading text-[28px] font-semibold text-foreground">KSP Crime Analytics</h1>
            <p className="font-body text-sm text-foreground/70">Please log in to access the crime database query interface.</p>
            <button
              className="rounded-md bg-accent px-6 py-2 font-body text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              onClick={() => showEmbeddedAuth()}
            >
              Log In with Catalyst Account
            </button>
          </div>
        )}
      </main>
      {evidencePanelOpen && <div className="hidden">{/* EvidencePanel via shadcn Sheet in Plan 01-04 */}</div>}
    </div>
  )
}

export default App
