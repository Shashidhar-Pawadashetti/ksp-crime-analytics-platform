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
    const validData = data.filter(function (d) { return d != null && typeof d.value === 'number' && isFinite(d.value); });
    if (validData.length === 0) return;

    const svg = d3.select(svgRef.current);
    const margin = { top: 10, right: 10, bottom: 15, left: 10 };
    const radius = Math.min(width, height) * 0.42;
    const innerRadius = radius * 0.35;
    const outerRadius = radius;

    // Clear previous render before re-render
    svg.selectAll('*').remove();

    const g = svg.append('g')
      .attr('transform', 'translate(' + width / 2 + ',' + (height * 0.45) + ')');

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
    const total = d3.sum(validData, function (d) { return d.value; });

    // Arcs
    g.selectAll('path')
      .data(pie(validData))
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

    // Legend: compact inline below the pie
    var legendBottom = height * 0.85;
    var legendG = svg.append('g')
      .attr('transform', 'translate(10,' + legendBottom + ')');

    var legendItems = validData.map(function (d, i) {
      return {
        color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
        label: d.label.length > 14 ? d.label.slice(0, 14) + '...' : d.label
      };
    });

    var availWidth = Math.max(100, width - 20);
    var colCount = Math.min(legendItems.length, 3);
    var colWidth = availWidth / colCount;
    var perCol = Math.ceil(legendItems.length / colCount);

    legendItems.forEach(function (item, i) {
      var col = Math.floor(i / perCol);
      var row = i % perCol;
      legendG.append('rect')
        .attr('x', col * colWidth)
        .attr('y', row * 14)
        .attr('width', 8)
        .attr('height', 8)
        .attr('rx', 2)
        .attr('fill', item.color);
      legendG.append('text')
        .attr('x', col * colWidth + 12)
        .attr('y', row * 14 + 7)
        .attr('font-size', '10px')
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
