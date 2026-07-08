'use strict';

function printEdgeStats(edges, nodeCount) {
  var byType = {};
  var degree = {};

  for (var ei = 0; ei < edges.length; ei++) {
    var e = edges[ei];
    if (!byType[e.edge_type]) byType[e.edge_type] = 0;
    byType[e.edge_type]++;

    if (!degree[e.source]) degree[e.source] = 0;
    degree[e.source]++;
    if (!degree[e.target]) degree[e.target] = 0;
    degree[e.target]++;
  }

  var typeKeys = Object.keys(byType).sort();
  var totalEdges = edges.length;

  var degreeValues = [];
  for (var d in degree) degreeValues.push(degree[d]);
  var maxDegree = degreeValues.length > 0 ? Math.max.apply(null, degreeValues) : 0;
  var avgDegree = degreeValues.length > 0
    ? (degreeValues.reduce(function(a, b) { return a + b; }) / degreeValues.length).toFixed(1)
    : '0.0';
  var nodesWithEdges = degreeValues.length;

  var coAccusedEdges = edges.filter(function(e) { return e.edge_type === 'CO_ACCUSED'; });
  var maxCoAccusedGroup = coAccusedEdges.length > 0
    ? Math.max.apply(null, coAccusedEdges.map(function(e) {
        return e.metadata && e.metadata.occurrence_count ? e.metadata.occurrence_count : 0;
      }))
    : 0;

  var slEdges = edges.filter(function(e) { return e.edge_type === 'SHARED_LOCATION'; });
  var avgSLOccurrence = slEdges.length > 0
    ? (slEdges.reduce(function(sum, e) {
        return sum + (e.metadata && e.metadata.occurrence_count ? e.metadata.occurrence_count : 0);
      }, 0) / slEdges.length).toFixed(1)
    : '0.0';

  console.log('');
  console.log('='.repeat(60));
  console.log('  TYPED EDGE BUILDER  \u2014  STATISTICS');
  console.log('='.repeat(60));
  console.log('  Total PersonMaster nodes:    ' + nodeCount);
  console.log('  Total edges:                 ' + totalEdges);
  console.log('  Nodes with edges:            ' + nodesWithEdges);
  console.log('');
  console.log('  Edges by type:');
  for (var ti = 0; ti < typeKeys.length; ti++) {
    var pct = ((byType[typeKeys[ti]] / totalEdges) * 100).toFixed(1);
    console.log('    ' + typeKeys[ti].padEnd(22) + String(byType[typeKeys[ti]]).padStart(8) + ' (' + pct + '%)');
  }
  console.log('');
  console.log('  Largest degree:              ' + maxDegree);
  console.log('  Average degree:              ' + avgDegree);
  console.log('  Max co-accused group count:  ' + maxCoAccusedGroup);
  console.log('  Avg shared-location count:   ' + avgSLOccurrence);
  console.log('='.repeat(60));
}

module.exports = { printEdgeStats };
