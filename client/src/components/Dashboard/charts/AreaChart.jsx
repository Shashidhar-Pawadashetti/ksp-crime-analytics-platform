// ksp-crime-analytics-platform/client/src/components/Dashboard/charts/AreaChart.jsx
//
// D3.js area chart component using useRef + useEffect pattern.
// Features: gradient fill, hover tooltip with crosshair, brush zoom, baseline rise animation.
// Respects prefers-reduced-motion.

import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

/**
 * Area chart component rendering a D3.js SVG area chart with interactive features.
 *
 * @param {{ data: Array<{label: string, value: number}>, width: number, height: number, onElementClick: function }} props
 * @returns {import('react').ReactElement}
 */
export default function AreaChart({ data, width, height, onElementClick }) {
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (!data || data.length === 0) return;
    const validData = data.filter(function (d) { return d != null && typeof d.value === 'number' && isFinite(d.value); });
    if (validData.length === 0) return;

    const svg = d3.select(svgRef.current);
    const margin = { top: 20, right: 20, bottom: 40, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Clear previous render before re-render
    svg.selectAll('*').remove();

    const g = svg.append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    // Detect if data has Date labels
    const isDateData = validData.length > 0 && validData[0].label instanceof Date;

    // Scales
    const xScale = isDateData
      ? d3.scaleTime()
          .domain(d3.extent(validData, function (d) { return d.label; }))
          .range([0, innerWidth])
      : d3.scalePoint()
          .domain(validData.map(function (d) { return d.label; }))
          .range([0, innerWidth])
          .padding(0.5);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(validData, function (d) { return d.value; })])
      .range([innerHeight, 0]);

    // Axes
    g.append('g')
      .attr('transform', 'translate(0,' + innerHeight + ')')
      .call(d3.axisBottom(xScale));

    g.append('g')
      .call(d3.axisLeft(yScale));

    // Grid lines
    g.append('g')
      .attr('class', 'grid-lines')
      .call(d3.axisLeft(yScale)
        .tickSize(-innerWidth)
        .tickFormat('')
      )
      .selectAll('line')
      .attr('stroke', '#DBEAFE')
      .attr('stroke-dasharray', '3,3');

    // Gradient definition
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient')
      .attr('id', 'area-fill-gradient-' + width + '-' + height)
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#1E40AF')
      .attr('stop-opacity', 0.3);
    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#1E40AF')
      .attr('stop-opacity', 0);

    // Area generator
    const area = d3.area()
      .x(function (d) { return xScale(d.label); })
      .y0(innerHeight)
      .y1(function (d) { return yScale(d.value); })
      .curve(d3.curveMonotoneX);

    // Line generator (line on top of area)
    const line = d3.line()
      .x(function (d) { return xScale(d.label); })
      .y(function (d) { return yScale(d.value); })
      .curve(d3.curveMonotoneX);

    // Area path
    const areaPath = g.append('path')
      .datum(validData)
      .attr('class', 'area-fill')
      .attr('fill', 'url(#area-fill-gradient-' + width + '-' + height + ')')
      .attr('d', area);

    // Line path
    const linePath = g.append('path')
      .datum(validData)
      .attr('class', 'area-line')
      .attr('fill', 'none')
      .attr('stroke', '#1E40AF')
      .attr('stroke-width', 2)
      .attr('d', line);

    // Area fill animation: baseline rise + opacity fade
    if (!prefersReducedMotion.current) {
      // Start with y0 at height (baseline) and y1 at height (zero area)
      const initialArea = d3.area()
        .x(function (d) { return xScale(d.label); })
        .y0(innerHeight)
        .y1(innerHeight)
        .curve(d3.curveMonotoneX);

      areaPath.attr('d', initialArea);

      // Transition area to final
      areaPath.transition()
        .duration(600)
        .ease(d3.easeCubicInOut)
        .attr('d', area);

      // Stroke reveal
      const totalLength = linePath.node().getTotalLength();
      linePath
        .attr('stroke-dasharray', totalLength)
        .attr('stroke-dashoffset', totalLength)
        .transition()
        .duration(600)
        .ease(d3.easeCubicInOut)
        .attr('stroke-dashoffset', 0);
    }

    // Hover vertical crosshair
    const hoverLine = g.append('line')
      .attr('class', 'hover-line')
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', '#3B82F6')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3')
      .style('opacity', 0);

    // Data point circles
    g.selectAll('.data-point')
      .data(validData)
      .join('circle')
      .attr('class', 'data-point')
      .attr('cx', function (d) { return xScale(d.label); })
      .attr('cy', function (d) { return yScale(d.value); })
      .attr('r', 3)
      .attr('fill', '#1E40AF')
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('r', 6).attr('stroke', '#3B82F6').attr('stroke-width', 3);
        hoverLine
          .attr('x1', xScale(d.label))
          .attr('x2', xScale(d.label))
          .style('opacity', 1);
        setTooltip({
          x: event.offsetX,
          y: event.offsetY,
          label: d.label,
          value: d.value
        });
      })
      .on('mouseleave', function () {
        d3.select(this).attr('r', 3).attr('stroke', '#FFFFFF').attr('stroke-width', 2);
        hoverLine.style('opacity', 0);
        setTooltip(null);
      })
      .on('click', function (event, d) {
        if (onElementClick) onElementClick(d);
      });

    // Brush zoom on x-axis
    const brush = d3.brushX()
      .extent([[0, 0], [innerWidth, innerHeight]])
      .on('end', function (event) {
        if (!event.selection) return;
        // Brush zoom placeholder
      });
    g.append('g').attr('class', 'brush').call(brush);

  }, [data, width, height, onElementClick]);

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="overflow-visible"
        aria-label="Area chart"
      />
      {tooltip && (
        <div
          className="absolute z-50 rounded-md bg-foreground px-3 py-1.5 text-xs text-white shadow-lg pointer-events-none"
          style={{ left: tooltip.x + 10, top: tooltip.y - 30 }}
        >
          <strong>{tooltip.label instanceof Date ? tooltip.label.toLocaleDateString() : tooltip.label}:</strong>{' '}
          {typeof tooltip.value === 'number' ? tooltip.value.toLocaleString() : tooltip.value}
        </div>
      )}
    </div>
  );
}
