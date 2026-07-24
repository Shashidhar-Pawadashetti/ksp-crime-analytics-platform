import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthContext } from '../contexts/AuthContext';
import { ChatContext } from '../contexts/ChatContext';
import { UIContext } from '../contexts/UIContext';
import App from '../App';

function renderApp(authOverrides = {}, uiOverrides = {}, chatOverrides = {}) {
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
    closeEvidence: vi.fn(),
    dispatch: vi.fn()
  };
  const defaultChat = {
    messages: [],
    isLoading: false,
    error: null,
    sendMessage: vi.fn(),
    dispatch: vi.fn()
  };
  return render(
    <AuthContext.Provider value={{ ...defaultAuth, ...authOverrides }}>
      <ChatContext.Provider value={{ ...defaultChat, ...chatOverrides }}>
        <UIContext.Provider value={{ ...defaultUI, ...uiOverrides }}>
          <App />
        </UIContext.Provider>
      </ChatContext.Provider>
    </AuthContext.Provider>
  );
}

describe('App', () => {
  test('renders app container', () => {
    renderApp();
    // App renders a div with flex h-screen overflow-hidden bg-dominant classes
    const appContainer = document.querySelector('.flex.h-screen.overflow-hidden');
    expect(appContainer).toBeInTheDocument();
  });

  test('shows login prompt when not authenticated', () => {
    renderApp({ isAuthenticated: false, isLoading: false });
    expect(screen.getByText(/Log In with Catalyst Account/i)).toBeInTheDocument();
    expect(screen.getByText(/Please log in/i)).toBeInTheDocument();
  });

  test('shows chat area when authenticated', () => {
    renderApp({
      isAuthenticated: true,
      isLoading: false,
      employee: { employee_id: 'E001', name: 'Officer' }
    });
    // ChatArea renders EmptyState which shows "Ask a question about KSP crime data"
    expect(screen.getByText(/Ask a question about KSP crime data/i)).toBeInTheDocument();
  });

  test('renders app title in sidebar and main area', () => {
    renderApp();
    // "KSP Crime Analytics" appears in both the sidebar heading and login prompt
    const titles = screen.getAllByText(/KSP Crime Analytics/i);
    expect(titles.length).toBeGreaterThanOrEqual(2);
  });

  test('shows evidence panel when evidencePanelOpen', () => {
    renderApp(
      { isAuthenticated: true, isLoading: false, employee: { employee_id: 'E001' } },
      { evidencePanelOpen: true, activeCitation: { index: 1, reference: 'CaseMasterID:123' } }
    );
    expect(screen.getByText(/Source Evidence/i)).toBeInTheDocument();
  });

  test('does not show evidence panel when closed', () => {
    renderApp({}, { evidencePanelOpen: false });
    expect(screen.queryByText(/Source Evidence/i)).toBeNull();
  });

  test('shows loading state while checking auth', () => {
    renderApp({ isLoading: true });
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('shows login prompt for unauthenticated user', () => {
    renderApp({ isAuthenticated: false, isLoading: false });
    // "Log In" appears in both sidebar and main area buttons
    const logInButtons = screen.getAllByRole('button', { name: /log in/i });
    expect(logInButtons.length).toBeGreaterThanOrEqual(2);
  });
});
