import { dashboardReducer, initialState } from '../contexts/DashboardContext';

describe('DashboardContext', () => {
  describe('initialState', () => {
    test('initial state: all filters at defaults, no chart data, trend active', () => {
      expect(initialState.filters.timePeriod).toBe('all');
      expect(initialState.filters.district).toBeNull();
      expect(initialState.filters.crimeType).toBeNull();
      expect(initialState.filters.startDate).toBeNull();
      expect(initialState.filters.endDate).toBeNull();
      expect(initialState.activeCharts).toEqual(['trend']);
    });

    test('initial state: all charts have null data, false loading, null error', () => {
      const chartNames = ['trend', 'breakdown', 'location', 'hotspots', 'riskRanked', 'seasonal'];
      chartNames.forEach(function (name) {
        expect(initialState.chartData[name]).toBeDefined();
        expect(initialState.chartData[name].data).toBeNull();
        expect(initialState.chartData[name].loading).toBe(false);
        expect(initialState.chartData[name].error).toBeNull();
      });
    });
  });

  describe('dashboardReducer — SET_FILTER', () => {
    test('SET_FILTER merges partial filter object', () => {
      const state = dashboardReducer(initialState, {
        type: 'SET_FILTER',
        payload: { district: 'Bengaluru Urban' }
      });
      expect(state.filters.district).toBe('Bengaluru Urban');
      // Other filters unchanged
      expect(state.filters.timePeriod).toBe('all');
      expect(state.filters.crimeType).toBeNull();
      expect(state.filters.startDate).toBeNull();
      expect(state.filters.endDate).toBeNull();
    });

    test('SET_FILTER with crimeType sets crimeType correctly', () => {
      const state = dashboardReducer(initialState, {
        type: 'SET_FILTER',
        payload: { crimeType: 'Theft' }
      });
      expect(state.filters.crimeType).toBe('Theft');
      expect(state.filters.district).toBeNull();
    });

    test('SET_FILTER with startDate/endDate', () => {
      const state = dashboardReducer(initialState, {
        type: 'SET_FILTER',
        payload: { startDate: '2024-01-01', endDate: '2024-12-31' }
      });
      expect(state.filters.startDate).toBe('2024-01-01');
      expect(state.filters.endDate).toBe('2024-12-31');
    });

    test('SET_FILTER multiple times accumulates filters', () => {
      const state1 = dashboardReducer(initialState, {
        type: 'SET_FILTER',
        payload: { district: 'Mysuru' }
      });
      const state2 = dashboardReducer(state1, {
        type: 'SET_FILTER',
        payload: { crimeType: 'Robbery' }
      });
      expect(state2.filters.district).toBe('Mysuru');
      expect(state2.filters.crimeType).toBe('Robbery');
    });
  });

  describe('dashboardReducer — RESET_FILTERS', () => {
    test('RESET_FILTERS returns filters to initial state', () => {
      const modifiedState = dashboardReducer(initialState, {
        type: 'SET_FILTER',
        payload: { district: 'Bengaluru Urban', crimeType: 'Theft', startDate: '2024-01-01' }
      });
      const resetState = dashboardReducer(modifiedState, { type: 'RESET_FILTERS' });
      expect(resetState.filters).toEqual(initialState.filters);
    });

    test('RESET_FILTERS does not affect chartData', () => {
      const stateWithData = dashboardReducer(initialState, {
        type: 'SET_CHART_DATA',
        payload: { chart: 'trend', data: [{ label: 'Jan', value: 10 }] }
      });
      const resetState = dashboardReducer(stateWithData, { type: 'RESET_FILTERS' });
      expect(resetState.chartData.trend.data).toEqual([{ label: 'Jan', value: 10 }]);
    });
  });

  describe('dashboardReducer — SET_CHART_DATA', () => {
    test('SET_CHART_DATA for trend chart sets data and clears loading/error', () => {
      const data = [{ label: 'Jan', value: 10 }, { label: 'Feb', value: 20 }];
      const state = dashboardReducer(initialState, {
        type: 'SET_CHART_DATA',
        payload: { chart: 'trend', data: data }
      });
      expect(state.chartData.trend.data).toEqual(data);
      expect(state.chartData.trend.loading).toBe(false);
      expect(state.chartData.trend.error).toBeNull();
    });

    test('SET_CHART_DATA stores data reference correctly', () => {
      const data = [{ label: 'Test', value: 42 }];
      const state = dashboardReducer(initialState, {
        type: 'SET_CHART_DATA',
        payload: { chart: 'breakdown', data: data }
      });
      expect(state.chartData.breakdown.data).toBe(data);
    });

    test('SET_CHART_DATA for one chart does not affect other charts data', () => {
      const state = dashboardReducer(initialState, {
        type: 'SET_CHART_DATA',
        payload: { chart: 'trend', data: [{ label: 'Jan', value: 10 }] }
      });
      expect(state.chartData.breakdown.data).toBeNull();
      expect(state.chartData.location.data).toBeNull();
      expect(state.chartData.hotspots.data).toBeNull();
    });

    test('SET_CHART_DATA clears any previous error state', () => {
      const errorState = dashboardReducer(initialState, {
        type: 'SET_CHART_ERROR',
        payload: { chart: 'trend', error: 'Failed to load' }
      });
      const fixedState = dashboardReducer(errorState, {
        type: 'SET_CHART_DATA',
        payload: { chart: 'trend', data: [{ label: 'Jan', value: 10 }] }
      });
      expect(fixedState.chartData.trend.error).toBeNull();
      expect(fixedState.chartData.trend.data).toEqual([{ label: 'Jan', value: 10 }]);
    });
  });

  describe('dashboardReducer — SET_CHART_LOADING', () => {
    test('SET_CHART_LOADING sets loading true for specific chart', () => {
      const state = dashboardReducer(initialState, {
        type: 'SET_CHART_LOADING',
        payload: 'breakdown'
      });
      expect(state.chartData.breakdown.loading).toBe(true);
      // Other charts unaffected
      expect(state.chartData.trend.loading).toBe(false);
    });

    test('SET_CHART_LOADING clears data and error for the chart', () => {
      const stateWithData = dashboardReducer(initialState, {
        type: 'SET_CHART_DATA',
        payload: { chart: 'trend', data: [{ label: 'Jan', value: 10 }] }
      });
      const loadingState = dashboardReducer(stateWithData, {
        type: 'SET_CHART_LOADING',
        payload: 'trend'
      });
      expect(loadingState.chartData.trend.loading).toBe(true);
      expect(loadingState.chartData.trend.data).toBeNull();
      expect(loadingState.chartData.trend.error).toBeNull();
    });
  });

  describe('dashboardReducer — SET_CHART_ERROR', () => {
    test('SET_CHART_ERROR sets error for specific chart', () => {
      const state = dashboardReducer(initialState, {
        type: 'SET_CHART_ERROR',
        payload: { chart: 'trend', error: 'Failed' }
      });
      expect(state.chartData.trend.error).toBe('Failed');
      expect(state.chartData.trend.loading).toBe(false);
      expect(state.chartData.trend.data).toBeNull();
    });

    test('SET_CHART_ERROR does not affect other charts', () => {
      const state = dashboardReducer(initialState, {
        type: 'SET_CHART_ERROR',
        payload: { chart: 'trend', error: 'Trend failed' }
      });
      expect(state.chartData.breakdown.error).toBeNull();
      expect(state.chartData.location.error).toBeNull();
    });
  });

  describe('dashboardReducer — unknown action', () => {
    test('unknown action returns state unchanged', () => {
      const state = dashboardReducer(initialState, { type: 'UNKNOWN_ACTION' });
      expect(state).toBe(initialState);
    });
  });
});
