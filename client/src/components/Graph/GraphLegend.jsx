// ksp-crime-analytics-platform/client/src/components/Graph/GraphLegend.jsx
//
// Compact overlay card showing node shape/color meanings and edge type descriptions.
// Positioned at bottom-right of the graph container.

import React, { useState } from 'react';

const NODE_ITEMS = [
  { label: 'Accused', color: '#DC2626', shape: 'circle' },
  { label: 'Victim', color: '#059669', shape: 'circle' },
  { label: 'Complainant', color: '#3B82F6', shape: 'circle' },
  { label: 'Case', color: '#1E40AF', shape: 'rounded-rect' },
];

const EDGE_ITEMS = [
  { label: 'Co-Accused', color: '#DC2626', style: 'solid' },
  { label: 'Accused → Victim', color: '#D97706', style: 'solid' },
  { label: 'Shared Location', color: '#3B82F6', style: 'dotted' },
];

function NodeSwatch({ color, shape }) {
  if (shape === 'rounded-rect') {
    return (
      <span
        className="inline-block shrink-0"
        style={{
          width: 16,
          height: 12,
          borderRadius: 3,
          backgroundColor: color,
        }}
      />
    );
  }
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: 12,
        height: 12,
        backgroundColor: color,
      }}
    />
  );
}

function EdgeSwatch({ color, style }) {
  const borderStyle = style === 'dotted' ? 'dotted' : 'solid';
  return (
    <span
      className="inline-block shrink-0"
      style={{
        width: 20,
        height: 0,
        borderTop: `2px ${borderStyle} ${color}`,
        marginTop: 6,
      }}
    />
  );
}

export default function GraphLegend() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="absolute bottom-4 right-4 z-20">
      <div className="rounded-lg border border-border bg-dominant/95 shadow-lg backdrop-blur-sm">
        {/* Header */}
        <button
          className="flex w-full items-center justify-between px-3 py-2 font-heading text-sm font-semibold text-foreground hover:bg-border/40"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand legend' : 'Collapse legend'}
        >
          <span>Legend</span>
          <svg
            className={`h-3 w-3 transform text-foreground/40 transition-transform ${collapsed ? '' : 'rotate-180'}`}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M3 5l3 3 3-3" />
          </svg>
        </button>

        {!collapsed && (
          <div className="space-y-3 px-3 pb-3 pt-1">
            {/* Node types */}
            <div>
              <h4 className="mb-1.5 font-body text-xs font-semibold text-foreground/60 uppercase tracking-wide">
                Nodes
              </h4>
              <div className="space-y-1.5">
                {NODE_ITEMS.map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <NodeSwatch color={item.color} shape={item.shape} />
                    <span className="font-body text-xs text-foreground/70">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Edge types */}
            <div>
              <h4 className="mb-1.5 font-body text-xs font-semibold text-foreground/60 uppercase tracking-wide">
                Edges
              </h4>
              <div className="space-y-1.5">
                {EDGE_ITEMS.map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <EdgeSwatch color={item.color} style={item.style} />
                    <span className="font-body text-xs text-foreground/70">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
