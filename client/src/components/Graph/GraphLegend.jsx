import React, { useState } from 'react';

var NODE_ITEMS = [
  { key: 'ACCUSED', label: 'Accused', color: '#E53935', shape: 'circle' },
  { key: 'VICTIM', label: 'Victim', color: '#FF9800', shape: 'circle' },
  { key: 'COMPLAINANT', label: 'Complainant', color: '#43A047', shape: 'circle' },
  { key: 'MIXED', label: 'Mixed Role', color: '#7B1FA2', shape: 'circle' },
  { key: 'CASE', label: 'Case', color: '#1E40AF', shape: 'rounded-rect' },
];

var EDGE_ITEMS = [
  { key: 'CO_ACCUSED', label: 'Co-Accused', color: '#E53935', style: 'solid' },
  { key: 'ACCUSED_TO_VICTIM', label: 'Accused \u2192 Victim', color: '#FF9800', style: 'solid' },
  { key: 'SHARED_LOCATION', label: 'Shared Location', color: '#2196F3', style: 'dotted' },
  { key: 'UNCONFIRMED_MATCH', label: 'Unconfirmed Match', color: '#9E9E9E', style: 'dashed' },
];

function NodeSwatch({ color, shape }) {
  if (shape === 'rounded-rect') {
    return (
      <span
        className="inline-block shrink-0"
        style={{ width: 16, height: 12, borderRadius: 3, backgroundColor: color }}
      />
    );
  }
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: 12, height: 12, backgroundColor: color }}
    />
  );
}

function EdgeSwatch({ color, style }) {
  var borderStyle = style === 'dotted' ? 'dotted' : style === 'dashed' ? 'dashed' : 'solid';
  return (
    <span
      className="inline-block shrink-0"
      style={{ width: 20, height: 0, borderTop: '2px ' + borderStyle + ' ' + color, marginTop: 6 }}
    />
  );
}

export default function GraphLegend({ nodeFilters, edgeFilters, onToggleNode, onToggleEdge }) {
  var _useState = useState(false);
  var collapsed = _useState[0];
  var setCollapsed = _useState[1];

  return (
    <div className="absolute bottom-4 right-4 z-20">
      <div className="rounded-lg border border-border bg-dominant/95 shadow-lg backdrop-blur-sm">
        <button
          className="flex w-full items-center justify-between px-3 py-2 font-heading text-sm font-semibold text-foreground hover:bg-border/40"
          onClick={function () { setCollapsed(!collapsed); }}
          aria-label={collapsed ? 'Expand legend' : 'Collapse legend'}
        >
          <span>Legend</span>
          <svg
            className={'h-3 w-3 transform text-foreground/40 transition-transform ' + (collapsed ? '' : 'rotate-180')}
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
            <div>
              <h4 className="mb-1.5 font-body text-xs font-semibold text-foreground/60 uppercase tracking-wide">
                Nodes
              </h4>
              <div className="space-y-1">
                {NODE_ITEMS.map(function (item) {
                  var active = !nodeFilters || nodeFilters[item.key] !== false;
                  return (
                    <button
                      key={item.key}
                      className={'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-border/40 ' + (active ? '' : 'opacity-40')}
                      onClick={function () { onToggleNode && onToggleNode(item.key); }}
                      aria-label={'Toggle ' + item.label + ' nodes'}
                      aria-pressed={active}
                    >
                      <NodeSwatch color={active ? item.color : '#6B7280'} shape={item.shape} />
                      <span className={'font-body text-xs ' + (active ? 'text-foreground/70' : 'text-foreground/30 line-through')}>
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h4 className="mb-1.5 font-body text-xs font-semibold text-foreground/60 uppercase tracking-wide">
                Edges
              </h4>
              <div className="space-y-1">
                {EDGE_ITEMS.map(function (item) {
                  var active = !edgeFilters || edgeFilters[item.key] !== false;
                  return (
                    <button
                      key={item.key}
                      className={'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-border/40 ' + (active ? '' : 'opacity-40')}
                      onClick={function () { onToggleEdge && onToggleEdge(item.key); }}
                      aria-label={'Toggle ' + item.label + ' edges'}
                      aria-pressed={active}
                    >
                      <EdgeSwatch color={active ? item.color : '#6B7280'} style={item.style} />
                      <span className={'font-body text-xs ' + (active ? 'text-foreground/70' : 'text-foreground/30 line-through')}>
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
