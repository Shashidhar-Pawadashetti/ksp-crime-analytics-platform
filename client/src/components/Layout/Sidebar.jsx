import { useAuth } from '../../hooks/useAuth'
import { useUI } from '../../hooks/useUI'
import { Button } from '../../components/ui/button'
import { Separator } from '../../components/ui/separator'
import { Avatar, AvatarFallback } from '../../components/ui/avatar'
import { LogOut, LogIn, Menu, X, MessageSquare, LayoutDashboard, Share2, Globe } from 'lucide-react'

function Sidebar() {
  const { isAuthenticated, employee, login, logout } = useAuth()
  const { sidebarOpen, dispatch } = useUI()

  const displayName = employee?.firstName || employee?.name || employee?.employee_id || 'Unknown Officer'
  const initials = displayName
    .split(' ')
    .map((/** @type {string} */ w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('')

  function toggleSidebar() {
    dispatch({ type: 'TOGGLE_SIDEBAR' })
  }

  return (
    <>
      {/* Mobile toggle button — visible when sidebar is collapsed */}
      {!sidebarOpen && (
        <button
          className="fixed left-2 top-2 z-50 flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-foreground/70 hover:text-foreground md:hidden"
          onClick={toggleSidebar}
          aria-label="Open sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      <aside
        className={`flex h-screen flex-col border-r border-border bg-secondary transition-all duration-200 ${
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden md:w-10 md:overflow-visible'
        }`}
      >
        {/* Header with app title */}
        <div className="flex items-center justify-between px-4 py-4">
          {sidebarOpen && (
            <h1 className="font-heading text-[20px] font-semibold text-foreground truncate">
              KSP Crime Analytics
            </h1>
          )}
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground/50 hover:bg-border hover:text-foreground"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

        {/* User section */}
        {sidebarOpen && (
          <>
            <div className="border-b border-border px-4 py-3">
              {isAuthenticated && employee ? (
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-accent text-white text-xs font-medium">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {displayName}
                    </p>
                    <p className="truncate text-xs text-foreground/60">
                      {employee.rank || ''}{employee.rank && employee.unit ? ' · ' : ''}{employee.unit || ''}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-foreground/10 text-foreground/40 text-xs">
                      ?
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-sm text-foreground/50">Not logged in</p>
                </div>
              )}
            </div>

            {/* Navigation links */}
            <nav className="flex-1 space-y-1 px-3 py-4">
              <NavItem
                icon={<MessageSquare className="h-4 w-4" />}
                label="Chat"
                active={true}
              />
              <NavItem
                icon={<LayoutDashboard className="h-4 w-4" />}
                label="Dashboard"
                badge="Coming in Phase 2"
              />
              <NavItem
                icon={<Share2 className="h-4 w-4" />}
                label="Network Graph"
                badge="Coming in Phase 2"
              />
            </nav>

            {/* Language toggle */}
            <div className="border-t border-border px-4 py-2">
              <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground/60 hover:text-foreground">
                <Globe className="h-3.5 w-3.5" />
                <span>(English)</span>
              </button>
            </div>

            <Separator />

            {/* Login/Logout button */}
            <div className="p-3">
              {isAuthenticated ? (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 text-sm"
                  onClick={logout}
                >
                  <LogOut className="h-4 w-4" />
                  Log Out
                </Button>
              ) : (
                <Button
                  className="w-full justify-start gap-2 bg-accent text-sm text-white hover:bg-accent-hover"
                  onClick={login}
                >
                  <LogIn className="h-4 w-4" />
                  Log In
                </Button>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  )
}

/**
 * Navigation item component.
 * @param {{ icon: import('react').ReactNode, label: string, active?: boolean, badge?: string }} props
 */
function NavItem({ icon, label, active, badge }) {
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
        active
          ? 'border-l-2 border-accent bg-accent/10 text-accent font-medium'
          : 'text-foreground/60 hover:bg-border hover:text-foreground'
      }`}
      disabled={!active}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <span className="text-[10px] text-foreground/40 whitespace-nowrap">{badge}</span>
      )}
    </button>
  )
}

export default Sidebar
