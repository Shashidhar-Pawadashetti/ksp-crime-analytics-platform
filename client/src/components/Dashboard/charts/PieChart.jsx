// ksp-crime-analytics-platform/client/src/components/Dashboard/charts/PieChart.jsx
//
// D3.js pie/donut chart component using useRef + useEffect pattern.
// Features: hover arc expansion, tooltip with percentage, legend, arc enter animation.
// Respects prefers-reduced-motion.

import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

/**
 * Categorical palette assigned by index — C1 through C6 from UI-SPEC.
 */
const CATEGORICAL_COLORS = ['#1E40AF', '#3B82F6', '#059669', '#D97706', '#DC2626', '#7C3AED'];

/**
 * Pie/donut chart component rendering a D3.js SVG pie chart with interactive features.
 *
 * @param {{ data: Array<{label: string, value: number}>, width: number, height: number, onElementClick: function }} props
 * @returns {import('react').ReactElement}
 */
export default function PieChart({ data, width, height, onElementClick }) {
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (!data || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    const margin = { top: 20, right: 20, bottom: 60, left: 20 };
    const radius = Math.min(width, height) / 2 - margin.top;
    const innerRadius = radius * 0.4; // Donut variant
    const outerRadius = radius;

    // Clear previous render before re-render
    svg.selectAll('*').remove();

    const g = svg.append('g')
      .attr('transform', 'translate(' + width / 2 + ',' + (height / 2 - 10) + ')');

    // Pie generator
    const pie = d3.pie()
      .value(function (d) { return d.value; })
      .sort(null);

    // Arc generators
    const arc = d3.arc()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius);

    const arcHover = d3.arc()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius + 5);

    // Total for percentage calculation
    const total = d3.sum(data, function (d) { return d.value; });

    // Arcs
    g.selectAll('path')
      .data(pie(data))
      .join('path')
      .attr('d', arc)
      .attr('fill', function (d, i) { return CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]; })
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arcHover);
        setTooltip({
          x: event.offsetX,
          y: event.offsetY - 10,
          label: d.data.label,
          value: d.data.value,
          percent: ((d.data.value / total) * 100).toFixed(1)
        });
      })
      .on('mouseleave', function () {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arc);
        setTooltip(null);
      })
      .on('click', function (event, d) {
        if (onElementClick) onElementClick(d.data);
      });

    // Arc enter animation: radius grow from center
    if (!prefersReducedMotion.current) {
      g.selectAll('path')
        .transition()
        .duration(500)
        .ease(d3.easeCubicOut)
        .attrTween('d', function (d) {
          const interpolate = d3.interpolate(
            { startAngle: d.startAngle, endAngle: d.startAngle },
            { startAngle: d.startAngle, endAngle: d.endAngle }
          );
          return function (t) {
            return arc(interpolate(t));
          };
        });
    }

    // Legend: below the pie, compact 2-column layout
    const legendG = svg.append('g')
      .attr('transform', 'translate(' + 20 + ',' + (height - 45) + ')');

    const legendItems = data.map(function (d, i) {
      return {
        color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
        label: d.label,
        value: d.value
      };
    });

    const legendItemHeight = 18;
    const legendColWidth = Math.max(width / 2 - 30, 120);
    const itemsPerCol = Math.ceil(legendItems.length / 2);

    legendItems.forEach(function (item, i) {
      const col = Math.floor(i / itemsPerCol);
      const row = i % itemsPerCol;
      const x = col * legendColWidth;
      const y = row * legendItemHeight;

      // Color square
      legendG.append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', 10)
        .attr('height', 10)
        .attr('rx', 2)
        .attr('fill', item.color);

      // Label
      legendG.append('text')
        .attr('x', x + 14)
        .attr('y', y + 9)
        .attr('font-size', '11px')
        .attr('fill', '#1E3A8A')
        .style('font-family', 'Fira Sans, sans-serif')
        .text(item.label);
    });

  }, [data, width, height, onElementClick]);

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="overflow-visible"
        aria-label="Pie chart"
      />
      {tooltip && (
        <div
          className="absolute z-50 rounded-md bg-foreground px-3 py-1.5 text-xs text-white shadow-lg pointer-events-none"
          style={{ left: tooltip.x + 10, top: tooltip.y - 30 }}
        >
          <strong>{tooltip.label}:</strong> {typeof tooltip.value === 'number' ? tooltip.value.toLocaleString() : tooltip.value}
          {tooltip.percent && <span> ({tooltip.percent}%)</span>}
        </div>
      )}
    </div>
  );
}
