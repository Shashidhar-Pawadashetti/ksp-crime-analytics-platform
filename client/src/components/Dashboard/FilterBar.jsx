// ksp-crime-analytics-platform/client/src/components/Dashboard/FilterBar.jsx
//
// Dashboard filter bar with Time Period, District, and Crime Type dropdowns.
// Uses shadcn Select components. Collapsible on mobile (<768px).
// Dispatches SET_FILTER on change, RESET_FILTERS on reset.

import { useState, useEffect, useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

/** Karnataka districts — hardcoded for Plan 02 scope. Dynamic from DB deferred. */
const DISTRICTS = [
  'Bagalkote', 'Ballari', 'Belagavi', 'Bengaluru Rural', 'Bengaluru Urban',
  'Bidar', 'Chamarajanagara', 'Chikkaballapura', 'Chikkamagaluru', 'Chitradurga',
  'Dakshina Kannada', 'Davanagere', 'Dharwada', 'Gadaga', 'Hassan',
  'Haveri', 'Kalaburagi', 'Kodagu', 'Kolar', 'Koppala',
  'Mandya', 'Mysuru', 'Raichuru', 'Ramanagara', 'Shivamogga',
  'Tumakuru', 'Udupi', 'Uttara Kannada', 'Vijayanagara', 'Vijayapura',
  'Yadgiri'
];

/** Crime type options — hardcoded for Plan 02 scope. Dynamic from DB deferred. */
const CRIME_TYPES = [
  'Theft', 'Burglary', 'Robbery', 'Assault', 'Murder',
  'Kidnapping', 'Fraud', 'Cyber Crime', 'Drug Offense',
  'Riot', 'Domestic Violence', 'Sexual Offense',
  'Property Damage', 'Arms Act', 'Other'
];

/** Time period options. */
const TIME_PERIODS = [
  { value: 'all', label: 'All Time' },
  { value: 'year', label: 'Last Year' },
  { value: '6months', label: 'Last 6 Months' },
  { value: '3months', label: 'Last 3 Months' },
  { value: 'month', label: 'Last Month' }
];

/**
 * Map timePeriod shorthand to (startDate, endDate) for backend filters.
 * @param {string} period - Time period key
 * @returns {{ startDate: string|null, endDate: string|null }}
 */
function getDateRange(period) {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);

  switch (period) {
    case 'year': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return { startDate: d.toISOString().slice(0, 10), endDate };
    }
    case '6months': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      return { startDate: d.toISOString().slice(0, 10), endDate };
    }
    case '3months': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return { startDate: d.toISOString().slice(0, 10), endDate };
    }
    case 'month': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return { startDate: d.toISOString().slice(0, 10), endDate };
    }
    default:
      return { startDate: null, endDate: null };
  }
}

/**
 * Filter bar with 3 dropdowns and reset button.
 * Collapsible on mobile: collapses to a "Filters" toggle.
 *
 * @param {{ filters: object, onFilterChange: function, onReset: function }} props
 * @returns {import('react').ReactElement}
 */
export default function FilterBar({ filters, onFilterChange, onReset }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleTimePeriodChange(value) {
    const range = getDateRange(value);
    onFilterChange({ timePeriod: value, startDate: range.startDate, endDate: range.endDate });
  }

  function handleDistrictChange(value) {
    onFilterChange({ district: value === 'all' ? null : value });
  }

  function handleCrimeTypeChange(value) {
    onFilterChange({ crimeType: value === 'all' ? null : value });
  }

  // Mobile filter toggle
  const filterContent = (
    <div className="flex flex-wrap items-center gap-3">
      {/* Time Period */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-foreground/70 whitespace-nowrap">
          Time Period
        </label>
        <Select value={filters.timePeriod || 'all'} onValueChange={handleTimePeriodChange}>
          <SelectTrigger className="w-[150px]" aria-label="Select time period">
            <SelectValue placeholder="All Time" />
          </SelectTrigger>
          <SelectContent>
            {TIME_PERIODS.map(function (tp) {
              return (
                <SelectItem key={tp.value} value={tp.value}>
                  {tp.label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* District */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-foreground/70 whitespace-nowrap">
          District
        </label>
        <Select value={filters.district || 'all'} onValueChange={handleDistrictChange}>
          <SelectTrigger className="w-[170px]" aria-label="Select district">
            <SelectValue placeholder="All Districts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Districts</SelectItem>
            {DISTRICTS.map(function (d) {
              return (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Crime Type */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-foreground/70 whitespace-nowrap">
          Crime Type
        </label>
        <Select value={filters.crimeType || 'all'} onValueChange={handleCrimeTypeChange}>
          <SelectTrigger className="w-[160px]" aria-label="Select crime type">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {CRIME_TYPES.map(function (ct) {
              return (
                <SelectItem key={ct} value={ct}>
                  {ct}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Reset Filters */}
      <button
        className="rounded-md border border-border bg-input px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-border hover:text-foreground"
        onClick={onReset}
        aria-label="Reset Filters"
      >
        Reset Filters
      </button>
    </div>
  );

  return (
    <div className="border-b border-border bg-surface px-4 py-3">
      {/* Desktop: always visible */}
      <div className="hidden md:block">
        {filterContent}
      </div>

      {/* Mobile: collapsible toggle */}
      <div className="md:hidden">
        <button
          className="flex w-full items-center justify-between rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground/70"
          onClick={function () { setMobileOpen(!mobileOpen); }}
          aria-expanded={mobileOpen}
          aria-label="Toggle filters"
        >
          <span>Filters</span>
          <svg
            className={'h-4 w-4 transition-transform duration-200 ' + (mobileOpen ? 'rotate-180' : '')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {mobileOpen && (
          <div className="mt-3">
            {filterContent}
          </div>
        )}
      </div>
    </div>
  );
}
