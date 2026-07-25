'use strict';

var { toCytoscape } = require('./cytoscapeFormatter');
var { TraversalService } = require('./__vendored/traversal/traversalService');
var { PersonMasterRepository } = require('./__vendored/repository/personMasterRepository');

function GraphExportService(appInstance) {
  this._appInstance = appInstance;
  var ts = new TraversalService();
  if (appInstance) {
    ts.setAppInstance(appInstance);
  }
  this._traversal = ts;
}

GraphExportService.prototype.personExists = async function (personId) {
  if (!personId || !this._appInstance) return false;
  var repo = new PersonMasterRepository({ appInstance: this._appInstance });
  try {
    var doc = await repo.getPerson(personId);
    return !!doc;
  } catch (e) {
    return false;
  }
};

GraphExportService.prototype.resolveSourceRecord = async function (sourceId) {
  if (!sourceId || !this._appInstance) return null;
  var repo = new PersonMasterRepository({ appInstance: this._appInstance });
  try {
    var doc = await repo.getPerson(sourceId);
    if (doc && doc.person_id) return doc.person_id;
  } catch (e) {
  }
  return null;
};

GraphExportService.prototype.getGraph = async function (personId, options) {
  options = options || {};

  var resolvedId = personId;
  var exists = await this.personExists(personId);
  if (!exists) {
    var resolved = await this.resolveSourceRecord(personId);
    if (resolved) {
      resolvedId = resolved;
    } else {
      return { error: ['Person ' + personId + ' not found'] };
    }
  }

  var result = await this._traversal.traverse(resolvedId, {
    max_hops: options.hops || options.max_hops || 2,
    max_nodes: options.max_nodes || 100,
    include_unconfirmed: options.include_unconfirmed === true,
    edge_type_filter: options.edge_type_filter || options.edge_types || null,
    caller_scope: options.caller_scope || {}
  });

  return result;
};

GraphExportService.prototype.toCytoscape = async function (personId, options) {
  var result = await this.getGraph(personId, options);
  if (result.error) return result;
  var cyResult = toCytoscape(result);
  cyResult.truncated = result.truncated || false;
  cyResult.node_count = result.nodes.length;
  cyResult.edge_count = result.edges.length;
  return cyResult;
};

GraphExportService.prototype.toCompact = async function (personId, options) {
  var result = await this.getGraph(personId, options);
  if (result.error) return result;

  var compactNodes = [];
  for (var ni = 0; ni < result.nodes.length; ni++) {
    var n = result.nodes[ni];
    compactNodes.push({
      id: n.person_id,
      label: n.canonical_name,
      hop: n.hop_distance !== undefined ? n.hop_distance : 0
    });
  }

  var compactEdges = [];
  for (var ei = 0; ei < result.edges.length; ei++) {
    var e = result.edges[ei];
    compactEdges.push({
      id: e.edge_id,
      s: e.from,
      t: e.to,
      type: e.edge_type,
      w: e.confidence || null
    });
  }

  return {
    root: personId,
    nodes: compactNodes,
    edges: compactEdges,
    truncated: result.truncated || false,
    node_count: compactNodes.length,
    edge_count: compactEdges.length,
    stats: {
      nodes_visited: result.nodes_visited || 0,
      hops_requested: result.hops_requested || 0,
      scope_applied: result.scope_applied || 'unknown'
    }
  };
};

GraphExportService.prototype.toDebug = async function (personId, options) {
  var result = await this.getGraph(personId, options);
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
    if (!nodeSet[e.from]) missingSource.push(e.edge_id);
    if (!nodeSet[e.to]) missingTarget.push(e.edge_id);
  }

  var nodeDegrees = {};
  for (var eid in edgeSet) {
    var edge = edgeSet[eid];
    if (!nodeDegrees[edge.from]) nodeDegrees[edge.from] = 0;
    nodeDegrees[edge.from]++;
    if (!nodeDegrees[edge.to]) nodeDegrees[edge.to] = 0;
    nodeDegrees[edge.to]++;
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
      truncated: result.truncated || false,
      statistics: {
        nodes_visited: result.nodes_visited || 0,
        hops_requested: result.hops_requested || 0,
        scope_applied: result.scope_applied || 'unknown'
      }
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
