'use strict';

var { GraphRepository } = require('./graphRepository');
var { GraphCache } = require('./cache');
var { computeStats } = require('./statistics');

function GraphService() {
  this._repo = null;
  this._cache = null;
}

GraphService.prototype.init = function (req) {
  this._repo = new GraphRepository();
  this._repo.init(req);
  this._cache = new GraphCache(function () {
    return this._repo.loadGraph();
  }.bind(this));
  return this;
};

GraphService.prototype._ensureLoaded = async function () {
  if (!this._repo || !this._cache) throw new Error('Not initialized. Call init(req) first.');
  await this._cache.load();
};

GraphService.prototype.getPerson = async function (personId) {
  await this._ensureLoaded();
  var node = this._cache.getNode(personId);
  if (!node) return null;
  return JSON.parse(JSON.stringify(node));
};

GraphService.prototype.getNeighbours = async function (personId) {
  await this._ensureLoaded();
  if (!this._cache.nodeExists(personId)) return [];

  var edges = this._cache.getEdgesForNode(personId);
  var neighbourSet = {};

  for (var ei = 0; ei < edges.length; ei++) {
    var e = edges[ei];
    var otherId = e.source === personId ? e.target : e.source;
    neighbourSet[otherId] = true;
  }

  var neighbours = [];
  for (var nid in neighbourSet) {
    var node = this._cache.getNode(nid);
    if (node) neighbours.push(JSON.parse(JSON.stringify(node)));
  }
  return neighbours;
};

GraphService.prototype.getEdges = async function (personId) {
  await this._ensureLoaded();
  if (!this._cache.nodeExists(personId)) return [];
  return JSON.parse(JSON.stringify(this._cache.getEdgesForNode(personId)));
};

GraphService.prototype.getDegree = async function (personId) {
  await this._ensureLoaded();
  return this._cache.getDegree(personId);
};

GraphService.prototype.personExists = async function (personId) {
  await this._ensureLoaded();
  return this._cache.nodeExists(personId);
};

GraphService.prototype.getPersonsByRole = async function (role) {
  await this._ensureLoaded();
  var nodes = this._cache.getNodes();
  var roleKey = role.toLowerCase();
  var results = [];

  for (var ni = 0; ni < nodes.length; ni++) {
    var node = nodes[ni];
    var count;
    if (roleKey === 'accused') count = node.roles_summary.accused_count;
    else if (roleKey === 'victim') count = node.roles_summary.victim_count;
    else if (roleKey === 'complainant' || roleKey === 'complainantdetails') count = node.roles_summary.complainant_count;
    else continue;

    if (count > 0) {
      results.push({
        person_id: node.person_id,
        canonical_name: node.canonical_name,
        role: role,
        count: count
      });
    }
  }
  return results;
};

GraphService.prototype.getEdge = async function (edgeId) {
  await this._ensureLoaded();
  var edge = this._cache.getEdge(edgeId);
  if (!edge) return null;
  return JSON.parse(JSON.stringify(edge));
};

GraphService.prototype.getGraphStatistics = async function () {
  await this._ensureLoaded();
  var nodes = this._cache.getNodes();
  var edges = this._cache.getEdges();
  return computeStats(nodes, edges);
};

GraphService.prototype.reload = async function () {
  await this._cache.reload();
};

GraphService.prototype.clearCache = function () {
  this._cache.clear();
};

GraphService.prototype.getCacheInfo = function () {
  return {
    loaded: this._cache.isLoaded(),
    loadedAt: this._cache.getLoadedAt(),
    nodeCount: this._cache.isLoaded() ? this._cache.getNodes().length : 0,
    edgeCount: this._cache.isLoaded() ? this._cache.getEdges().length : 0
  };
};

module.exports = { GraphService };
