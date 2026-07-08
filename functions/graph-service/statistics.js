'use strict';

function computeStats(nodes, edges) {
  var totalNodes = nodes.length;
  var totalEdges = edges.length;

  var byType = {};
  var degree = {};
  var adjacency = {};

  for (var ni = 0; ni < nodes.length; ni++) {
    adjacency[nodes[ni].person_id] = [];
  }

  for (var ei = 0; ei < edges.length; ei++) {
    var e = edges[ei];

    if (!byType[e.edge_type]) byType[e.edge_type] = 0;
    byType[e.edge_type]++;

    if (!degree[e.source]) degree[e.source] = 0;
    degree[e.source]++;
    if (!degree[e.target]) degree[e.target] = 0;
    degree[e.target]++;

    if (adjacency[e.source]) adjacency[e.source].push(e.target);
    if (adjacency[e.target]) adjacency[e.target].push(e.source);
  }

  var degreeValues = Object.keys(degree).map(function(k) { return degree[k]; });
  var avgDegree = degreeValues.length > 0
    ? (degreeValues.reduce(function(a, b) { return a + b; }) / totalNodes).toFixed(2)
    : '0.00';
  var maxDegree = degreeValues.length > 0 ? Math.max.apply(null, degreeValues) : 0;

  var visited = {};
  var componentSizes = [];

  for (var nid in adjacency) {
    if (visited[nid]) continue;

    var stack = [nid];
    visited[nid] = true;
    var size = 0;

    while (stack.length > 0) {
      var current = stack.pop();
      size++;
      var neighbours = adjacency[current] || [];
      for (var ni2 = 0; ni2 < neighbours.length; ni2++) {
        if (!visited[neighbours[ni2]]) {
          visited[neighbours[ni2]] = true;
          stack.push(neighbours[ni2]);
        }
      }
    }

    componentSizes.push(size);
  }

  componentSizes.sort(function(a, b) { return b - a; });

  return {
    totalNodes: totalNodes,
    totalEdges: totalEdges,
    averageDegree: avgDegree,
    maxDegree: maxDegree,
    edgesByType: byType,
    connectedComponents: componentSizes.length,
    largestComponent: componentSizes.length > 0 ? componentSizes[0] : 0,
    componentSizes: componentSizes
  };
}

function printStats(stats) {
  var typeKeys = Object.keys(stats.edgesByType).sort();

  console.log('');
  console.log('='.repeat(60));
  console.log('  GRAPH SERVICE  \u2014  STATISTICS');
  console.log('='.repeat(60));
  console.log('  Total nodes:              ' + stats.totalNodes);
  console.log('  Total edges:              ' + stats.totalEdges);
  console.log('  Average degree:           ' + stats.averageDegree);
  console.log('  Largest degree:           ' + stats.maxDegree);
  console.log('');
  console.log('  Connected components:     ' + stats.connectedComponents);
  console.log('  Largest component:        ' + stats.largestComponent + ' nodes');
  console.log('');
  console.log('  Edges by type:');
  for (var ti = 0; ti < typeKeys.length; ti++) {
    var pct = ((stats.edgesByType[typeKeys[ti]] / stats.totalEdges) * 100).toFixed(1);
    console.log('    ' + typeKeys[ti].padEnd(22) + String(stats.edgesByType[typeKeys[ti]]).padStart(8) + ' (' + pct + '%)');
  }

  if (stats.componentSizes.length <= 10) {
    console.log('');
    console.log('  Component sizes:');
    for (var ci = 0; ci < stats.componentSizes.length; ci++) {
      console.log('    Component ' + (ci + 1) + ': ' + stats.componentSizes[ci] + ' nodes');
    }
  }
  console.log('='.repeat(60));
}

module.exports = { computeStats, printStats };
