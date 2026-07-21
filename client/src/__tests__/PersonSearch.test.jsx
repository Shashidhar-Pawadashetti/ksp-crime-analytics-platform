import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';
import PersonSearch from '../components/Graph/PersonSearch';

// Mock the api module
vi.mock('../services/api', () => ({
  fetchDashboard: vi.fn(),
  fetchGraph: vi.fn()
}));

import { fetchDashboard } from '../services/api';

const SAMPLE_PERSONS = [
  { id: 'PM_000001', label: 'John Doe' },
  { id: 'PM_000002', label: 'Jane Smith' },
  { id: 'PM_000003', label: 'Robert Johnson' }
];

describe('PersonSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders input with placeholder text', () => {
    render(<PersonSearch onSelect={vi.fn()} />);
    expect(screen.getByPlaceholderText('Search for a person...')).toBeInTheDocument();
  });

  test('shows search icon', () => {
    render(<PersonSearch onSelect={vi.fn()} />);
    // The Search icon from lucide-react renders as an SVG
    const input = screen.getByPlaceholderText('Search for a person...');
    expect(input).toBeInTheDocument();
  });

  test('shows dropdown results after debounce when results returned', async () => {
    fetchDashboard.mockResolvedValue(SAMPLE_PERSONS);

    render(<PersonSearch onSelect={vi.fn()} />);

    const input = screen.getByPlaceholderText('Search for a person...');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'John' } });
      // Wait for the 300ms debounce + async fetch + re-render
      await new Promise((r) => setTimeout(r, 500));
    });

    await waitFor(() => {
      expect(fetchDashboard).toHaveBeenCalledWith('person-search', { searchTerm: 'John' });
    });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  test('calls onSelect when a result is clicked', async () => {
    const onSelect = vi.fn();
    fetchDashboard.mockResolvedValue(SAMPLE_PERSONS);

    render(<PersonSearch onSelect={onSelect} />);

    const input = screen.getByPlaceholderText('Search for a person...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'John' } });
      await new Promise((r) => setTimeout(r, 500));
    });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Click the result
    await act(async () => {
      fireEvent.mouseDown(screen.getByText('John Doe'));
    });

    expect(onSelect).toHaveBeenCalledWith('PM_000001');
  });

  test('shows empty results message when no persons match', async () => {
    fetchDashboard.mockResolvedValue([]);

    render(<PersonSearch onSelect={vi.fn()} />);

    const input = screen.getByPlaceholderText('Search for a person...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'UnknownPerson' } });
      await new Promise((r) => setTimeout(r, 500));
    });

    await waitFor(() => {
      expect(screen.getByText(/No persons found matching/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  test('input has combobox ARIA attributes', () => {
    render(<PersonSearch onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  test('does not fetch for short queries (< 2 chars)', async () => {
    render(<PersonSearch onSelect={vi.fn()} />);

    const input = screen.getByPlaceholderText('Search for a person...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'J' } });
      await new Promise((r) => setTimeout(r, 500));
    });

    // fetchDashboard should NOT be called for short query
    expect(fetchDashboard).not.toHaveBeenCalled();
  });
});
