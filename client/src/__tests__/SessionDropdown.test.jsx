import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import SessionDropdown from '../components/Chat/SessionDropdown';

const mockSessions = [
  { session_id: 's1', title: 'How many FIRs?', created_at: '2026-07-25T10:00:00Z', last_activity: '2026-07-25T10:30:00Z', message_count: 3 },
  { session_id: 's2', title: 'Tell me about theft', created_at: '2026-07-25T11:00:00Z', last_activity: '2026-07-25T11:30:00Z', message_count: 1 },
  { session_id: 's3', title: null, created_at: '2026-07-25T12:00:00Z', last_activity: '2026-07-25T12:00:00Z', message_count: 0 }
];

describe('SessionDropdown', () => {
  test('renders select trigger with placeholder when no active session', () => {
    render(
      <SessionDropdown
        sessions={mockSessions}
        activeSessionId={null}
        onSwitch={vi.fn()}
        onNewChat={vi.fn()}
      />
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  test('shows session titles in popup when trigger is clicked', () => {
    render(
      <SessionDropdown
        sessions={mockSessions}
        activeSessionId={null}
        onSwitch={vi.fn()}
        onNewChat={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByText('How many FIRs?')).toBeInTheDocument();
    expect(screen.getByText('Tell me about theft')).toBeInTheDocument();
    expect(screen.getByText('New Chat')).toBeInTheDocument();
  });

  test('shows "New conversation" for untitled sessions', () => {
    render(
      <SessionDropdown
        sessions={mockSessions}
        activeSessionId={null}
        onSwitch={vi.fn()}
        onNewChat={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByText('New conversation')).toBeInTheDocument();
  });

  test('hidden input has active session value', () => {
    render(
      <SessionDropdown
        sessions={mockSessions}
        activeSessionId="s1"
        onSwitch={vi.fn()}
        onNewChat={vi.fn()}
      />
    );
    const hiddenInput = document.querySelector('input[aria-hidden="true"]');
    expect(hiddenInput).toBeInTheDocument();
    expect(hiddenInput.value).toBe('s1');
  });
});
