'use strict';

var { toCytoscape } = require('./cytoscapeFormatter');

function GraphExportService() {
  this._traversal = null;
  this._graphService = null;
}

GraphExportService.prototype._ensureLoaded = function() {
  if (!this._graphService) {
    try {
      var gs = require('./graph-service/index');
      this._graphService = gs.getInstance();
    } catch (e) {
      try {
        var gs2 = require('../graph-service/index');
        this._graphService = gs2.getInstance();
      } catch (e2) {
        throw new Error('graph-service not available: ' + e2.message);
      }
    }
  }
  if (!this._traversal) {
    try {
      var gt = require('./graph-traversal/index');
      this._traversal = gt.getInstance ? gt.getInstance() : null;
    } catch (e) {
      try {
        var gt2 = require('../graph-traversal/index');
        this._traversal = gt2.getInstance ? gt2.getInstance() : null;
      } catch (e2) {
        throw new Error('graph-traversal not available: ' + e2.message);
      }
    }
  }
};

GraphExportService.prototype._getTraversalResult = function(personId, options) {
  try {
    this._ensureLoaded();
  } catch (e) {
    return { error: [e.message] };
  }

  var maxHops = (options && options.max_hops !== undefined) ? options.max_hops : 2;
  var includeUnconfirmed = options && options.include_unconfirmed === true;
  var edgeTypeFilter = options && options.edge_type_filter;

  if (!this._graphService.personExists(personId)) {
    return { error: ['Person ' + personId + ' not found'] };
  }

  return this._traversal.traverse(personId, {
    max_hops: maxHops,
    include_unconfirmed: includeUnconfirmed,
    edge_type_filter: edgeTypeFilter
  });
};

GraphExportService.prototype.toCytoscape = function(personId, options) {
  var result = this._getTraversalResult(personId, options);
  if (result.error) return result;

  return toCytoscape(result);
};

GraphExportService.prototype.toCompact = function(personId, options) {
  var result = this._getTraversalResult(personId, options);
  if (result.error) return result;

  var compactNodes = [];
  for (var ni = 0; ni < result.nodes.length; ni++) {
    var n = result.nodes[ni];
    compactNodes.push({
      id: n.person_id,
      label: n.canonical_name,
      hop: n.hop_distance
    });
  }

  var compactEdges = [];
  for (var ei = 0; ei < result.edges.length; ei++) {
    var e = result.edges[ei];
    compactEdges.push({
      id: e.edge_id,
      s: e.source,
      t: e.target,
      type: e.edge_type,
      w: e.weight
    });
  }

  return {
    root: personId,
    nodes: compactNodes,
    edges: compactEdges,
    stats: result.statistics
  };
};

GraphExportService.prototype.toDebug = function(personId, options) {
  var result = this._getTraversalResult(personId, options);
  if (result.error) return result;

  var nodeSet = {};
  var edgeSet = {};
  var missingSource = [];
  var missingTarget = [];

  for (var ni = 0; ni < result.nodes.length; ni++) {
    nodeSet[result.nodes[ni].person_id] = result.nodes[ni];
  }

  for (var ei = 0; ei < result.edges.length; ei++) {
    var e = result.edges[ei];
    edgeSet[e.edge_id] = e;

    if (!nodeSet[e.source]) missingSource.push(e.edge_id);
    if (!nodeSet[e.target]) missingTarget.push(e.edge_id);
  }

  var nodeDegrees = {};
  for (var eid in edgeSet) {
    var edge = edgeSet[eid];
    if (!nodeDegrees[edge.source]) nodeDegrees[edge.source] = 0;
    nodeDegrees[edge.source]++;
    if (!nodeDegrees[edge.target]) nodeDegrees[edge.target] = 0;
    nodeDegrees[edge.target]++;
  }

  var degreeDistribution = {};
  for (var nid in nodeDegrees) {
    var d = nodeDegrees[nid];
    if (!degreeDistribution[d]) degreeDistribution[d] = 0;
    degreeDistribution[d]++;
  }

  return {
    root: personId,
    source: 'GraphExportService.toDebug',
    timestamp: new Date().toISOString(),
    graph: {
      nodeCount: result.nodes.length,
      edgeCount: result.edges.length,
      statistics: result.statistics
    },
    validation: {
      allEdgesReferenceValidNodes: missingSource.length === 0 && missingTarget.length === 0,
      missingSourceEdges: missingSource,
      missingTargetEdges: missingTarget
    },
    degreeDistribution: degreeDistribution,
    hopDistribution: buildHopDistribution(result.nodes),
    typeDistribution: buildTypeDistribution(result.edges)
  };
};

function buildHopDistribution(nodes) {
  var dist = {};
  for (var ni = 0; ni < nodes.length; ni++) {
    var h = nodes[ni].hop_distance;
    if (!dist[h]) dist[h] = 0;
    dist[h]++;
  }
  return dist;
}

function buildTypeDistribution(edges) {
  var dist = {};
  for (var ei = 0; ei < edges.length; ei++) {
    var t = edges[ei].edge_type;
    if (!dist[t]) dist[t] = 0;
    dist[t]++;
  }
  return dist;
}

module.exports = { GraphExportService: GraphExportService };
