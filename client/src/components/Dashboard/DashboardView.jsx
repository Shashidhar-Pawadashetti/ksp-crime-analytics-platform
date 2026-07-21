// ksp-crime-analytics-platform/client/src/components/Dashboard/DashboardView.jsx
//
// View orchestrator for the analytics dashboard.
// Mounts chart cards in a responsive grid layout, fetches data on filter changes.

import { useEffect } from 'react';
import { useDashboard, useDashboardActions } from '../../hooks/useDashboard';
import GridLayout from './GridLayout';
import ChartCard from './ChartCard';

/**
 * Dashboard view — the main analytics view.
 * Renders chart cards based on activeCharts configuration.
 * @returns {import('react').ReactElement}
 */
export default function DashboardView() {
  const { filters, chartData, activeCharts } = useDashboard();
  const { fetchChart, setFilter } = useDashboardActions();

  // Fetch active charts when filters change
  useEffect(() => {
    activeCharts.forEach(function (chartName) {
      fetchChart(chartName);
    });
  }, [filters]);

  const chartConfig = {
    trend: { title: 'Crime Trend', chartType: 'bar' },
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <GridLayout>
          {activeCharts.map(function (chartName) {
            const config = chartConfig[chartName];
            if (!config) return null;

            const chart = chartData[chartName];
            if (!chart) return null;

            return (
              <ChartCard
                key={chartName}
                title={config.title}
                loading={chart.loading}
                error={chart.error}
                onRetry={function () { fetchChart(chartName); }}
              >
                {chart.data && chart.data.length > 0 ? (
                  <div className="flex h-full w-full items-center justify-center text-foreground/40 text-sm">
                    {/* BarChart will be rendered here when data is available — Place 02 adds more chart types */}
                    <span>Chart rendered — {chart.data.length} data points loaded</span>
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-foreground/40 text-sm">
                    No data for selected filters
                  </div>
                )}
              </ChartCard>
            );
          })}
        </GridLayout>
      </div>
    </div>
  );
}
