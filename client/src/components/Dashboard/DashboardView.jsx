// ksp-crime-analytics-platform/client/src/components/Dashboard/DashboardView.jsx
//
// View orchestrator for the analytics dashboard.
// Mounts FilterBar, chart cards in responsive grid, SeasonalBadge annotations,
// and RiskRankedView at bottom. Fetches data on filter changes.

import { useEffect, useRef, useState } from 'react';
import { useDashboard, useDashboardActions } from '../../hooks/useDashboard';
import FilterBar from './FilterBar';
import GridLayout from './GridLayout';
import ChartCard from './ChartCard';
import SummaryCards from './SummaryCards';
import BarChart from './charts/BarChart';
import LineChart from './charts/LineChart';
import PieChart from './charts/PieChart';
import HorizontalBarChart from './charts/HorizontalBarChart';
import SeasonalPatterns from './charts/SeasonalPatterns';
import RiskRankedView from './risk/RiskRankedView';

const CHART_COMPONENTS = {
  bar: BarChart,
  line: LineChart,
  pie: PieChart,
  horizontalBar: HorizontalBarChart,
  seasonal: SeasonalPatterns
};

var FULL_WIDTH = ['trend', 'seasonal'];

const chartConfig = {
  trend: { title: 'Crime Trend', chartType: 'line' },
  breakdown: { title: 'Crime Breakdown', chartType: 'pie' },
  location: { title: 'Location Breakdown', chartType: 'horizontalBar' },
  seasonal: { title: 'Seasonal Patterns', chartType: 'seasonal' }
};

/**
 * Dashboard view — the main analytics view.
 * Renders FilterBar, chart cards based on activeCharts configuration,
 * seasonal annotation badges, and risk-ranked table.
 * @returns {import('react').ReactElement}
 */
export default function DashboardView() {
  const { filters, chartData, activeCharts } = useDashboard();
  const { fetchChart, setFilter } = useDashboardActions();
  const chartAreaRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(function () {
    var el = chartAreaRef.current;
    if (!el) return;

    function handleResize() {
      setContainerWidth(el.clientWidth - 32);
    }

    handleResize();
    var ro = new ResizeObserver(handleResize);
    ro.observe(el);
    return function () { ro.disconnect(); };
  }, []);

  var gap = 16;
  var fullWidth = containerWidth;
  var halfWidth = Math.max(200, (containerWidth - gap) / 2);
  var chartHeight = Math.round(Math.min(containerWidth * 0.35, 300));

  function handleResetFilters() {
    setFilter({
      timePeriod: 'all',
      district: null,
      crimeType: null,
      startDate: null,
      endDate: null
    });
  }

  useEffect(function () {
    activeCharts.forEach(function (chartName) {
      fetchChart(chartName);
    });
  }, [filters]);

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
      <div ref={chartAreaRef} className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-2">
          <SummaryCards chartData={chartData} />
        </div>
        <GridLayout>
          {activeCharts.map(function (chartName) {
            var config = chartConfig[chartName];
            if (!config) return null;

            var chart = chartData[chartName];
            if (!chart) return null;

            var ChartComponent = CHART_COMPONENTS[config.chartType];
            if (!ChartComponent) return null;

            var isFullWidth = FULL_WIDTH.indexOf(chartName) !== -1;
            var isSeasonal = chartName === 'seasonal';
            var card = (
              <ChartCard
                key={chartName}
                title={config.title}
                loading={chart.loading}
                error={chart.error}
                onRetry={function () { fetchChart(chartName); }}
              >

                {chart.data && chart.data.length > 0 ? (
                  <ChartComponent
                    data={chart.data}
                    width={isFullWidth ? fullWidth : halfWidth}
                    height={chartHeight}
                    onElementClick={function (d) { console.log('Chart element clicked:', d); }}
                    {...(isSeasonal ? {
                      peaks: (chartData.seasonal && chartData.seasonal.data && chartData.seasonal.data.peaks) || [],
                      trend: (chartData.seasonal && chartData.seasonal.data && chartData.seasonal.data.trend) || null
                    } : {})}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-foreground/60 text-sm">
                    No data for selected filters
                  </div>
                )}
              </ChartCard>
            );

            return isFullWidth
              ? <div key={chartName} className="md:col-span-2">{card}</div>
              : card;
          })}
          <div key="riskTable" className="md:col-span-2">
            <RiskRankedView data={chartData.riskRanked ? chartData.riskRanked.data : null} />
          </div>
        </GridLayout>
      </div>
    </div>
  );
}
