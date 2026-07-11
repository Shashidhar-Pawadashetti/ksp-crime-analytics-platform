import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import ChatInput from '../components/Chat/ChatInput';

describe('ChatInput', () => {
  test('renders textarea and send button', () => {
    render(<ChatInput onSend={() => {}} isLoading={false} />);
    expect(screen.getByPlaceholderText(/ask a question/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  test('send button disabled when input empty', () => {
    render(<ChatInput onSend={() => {}} isLoading={false} />);
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  test('send button enabled when input has text', () => {
    render(<ChatInput onSend={() => {}} isLoading={false} />);
    const input = screen.getByPlaceholderText(/ask a question/i);
    fireEvent.change(input, { target: { value: 'How many FIRs?' } });
    expect(screen.getByRole('button', { name: /send/i })).toBeEnabled();
  });

  test('calls onSend on Enter press', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isLoading={false} />);
    const input = screen.getByPlaceholderText(/ask a question/i);
    fireEvent.change(input, { target: { value: 'How many FIRs?' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
    expect(onSend).toHaveBeenCalledWith('How many FIRs?');
  });

  test('send button disabled when isLoading', () => {
    render(<ChatInput onSend={() => {}} isLoading={true} />);
    const input = screen.getByPlaceholderText(/ask a question/i);
    fireEvent.change(input, { target: { value: 'test' } });
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  test('Shift+Enter inserts newline, does not submit', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isLoading={false} />);
    const input = screen.getByPlaceholderText(/ask a question/i);
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  test('clears input after submit', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isLoading={false} />);
    const input = screen.getByPlaceholderText(/ask a question/i);
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('');
  });

  test('textarea is disabled when isLoading', () => {
    render(<ChatInput onSend={() => {}} isLoading={true} />);
    expect(screen.getByPlaceholderText(/ask a question/i)).toBeDisabled();
  });
});
