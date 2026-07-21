import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';
import { fetchGraph, fetchDashboard } from '../services/api';
import { AuthContext } from '../contexts/AuthContext';
import { UIContext } from '../contexts/UIContext';
import GraphView from '../components/Graph/GraphView';

// Mock the api module
vi.mock('../services/api', () => ({
  fetchGraph: vi.fn(),
  fetchDashboard: vi.fn()
}));

const SAMPLE_GRAPH_DATA = {
  elements: {
    nodes: [
      { data: { id: 'PM_000001', label: 'John Doe', type: 'person' } },
      { data: { id: 'PM_000002', label: 'Jane Smith', type: 'person' } },
      { data: { id: 'CASE_001', label: 'Case 2024-001', type: 'case' } }
    ],
    edges: [
      { data: { id: 'E1', source: 'PM_000001', target: 'CASE_001', label: 'Accused in' } }
    ]
  },
  style: [],
  statistics: { nodeCount: 3, edgeCount: 1 }
};

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

const mockUI = {
  activeView: 'graph',
  sidebarOpen: true,
  evidencePanelOpen: false,
  dispatch: vi.fn()
};

function renderGraphView(authOverrides = {}, uiOverrides = {}) {
  return render(
    <AuthContext.Provider value={{ ...mockAuth, ...authOverrides }}>
      <UIContext.Provider value={{ ...mockUI, ...uiOverrides }}>
        <GraphView />
      </UIContext.Provider>
    </AuthContext.Provider>
  );
}

describe('GraphView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders search interface with PersonSearch placeholder', () => {
    renderGraphView();
    expect(screen.getByPlaceholderText('Search for a person...')).toBeInTheDocument();
  });

  test('shows empty state message when no person searched yet', () => {
    renderGraphView();
    expect(screen.getByText('Search for a person to explore their network')).toBeInTheDocument();
  });

  test('shows loading skeleton while graph data is being fetched', async () => {
    fetchGraph.mockReturnValue(new Promise(() => {}));
    fetchDashboard.mockResolvedValue([{ id: 'PM_000001', label: 'John Doe' }]);

    renderGraphView();

    // Initially shows empty state before any search
    expect(screen.getByText('Search for a person to explore their network')).toBeInTheDocument();

    // Type in the PersonSearch input to trigger search
    const input = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'John' } });
      // Wait for debounce (300ms) + async fetch + re-render
      await new Promise((r) => setTimeout(r, 600));
    });

    // Click on the search result to trigger handleSearch → fetchGraph
    const option = screen.getByText('John Doe');
    await act(async () => {
      fireEvent.mouseDown(option);
      // Let React state update propagate
      await new Promise((r) => setTimeout(r, 50));
    });

    // GraphSkeleton should now be visible (loading=true, graphData=null)
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading graph')).toBeInTheDocument();
  });

  test('renders with flex column layout', () => {
    const { container } = renderGraphView();
    const flexContainer = container.querySelector('.flex.h-full.flex-col');
    expect(flexContainer).toBeInTheDocument();
  });

  test('no expand button when no graph data', () => {
    renderGraphView();
    expect(screen.queryByText(/Expand to/i)).not.toBeInTheDocument();
  });

  test('person search input has combobox role', () => {
    renderGraphView();
    const input = screen.getByRole('combobox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
  });

  test('GraphLegend renders node type labels', () => {
    renderGraphView();
    expect(screen.getByText('Legend')).toBeInTheDocument();
    expect(screen.getByText('Accused')).toBeInTheDocument();
    expect(screen.getByText('Victim')).toBeInTheDocument();
    expect(screen.getByText('Complainant')).toBeInTheDocument();
    expect(screen.getByText('Case')).toBeInTheDocument();
  });

  test('GraphLegend renders edge type labels', () => {
    renderGraphView();
    expect(screen.getByText('Co-Accused')).toBeInTheDocument();
    expect(screen.getByText('Accused → Victim')).toBeInTheDocument();
    expect(screen.getByText('Shared Location')).toBeInTheDocument();
  });

  test('retry button not present when no error', () => {
    renderGraphView();
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();
  });
});
