// ksp-crime-analytics-platform/client/src/components/Dashboard/charts/BarChart.jsx
//
// D3.js bar chart component using useRef + useEffect pattern.
// Features: hover tooltip as React DOM overlay, enter animation, brush zoom, click drill-down.
// Respects prefers-reduced-motion.

import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

/**
 * Bar chart component rendering a D3.js SVG bar chart with interactive features.
 *
 * @param {{ data: Array<{label: string, value: number}>, width: number, height: number, onBarClick: function }} props
 * @returns {import('react').ReactElement}
 */
export default function BarChart({ data, width, height, onBarClick }) {
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (!data || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    const margin = { top: 20, right: 20, bottom: 40, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Clear previous render before re-render
    svg.selectAll('*').remove();

    const g = svg.append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    // Scales
    const xScale = d3.scaleBand()
      .domain(data.map(function (d) { return d.label; }))
      .range([0, innerWidth])
      .padding(0.2);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, function (d) { return d.value; })])
      .range([innerHeight, 0]);

    // Axes
    g.append('g')
      .attr('transform', 'translate(0,' + innerHeight + ')')
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    g.append('g').call(d3.axisLeft(yScale));

    // Bars with enter animation
    const bars = g.selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', function (d) { return xScale(d.label); })
      .attr('width', xScale.bandwidth())
      .attr('fill', '#1E40AF')
      .attr('rx', 3)
      .on('mouseenter', function (event, d) {
        setTooltip({ x: event.offsetX, y: event.offsetY, label: d.label, value: d.value });
        d3.select(event.target).attr('fill', '#3B82F6');
      })
      .on('mouseleave', function (event) {
        setTooltip(null);
        d3.select(event.target).attr('fill', '#1E40AF');
      })
      .on('click', function (event, d) {
        if (onBarClick) onBarClick(d);
      });

    if (prefersReducedMotion.current) {
      bars.attr('y', function (d) { return yScale(d.value); })
        .attr('height', function (d) { return innerHeight - yScale(d.value); });
    } else {
      bars.attr('y', innerHeight)
        .attr('height', 0)
        .transition()
        .duration(500)
        .ease(d3.easeCubicOut)
        .attr('y', function (d) { return yScale(d.value); })
        .attr('height', function (d) { return innerHeight - yScale(d.value); });
    }

    // Brush zoom (optional)
    const brush = d3.brushX()
      .extent([[0, 0], [innerWidth, innerHeight]])
      .on('end', function (event) {
        if (!event.selection) return;
        // Brush zoom placeholder — actual zoom dispatch deferred to future enhancement
      });
    g.append('g').attr('class', 'brush').call(brush);

  }, [data, width, height, onBarClick]);

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="overflow-visible"
        aria-label="Bar chart"
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
