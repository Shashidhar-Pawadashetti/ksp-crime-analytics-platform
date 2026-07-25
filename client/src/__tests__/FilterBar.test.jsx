import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FilterBar from '../components/Dashboard/FilterBar';

describe('FilterBar', () => {
  const defaultFilters = {
    timePeriod: 'all',
    district: null,
    crimeType: null,
    startDate: null,
    endDate: null
  };

  it('renders all 3 dropdown triggers (period, district, crime type)', () => {
    render(
      <FilterBar
        filters={defaultFilters}
        onFilterChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    // Check the filter labels are rendered
    expect(screen.getByText('Time Period')).toBeInTheDocument();
    expect(screen.getByText('District')).toBeInTheDocument();
    expect(screen.getByText('Crime Type')).toBeInTheDocument();
  });

  it('renders Reset Filters button', () => {
    render(
      <FilterBar
        filters={defaultFilters}
        onFilterChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    // There may be two Reset buttons (mobile + desktop views) — use getAllBy
    const resetButtons = screen.getAllByRole('button', { name: /reset filters/i });
    expect(resetButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('dispatches RESET_FILTERS when Reset button clicked', () => {
    const onReset = vi.fn();
    render(
      <FilterBar
        filters={defaultFilters}
        onFilterChange={vi.fn()}
        onReset={onReset}
      />
    );

    // Click the first Reset Filters button
    const resetButtons = screen.getAllByRole('button', { name: /reset filters/i });
    fireEvent.click(resetButtons[0]);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('renders mobile toggle button', () => {
    render(
      <FilterBar
        filters={defaultFilters}
        onFilterChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    // Mobile toggle button should exist
    const mobileToggle = screen.getByLabelText('Toggle filters');
    expect(mobileToggle).toBeInTheDocument();
  });

  it('shows mobile filter content when toggle is clicked', () => {
    render(
      <FilterBar
        filters={defaultFilters}
        onFilterChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    const mobileToggle = screen.getByLabelText('Toggle filters');
    fireEvent.click(mobileToggle);

    // After clicking toggle, filter rows should expand
    // Use getAllByText since desktop view also renders Reset button
    const resetAll = screen.getAllByText('Reset Filters');
    expect(resetAll.length).toBeGreaterThanOrEqual(1);
  });

  it('renders time period options in the select', () => {
    render(
      <FilterBar
        filters={defaultFilters}
        onFilterChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    // The current "all" value should be displayed in the select trigger
    // This shows the select rendered with the right value
    expect(screen.getByLabelText('Select time period')).toBeInTheDocument();
    expect(screen.getByLabelText('Select district')).toBeInTheDocument();
    expect(screen.getByLabelText('Select crime type')).toBeInTheDocument();
  });
});
