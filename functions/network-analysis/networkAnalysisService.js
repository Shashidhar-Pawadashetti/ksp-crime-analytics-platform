'use strict';

var { getInstance: getGraphService } = require('../graph-service/index');
var { TraversalService } = require('../graph-traversal/traversalService');

function NetworkAnalysisService() {
  this._graphService = getGraphService();
  this._traversalService = new TraversalService(this._graphService);
}

NetworkAnalysisService.prototype.getPerson = function(personId) {
  if (!this._graphService.personExists(personId)) return null;
  var person = this._graphService.getPerson(personId);
  person.degree = this._graphService.getDegree(personId);
  return person;
};

NetworkAnalysisService.prototype.getKnownAssociates = function(personId, options) {
  if (!this._graphService.personExists(personId)) return null;

  var maxHops = (options && options.max_hops !== undefined) ? options.max_hops : 2;
  var includeUnconfirmed = options && options.include_unconfirmed === true;
  var edgeTypeFilter = options && options.edge_type_filter;

  var result = this._traversalService.traverse(personId, {
    max_hops: maxHops,
    include_unconfirmed: includeUnconfirmed,
    edge_type_filter: edgeTypeFilter
  });

  if (result.error) return { error: result.error };

  var associates = [];
  for (var ni = 0; ni < result.nodes.length; ni++) {
    if (result.nodes[ni].person_id !== personId) {
      associates.push(result.nodes[ni]);
    }
  }

  return {
    root: personId,
    max_hops: maxHops,
    associates: associates,
    edges: result.edges,
    statistics: result.statistics
  };
};

NetworkAnalysisService.prototype.getCoAccusedNetwork = function(personId) {
  if (!this._graphService.personExists(personId)) return null;

  var result = this._traversalService.traverseCoAccused(personId, 3);

  if (result.error) return { error: result.error };

  var associates = [];
  for (var ni = 0; ni < result.nodes.length; ni++) {
    if (result.nodes[ni].person_id !== personId) {
      associates.push(result.nodes[ni]);
    }
  }

  return {
    root: personId,
    associates: associates,
    edges: result.edges,
    statistics: result.statistics
  };
};

NetworkAnalysisService.prototype.getVictimRelationships = function(personId) {
  if (!this._graphService.personExists(personId)) return null;

  var result = this._traversalService.traverseAccusedVictim(personId, 3);

  if (result.error) return { error: result.error };

  var associates = [];
  for (var ni = 0; ni < result.nodes.length; ni++) {
    if (result.nodes[ni].person_id !== personId) {
      associates.push(result.nodes[ni]);
    }
  }

  return {
    root: personId,
    associates: associates,
    edges: result.edges,
    statistics: result.statistics
  };
};

NetworkAnalysisService.prototype.getNetworkSummary = function(personId) {
  if (!this._graphService.personExists(personId)) return null;

  var person = this._graphService.getPerson(personId);
  var degree = this._graphService.getDegree(personId);

  var fullTraversal = this._traversalService.traverse(personId, { max_hops: 3, include_unconfirmed: false });

  if (fullTraversal.error) {
    return { error: fullTraversal.error, person: person, degree: degree };
  }

  var coAccusedResult = this._traversalService.traverseCoAccused(personId, 3);
  var victimResult = this._traversalService.traverseAccusedVictim(personId, 3);

  var knownAssociates = [];
  for (var ni = 0; ni < fullTraversal.nodes.length; ni++) {
    if (fullTraversal.nodes[ni].person_id !== personId) {
      knownAssociates.push(fullTraversal.nodes[ni].person_id);
    }
  }

  var victimLinks = [];
  if (!victimResult.error) {
    for (var vi = 0; vi < victimResult.nodes.length; vi++) {
      if (victimResult.nodes[vi].person_id !== personId) {
        victimLinks.push(victimResult.nodes[vi].person_id);
      }
    }
  }

  var coAccused = [];
  if (!coAccusedResult.error) {
    for (var ci = 0; ci < coAccusedResult.nodes.length; ci++) {
      if (coAccusedResult.nodes[ci].person_id !== personId) {
        coAccused.push(coAccusedResult.nodes[ci].person_id);
      }
    }
  }

  var edgeBreakdown = {};
  var allEdges = this._graphService.getEdges(personId);
  for (var ei = 0; ei < allEdges.length; ei++) {
    var et = allEdges[ei].edge_type;
    if (!edgeBreakdown[et]) edgeBreakdown[et] = 0;
    edgeBreakdown[et]++;
  }

  return {
    person: person,
    degree: degree,
    known_associates: knownAssociates.length,
    victim_links: victimLinks.length,
    co_accused: coAccused.length,
    edge_breakdown: edgeBreakdown
  };
};

NetworkAnalysisService.prototype.personExists = function(personId) {
  return this._graphService.personExists(personId);
};

module.exports = { NetworkAnalysisService: NetworkAnalysisService };
