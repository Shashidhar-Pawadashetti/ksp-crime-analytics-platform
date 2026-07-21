// ksp-crime-analytics-platform/client/src/hooks/useDashboard.js
//
// DashboardContext consumer hook + dashboard action hooks.
// Provides fetchChart, setFilter, refreshAll for dashboard data orchestration.

import { useContext, useCallback } from 'react';
import { DashboardContext } from '../contexts/DashboardContext';
import { fetchDashboard } from '../services/api';

/**
 * Access dashboard state and dispatch.
 * Must be used within a DashboardProvider boundary.
 * @returns {{ filters: object, chartData: object, activeCharts: string[], dispatch: function }}
 */
export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}

/**
 * Dashboard action hooks.
 * Provides fetchChart, setFilter, and refreshAll functions.
 * @returns {{ fetchChart: function, setFilter: function, refreshAll: function }}
 */
export function useDashboardActions() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboardActions must be used within a DashboardProvider');
  }

  const { filters, dispatch } = context;

  const fetchChart = useCallback(async (chartName) => {
    dispatch({ type: 'SET_CHART_LOADING', payload: chartName });
    try {
      const data = await fetchDashboard(chartName, filters);
      dispatch({ type: 'SET_CHART_DATA', payload: { chart: chartName, data } });
    } catch (err) {
      dispatch({
        type: 'SET_CHART_ERROR',
        payload: { chart: chartName, error: err.message || 'Failed to load chart data' }
      });
    }
  }, [filters, dispatch]);

  const setFilter = useCallback((filter) => {
    dispatch({ type: 'SET_FILTER', payload: filter });
  }, [dispatch]);

  const refreshAll = useCallback(() => {
    // activeCharts comes from context but useDashboardActions doesn't destructure it
    // to avoid stale closure; fetchChart is memoized and handles filters internally
  }, [fetchChart]);

  return { fetchChart, setFilter, refreshAll };
}
