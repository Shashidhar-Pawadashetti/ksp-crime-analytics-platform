import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

var BAR_COLORS = ['#1E40AF', '#3B82F6', '#059669', '#D97706', '#7C3AED', '#6366F1', '#14B8A6', '#F43F5E'];
var FALLBACK_COLOR = '#94A3B8';

function truncate(str, max) {
  if (!str || str.length <= max) return str || '';
  return str.slice(0, max - 1) + '\u2026';
}

export default function HorizontalBarChart({ data, width, height, onElementClick }) {
  var svgRef = useRef(null);
  var [tooltip, setTooltip] = useState(null);
  var prefersReducedMotion = useRef(false);

  useEffect(function () {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(function () {
    if (!data || data.length === 0) return;

    var sorted = data
      .filter(function (d) { return d != null && typeof d.value === 'number' && isFinite(d.value); })
      .slice()
      .sort(function (a, b) { return b.value - a.value; });

    if (sorted.length === 0) return;

    var svg = d3.select(svgRef.current);
    var leftMargin = Math.min(Math.max(90, d3.max(sorted, function (d) { return d.label.length * 7; }) + 10), 160);
    var margin = { top: 12, right: 70, bottom: 8, left: leftMargin };
    var innerWidth = width - margin.left - margin.right;
    var innerHeight = height - margin.top - margin.bottom;

    svg.selectAll('*').remove();

    var g = svg.append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    var yScale = d3.scaleBand()
      .domain(sorted.map(function (d) { return d.label; }))
      .range([0, innerHeight])
      .padding(0.15);

    var xMax = sorted[0].value * 1.08;
    var xScale = d3.scaleLinear()
      .domain([0, xMax])
      .range([0, innerWidth]);

    // Horizontal grid lines
    g.append('g')
      .call(d3.axisLeft(yScale).tickSize(0).tickFormat(''))
      .selectAll('line')
      .attr('stroke', '#DBEAFE')
      .attr('stroke-dasharray', '3,3');

    // Bars
    var bars = g.selectAll('rect')
      .data(sorted)
      .join('rect')
      .attr('y', function (d) { return yScale(d.label); })
      .attr('height', yScale.bandwidth())
      .attr('fill', function (d, i) { return BAR_COLORS[i % BAR_COLORS.length] || FALLBACK_COLOR; })
      .attr('rx', 2)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('opacity', 0.85);
        setTooltip({
          x: event.offsetX,
          y: event.offsetY,
          label: d.label,
          value: d.value,
          rank: sorted.indexOf(d) + 1,
          total: sorted.length
        });
      })
      .on('mouseleave', function () {
        d3.select(this).attr('opacity', 1);
        setTooltip(null);
      })
      .on('click', function (event, d) {
        if (onElementClick) onElementClick(d);
      });

    if (prefersReducedMotion.current) {
      bars.attr('width', function (d) { return xScale(d.value); });
    } else {
      bars.attr('width', 0)
        .transition()
        .duration(500)
        .ease(d3.easeCubicOut)
        .attr('width', function (d) { return xScale(d.value); });
    }

    // Y-axis labels
    g.append('g')
      .call(d3.axisLeft(yScale))
      .selectAll('text')
      .attr('font-size', '10px')
      .attr('fill', '#1E3A8A')
      .text(function (d) { return truncate(d, 18); });

    // Value labels at bar end
    g.selectAll('.bar-value')
      .data(sorted)
      .join('text')
      .attr('class', 'bar-value')
      .attr('x', function (d) { return xScale(d.value) + 4; })
      .attr('y', function (d) { return yScale(d.label) + yScale.bandwidth() / 2 + 3; })
      .attr('font-size', '9px')
      .attr('fill', '#64748B')
      .text(function (d) { return d.value.toLocaleString(); });

    // Rank badges on top 3 bars
    sorted.slice(0, 3).forEach(function (d, i) {
      g.append('text')
        .attr('x', xScale(d.value) + 4)
        .attr('y', yScale(d.label) + 4)
        .attr('font-size', '7px')
        .attr('fill', '#94A3B8')
        .attr('font-weight', 'bold')
        .text('#' + (i + 1));
    });

  }, [data, width, height, onElementClick]);

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="overflow-visible"
        aria-label="Horizontal bar chart"
      />
      {tooltip && (
        <div
          className="absolute z-50 rounded-md bg-foreground px-3 py-1.5 text-xs text-white shadow-lg pointer-events-none"
          style={{ left: tooltip.x + 10, top: tooltip.y - 30 }}
        >
          <strong>{tooltip.label}</strong>
          <br />
          {tooltip.value.toLocaleString()} cases
          <br />
          Rank #{tooltip.rank} of {tooltip.total}
        </div>
      )}
    </div>
  );
}
