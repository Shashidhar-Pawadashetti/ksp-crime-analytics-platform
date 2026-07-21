// ksp-crime-analytics-platform/client/src/components/Dashboard/charts/HeatmapChart.jsx
//
// D3.js heatmap chart component using useRef + useEffect pattern.
// Calendar-style: cells represent category pairs, color intensity represents value.
// Fallback to grouped bar heatmap for non-temporal data.
// Respects prefers-reduced-motion.

import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

/**
 * Heatmap chart component rendering a D3.js SVG heatmap.
 * Supports both temporal (calendar) and categorical (grouped) heatmaps.
 *
 * @param {{ data: Array<{label: string, value: number, group?: string}>, width: number, height: number, onElementClick: function }} props
 * @returns {import('react').ReactElement}
 */
export default function HeatmapChart({ data, width, height, onElementClick }) {
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (!data || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    const margin = { top: 30, right: 20, bottom: 50, left: 100 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Clear previous render before re-render
    svg.selectAll('*').remove();

    const g = svg.append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    // Determine if data has groups (categorical pairs)
    const hasGroups = data.length > 0 && data[0].group !== undefined;

    if (hasGroups) {
      renderGroupedHeatmap(g, data, innerWidth, innerHeight, setTooltip, onElementClick, prefersReducedMotion);
    } else {
      renderSimpleHeatmap(g, data, innerWidth, innerHeight, setTooltip, onElementClick, prefersReducedMotion);
    }

  }, [data, width, height, onElementClick]);

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="overflow-visible"
        aria-label="Heatmap"
      />
      {tooltip && (
        <div
          className="absolute z-50 rounded-md bg-foreground px-3 py-1.5 text-xs text-white shadow-lg pointer-events-none"
          style={{ left: tooltip.x + 10, top: tooltip.y - 30 }}
        >
          <strong>{tooltip.label}:</strong> {tooltip.extra ? tooltip.extra + ' — ' : ''}
          {typeof tooltip.value === 'number' ? tooltip.value.toLocaleString() : tooltip.value}
        </div>
      )}
    </div>
  );
}

/**
 * Render a grouped heatmap where data has { label, value, group } tuples.
 * Rows = groups, columns = labels.
 */
function renderGroupedHeatmap(g, data, innerWidth, innerHeight, setTooltip, onElementClick, prefersReducedMotion) {
  const groups = Array.from(new Set(data.map(function (d) { return d.group; })));
  const labels = Array.from(new Set(data.map(function (d) { return d.label; })));

  const cellWidth = innerWidth / labels.length;
  const cellHeight = innerHeight / groups.length;

  const xScale = d3.scaleBand()
    .domain(labels)
    .range([0, innerWidth])
    .padding(0.05);

  const yScale = d3.scaleBand()
    .domain(groups)
    .range([0, innerHeight])
    .padding(0.05);

  const maxVal = d3.max(data, function (d) { return d.value; });
  const colorScale = d3.scaleSequential(d3.interpolateBlues)
    .domain([0, maxVal || 1]);

  // X axis labels
  g.append('g')
    .attr('transform', 'translate(0,' + innerHeight + ')')
    .call(d3.axisBottom(xScale))
    .selectAll('text')
    .attr('transform', 'rotate(-45)')
    .attr('text-anchor', 'end')
    .attr('font-size', '10px');

  // Y axis labels
  g.append('g')
    .call(d3.axisLeft(yScale))
    .selectAll('text')
    .attr('font-size', '10px');

  // Cells
  g.selectAll('rect')
    .data(data)
    .join('rect')
    .attr('x', function (d) { return xScale(d.label); })
    .attr('y', function (d) { return yScale(d.group); })
    .attr('width', xScale.bandwidth())
    .attr('height', yScale.bandwidth())
    .attr('rx', 2)
    .attr('fill', function (d) { return colorScale(d.value); })
    .style('cursor', 'pointer')
    .on('mouseenter', function (event, d) {
      d3.select(this).attr('stroke', '#1E3A8A').attr('stroke-width', 2);
      setTooltip({
        x: event.offsetX,
        y: event.offsetY,
        label: d.label + ' - ' + d.group,
        value: d.value
      });
    })
    .on('mouseleave', function () {
      d3.select(this).attr('stroke', 'none');
      setTooltip(null);
    })
    .on('click', function (event, d) {
      if (onElementClick) onElementClick(d);
    });
}

/**
 * Render a simple sequential heatmap: columns sorted by label, value mapped to blue intensity.
 */
function renderSimpleHeatmap(g, data, innerWidth, innerHeight, setTooltip, onElementClick, prefersReducedMotion) {
  const cols = Math.min(data.length, 15);
  const rows = Math.ceil(data.length / cols);
  const cellWidth = innerWidth / cols;
  const cellHeight = innerHeight / rows;

  const maxVal = d3.max(data, function (d) { return d.value; });
  const colorScale = d3.scaleSequential(d3.interpolateBlues)
    .domain([0, maxVal || 1]);

  g.selectAll('rect')
    .data(data)
    .join('rect')
    .attr('x', function (d, i) { return (i % cols) * cellWidth + 2; })
    .attr('y', function (d, i) { return Math.floor(i / cols) * cellHeight + 2; })
    .attr('width', cellWidth - 4)
    .attr('height', cellHeight - 4)
    .attr('rx', 2)
    .attr('fill', function (d) { return colorScale(d.value); })
    .style('cursor', 'pointer')
    .on('mouseenter', function (event, d) {
      d3.select(this).attr('stroke', '#1E3A8A').attr('stroke-width', 2);
      setTooltip({ x: event.offsetX, y: event.offsetY, label: d.label, value: d.value });
    })
    .on('mouseleave', function () {
      d3.select(this).attr('stroke', 'none');
      setTooltip(null);
    })
    .on('click', function (event, d) {
      if (onElementClick) onElementClick(d);
    });

  // Label some columns
  g.append('g')
    .attr('transform', 'translate(0,' + innerHeight + ')')
    .selectAll('text')
    .data(data.slice(0, cols))
    .join('text')
    .attr('x', function (d, i) { return i * cellWidth + cellWidth / 2; })
    .attr('y', 12)
    .attr('text-anchor', 'middle')
    .attr('font-size', '9px')
    .attr('fill', '#1E3A8A')
    .text(function (d) { return d.label.length > 8 ? d.label.slice(0, 8) + '…' : d.label; });
}
