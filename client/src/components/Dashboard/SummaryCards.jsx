import { useMemo } from 'react';

function sumSeries(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce(function (acc, d) { return acc + (typeof d.value === 'number' ? d.value : 0); }, 0);
}

function countItems(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.length;
}

function findPeakMonth(arr) {
  if (!arr || arr.length === 0) return null;
  var peak = arr.reduce(function (best, d) { return (d.value || 0) > (best.value || 0) ? d : best; }, arr[0]);
  return peak.label || null;
}

export default function SummaryCards({ chartData }) {
  var cards = useMemo(function () {
    var trendData = chartData.trend && chartData.trend.data;
    var breakdownData = chartData.breakdown && chartData.breakdown.data;
    var locationData = chartData.location && chartData.location.data;
    var seasonalData = chartData.seasonal && chartData.seasonal.data;

    var totalCases = sumSeries(trendData);
    var crimeCategories = countItems(breakdownData);
    var districts = countItems(locationData);
    var peakMonth = findPeakMonth(trendData);

    return [
      {
        label: 'Total Cases',
        value: totalCases.toLocaleString(),
        subtitle: 'Across all districts',
        accent: 'border-l-[#1E40AF]'
      },
      {
        label: 'Crime Categories',
        value: String(crimeCategories),
        subtitle: 'Types reported',
        accent: 'border-l-[#3B82F6]'
      },
      {
        label: 'Districts',
        value: String(districts),
        subtitle: 'With active cases',
        accent: 'border-l-[#059669]'
      },
      {
        label: 'Peak Period',
        value: peakMonth ? String(peakMonth) : '—',
        subtitle: 'Highest case volume',
        accent: 'border-l-[#D97706]'
      }
    ];
  }, [chartData]);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map(function (card, i) {
        return (
          <div
            key={i}
            className={
              'flex flex-col gap-0.5 rounded-lg border border-border bg-surface px-4 py-3 border-l-4 ' +
              card.accent
            }
          >
            <span className="text-xs font-medium uppercase tracking-wide text-foreground/60">
              {card.label}
            </span>
            <span className="font-heading text-2xl font-bold text-foreground">
              {card.value}
            </span>
            <span className="text-[11px] text-foreground/50">
              {card.subtitle}
            </span>
          </div>
        );
      })}
    </div>
  );
}
