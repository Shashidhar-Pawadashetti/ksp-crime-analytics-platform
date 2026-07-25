import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { UIContext } from '../contexts/UIContext';
import { DashboardProvider } from '../contexts/DashboardContext';
import MessageBubble from '../components/Chat/MessageBubble';

// Wrap in UIContext.Provider + DashboardProvider because MessageBubble uses
// useUI() internally and useDashboardActions() for "View in Dashboard".
const uiDispatch = vi.fn();
const uiValue = {
  dispatch: uiDispatch,
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

const analyticalMessage = {
  id: '3',
  role: 'assistant',
  content: 'Crime trends for Bengaluru Urban show a rise in theft cases.',
  intent: 'analytical',
  confidence: 0.88,
  source_refs: [],
  risk_score: null,
  data: [
    { month: 'Jan', count: 45 },
    { month: 'Feb', count: 52 },
  ],
  timestamp: Date.now()
};

function renderWithProviders(component) {
  return render(
    <UIContext.Provider value={uiValue}>
      <DashboardProvider>
        {component}
      </DashboardProvider>
    </UIContext.Provider>
  );
}

describe('MessageBubble', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders user message with content and sender label', () => {
    renderWithProviders(<MessageBubble message={userMessage} />);
    expect(screen.getByText('How many FIRs were registered last month?')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  test('renders assistant message with sender label and content', () => {
    renderWithProviders(<MessageBubble message={assistantMessage} />);
    expect(screen.getByText('KSP AI Assistant')).toBeInTheDocument();
    expect(screen.getByText(/150 FIRs/)).toBeInTheDocument();
  });

  test('shows intent tag for assistant messages', () => {
    renderWithProviders(<MessageBubble message={assistantMessage} />);
    expect(screen.getByText('Structured Query')).toBeInTheDocument();
  });

  test('shows confidence badge with percentage', () => {
    renderWithProviders(<MessageBubble message={assistantMessage} />);
    expect(screen.getByText('92% confidence')).toBeInTheDocument();
  });

  test('shows data table for structured responses', () => {
    renderWithProviders(<MessageBubble message={assistantMessage} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('count')).toBeInTheDocument();
  });

  test('does not show intent/confidence for user messages', () => {
    renderWithProviders(<MessageBubble message={userMessage} />);
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
    renderWithProviders(<MessageBubble message={riskMessage} />);
    expect(screen.getByText(/Risk Score/)).toBeInTheDocument();
    expect(screen.getByText(/7.5/)).toBeInTheDocument();
    expect(screen.getByText(/High/)).toBeInTheDocument();
  });

  test('shows citations when source_refs present', () => {
    renderWithProviders(<MessageBubble message={assistantMessage} />);
    expect(screen.getByText(/Sources/)).toBeInTheDocument();
    expect(screen.getByText('[1]')).toBeInTheDocument();
    expect(screen.getByText('[2]')).toBeInTheDocument();
  });

  // New tests for "View in Dashboard" integration (Plan 02-04)

  test('renders "View in Dashboard" for analytical intent with data', () => {
    renderWithProviders(<MessageBubble message={analyticalMessage} />);
    expect(screen.getByText('View in Dashboard')).toBeInTheDocument();
  });

  test('hides "View in Dashboard" button for non-analytical intents', () => {
    renderWithProviders(<MessageBubble message={assistantMessage} />);
    expect(screen.queryByText('View in Dashboard')).toBeNull();
  });

  test('clicking "View in Dashboard" dispatches SET_VIEW', () => {
    const msgWithLocation = {
      ...analyticalMessage,
      data: {
        ...analyticalMessage.data,
        location: 'Bengaluru Urban',
        timePeriod: { since: '2024-01-01', until: '2024-12-31' },
      },
    };
    renderWithProviders(<MessageBubble message={msgWithLocation} />);
    const button = screen.getByText('View in Dashboard');
    fireEvent.click(button);
    expect(uiDispatch).toHaveBeenCalledWith({
      type: 'SET_VIEW',
      payload: 'dashboard',
    });
  });
});
