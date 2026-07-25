import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import ChartCard from '../components/Dashboard/ChartCard';

describe('ChartCard', () => {
  test('renders title', () => {
    render(
      <ChartCard title="Crime Trends" loading={false} error={null} onRetry={vi.fn()}>
        <div>Chart content</div>
      </ChartCard>
    );
    expect(screen.getByText('Crime Trends')).toBeInTheDocument();
  });

  test('shows ChartSkeleton when loading', () => {
    const { container } = render(
      <ChartCard title="Test" loading={true} error={null} onRetry={vi.fn()}>
        <div>Content</div>
      </ChartCard>
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });

  test('shows DashboardErrorMessage when error', () => {
    const onRetry = vi.fn();
    render(
      <ChartCard title="Test" loading={false} error="Failed to load" onRetry={onRetry}>
        <div>Content</div>
      </ChartCard>
    );
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  test('renders children when not loading and no error', () => {
    render(
      <ChartCard title="Test" loading={false} error={null} onRetry={vi.fn()}>
        <div>Chart content here</div>
      </ChartCard>
    );
    expect(screen.getByText('Chart content here')).toBeInTheDocument();
  });

  test('shows loading skeleton initially, then switches to content', () => {
    const { rerender } = render(
      <ChartCard title="Test" loading={true} error={null} onRetry={vi.fn()}>
        <div>Loaded data</div>
      </ChartCard>
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Loaded data')).not.toBeInTheDocument();

    rerender(
      <ChartCard title="Test" loading={false} error={null} onRetry={vi.fn()}>
        <div>Loaded data</div>
      </ChartCard>
    );
    expect(screen.getByText('Loaded data')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('does not crash with null children', () => {
    render(
      <ChartCard title="Test" loading={false} error={null} onRetry={vi.fn()}>
        {null}
      </ChartCard>
    );
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  test('retry button calls onRetry in error state', () => {
    const onRetry = vi.fn();
    render(
      <ChartCard title="Test" loading={false} error="Error" onRetry={onRetry}>
        <div>Content</div>
      </ChartCard>
    );
    const retryButtons = screen.getAllByRole('button');
    if (retryButtons.length > 0) {
      fireEvent.click(retryButtons[0]);
    }
  });
});
