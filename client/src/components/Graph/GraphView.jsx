// ksp-crime-analytics-platform/client/src/components/Graph/GraphView.jsx
//
// Interactive entity relationship network graph using Cytoscape.js.
// Allows users to search for a person and explore their connections.

import React, { useState, useCallback, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import PersonSearch from './PersonSearch';
import GraphLegend from './GraphLegend';
import GraphSkeleton from './GraphSkeleton';
import { fetchGraph } from '../../services/api';

// Register cose-bilkent layout once at module level — critical: must be before rendering
cytoscape.use(coseBilkent);

const DEFAULT_STYLESHEET = [
  // Default node style — persons (circle), cases (round rectangle)
  {
    selector: 'node',
    style: {
      'background-color': '#1E40AF',
      width: 50,
      height: 50,
      'border-color': '#1E3A8A',
      'border-width': 2,
      label: 'data(label)',
      'font-family': 'Fira Code, monospace',
      'font-size': '11px',
      color: '#1E3A8A',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-wrap': 'ellipsis',
      'text-max-width': 80,
    }
  },
  // Default edge style
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.8,
      label: 'data(label)',
      'font-size': '10px',
      color: '#6B7280',
      'text-rotation': 'autorotate'
    }
  },
  // Selected node highlight
  {
    selector: ':selected',
    style: {
      'border-color': '#D97706',
      'border-width': 4
    }
  }
];

/**
 * GraphView — interactive network graph exploration view.
 * Fetches graph data from graph-service-api, renders with Cytoscape.js.
 */
export default function GraphView() {
  const [elements, setElements] = useState({ nodes: [], edges: [] });
  const [stylesheet, setStylesheet] = useState(DEFAULT_STYLESHEET);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [maxHops, setMaxHops] = useState(2);
  const [searchPersonId, setSearchPersonId] = useState(null);
  const cyRef = useRef(null);

  const fetchGraphData = useCallback(async (personId, hops) => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchGraph(personId, hops);

      // Deep clone with JSON parse/stringify to create new reference (Pitfall 2 fix)
      const newElements = data.elements
        ? JSON.parse(JSON.stringify(data.elements))
        : { nodes: [], edges: [] };

      // Build stylesheet: defaults + backend-provided styles
      const backendStyles = Array.isArray(data.style) ? data.style : [];
      const mergedStyles = [
        ...DEFAULT_STYLESHEET,
        // Shape differentiation: persons = ellipse, cases = roundrectangle
        {
          selector: 'node[type = "person"]',
          style: { shape: 'ellipse' }
        },
        {
          selector: 'node[type = "case"]',
          style: { shape: 'roundrectangle', width: 70 }
        },
        ...backendStyles
      ];

      setElements(newElements);
      setStylesheet(mergedStyles);
      setSearchPersonId(personId);

      // Reset maxHops if graph returned successfully
      if (hops !== undefined) {
        setMaxHops(hops);
      }
    } catch (err) {
      setError(err.message || 'Unable to load network data.');
      setElements({ nodes: [], edges: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback((personId) => {
    if (!personId) return;
    fetchGraphData(personId, 2);
    setMaxHops(2);
  }, [fetchGraphData]);

  const handleExpand = useCallback(() => {
    if (maxHops < 3 && searchPersonId) {
      const newHops = maxHops + 1;
      setMaxHops(newHops);
      fetchGraphData(searchPersonId, newHops);
    }
  }, [maxHops, searchPersonId, fetchGraphData]);

  const handleNodeClick = useCallback((evt) => {
    const node = evt.target;
    // Ignore clicks on the background (cy itself)
    if (node === cyRef.current || node.length === 0) return;

    // Highlight the clicked node, its connected edges, and neighbor nodes
    node.select();
    node.connectedEdges().select();
    node.connectedEdges().connectedNodes().select();
  }, []);

  const handleRetry = useCallback(() => {
    if (searchPersonId) {
      fetchGraphData(searchPersonId, maxHops);
    }
  }, [searchPersonId, maxHops, fetchGraphData]);

  // Derive hasElements from the elements state
  const hasNodes = elements.nodes && elements.nodes.length > 0;
  const hasContent = hasNodes;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-4 border-b border-border px-6 py-3">
        <PersonSearch onSelect={handleSearch} />
        {hasContent && maxHops < 3 && (
          <button
            className="rounded-md bg-cta px-4 py-1.5 font-body text-sm font-medium text-white transition-colors hover:opacity-90"
            onClick={handleExpand}
            aria-label="Expand to 3 hops"
          >
            Expand to {maxHops + 1} hops
          </button>
        )}
      </div>

      {/* Graph canvas */}
      <div className="relative flex-1">
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-dominant/60">
            <GraphSkeleton />
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-dominant/60 px-6">
            <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-center" role="alert">
              <p className="mb-3 font-body text-sm leading-relaxed text-red-700">
                {error}
              </p>
              <button
                className="rounded-md bg-accent px-4 py-1.5 font-body text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                onClick={handleRetry}
                aria-label="Retry loading graph"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Empty state — no person searched yet */}
        {!loading && !error && !hasContent && (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 text-foreground/20">
              <svg className="h-16 w-16 mx-auto" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="32" cy="20" r="8" />
                <circle cx="16" cy="40" r="6" />
                <circle cx="48" cy="40" r="6" />
                <line x1="32" y1="28" x2="16" y2="34" />
                <line x1="32" y1="28" x2="48" y2="34" />
                <line x1="16" y1="46" x2="48" y2="46" />
              </svg>
            </div>
            <h3 className="mb-2 font-heading text-lg font-semibold text-foreground">
              Search for a person to explore their network
            </h3>
            <p className="max-w-sm font-body text-sm text-foreground/60">
              Enter a name above to visualize connections between persons and cases. Discover co-accused, victim-perpetrator links, and shared locations.
            </p>
          </div>
        )}

        {/* Empty state — no results from search */}
        {!loading && !error && searchPersonId && !hasContent && (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <h3 className="mb-2 font-heading text-lg font-semibold text-foreground">
              No relationships found
            </h3>
            <p className="max-w-sm font-body text-sm text-foreground/60">
              No connections were found for this person. Try a different name or a broader search.
            </p>
          </div>
        )}

        {/* Cytoscape.js graph canvas */}
        {hasContent && (
          <CytoscapeComponent
            elements={elements}
            stylesheet={stylesheet}
            layout={{
              name: 'cose-bilkent',
              animate: true,
              animationDuration: 500,
              fit: true,
              padding: 30,
            }}
            style={{ width: '100%', height: '100%' }}
            cy={(cy) => { cyRef.current = cy; }}
            zoomingEnabled={true}
            panningEnabled={true}
            minZoom={0.5}
            maxZoom={3}
            userPanningEnabled={true}
            userZoomingEnabled={true}
            boxSelectionEnabled={false}
          />
        )}

        {/* Graph legend overlay */}
        <GraphLegend />
      </div>
    </div>
  );
}
