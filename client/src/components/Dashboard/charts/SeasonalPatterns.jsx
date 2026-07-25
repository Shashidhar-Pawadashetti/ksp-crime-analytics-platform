import { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';

var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MONTH_COLORS = ['#E0E7FF', '#C7D2FE', '#A5B4FC', '#818CF8', '#6366F1', '#4F46E5', '#4338CA', '#3730A3', '#312E81', '#1E1B4B', '#3730A3', '#4338CA'];

function parseDate(d) {
  if (d instanceof Date) return d;
  var t = new Date(d);
  return isNaN(t.getTime()) ? null : t;
}

function aggregateBy(validData, period) {
  if (!validData || validData.length === 0) return [];

  var buckets = {};
  validData.forEach(function (item) {
    var date = parseDate(item.label);
    if (!date) return;
    var key = period === 'month' ? date.getMonth() : date.getDay();
    buckets[key] = (buckets[key] || 0) + item.value;
  });

  var count = period === 'month' ? 12 : 7;
  var names = period === 'month' ? MONTHS : DAYS;
  var result = [];
  for (var i = 0; i < count; i++) {
    result.push({ label: names[i], index: i, value: buckets[i] || 0 });
  }
  return result;
}

function barChart(g, data, config) {
  var { innerWidth, innerHeight, barColor, peakColor, label, showValues } = config;

  var maxVal = d3.max(data, function (d) { return d.value; }) || 1;
  var xScale = d3.scaleBand()
    .domain(data.map(function (d) { return d.label; }))
    .range([0, innerWidth])
    .padding(0.2);

  var yScale = d3.scaleLinear()
    .domain([0, maxVal * 1.1])
    .range([innerHeight, 0]);

  // Grid lines
  g.append('g')
    .call(d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(''))
    .selectAll('line')
    .attr('stroke', '#DBEAFE')
    .attr('stroke-dasharray', '3,3');

  // Axis
  g.append('g')
    .attr('transform', 'translate(0,' + innerHeight + ')')
    .call(d3.axisBottom(xScale))
    .selectAll('text')
    .attr('font-size', '9px')
    .attr('fill', '#1E3A8A');

  g.append('g')
    .call(d3.axisLeft(yScale).ticks(4))
    .selectAll('text')
    .attr('font-size', '8px')
    .attr('fill', '#64748B');

  // Bars
  data.forEach(function (d, i) {
    var isPeak = d.value === maxVal;
    var fill = peakColor && isPeak ? peakColor : (typeof barColor === 'function' ? barColor(i) : barColor);

    g.append('rect')
      .attr('x', xScale(d.label))
      .attr('y', yScale(d.value))
      .attr('width', xScale.bandwidth())
      .attr('height', innerHeight - yScale(d.value))
      .attr('fill', fill)
      .attr('rx', 2)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event) {
        d3.select(this).attr('opacity', 0.8);
        config.setTooltip && config.setTooltip({
          x: event.offsetX,
          y: event.offsetY,
          label: d.label,
          value: d.value
        });
      })
      .on('mouseleave', function () {
        d3.select(this).attr('opacity', 1);
        config.setTooltip && config.setTooltip(null);
      })
      .on('click', function () {
        config.onElementClick && config.onElementClick(d);
      });

    // Value label
    if (showValues && d.value > 0) {
      g.append('text')
        .attr('x', xScale(d.label) + xScale.bandwidth() / 2)
        .attr('y', yScale(d.value) - 4)
        .attr('text-anchor', 'middle')
        .attr('font-size', '8px')
        .attr('font-weight', isPeak ? 'bold' : 'normal')
        .attr('fill', isPeak ? '#1E40AF' : '#64748B')
        .text(d.value >= 1000 ? (d.value / 1000).toFixed(1) + 'k' : d.value);
    }
  });

  // Section label
  g.append('text')
    .attr('x', 0)
    .attr('y', -6)
    .attr('font-size', '10px')
    .attr('font-weight', '600')
    .attr('fill', '#1E3A8A')
    .text(label);
}

export default function SeasonalPatterns({ data, width, height, onElementClick }) {
  var svgRef = useRef(null);
  var [tooltip, setTooltip] = useState(null);
  var prefersReducedMotion = useRef(false);

  useEffect(function () {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  var validData = useMemo(function () {
    if (!data || data.length === 0) return [];
    return data.filter(function (d) { return d != null && typeof d.value === 'number' && isFinite(d.value); });
  }, [data]);

  var monthly = useMemo(function () { return aggregateBy(validData, 'month'); }, [validData]);
  var weekly = useMemo(function () { return aggregateBy(validData, 'weekday'); }, [validData]);

  var insights = useMemo(function () {
    if (monthly.length === 0 || weekly.length === 0) return { lines: [], peakMonth: null, weekendRatio: null, seasonalRange: null };

    var peakMonth = monthly.reduce(function (best, d) { return d.value > best.value ? d : best; }, monthly[0]);
    var avgMonthly = monthly.reduce(function (s, d) { return s + d.value; }, 0) / monthly.filter(function (d) { return d.value > 0; }).length;
    var nonZeroMonthly = monthly.filter(function (d) { return d.value > 0; });
    var minMonth = nonZeroMonthly.length > 0 ? nonZeroMonthly.reduce(function (low, d) { return d.value < low.value ? d : low; }, nonZeroMonthly[0]) : null;

    var totalWeekend = (weekly[0] ? weekly[0].value : 0) + (weekly[6] ? weekly[6].value : 0);
    var totalWeekday = 0;
    for (var i = 1; i <= 5; i++) { totalWeekday += weekly[i] ? weekly[i].value : 0; }
    var avgWeekday = totalWeekday > 0 ? totalWeekday / 5 : 0;
    var avgWeekend = totalWeekend > 0 ? totalWeekend / 2 : 0;
    var weekendRatio = avgWeekday > 0 ? Math.round(((avgWeekend - avgWeekday) / avgWeekday) * 100) : null;

    var seasonalRange = minMonth && minMonth.value > 0 ? (peakMonth.value / minMonth.value).toFixed(1) : null;

    var highSeason = monthly.filter(function (d) { return d.value > avgMonthly * 1.1; }).map(function (d) { return d.label; });

    var lines = [];
    if (peakMonth) {
      lines.push('Peak month: ' + peakMonth.label + ' (' + peakMonth.value.toLocaleString() + ' cases)');
    }
    if (weekendRatio !== null && weekendRatio > 0) {
      lines.push('Weekends: ' + weekendRatio + '% higher than weekdays');
    }
    if (seasonalRange !== null && seasonalRange > 1.2) {
      lines.push('Seasonal range: ' + seasonalRange + 'x (peak vs low)');
    }
    if (highSeason.length > 0) {
      lines.push('High season: ' + highSeason.join(', '));
    }

    return { lines: lines, peakMonth: peakMonth, weekendRatio: weekendRatio, seasonalRange: seasonalRange };
  }, [monthly, weekly]);

  useEffect(function () {
    if (monthly.length === 0 && weekly.length === 0) return;

    var svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    var topMargin = 8;
    var insightLineH = 18;
    var insightCount = Math.min(insights.lines.length, 3);
    var insightHeight = insightCount > 0 ? insightCount * insightLineH + 6 : 0;
    var sectionGap = 14;

    var chartAreaTop = topMargin + insightHeight + sectionGap;
    var monthChartHeight = Math.max(60, (height - chartAreaTop - 10) * 0.58);
    var weekdayChartHeight = Math.max(50, (height - chartAreaTop - 10) * 0.38);
    var weekdayChartTop = chartAreaTop + monthChartHeight + sectionGap;

    var marginL = 32;
    var marginR = 10;
    var innerWidth = width - marginL - marginR;

    // Insight text
    insights.lines.slice(0, 3).forEach(function (line, i) {
      var icon = i === 0 ? '\uD83D\uDCCA' : '\uD83D\uDD0D';
      svg.append('text')
        .attr('x', marginL)
        .attr('y', topMargin + i * insightLineH + 10)
        .attr('font-size', '10px')
        .attr('fill', '#1E3A8A')
        .attr('font-weight', '500')
        .text(icon + '  ' + line);
    });

    // Monthly bar chart
    var monthG = svg.append('g')
      .attr('transform', 'translate(' + marginL + ',' + chartAreaTop + ')');

    barChart(monthG, monthly, {
      innerWidth: innerWidth,
      innerHeight: monthChartHeight,
      barColor: '#93C5FD',
      peakColor: '#1E40AF',
      label: 'Crime by Month',
      showValues: true,
      setTooltip: setTooltip,
      onElementClick: onElementClick
    });

    // Weekday bar chart
    var weekdayG = svg.append('g')
      .attr('transform', 'translate(' + marginL + ',' + weekdayChartTop + ')');

    var weekdayColors = ['#F59E0B', '#3B82F6', '#3B82F6', '#3B82F6', '#3B82F6', '#3B82F6', '#F59E0B'];

    barChart(weekdayG, weekly, {
      innerWidth: innerWidth,
      innerHeight: weekdayChartHeight,
      barColor: function (i) { return weekdayColors[i]; },
      peakColor: '#DC2626',
      label: 'Crime by Day of Week',
      showValues: true,
      setTooltip: setTooltip,
      onElementClick: onElementClick
    });

  }, [monthly, weekly, insights, width, height, onElementClick]);

  if (validData.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-foreground/60 text-sm">
        No seasonal data available
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="overflow-visible"
        aria-label="Seasonal patterns analysis"
      />
      {tooltip && (
        <div
          className="absolute z-50 rounded-md bg-foreground px-3 py-1.5 text-xs text-white shadow-lg pointer-events-none"
          style={{ left: tooltip.x + 10, top: tooltip.y - 30 }}
        >
          <strong>{tooltip.label}:</strong> {typeof tooltip.value === 'number' ? tooltip.value.toLocaleString() : tooltip.value}
        </div>
      )}
    </div>
  );
}
