// ksp-crime-analytics-platform/client/src/components/Dashboard/DashboardView.jsx
//
// View orchestrator for the analytics dashboard.
// Mounts FilterBar, chart cards in responsive grid, SeasonalBadge annotations,
// and RiskRankedView at bottom. Fetches data on filter changes.

import { useEffect } from 'react';
import { useDashboard, useDashboardActions } from '../../hooks/useDashboard';
import FilterBar from './FilterBar';
import GridLayout from './GridLayout';
import ChartCard from './ChartCard';
import SeasonalBadge from './SeasonalBadge';
import BarChart from './charts/BarChart';
import LineChart from './charts/LineChart';
import PieChart from './charts/PieChart';
import AreaChart from './charts/AreaChart';
import HeatmapChart from './charts/HeatmapChart';
import RiskRankedView from './risk/RiskRankedView';

/**
 * Map chart name to a display component.
 * Each chart follows the common Props interface: { data, width, height, onElementClick }.
 */
const CHART_COMPONENTS = {
  bar: BarChart,
  line: LineChart,
  pie: PieChart,
  area: AreaChart,
  heatmap: HeatmapChart
};

/**
 * Chart configuration: title and rendering component type per chart.
 */
const chartConfig = {
  trend: { title: 'Crime Trend', chartType: 'line' },
  breakdown: { title: 'Crime Breakdown', chartType: 'pie' },
  location: { title: 'Location Breakdown', chartType: 'area' },
  seasonal: { title: 'Seasonal Patterns', chartType: 'heatmap' }
};

/** Default chart dimensions. */
const CHART_WIDTH = 500;
const CHART_HEIGHT = 300;

/**
 * Dashboard view — the main analytics view.
 * Renders FilterBar, chart cards based on activeCharts configuration,
 * seasonal annotation badges, and risk-ranked table.
 * @returns {import('react').ReactElement}
 */
export default function DashboardView() {
  const { filters, chartData, activeCharts } = useDashboard();
  const { fetchChart, setFilter } = useDashboardActions();

  function handleResetFilters() {
    setFilter({
      timePeriod: 'all',
      district: null,
      crimeType: null,
      startDate: null,
      endDate: null
    });
  }

  // Fetch active charts when filters change
  useEffect(function () {
    activeCharts.forEach(function (chartName) {
      fetchChart(chartName);
    });
  }, [filters]);

  // Fetch risk-ranked data separately (always active)
  useEffect(function () {
    fetchChart('riskRanked');
  }, [filters]);

  return (
    <div className="flex h-full flex-col">
      <FilterBar
        filters={filters}
        onFilterChange={setFilter}
        onReset={handleResetFilters}
      />
      <div className="flex-1 overflow-y-auto">
        <GridLayout>
          {activeCharts.map(function (chartName) {
            const config = chartConfig[chartName];
            if (!config) return null;

            const chart = chartData[chartName];
            if (!chart) return null;

            const ChartComponent = CHART_COMPONENTS[config.chartType];
            if (!ChartComponent) return null;

            return (
              <ChartCard
                key={chartName}
                title={config.title}
                loading={chart.loading}
                error={chart.error}
                onRetry={function () { fetchChart(chartName); }}
              >
                {/* Seasonal badge on trend and seasonal cards */}
                {(chartName === 'trend' || chartName === 'seasonal') &&
                  chartData.seasonal && chartData.seasonal.data && (
                  <div className="mb-2">
                    <SeasonalBadge
                      peaks={chartData.seasonal.data.peaks || []}
                      trend={chartData.seasonal.data.trend || 'stable'}
                    />
                  </div>
                )}

                {chart.data && chart.data.length > 0 ? (
                  <ChartComponent
                    data={chart.data}
                    width={CHART_WIDTH}
                    height={CHART_HEIGHT}
                    onElementClick={function (d) { console.log('Chart element clicked:', d); }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-foreground/40 text-sm">
                    No data for selected filters
                  </div>
                )}
              </ChartCard>
            );
          })}
        </GridLayout>

        {/* Risk-ranked persons table at bottom */}
        <div className="px-4 pb-6">
          <RiskRankedView data={chartData.riskRanked ? chartData.riskRanked.data : null} />
        </div>
      </div>
    </div>
  );
}
