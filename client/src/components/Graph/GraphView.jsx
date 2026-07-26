import React, { useState, useCallback, useRef, useEffect } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import { createScope, animate } from 'animejs';
import PersonSearch from './PersonSearch';
import GraphLegend from './GraphLegend';
import GraphSkeleton from './GraphSkeleton';
import GraphInfoPanel from './GraphInfoPanel';
import { fetchGraph } from '../../services/api';

cytoscape.use(coseBilkent);

var EDGE_TYPE_CONFIG = {
  CO_ACCUSED: { label: 'Co-Accused', color: '#E53935' },
  ACCUSED_TO_VICTIM: { label: 'Accused \u2192 Victim', color: '#FF9800' },
  UNCONFIRMED_MATCH: { label: 'Unconfirmed', color: '#9E9E9E' },
  SHARED_LOCATION: { label: 'Shared Location', color: '#2196F3' },
};

var NODE_TYPE_CONFIG = {
  ACCUSED: { label: 'Accused', color: '#E53935' },
  VICTIM: { label: 'Victim', color: '#FF9800' },
  COMPLAINANT: { label: 'Complainant', color: '#43A047' },
  MIXED: { label: 'Mixed Role', color: '#7B1FA2' },
  CASE: { label: 'Case', color: '#1E40AF' },
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
      'font-size': '12px',
      color: '#FFFFFF',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 6,
      'text-wrap': 'ellipsis',
      'text-max-width': 130,
      'text-background-color': '#1F2937',
      'text-background-opacity': 0.85,
      'text-background-padding': 4,
      'text-background-shape': 'roundrectangle',
      'text-events': 'yes',
      width: 50,
      height: 50,
      'z-index': 10,
    },
  },
  {
    selector: 'node[degree]',
    style: {
      width: 'mapData(degree, 0, 10, 30, 80)',
      height: 'mapData(degree, 0, 10, 30, 80)',
    },
  },
  {
    selector: 'node[hop_distance = 0]',
    style: {
      opacity: 1,
      'text-opacity': 1,
      'font-size': '15px',
      'font-weight': 'bold',
      'text-background-color': '#111827',
      'text-background-opacity': 0.95,
      'text-background-padding': 6,
      width: 'mapData(degree, 0, 10, 50, 90)',
      height: 'mapData(degree, 0, 10, 50, 90)',
      'z-index': 50,
    },
  },
  {
    selector: 'node[hop_distance = 1]',
    style: {
      opacity: 1,
      'text-opacity': 1,
      'font-size': '12px',
    },
  },
  {
    selector: 'node[hop_distance >= 2]',
    style: {
      opacity: 0.5,
      'text-opacity': 0,
      'font-size': '11px',
      'z-index': 5,
    },
  },
  {
    selector: 'node[degree >= 8]',
    style: {
      'font-size': '14px',
      'font-weight': 'bold',
      'text-background-color': '#111827',
      'text-background-opacity': 0.9,
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#D97706',
      'border-width': 5,
      'font-size': '16px',
      'font-weight': 'bold',
      color: '#FBBF24',
      'text-background-color': '#1F2937',
      'text-background-opacity': 0.98,
      'text-background-padding': 8,
      'text-margin-y': 8,
      'z-index': 200,
      'transition-property': 'border-color, border-width, font-size',
      'transition-duration': '0.2s',
    },
  },
  {
    selector: 'node.focused-neighbor',
    style: {
      opacity: 1,
      'text-opacity': 1,
      'z-index': 30,
    },
  },
  {
    selector: 'node.faded-node',
    style: {
      opacity: 0.08,
      'text-opacity': 0,
      'z-index': 1,
    },
  },
  {
    selector: 'node.hop2-revealed',
    style: {
      'text-opacity': 1,
      opacity: 0.7,
      'z-index': 15,
    },
  },
  {
    selector: 'node.node-hover',
    style: {
      'border-color': '#60A5FA',
      'border-width': 3,
      'text-background-opacity': 0.95,
      'transition-property': 'border-color, border-width',
      'transition-duration': '0.15s',
    },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.6,
      label: 'data(label)',
      'font-size': '10px',
      color: '#D1D5DB',
      'text-background-color': '#1F2937',
      'text-background-opacity': 0.85,
      'text-background-padding': 3,
      'text-background-shape': 'roundrectangle',
      'text-rotation': 'autorotate',
      'text-opacity': 0,
      opacity: 0.5,
      width: 1.5,
      'z-index': 5,
    },
  },
  {
    selector: 'edge.focused-edge',
    style: {
      opacity: 0.9,
      'text-opacity': 1,
      width: 2.5,
      'z-index': 40,
    },
  },
  {
    selector: 'edge.faded-edge',
    style: {
      opacity: 0.04,
      'text-opacity': 0,
      'z-index': 1,
    },
  },
  {
    selector: 'edge:selected',
    style: {
      opacity: 1,
      'text-opacity': 1,
      'font-size': '11px',
      'z-index': 50,
    },
  },
];

var COLOR_TO_ROLE = {
  '#E53935': 'ACCUSED',
  '#FF9800': 'VICTIM',
  '#43A047': 'COMPLAINANT',
  '#7B1FA2': 'MIXED',
};

function deriveNodeRole(nodeData) {
  var style = nodeData.node_style;
  if (style && style.color && COLOR_TO_ROLE[style.color]) {
    return COLOR_TO_ROLE[style.color];
  }
  var roles = nodeData.roles_summary || {};
  var hasAccused = (roles.accused_count || 0) > 0;
  var hasVictim = (roles.victim_count || 0) > 0;
  var hasComplainant = (roles.complainant_count || 0) > 0;
  var count = (hasAccused ? 1 : 0) + (hasVictim ? 1 : 0) + (hasComplainant ? 1 : 0);
  if (count > 1) return 'MIXED';
  if (hasAccused) return 'ACCUSED';
  if (hasVictim) return 'VICTIM';
  if (hasComplainant) return 'COMPLAINANT';
  return 'CASE';
}

function getInitialFilters(config) {
  var f = {};
  for (var k in config) f[k] = true;
  return f;
}

function computeEdgeBreakdown(cy, nodeId) {
  if (!cy || !nodeId) return null;
  var node = cy.getElementById(nodeId);
  if (!node || node.length === 0) return null;
  var edges = node.connectedEdges();
  var breakdown = {};
  edges.forEach(function (edge) {
    var type = edge.data('edge_type');
    if (type) breakdown[type] = (breakdown[type] || 0) + 1;
  });
  return breakdown;
}

function getPersonInfo(cy, node) {
  if (!cy || !node) return null;
  var roles = node.data('roles_summary') || {};
  var neighborCount = node.connectedEdges().length;
  var degree = node.data('degree') || 0;
  var nodeId = node.data('id');
  return {
    label: node.data('label') || 'Unknown',
    degree: degree,
    neighborCount: neighborCount,
    roles_summary: roles,
    edgeBreakdown: computeEdgeBreakdown(cy, nodeId),
  };
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

  var _useState5 = useState(1);
  var maxHops = _useState5[0];
  var setMaxHops = _useState5[1];

  var _useState6 = useState(null);
  var searchPersonId = _useState6[0];
  var setSearchPersonId = _useState6[1];

  var _useState7 = useState(getInitialFilters(EDGE_TYPE_CONFIG));
  var edgeTypeFilter = _useState7[0];
  var setEdgeTypeFilter = _useState7[1];

  var _useState8 = useState(getInitialFilters(NODE_TYPE_CONFIG));
  var nodeTypeFilter = _useState8[0];
  var setNodeTypeFilter = _useState8[1];

  var _useState9 = useState(null);
  var selectedPersonInfo = _useState9[0];
  var setSelectedPersonInfo = _useState9[1];

  var cyRef = useRef(null);
  var cyDestroyedRef = useRef(false);
  var animScope = useRef(null);

  useEffect(function () {
    if (!cyRef.current || elements.length === 0) return;
    var cy = cyRef.current;
    var container = cy.container();
    if (!container) return;

    animScope.current = createScope({ root: container }).add(function () {
      animate(container, {
        opacity: [0, 1],
        duration: 300,
        ease: 'out(2)',
      });
    });

    return function () {
      if (animScope.current) {
        animScope.current.revert();
        animScope.current = null;
      }
    };
  }, [elements]);

  var applyFilters = useCallback(function () {
    var cy = cyRef.current;
    if (!cy || cy.nodes().length === 0) return;

    cy.edges().show();
    cy.nodes().show();

    for (var type in edgeTypeFilter) {
      if (!edgeTypeFilter[type]) {
        cy.edges('[edge_type = "' + type + '"]').hide();
      }
    }

    var isAnyNodeFilterOff = false;
    for (var nt in nodeTypeFilter) {
      if (!nodeTypeFilter[nt]) {
        isAnyNodeFilterOff = true;
        break;
      }
    }

    if (isAnyNodeFilterOff) {
      cy.nodes().forEach(function (node) {
        var role = node.data('role') || node.data('node_role');
        if (!role || !nodeTypeFilter[role]) {
          node.hide();
        }
      });
    }

    cy.nodes().forEach(function (node) {
      if (node.connectedEdges(':visible').length === 0 && !node.selected()) {
        node.hide();
      }
    });

    if (cy.nodes(':visible').length === 0) {
      cy.nodes().show();
      cy.edges().show();
    }
  }, [edgeTypeFilter, nodeTypeFilter]);

  useEffect(function () {
    if (cyRef.current && elements.length > 0) {
      applyFilters();
    }
  }, [elements, applyFilters]);

  var fetchGraphData = useCallback(async function (personId, hops) {
    setLoading(true);
    setError(null);
    setSelectedPersonInfo(null);

    try {
      var data = await fetchGraph(personId, hops);

      var src = data.elements || { nodes: [], edges: [] };
      var enrichedNodes = (src.nodes || []).map(function (n) {
        if (n.data && !n.data.role) {
          n.data.role = deriveNodeRole(n.data);
        }
        return n;
      });
      var newElements = [
        ...JSON.parse(JSON.stringify(enrichedNodes)),
        ...JSON.parse(JSON.stringify(src.edges || [])),
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
    fetchGraphData(personId, 1);
    setMaxHops(1);
  }, [fetchGraphData]);

  var handleExpand = useCallback(function () {
    if (maxHops < 3 && searchPersonId) {
      var newHops = maxHops + 1;
      setMaxHops(newHops);
      fetchGraphData(searchPersonId, newHops);
    }
  }, [maxHops, searchPersonId, fetchGraphData]);

  function focusSubgraph(cy, target) {
    cy.elements().removeClass('faded-node faded-edge focused-neighbor focused-edge');

    var connectedEdges = target.connectedEdges(':visible');
    var neighbors = connectedEdges.connectedNodes();

    cy.elements().addClass('faded-node');
    cy.edges().addClass('faded-edge');

    target.removeClass('faded-node');
    target.addClass('focused-neighbor');

    neighbors.removeClass('faded-node');
    neighbors.addClass('focused-neighbor');

    connectedEdges.removeClass('faded-edge');
    connectedEdges.addClass('focused-edge');

    target.select();
  }

  function clearFocus(cy) {
    cy.elements().removeClass('faded-node faded-edge focused-neighbor focused-edge');
    cy.nodes(':visible').forEach(function (n) {
      if (n.data('hop_distance') >= 2) {
        n.removeClass('hop2-revealed');
      }
    });
  }

  var handleNodeClick = useCallback(function (evt) {
    var cy = cyRef.current;
    if (!cy) return;

    var target = evt.target;
    if (target === cy || target.length === 0) {
      clearFocus(cy);
      setSelectedPersonInfo(null);
      return;
    }

    focusSubgraph(cy, target);

    var info = getPersonInfo(cy, target);
    setSelectedPersonInfo(info);
  }, []);

  var handleCanvasClick = useCallback(function () {
    var cy = cyRef.current;
    if (!cy) return;
    clearFocus(cy);
    setSelectedPersonInfo(null);
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

  var toggleNodeType = useCallback(function (type) {
    setNodeTypeFilter(function (prev) {
      var next = {};
      for (var k in prev) next[k] = prev[k];
      next[type] = !prev[type];
      return next;
    });
  }, []);

  var handleCloseInfoPanel = useCallback(function () {
    var cy = cyRef.current;
    if (cy) clearFocus(cy);
    setSelectedPersonInfo(null);
  }, []);

  useEffect(function () {
    cyDestroyedRef.current = false;
    return function () {
      cyDestroyedRef.current = true;
      var cy = cyRef.current;
      if (cy) {
        try {
          cy.removeAllListeners('layoutstop');
        } catch (e) {}
        cyRef.current = null;
      }
    };
  }, []);

  var setupCy = useCallback(function (cy) {
    cyRef.current = cy;

    cy.on('tap', function (evt) {
      if (evt.target === cy) {
        handleCanvasClick();
      }
    });

    cy.on('tap', 'node', function (evt) {
      handleNodeClick(evt);
    });

    cy.on('mouseover', 'node', function (evt) {
      var node = evt.target;
      node.addClass('node-hover');
      node.style('text-opacity', 1);
      if (node.data('hop_distance') >= 2) {
        node.addClass('hop2-revealed');
      }
    });

    cy.on('mouseout', 'node', function (evt) {
      var node = evt.target;
      node.removeClass('node-hover');
      if (node.data('hop_distance') >= 2 && !node.hasClass('focused-neighbor')) {
        node.removeClass('hop2-revealed');
      }
    });

    cy.on('mouseover', 'edge', function (evt) {
      evt.target.addClass('focused-edge');
    });

    cy.on('mouseout', 'edge', function (evt) {
      var edge = evt.target;
      if (!edge.selected() && !edge.hasClass('focused-edge')) return;
      if (!edge.selected()) {
        edge.removeClass('focused-edge');
      }
    });

    var zoomHandler = function () {
    };
    cy.on('zoom', zoomHandler);

    cy.on('layoutstop', function () {
      setTimeout(function () {
        if (cyDestroyedRef.current) return;
        var nodes = cy.nodes();
        var edges = cy.edges();
        if (nodes.length === 0 && edges.length === 0) return;

        nodes.style('opacity', 0);
        edges.style('opacity', 0);

        nodes.forEach(function (node, i) {
          node.animate({
            style: { opacity: 1 }
          }, {
            duration: 300,
            delay: i * 60,
            easing: 'ease-out'
          });
        });

        edges.forEach(function (edge, i) {
          edge.animate({
            style: { opacity: 1 }
          }, {
            duration: 200,
            delay: i * 40 + 100,
            easing: 'ease-out'
          });
        });
      }, 50);
    });
  }, [handleNodeClick, handleCanvasClick]);

  var hasContent = elements.length > 0;
  var edgeCount = elements.filter(function (el) { return el.data && el.data.source; }).length;
  var layoutConfig = edgeCount === 0
    ? { name: 'grid', padding: 50, rows: 1 }
    : {
        name: 'cose',
        animate: false,
        fit: true,
        padding: 50,
        nodeRepulsion: 5000,
        idealEdgeLength: 180,
        gravity: 0.2,
        numIter: 1000,
        edgeElasticity: 120,
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
            Expand to {maxHops + 1} hop{maxHops + 1 > 1 ? 's' : ''}
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
          <div className="relative h-full">
            <CytoscapeComponent
              elements={elements}
              stylesheet={stylesheet}
              layout={layoutConfig}
              style={{ width: '100%', height: '100%' }}
              cy={setupCy}
              zoomingEnabled={true}
              panningEnabled={true}
              minZoom={0.3}
              maxZoom={4}
              userPanningEnabled={true}
              userZoomingEnabled={true}
              boxSelectionEnabled={false}
            />

            {selectedPersonInfo && (
              <GraphInfoPanel person={selectedPersonInfo} onClose={handleCloseInfoPanel} />
            )}
          </div>
        )}

        <GraphLegend
          nodeFilters={nodeTypeFilter}
          edgeFilters={edgeTypeFilter}
          onToggleNode={toggleNodeType}
          onToggleEdge={toggleEdgeType}
        />
      </div>
    </div>
  );
}
