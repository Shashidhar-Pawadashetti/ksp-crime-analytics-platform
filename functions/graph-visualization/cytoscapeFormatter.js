'use strict';

var styleHints = require('./styleHints');

function formatNodes(traversalNodes) {
  var nodes = [];

  for (var ni = 0; ni < traversalNodes.length; ni++) {
    var n = traversalNodes[ni];
    var nodeStyle = styleHints.getNodeStyle(n.roles_summary);

    nodes.push({
      data: {
        id: n.person_id,
        label: n.canonical_name,
        roles_summary: n.roles_summary,
        node_style: {
          size: nodeStyle.size,
          color: nodeStyle.color,
          borderColor: nodeStyle.borderColor,
          icon: nodeStyle.icon
        }
      }
    });
  }

  return nodes;
}

function formatEdges(traversalEdges) {
  var edges = [];

  for (var ei = 0; ei < traversalEdges.length; ei++) {
    var e = traversalEdges[ei];
    var edgeStyle = styleHints.getEdgeStyle(e.edge_type);

    edges.push({
      data: {
        id: e.edge_id,
        source: e.source,
        target: e.target,
        label: edgeStyle.label,
        edge_style: {
          color: edgeStyle.color,
          width: edgeStyle.width,
          style: edgeStyle.style,
          label: edgeStyle.label
        }
      }
    });
  }

  return edges;
}

function buildStylesheet(nodes, edges) {
  var seenRoles = {};
  var seenEdgeTypes = {};
  var styles = [];

  for (var ni = 0; ni < nodes.length; ni++) {
    var nd = nodes[ni].data;
    var style = nd.node_style;
    var roleKey = style.color + '-' + style.size;
    if (seenRoles[roleKey]) continue;
    seenRoles[roleKey] = true;

    styles.push({
      selector: 'node#' + nd.id,
      css: {
        'background-color': style.color,
        'width': style.size,
        'height': style.size,
        'border-color': style.borderColor,
        'border-width': 2
      }
    });
  }

  if (styles.length === 0) {
    var def = styleHints.getNodeStyle(null);
    styles.push({
      selector: 'node',
      css: {
        'background-color': def.color,
        'width': def.size,
        'height': def.size,
        'border-color': def.borderColor,
        'border-width': 2
      }
    });
  }

  for (var ei = 0; ei < edges.length; ei++) {
    var ed = edges[ei].data;
    var eStyle = ed.edge_style;
    var eKey = eStyle.color + '-' + eStyle.style;
    if (seenEdgeTypes[eKey]) continue;
    seenEdgeTypes[eKey] = true;

    styles.push({
      selector: 'edge#' + ed.id,
      css: {
        'line-color': eStyle.color,
        'width': eStyle.width,
        'line-style': eStyle.style
      }
    });
  }

  if (styles.length <= (nodes.length > 0 ? 1 : 0)) {
    var eDef = styleHints.getEdgeStyle(null);
    styles.push({
      selector: 'edge',
      css: {
        'line-color': eDef.color,
        'width': eDef.width,
        'line-style': eDef.style
      }
    });
  }

  return styles;
}

function toCytoscape(traversalResult) {
  if (!traversalResult || traversalResult.error) {
    return traversalResult;
  }

  var nodes = formatNodes(traversalResult.nodes);
  var edges = formatEdges(traversalResult.edges);
  var stylesheet = buildStylesheet(nodes, edges);

  return {
    elements: {
      nodes: nodes,
      edges: edges
    },
    style: stylesheet,
    statistics: traversalResult.statistics || null
  };
}

module.exports = {
  formatNodes: formatNodes,
  formatEdges: formatEdges,
  buildStylesheet: buildStylesheet,
  toCytoscape: toCytoscape
};
