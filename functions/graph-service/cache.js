'use strict';

function GraphCache(loader) {
  this._loader = loader;
  this._nodes = null;
  this._edges = null;
  this._nodeIndex = {};
  this._edgeIndex = {};
  this._edgesByNode = {};
  this._degreeIndex = {};
  this._loadedAt = null;
  this._loaded = false;
  this._loading = null;
}

GraphCache.prototype._buildIndexes = function () {
  this._nodeIndex = {};
  for (var ni = 0; ni < this._nodes.length; ni++) {
    this._nodeIndex[this._nodes[ni].person_id] = this._nodes[ni];
  }

  this._edgeIndex = {};
  this._edgesByNode = {};
  this._degreeIndex = {};

  for (var ei = 0; ei < this._edges.length; ei++) {
    var e = this._edges[ei];
    this._edgeIndex[e.edge_id] = e;

    if (!this._edgesByNode[e.source]) this._edgesByNode[e.source] = [];
    this._edgesByNode[e.source].push(e);
    if (!this._edgesByNode[e.target]) this._edgesByNode[e.target] = [];
    this._edgesByNode[e.target].push(e);

    if (!this._degreeIndex[e.source]) this._degreeIndex[e.source] = 0;
    this._degreeIndex[e.source]++;
    if (!this._degreeIndex[e.target]) this._degreeIndex[e.target] = 0;
    this._degreeIndex[e.target]++;
  }
};

GraphCache.prototype.load = async function () {
  if (this._loaded) return;
  if (this._loading) return this._loading;

  this._loading = (async function () {
    var data = await this._loader();
    this._nodes = data.nodes;
    this._edges = data.edges;
    this._buildIndexes();
    this._loadedAt = Date.now();
    this._loaded = true;
    this._loading = null;
  }).call(this);

  return this._loading;
};

GraphCache.prototype.reload = async function () {
  this.clear();
  return this.load();
};

GraphCache.prototype.clear = function () {
  this._nodes = null;
  this._edges = null;
  this._nodeIndex = {};
  this._edgeIndex = {};
  this._edgesByNode = {};
  this._degreeIndex = {};
  this._loadedAt = null;
  this._loaded = false;
  this._loading = null;
};

GraphCache.prototype.isLoaded = function () {
  return this._loaded;
};

GraphCache.prototype.getLoadedAt = function () {
  return this._loadedAt;
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

GraphCache.prototype.getEdgesForNode = function (personId) {
  if (!this._loaded) return [];
  return this._edgesByNode[personId] || [];
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
