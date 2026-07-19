import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthContext } from '../contexts/AuthContext';
import { ChatContext } from '../contexts/ChatContext';
import ErrorMessage from '../components/Chat/ErrorMessage';

const mockAuth = {
  employee: { employee_id: 'E001' },
  sessionToken: null,
  sessionId: 'sess_abc',
  isAuthenticated: true,
  isLoading: false,
  dispatch: vi.fn(),
  login: vi.fn(),
  logout: vi.fn()
};

function renderErrorMessage(chatOverrides = {}) {
  const defaultChat = {
    sessionId: 'sess_abc',
    error: { message: 'Server error', errorCode: 'PIPELINE_ERROR', fallback: 'Please try again.', query: 'FIRs?' },
    dispatch: vi.fn(),
    sendMessage: vi.fn(),
    isLoading: false,
    messages: []
  };
  return render(
    <AuthContext.Provider value={mockAuth}>
      <ChatContext.Provider value={{ ...defaultChat, ...chatOverrides }}>
        <ErrorMessage />
      </ChatContext.Provider>
    </AuthContext.Provider>
  );
}

describe('ErrorMessage', () => {
  test('renders error message with fallback text', () => {
    renderErrorMessage();
    expect(screen.getByText(/Please try again/)).toBeInTheDocument();
  });

  test('renders "Error" heading', () => {
    renderErrorMessage();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  test('retry button calls CLEAR_ERROR and sendMessage', () => {
    const dispatch = vi.fn();
    const sendMessage = vi.fn();
    renderErrorMessage({ dispatch, sendMessage });
    fireEvent.click(screen.getByText('Retry'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_ERROR' });
    expect(sendMessage).toHaveBeenCalledWith('FIRs?', 'E001', 'sess_abc', null);
  });

  test('returns null when no error', () => {
    const { container } = renderErrorMessage({ error: null });
    expect(container.firstChild).toBeNull();
  });
});
