import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthContext } from '../contexts/AuthContext';
import { ChatContext } from '../contexts/ChatContext';
import { UIContext } from '../contexts/UIContext';
import { DashboardProvider } from '../contexts/DashboardContext';
import ChatArea from '../components/Chat/ChatArea';

const mockAuth = {
  employee: { employee_id: 'E001', name: 'Test Officer' },
  sessionId: 'sess_abc',
  isAuthenticated: true,
  isLoading: false,
  dispatch: vi.fn(),
  login: vi.fn(),
  logout: vi.fn()
};

const mockChat = {
  messages: [
    { id: '1', role: 'user', content: 'How many FIRs?', timestamp: Date.now() },
    { id: '2', role: 'assistant', content: '150 FIRs in June 2026.', intent: 'structured', confidence: 0.92, source_refs: [], timestamp: Date.now() }
  ],
  isLoading: false,
  error: null,
  sendMessage: vi.fn(),
  dispatch: vi.fn()
};

const mockUI = {
  sidebarOpen: true,
  evidencePanelOpen: false,
  activeCitation: null,
  activeView: 'chat',
  closeEvidence: vi.fn(),
  dispatch: vi.fn()
};

function renderChatArea(authOverrides = {}, chatOverrides = {}, uiOverrides = {}) {
  return render(
    <AuthContext.Provider value={{ ...mockAuth, ...authOverrides }}>
      <ChatContext.Provider value={{ ...mockChat, ...chatOverrides }}>
        <UIContext.Provider value={{ ...mockUI, ...uiOverrides }}>
          <DashboardProvider>
            <ChatArea />
          </DashboardProvider>
        </UIContext.Provider>
      </ChatContext.Provider>
    </AuthContext.Provider>
  );
}

describe('ChatArea', () => {
  test('renders messages', () => {
    renderChatArea();
    expect(screen.getByText('How many FIRs?')).toBeInTheDocument();
    expect(screen.getByText(/150 FIRs/)).toBeInTheDocument();
  });

  test('shows New messages button when scrolled up from bottom', () => {
    renderChatArea();
    const container = document.querySelector('.overflow-y-auto');
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 500 });
    Object.defineProperty(container, 'scrollTop', { configurable: true, value: 0 });
    fireEvent.scroll(container);
    expect(screen.getByText('New messages')).toBeInTheDocument();
  });

  test('hides New messages button when near bottom', () => {
    renderChatArea();
    const container = document.querySelector('.overflow-y-auto');
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 500 });
    Object.defineProperty(container, 'scrollTop', { configurable: true, value: 1900 });
    fireEvent.scroll(container);
    expect(screen.queryByText('New messages')).toBeNull();
  });

  test('does not show New messages button when no messages exist', () => {
    renderChatArea({}, { messages: [] });
    expect(screen.queryByText('New messages')).toBeNull();
  });

  test('shows empty state when no messages and not loading', () => {
    renderChatArea({}, { messages: [], isLoading: false });
    expect(screen.getByText(/Ask a question about KSP crime data/i)).toBeInTheDocument();
  });

  test('does not show empty state when messages exist', () => {
    renderChatArea();
    expect(screen.queryByText(/Ask a question about KSP crime data/i)).toBeNull();
  });
});
