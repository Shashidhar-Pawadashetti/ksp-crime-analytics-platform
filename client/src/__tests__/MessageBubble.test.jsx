import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { UIContext } from '../contexts/UIContext';
import MessageBubble from '../components/Chat/MessageBubble';

// Wrap in UIContext.Provider because MessageBubble renders CitationLink
// which uses useUI() hook internally.
const uiValue = {
  dispatch: vi.fn(),
  evidencePanelOpen: false,
  activeCitation: null,
  sidebarOpen: true,
  activeView: 'chat'
};

const userMessage = {
  id: '1',
  role: 'user',
  content: 'How many FIRs were registered last month?',
  timestamp: Date.now()
};

const assistantMessage = {
  id: '2',
  role: 'assistant',
  content: 'There were 150 FIRs registered in June 2026.',
  intent: 'structured',
  confidence: 0.92,
  source_refs: ['CaseMasterID:123', 'CaseMasterID:456'],
  risk_score: null,
  data: [{ count: 150, month: 'June 2026' }],
  timestamp: Date.now()
};

function renderWithUI(component) {
  return render(
    <UIContext.Provider value={uiValue}>
      {component}
    </UIContext.Provider>
  );
}

describe('MessageBubble', () => {
  test('renders user message with content and sender label', () => {
    renderWithUI(<MessageBubble message={userMessage} />);
    expect(screen.getByText('How many FIRs were registered last month?')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  test('renders assistant message with sender label and content', () => {
    renderWithUI(<MessageBubble message={assistantMessage} />);
    expect(screen.getByText('KSP AI Assistant')).toBeInTheDocument();
    expect(screen.getByText(/150 FIRs/)).toBeInTheDocument();
  });

  test('shows intent tag for assistant messages', () => {
    renderWithUI(<MessageBubble message={assistantMessage} />);
    expect(screen.getByText('Structured Query')).toBeInTheDocument();
  });

  test('shows confidence badge with percentage', () => {
    renderWithUI(<MessageBubble message={assistantMessage} />);
    expect(screen.getByText('92% confidence')).toBeInTheDocument();
  });

  test('shows data table for structured responses', () => {
    renderWithUI(<MessageBubble message={assistantMessage} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('count')).toBeInTheDocument();
  });

  test('does not show intent/confidence for user messages', () => {
    renderWithUI(<MessageBubble message={userMessage} />);
    expect(screen.queryByText('Structured Query')).toBeNull();
    expect(screen.queryByText(/confidence/)).toBeNull();
  });

  test('shows risk score when present', () => {
    const riskMessage = {
      ...assistantMessage,
      risk_score: 7.5,
      severity: 'High',
      factors: []
    };
    renderWithUI(<MessageBubble message={riskMessage} />);
    expect(screen.getByText(/Risk Score/)).toBeInTheDocument();
    expect(screen.getByText(/7.5/)).toBeInTheDocument();
    expect(screen.getByText(/High/)).toBeInTheDocument();
  });

  test('shows citations when source_refs present', () => {
    renderWithUI(<MessageBubble message={assistantMessage} />);
    expect(screen.getByText(/Sources/)).toBeInTheDocument();
    expect(screen.getByText('[1]')).toBeInTheDocument();
    expect(screen.getByText('[2]')).toBeInTheDocument();
  });
});
