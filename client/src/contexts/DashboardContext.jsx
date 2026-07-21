// ksp-crime-analytics-platform/client/src/contexts/DashboardContext.jsx
//
// Dashboard state management using React Context + useReducer.
// Manages filter state, per-chart data/loading/error, and active chart configuration.
//
// Exports both the provider and the reducer for standalone testing (Plan 02-01).

import { createContext, useReducer } from 'react';

/** @type {import('react').Context<*>} */
export const DashboardContext = createContext(null);

/** @type {{ filters: object, chartData: object, activeCharts: string[] }} */
export const initialState = {
  filters: {
    timePeriod: 'all',      // 'all' | 'year' | 'quarter' | 'month' | 'custom'
    district: null,          // District name or null
    crimeType: null,         // CrimeGroupName or null
    startDate: null,
    endDate: null,
  },
  chartData: {
    trend: { data: null, loading: false, error: null },
    breakdown: { data: null, loading: false, error: null },
    location: { data: null, loading: false, error: null },
    hotspots: { data: null, loading: false, error: null },
    riskRanked: { data: null, loading: false, error: null },
    seasonal: { data: null, loading: false, error: null },
  },
  activeCharts: ['trend', 'breakdown', 'location', 'seasonal'],
};

/**
 * Dashboard reducer.
 * @param {typeof initialState} state
 * @param {{ type: string, payload?: any }} action
 * @returns {typeof initialState}
 */
export function dashboardReducer(state, action) {
  switch (action.type) {
    case 'SET_FILTER':
      return {
        ...state,
        filters: { ...state.filters, ...action.payload }
      };

    case 'RESET_FILTERS':
      return {
        ...state,
        filters: { ...initialState.filters }
      };

    case 'SET_CHART_DATA':
      return {
        ...state,
        chartData: {
          ...state.chartData,
          [action.payload.chart]: {
            data: action.payload.data,
            loading: false,
            error: null
          }
        }
      };

    case 'SET_CHART_LOADING':
      return {
        ...state,
        chartData: {
          ...state.chartData,
          [action.payload]: { data: null, loading: true, error: null }
        }
      };

    case 'SET_CHART_ERROR':
      return {
        ...state,
        chartData: {
          ...state.chartData,
          [action.payload.chart]: { data: null, loading: false, error: action.payload.error }
        }
      };

    default:
      return state;
  }
}

/**
 * Dashboard provider.
 * Provides filter state and per-chart data/loading/error for dashboard views.
 *
 * @param {{ children: import('react').ReactNode }} props
 * @returns {import('react').ReactElement}
 */
export function DashboardProvider({ children }) {
  const [state, dispatch] = useReducer(dashboardReducer, initialState);
  const value = { ...state, dispatch };
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
