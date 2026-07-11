import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthContext } from '../contexts/AuthContext';
import { ChatContext } from '../contexts/ChatContext';
import EmptyState from '../components/Chat/EmptyState';

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
  messages: [],
  isLoading: false,
  error: null,
  sendMessage: vi.fn(),
  dispatch: vi.fn()
};

function renderEmptyState(authOverrides = {}, chatOverrides = {}) {
  return render(
    <AuthContext.Provider value={{ ...mockAuth, ...authOverrides }}>
      <ChatContext.Provider value={{ ...mockChat, ...chatOverrides }}>
        <EmptyState />
      </ChatContext.Provider>
    </AuthContext.Provider>
  );
}

describe('EmptyState', () => {
  test('renders welcome heading', () => {
    renderEmptyState();
    expect(screen.getByText(/Ask a question about KSP crime data/i)).toBeInTheDocument();
  });

  test('renders example queries', () => {
    renderEmptyState();
    // Use getAllByText since "How many FIRs" appears in both the description and list
    const howManyFirs = screen.getAllByText(/How many FIRs/i);
    expect(howManyFirs.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
    expect(screen.getByText(/FIR-2024-001/i)).toBeInTheDocument();
    expect(screen.getByText(/pending investigation/i)).toBeInTheDocument();
  });

  test('renders "Try asking" heading', () => {
    renderEmptyState();
    expect(screen.getByText('Try asking:')).toBeInTheDocument();
  });

  test('example queries are clickable', () => {
    const sendMessage = vi.fn();
    renderEmptyState({}, { sendMessage });
    // Pick the first example query list item (not the description text)
    const queryEls = screen.getAllByText(/How many FIRs/i);
    // Click the one inside a <li> (the example query card, not the description)
    const liEl = queryEls.find(el => el.closest('li'));
    expect(liEl).toBeDefined();
    liEl.click();
    expect(sendMessage).toHaveBeenCalled();
  });
});
