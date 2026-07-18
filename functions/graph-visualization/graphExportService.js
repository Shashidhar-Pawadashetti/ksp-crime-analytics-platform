'use strict';

var https = require('https');
var { toCytoscape } = require('./cytoscapeFormatter');

var BASE_HOST = 'datathon2026-60073929329.development.catalystserverless.in';

function httpGet(path) {
  return new Promise(function(resolve, reject) {
    var options = {
      hostname: BASE_HOST,
      path: '/server' + path,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON response from ' + path)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('Timeout for ' + path)); });
    req.end();
  });
}

function httpPost(path, body) {
  return new Promise(function(resolve, reject) {
    var bodyStr = JSON.stringify(body);
    var options = {
      hostname: BASE_HOST,
      path: '/server' + path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      },
      timeout: 15000
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON response from ' + path)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('Timeout for ' + path)); });
    req.write(bodyStr);
    req.end();
  });
}

function GraphExportService() {}

GraphExportService.prototype._personExists = async function(personId) {
  try {
    var result = await httpGet('/graph-service/person/' + encodeURIComponent(personId) + '/exists');
    if (result.status === 'ok' && result.data) {
      return result.data.exists === true;
    }
    return false;
  } catch (e) {
    return false;
  }
};

GraphExportService.prototype._traverse = async function(personId, options) {
  var maxHops = (options && options.max_hops !== undefined) ? options.max_hops : 2;
  var maxNodes = 50;

  var result = await httpPost('/graph-traversal/traverse', {
    person_id: personId,
    hops: maxHops,
    max_nodes: maxNodes
  });

  if (result.status !== 'ok' || !result.data) {
    return { error: ['Traversal failed'] };
  }

  var data = result.data;

  var traversalResult = {
    nodes: (data.nodes || []).map(function(n) {
      return {
        person_id: n.person_id,
        canonical_name: n.label || n.person_id,
        roles_summary: n.roles_summary || {},
        degree: 0,
        hop_distance: 0
      };
    }),
    statistics: {
      nodes_visited: (data.nodes || []).length,
      edges_traversed: (data.edges || []).length + ((data.unconfirmed_edges || []).length),
      elapsed_ms: 0
    }
  };

  var includeUnconfirmed = options && options.include_unconfirmed === true;
  var allEdges = data.edges || [];
  if (includeUnconfirmed && data.unconfirmed_edges) {
    allEdges = allEdges.concat(data.unconfirmed_edges);
  }

  var edgeTypeFilter = options && options.edge_type_filter;
  if (edgeTypeFilter && edgeTypeFilter.length > 0) {
    allEdges = allEdges.filter(function(e) {
      return edgeTypeFilter.indexOf(e.type) !== -1;
    });
  }

  traversalResult.edges = allEdges.map(function(e) {
    return {
      edge_id: e.edge_id || (e.from + '-' + e.to + '-' + (e.type || 'unknown')),
      source: e.from,
      target: e.to,
      edge_type: e.type || 'UNKNOWN',
      weight: e.confirmed !== false ? 1 : 0.5,
      occurrence_count: (e.case_ids || []).length || 1
    };
  });

  return traversalResult;
};

GraphExportService.prototype._getTraversalResult = async function(personId, options) {
  var exists = await this._personExists(personId);
  if (!exists) {
    return { error: ['Person ' + personId + ' not found'] };
  }
  return await this._traverse(personId, options);
};

GraphExportService.prototype.toCytoscape = async function(personId, options) {
  var result = await this._getTraversalResult(personId, options);
  if (result.error) return result;
  return toCytoscape(result);
};

GraphExportService.prototype.toCompact = async function(personId, options) {
  var result = await this._getTraversalResult(personId, options);
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

GraphExportService.prototype.toDebug = async function(personId, options) {
  var result = await this._getTraversalResult(personId, options);
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
