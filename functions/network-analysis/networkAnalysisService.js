'use strict';

function NetworkAnalysisService() {
  this._graphService = null;
  this._traversalService = null;
}

NetworkAnalysisService.prototype._ensureLoaded = function() {
  if (this._graphService && this._traversalService) return;

  var gsInstance = null;
  var TraversalServiceType = null;

  try {
    var gs = require('./graph-service/index');
    gsInstance = gs.getInstance();
  } catch (e) {
    try {
      var gs2 = require('../graph-service/index');
      gsInstance = gs2.getInstance();
    } catch (e2) {
      throw new Error('graph-service not available: ' + e2.message);
    }
  }

  try {
    var gt = require('./graph-traversal/traversalService');
    TraversalServiceType = gt.TraversalService;
  } catch (e) {
    try {
      var gt2 = require('../graph-traversal/traversalService');
      TraversalServiceType = gt2.TraversalService;
    } catch (e2) {
      try {
        var gt3 = require('./graph-traversal/index');
        if (gt3.TraversalService) TraversalServiceType = gt3.TraversalService;
      } catch (e3) {
        throw new Error('graph-traversal/traversalService not available: ' + e3.message);
      }
    }
  }

  this._graphService = gsInstance;
  this._traversalService = new TraversalServiceType(gsInstance);
};

NetworkAnalysisService.prototype.getPerson = async function (personId) {
  this._ensureLoaded();
  var exists = await this._graphService.personExists(personId);
  if (!exists) return null;
  var person = await this._graphService.getPerson(personId);
  person.degree = await this._graphService.getDegree(personId);
  return person;
};

NetworkAnalysisService.prototype.getKnownAssociates = async function (personId, options) {
  this._ensureLoaded();
  var exists = await this._graphService.personExists(personId);
  if (!exists) return null;

  var maxHops = (options && options.max_hops !== undefined) ? options.max_hops : 2;
  var includeUnconfirmed = options && options.include_unconfirmed === true;
  var edgeTypeFilter = options && options.edge_type_filter;

  var result = await this._traversalService.traverse(personId, {
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

NetworkAnalysisService.prototype.getCoAccusedNetwork = async function (personId) {
  this._ensureLoaded();
  var exists = await this._graphService.personExists(personId);
  if (!exists) return null;

  var result = await this._traversalService.traverseCoAccused(personId, 3);

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

NetworkAnalysisService.prototype.getVictimRelationships = async function (personId) {
  this._ensureLoaded();
  var exists = await this._graphService.personExists(personId);
  if (!exists) return null;

  var result = await this._traversalService.traverseAccusedVictim(personId, 3);

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

NetworkAnalysisService.prototype.getNetworkSummary = async function (personId) {
  this._ensureLoaded();
  var exists = await this._graphService.personExists(personId);
  if (!exists) return null;

  var person = await this._graphService.getPerson(personId);
  var degree = await this._graphService.getDegree(personId);

  var fullTraversal = await this._traversalService.traverse(personId, { max_hops: 3, include_unconfirmed: false });

  if (fullTraversal.error) {
    return { error: fullTraversal.error, person: person, degree: degree };
  }

  var coAccusedResult = await this._traversalService.traverseCoAccused(personId, 3);
  var victimResult = await this._traversalService.traverseAccusedVictim(personId, 3);

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

  var allEdges = await this._graphService.getEdges(personId);
  var edgeBreakdown = {};
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

NetworkAnalysisService.prototype.personExists = async function (personId) {
  this._ensureLoaded();
  return this._graphService.personExists(personId);
};

module.exports = { NetworkAnalysisService: NetworkAnalysisService };
