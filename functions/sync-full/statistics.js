'use strict';

function computeStats(documents, edges) {
  var sizes = documents.map(function(d) { return d.source_records.length; });
  var totalSourceRecords = sizes.length > 0
    ? sizes.reduce(function(a, b) { return a + b; })
    : 0;
  var maxClusterSize = sizes.length > 0 ? Math.max.apply(null, sizes) : 0;

  var aliasCounts = documents.map(function(d) { return d.aliases.length; });
  var avgAliases = aliasCounts.length > 0
    ? (aliasCounts.reduce(function(a, b) { return a + b; }) / aliasCounts.length).toFixed(1)
    : '0.0';

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

  var degreeValues = Object.keys(degree).map(function(k) { return degree[k]; });
  var maxDegree = degreeValues.length > 0 ? Math.max.apply(null, degreeValues) : 0;

  return {
    documentCount: documents.length,
    edgeCount: edges.length,
    totalSourceRecords: totalSourceRecords,
    maxClusterSize: maxClusterSize,
    avgAliases: avgAliases,
    maxDegree: maxDegree,
    edgesByType: byType
  };
}

function printStats(stats, elapsedMs) {
  var typeKeys = Object.keys(stats.edgesByType).sort();

  console.log('');
  console.log('='.repeat(60));
  console.log('  FULL GRAPH REBUILD  \u2014  STATISTICS');
  console.log('='.repeat(60));
  console.log('  Elapsed time:            ' + (elapsedMs / 1000).toFixed(1) + 's');
  console.log('  Documents:               ' + stats.documentCount);
  console.log('  Edges:                   ' + stats.edgeCount);
  console.log('  Total source records:    ' + stats.totalSourceRecords);
  console.log('  Largest cluster:         ' + stats.maxClusterSize + ' records');
  console.log('  Average aliases/doc:     ' + stats.avgAliases);
  console.log('  Largest degree:          ' + stats.maxDegree);
  console.log('');
  console.log('  Edges by type:');
  for (var ti = 0; ti < typeKeys.length; ti++) {
    var pct = ((stats.edgesByType[typeKeys[ti]] / stats.edgeCount) * 100).toFixed(1);
    console.log('    ' + typeKeys[ti].padEnd(22) + String(stats.edgesByType[typeKeys[ti]]).padStart(8) + ' (' + pct + '%)');
  }
  console.log('='.repeat(60));
}

module.exports = { computeStats, printStats };
