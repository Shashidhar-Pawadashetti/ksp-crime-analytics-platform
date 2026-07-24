import React, { useState, useCallback, useRef, useEffect } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import PersonSearch from './PersonSearch';
import GraphLegend from './GraphLegend';
import GraphSkeleton from './GraphSkeleton';
import { fetchGraph } from '../../services/api';

cytoscape.use(coseBilkent);

var EDGE_TYPE_CONFIG = {
  CO_ACCUSED: { label: 'Co-Accused', color: '#E53935' },
  ACCUSED_TO_VICTIM: { label: 'Accused → Victim', color: '#FF9800' },
  UNCONFIRMED_MATCH: { label: 'Unconfirmed', color: '#9E9E9E' },
  SHARED_LOCATION: { label: 'Shared Location', color: '#2196F3' },
};

var DEFAULT_STYLESHEET = [
  {
    selector: 'node',
    style: {
      'background-color': '#1E40AF',
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
      width: 50,
      height: 50
    }
  },
  {
    selector: 'node[degree]',
    style: {
      width: 'mapData(degree, 0, 10, 30, 80)',
      height: 'mapData(degree, 0, 10, 30, 80)'
    }
  },
  {
    selector: 'node[hop_distance]',
    style: {
      opacity: 'mapData(hop_distance, 0, 2, 1, 0.55)',
      'text-opacity': 'mapData(hop_distance, 0, 2, 1, 0.5)'
    }
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#D97706',
      'border-width': 4
    }
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.6,
      label: 'data(label)',
      'font-size': '9px',
      color: '#6B7280',
      'text-rotation': 'autorotate',
      opacity: 0.6,
      'text-opacity': 0.5
    }
  },
  {
    selector: 'edge:selected',
    style: {
      opacity: 1,
      'text-opacity': 1
    }
  }
];

function getInitialEdgeFilters() {
  var filters = {};
  for (var key in EDGE_TYPE_CONFIG) {
    filters[key] = true;
  }
  return filters;
}

export default function GraphView() {
  var _useState1 = useState([]);
  var elements = _useState1[0];
  var setElements = _useState1[1];

  var _useState2 = useState(DEFAULT_STYLESHEET);
  var stylesheet = _useState2[0];
  var setStylesheet = _useState2[1];

  var _useState3 = useState(false);
  var loading = _useState3[0];
  var setLoading = _useState3[1];

  var _useState4 = useState(null);
  var error = _useState4[0];
  var setError = _useState4[1];

  var _useState5 = useState(2);
  var maxHops = _useState5[0];
  var setMaxHops = _useState5[1];

  var _useState6 = useState(null);
  var searchPersonId = _useState6[0];
  var setSearchPersonId = _useState6[1];

  var _useState7 = useState(getInitialEdgeFilters());
  var edgeTypeFilter = _useState7[0];
  var setEdgeTypeFilter = _useState7[1];

  var cyRef = useRef(null);

  var applyEdgeFilters = useCallback(function () {
    var cy = cyRef.current;
    if (!cy || cy.nodes().length === 0) return;

    cy.edges().show();
    cy.nodes().show();

    for (var type in edgeTypeFilter) {
      if (!edgeTypeFilter[type]) {
        cy.edges('[edge_type = "' + type + '"]').hide();
      }
    }

    cy.nodes().forEach(function (node) {
      if (node.connectedEdges(':visible').length === 0) {
        node.hide();
      }
    });
  }, [edgeTypeFilter]);

  useEffect(function () {
    if (cyRef.current && elements.length > 0) {
      applyEdgeFilters();
    }
  }, [elements, applyEdgeFilters]);

  var fetchGraphData = useCallback(async function (personId, hops) {
    setLoading(true);
    setError(null);

    try {
      var data = await fetchGraph(personId, hops);

      var src = data.elements || { nodes: [], edges: [] };
      var newElements = [
        ...JSON.parse(JSON.stringify(src.nodes || [])),
        ...JSON.parse(JSON.stringify(src.edges || []))
      ];

      var backendStyles = Array.isArray(data.style) ? data.style : [];
      var mergedStyles = DEFAULT_STYLESHEET.concat(backendStyles);

      setElements(newElements);
      setStylesheet(mergedStyles);
      setSearchPersonId(personId);

      if (hops !== undefined) {
        setMaxHops(hops);
      }
    } catch (err) {
      setError(err.message || 'Unable to load network data.');
      setElements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  var handleSearch = useCallback(function (personId) {
    if (!personId) return;
    fetchGraphData(personId, 2);
    setMaxHops(2);
  }, [fetchGraphData]);

  var handleExpand = useCallback(function () {
    if (maxHops < 3 && searchPersonId) {
      var newHops = maxHops + 1;
      setMaxHops(newHops);
      fetchGraphData(searchPersonId, newHops);
    }
  }, [maxHops, searchPersonId, fetchGraphData]);

  var handleNodeClick = useCallback(function (evt) {
    var cy = cyRef.current;
    if (!cy) return;

    var target = evt.target;
    if (target === cy || target.length === 0) {
      cy.elements().style('opacity', '');
      cy.elements().style('text-opacity', '');
      return;
    }

    var connectedEdges = target.connectedEdges(':visible');
    var neighbors = connectedEdges.connectedNodes();
    var subgraph = target.add(connectedEdges).add(neighbors);

    cy.elements().style('opacity', 0.12);
    cy.elements().style('text-opacity', 0);
    subgraph.style('opacity', 1);
    subgraph.style('text-opacity', 1);

    target.select();
  }, []);

  var handleCanvasClick = useCallback(function () {
    var cy = cyRef.current;
    if (!cy) return;
    cy.elements().style('opacity', '');
    cy.elements().style('text-opacity', '');
  }, []);

  var handleRetry = useCallback(function () {
    if (searchPersonId) {
      fetchGraphData(searchPersonId, maxHops);
    }
  }, [searchPersonId, maxHops, fetchGraphData]);

  var toggleEdgeType = useCallback(function (type) {
    setEdgeTypeFilter(function (prev) {
      var next = {};
      for (var k in prev) next[k] = prev[k];
      next[type] = !prev[type];
      return next;
    });
  }, []);

  var hasContent = elements.length > 0;
  var edgeCount = elements.filter(function (el) { return el.data && el.data.source; }).length;
  var layoutConfig = edgeCount === 0
    ? { name: 'grid', padding: 50, rows: 1 }
    : {
        name: 'cose',
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 50,
        nodeRepulsion: 4500,
        idealEdgeLength: 150,
        gravity: 0.25,
        numIter: 1000,
        edgeElasticity: 100
      };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-border px-6 py-3">
        <PersonSearch onSelect={handleSearch} />
        {hasContent && maxHops < 3 && (
          <button
            className="shrink-0 rounded-md bg-cta px-4 py-1.5 font-body text-sm font-medium text-white transition-colors hover:opacity-90"
            onClick={handleExpand}
            aria-label={'Expand to ' + (maxHops + 1) + ' hops'}
          >
            Expand to {maxHops + 1} hops
          </button>
        )}
        {hasContent && (
          <div className="ml-auto flex items-center gap-1.5">
            {Object.keys(EDGE_TYPE_CONFIG).map(function (type) {
              var cfg = EDGE_TYPE_CONFIG[type];
              var active = edgeTypeFilter[type];
              return (
                <button
                  key={type}
                  className={
                    'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-body transition-colors ' +
                    (active
                      ? 'text-white'
                      : 'border border-border bg-dominant text-foreground/40 line-through')
                  }
                  style={active ? { backgroundColor: cfg.color } : {}}
                  onClick={function () { toggleEdgeType(type); }}
                  aria-label={'Toggle ' + cfg.label + ' edges'}
                  aria-pressed={active}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="relative flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-dominant/60">
            <GraphSkeleton />
          </div>
        )}

        {!loading && error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-dominant/60 px-6">
            <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-center" role="alert">
              <p className="mb-3 font-body text-sm leading-relaxed text-red-700">{error}</p>
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

        {hasContent && (
          <CytoscapeComponent
            elements={elements}
            stylesheet={stylesheet}
            layout={layoutConfig}
            style={{ width: '100%', height: '100%' }}
            cy={function (cy) {
              cyRef.current = cy;
              cy.on('tap', function (evt) {
                if (evt.target === cy) {
                  handleCanvasClick();
                }
              });
              cy.on('tap', 'node', function (evt) {
                handleNodeClick(evt);
              });
            }}
            zoomingEnabled={true}
            panningEnabled={true}
            minZoom={0.3}
            maxZoom={4}
            userPanningEnabled={true}
            userZoomingEnabled={true}
            boxSelectionEnabled={false}
          />
        )}

        <GraphLegend />
      </div>
    </div>
  );
}
