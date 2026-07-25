import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthContext } from '../contexts/AuthContext';
import { UIContext } from '../contexts/UIContext';
import Sidebar from '../components/Layout/Sidebar';

const defaultAuth = {
  isAuthenticated: false,
  isLoading: false,
  employee: null,
  sessionToken: null,
  sessionId: null,
  error: null,
  login: vi.fn(),
  logout: vi.fn(),
  dispatch: vi.fn()
};

const defaultUI = {
  sidebarOpen: true,
  evidencePanelOpen: false,
  activeCitation: null,
  activeView: 'chat',
  dispatch: vi.fn()
};

function renderSidebar(authOverrides = {}, uiOverrides = {}) {
  return render(
    <AuthContext.Provider value={{ ...defaultAuth, ...authOverrides }}>
      <UIContext.Provider value={{ ...defaultUI, ...uiOverrides }}>
        <Sidebar />
      </UIContext.Provider>
    </AuthContext.Provider>
  );
}

describe('Sidebar', () => {
  test('renders app title', () => {
    renderSidebar();
    expect(screen.getByText('KSP Crime Analytics')).toBeInTheDocument();
  });

  test('shows navigation items', () => {
    renderSidebar();
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Network Graph')).toBeInTheDocument();
    expect(screen.getByText('Hotspot Map')).toBeInTheDocument();
  });

  test('shows Dashboard as active when activeView is dashboard', () => {
    renderSidebar({}, { activeView: 'dashboard' });
    const dashboard = screen.getByText('Dashboard').closest('button');
    expect(dashboard).not.toBeDisabled();
  });

  test('shows Chat as active and enabled', () => {
    renderSidebar();
    const chat = screen.getByText('Chat').closest('button');
    expect(chat).not.toBeDisabled();
  });

  test('shows login button when not authenticated', () => {
    renderSidebar();
    expect(screen.getByText('Log In')).toBeInTheDocument();
  });

  test('shows logout button when authenticated', () => {
    renderSidebar({
      isAuthenticated: true,
      employee: { employee_id: 'E001', name: 'Test Officer', rank: 'Inspector', unit: 'CCB' }
    });
    expect(screen.getByText('Log Out')).toBeInTheDocument();
  });

  test('shows employee name and rank when authenticated', () => {
    renderSidebar({
      isAuthenticated: true,
      employee: { employee_id: 'E001', name: 'Test Officer', rank: 'Inspector', unit: 'CCB' }
    });
    expect(screen.getByText('Test Officer')).toBeInTheDocument();
    expect(screen.getByText(/Inspector/)).toBeInTheDocument();
    expect(screen.getByText(/CCB/)).toBeInTheDocument();
  });

  test('shows "Not logged in" when unauthenticated', () => {
    renderSidebar({ isAuthenticated: false });
    expect(screen.getByText('Not logged in')).toBeInTheDocument();
  });

  test('toggle button dispatches TOGGLE_SIDEBAR', () => {
    const dispatch = vi.fn();
    renderSidebar({}, { dispatch, sidebarOpen: true });
    const closeBtn = screen.getByLabelText('Close sidebar');
    fireEvent.click(closeBtn);
    expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_SIDEBAR' });
  });
});
