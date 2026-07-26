'use strict';

function GraphCache(loader) {
  this._loader = loader;
  this._nodes = null;
  this._edges = null;
  this._nodeIndex = {};
  this._edgeIndex = {};
  this._outAdjacency = {};
  this._inAdjacency = {};
  this._degreeIndex = {};
  this._loadedAt = null;
  this._loaded = false;
  this._loading = null;
  this._version = 0;
  this._loadErrors = 0;
  this._diagnostics = null;
}

GraphCache.prototype._buildIndexes = function () {
  var nodeIndex = {};
  for (var ni = 0; ni < this._nodes.length; ni++) {
    nodeIndex[this._nodes[ni].person_id] = this._nodes[ni];
  }

  var edgeIndex = {};
  var outAdj = {};
  var inAdj = {};
  var degreeIdx = {};

  for (var ei = 0; ei < this._edges.length; ei++) {
    var e = this._edges[ei];
    edgeIndex[e.edge_id] = e;

    if (!outAdj[e.source_person_id]) outAdj[e.source_person_id] = {};
    outAdj[e.source_person_id][e.edge_id] = true;

    if (!inAdj[e.target_person_id]) inAdj[e.target_person_id] = {};
    inAdj[e.target_person_id][e.edge_id] = true;
  }

  var degreeEdgeSets = {};
  for (var ei = 0; ei < this._edges.length; ei++) {
    var e = this._edges[ei];
    if (e.source_person_id !== e.target_person_id) {
      if (!degreeEdgeSets[e.source_person_id]) degreeEdgeSets[e.source_person_id] = {};
      degreeEdgeSets[e.source_person_id][e.edge_id] = true;
      if (!degreeEdgeSets[e.target_person_id]) degreeEdgeSets[e.target_person_id] = {};
      degreeEdgeSets[e.target_person_id][e.edge_id] = true;
    }
  }
  for (var pid in degreeEdgeSets) {
    degreeIdx[pid] = Object.keys(degreeEdgeSets[pid]).length;
  }

  this._nodeIndex = nodeIndex;
  this._edgeIndex = edgeIndex;
  this._outAdjacency = outAdj;
  this._inAdjacency = inAdj;
  this._degreeIndex = degreeIdx;
};

GraphCache.prototype.load = async function () {
  if (this._loaded) return;
  if (this._loading) return this._loading;

  this._loading = (async function () {
    try {
      var data = await this._loader();
      this._nodes = data.nodes;
      this._edges = data.edges;
      this._diagnostics = data.diagnostics || null;
      this._buildIndexes();
      this._loadedAt = Date.now();
      this._loaded = true;
      this._version++;
    } catch (err) {
      this._loadErrors++;
      throw err;
    } finally {
      this._loading = null;
    }
  }).call(this);

  return this._loading;
};

GraphCache.prototype.reload = async function () {
  var newData;
  var newNodes;
  var newEdges;
  var newDiagnostics;
  var newNodeIndex;
  var newEdgeIndex;
  var newOutAdj;
  var newInAdj;
  var newDegreeIdx;

  try {
    newData = await this._loader();
    newNodes = newData.nodes;
    newEdges = newData.edges;
    newDiagnostics = newData.diagnostics || null;

    newNodeIndex = {};
    for (var ni = 0; ni < newNodes.length; ni++) {
      newNodeIndex[newNodes[ni].person_id] = newNodes[ni];
    }

    newEdgeIndex = {};
    newOutAdj = {};
    newInAdj = {};
    newDegreeIdx = {};

    for (var ei = 0; ei < newEdges.length; ei++) {
      var e = newEdges[ei];
      newEdgeIndex[e.edge_id] = e;

      if (!newOutAdj[e.source_person_id]) newOutAdj[e.source_person_id] = {};
      newOutAdj[e.source_person_id][e.edge_id] = true;

      if (!newInAdj[e.target_person_id]) newInAdj[e.target_person_id] = {};
      newInAdj[e.target_person_id][e.edge_id] = true;
    }

    var newDegreeEdgeSets = {};
    for (var ei = 0; ei < newEdges.length; ei++) {
      var e = newEdges[ei];
      if (e.source_person_id !== e.target_person_id) {
        if (!newDegreeEdgeSets[e.source_person_id]) newDegreeEdgeSets[e.source_person_id] = {};
        newDegreeEdgeSets[e.source_person_id][e.edge_id] = true;
        if (!newDegreeEdgeSets[e.target_person_id]) newDegreeEdgeSets[e.target_person_id] = {};
        newDegreeEdgeSets[e.target_person_id][e.edge_id] = true;
      }
    }
    for (var pid in newDegreeEdgeSets) {
      newDegreeIdx[pid] = Object.keys(newDegreeEdgeSets[pid]).length;
    }

    this._nodes = newNodes;
    this._edges = newEdges;
    this._nodeIndex = newNodeIndex;
    this._edgeIndex = newEdgeIndex;
    this._outAdjacency = newOutAdj;
    this._inAdjacency = newInAdj;
    this._degreeIndex = newDegreeIdx;
    this._diagnostics = newDiagnostics;
    this._loadedAt = Date.now();
    this._loaded = true;
    this._version++;
    this._loading = null;

    return true;
  } catch (err) {
    this._loadErrors++;
    this._loading = null;
    throw err;
  }
};

GraphCache.prototype.clear = function () {
  this._nodes = null;
  this._edges = null;
  this._nodeIndex = {};
  this._edgeIndex = {};
  this._outAdjacency = {};
  this._inAdjacency = {};
  this._degreeIndex = {};
  this._loadedAt = null;
  this._loaded = false;
  this._loading = null;
  this._diagnostics = null;
};

GraphCache.prototype.isLoaded = function () {
  return this._loaded;
};

GraphCache.prototype.getLoadedAt = function () {
  return this._loadedAt;
};

GraphCache.prototype.getVersion = function () {
  return this._version;
};

GraphCache.prototype.getLoadErrors = function () {
  return this._loadErrors;
};

GraphCache.prototype.getDiagnostics = function () {
  return this._diagnostics;
};

GraphCache.prototype.getNodes = function () {
  if (!this._loaded) return [];
  return this._nodes;
};

GraphCache.prototype.getEdges = function () {
  if (!this._loaded) return [];
  return this._edges;
};

GraphCache.prototype.getNode = function (personId) {
  if (!this._loaded) return null;
  return this._nodeIndex[personId] || null;
};

GraphCache.prototype.getEdge = function (edgeId) {
  if (!this._loaded) return null;
  return this._edgeIndex[edgeId] || null;
};

GraphCache.prototype.getOutEdgesForNode = function (personId) {
  if (!this._loaded) return [];
  var edgeIds = this._outAdjacency[personId];
  if (!edgeIds) return [];
  var result = [];
  for (var eid in edgeIds) {
    if (this._edgeIndex[eid]) result.push(this._edgeIndex[eid]);
  }
  return result;
};

GraphCache.prototype.getInEdgesForNode = function (personId) {
  if (!this._loaded) return [];
  var edgeIds = this._inAdjacency[personId];
  if (!edgeIds) return [];
  var result = [];
  for (var eid in edgeIds) {
    if (this._edgeIndex[eid]) result.push(this._edgeIndex[eid]);
  }
  return result;
};

GraphCache.prototype.getEdgesForNode = function (personId) {
  var outEdges = this.getOutEdgesForNode(personId);
  var inEdges = this.getInEdgesForNode(personId);
  var seen = {};
  var result = [];
  var combined = outEdges.concat(inEdges);
  for (var ei = 0; ei < combined.length; ei++) {
    var e = combined[ei];
    if (!seen[e.edge_id]) {
      seen[e.edge_id] = true;
      result.push(e);
    }
  }
  return result;
};

GraphCache.prototype.getDegree = function (personId) {
  if (!this._loaded) return 0;
  return this._degreeIndex[personId] || 0;
};

GraphCache.prototype.nodeExists = function (personId) {
  if (!this._loaded) return false;
  return !!this._nodeIndex[personId];
};

module.exports = { GraphCache };