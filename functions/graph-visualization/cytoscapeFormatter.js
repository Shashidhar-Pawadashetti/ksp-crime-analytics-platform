'use strict';

var styleHints = require('./styleHints');

function formatNodes(traversalNodes) {
  var nodes = [];

  for (var ni = 0; ni < traversalNodes.length; ni++) {
    var n = traversalNodes[ni];
    var role = styleHints.getPrimaryRole(n.roles_summary);
    var nodeStyle = styleHints.getNodeStyle(n.roles_summary);

    nodes.push({
      data: {
        id: n.person_id,
        label: n.canonical_name,
        role: role,
        degree: n.degree,
        hop_distance: n.hop_distance
      },
      style: {
        size: nodeStyle.size,
        color: nodeStyle.color,
        borderColor: nodeStyle.borderColor,
        icon: nodeStyle.icon
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
        type: e.edge_type,
        weight: e.weight,
        occurrence_count: e.occurrence_count
      },
      style: {
        color: edgeStyle.color,
        width: edgeStyle.width,
        lineStyle: edgeStyle.style,
        label: edgeStyle.label
      }
    });
  }

  return edges;
}

function toCytoscape(traversalResult) {
  if (!traversalResult || traversalResult.error) {
    return traversalResult;
  }

  var nodes = formatNodes(traversalResult.nodes);
  var edges = formatEdges(traversalResult.edges);

  return {
    elements: {
      nodes: nodes,
      edges: edges
    },
    statistics: traversalResult.statistics || null
  };
}

module.exports = {
  formatNodes: formatNodes,
  formatEdges: formatEdges,
  toCytoscape: toCytoscape
};
