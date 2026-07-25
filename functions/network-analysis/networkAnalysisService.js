'use strict';

var { PersonMasterRepository } = require('./repository/personMasterRepository');
var { TraversalService } = require('./traversal/traversalService');

function NetworkAnalysisService(options) {
  options = options || {};
  var appInstance = options.appInstance || null;

  this._personMasterRepository = options.repository || null;
  if (!this._personMasterRepository && appInstance) {
    this._personMasterRepository = new PersonMasterRepository({ appInstance: appInstance });
  }

  this._traversalService = options.traversalService || null;
  if (!this._traversalService) {
    var travOptions = {};
    if (this._personMasterRepository) {
      travOptions.repository = this._personMasterRepository;
    } else if (appInstance) {
      travOptions.appInstance = appInstance;
    }
    this._traversalService = new TraversalService(travOptions);
  }

  this._callerScope = {};
}

NetworkAnalysisService.prototype._getRepository = function () {
  if (!this._personMasterRepository) {
    this._personMasterRepository = new PersonMasterRepository();
  }
  return this._personMasterRepository;
};

NetworkAnalysisService.prototype.setAppInstance = function (appInstance) {
  var repo = this._getRepository();
  repo.setAppInstance(appInstance);
  this._traversalService.setAppInstance(appInstance);
};

NetworkAnalysisService.prototype.setCallerScope = function (scope) {
  this._callerScope = scope || {};
};

NetworkAnalysisService.prototype.personExists = async function (personId) {
  try {
    var person = await this._getRepository().getPerson(personId);
    return !!person;
  } catch (err) {
    return false;
  }
};

NetworkAnalysisService.prototype.getPerson = async function (personId) {
  try {
    var person = await this._getRepository().getPerson(personId);
    if (!person) return null;
    var confirmed = person.confirmed_edges || [];
    var unconfirmed = person.unconfirmed_edges || [];
    person.degree = confirmed.length + unconfirmed.length;
    return person;
  } catch (err) {
    return null;
  }
};

NetworkAnalysisService.prototype.getKnownAssociates = async function (personId, options) {
  var exists = await this.personExists(personId);
  if (!exists) return null;

  var maxHops = (options && options.max_hops !== undefined) ? options.max_hops : 2;
  var includeUnconfirmed = options && options.include_unconfirmed === true;
  var edgeTypeFilter = options && options.edge_type_filter;
  var maxNodes = (options && options.max_nodes) || 100;

  var result = await this._traversalService.traverse(personId, {
    max_hops: maxHops,
    include_unconfirmed: includeUnconfirmed,
    edge_type_filter: edgeTypeFilter,
    max_nodes: maxNodes,
    caller_scope: this._callerScope
  });

  if (result.error) return { error: result.error };

  var associates = [];
  for (var ni = 0; ni < result.nodes.length; ni++) {
    if (result.nodes[ni].person_id !== personId) {
      associates.push(result.nodes[ni]);
    }
  }

  var response = {
    root: personId,
    max_hops: maxHops,
    associates: associates,
    edges: result.edges
  };

  if (result.truncated) {
    response.truncated = true;
  }

  return response;
};

NetworkAnalysisService.prototype.getCoAccusedNetwork = async function (personId, options) {
  var exists = await this.personExists(personId);
  if (!exists) return null;

  var maxNodes = (options && options.max_nodes) || 100;

  var result = await this._traversalService.traverseCoAccused(personId, 3, {
    max_nodes: maxNodes,
    caller_scope: this._callerScope
  });

  if (result.error) return { error: result.error };

  var associates = [];
  for (var ni = 0; ni < result.nodes.length; ni++) {
    if (result.nodes[ni].person_id !== personId) {
      associates.push(result.nodes[ni]);
    }
  }

  var response = {
    root: personId,
    associates: associates,
    edges: result.edges
  };

  if (result.truncated) {
    response.truncated = true;
  }

  return response;
};

NetworkAnalysisService.prototype.getVictimRelationships = async function (personId, options) {
  var exists = await this.personExists(personId);
  if (!exists) return null;

  var maxNodes = (options && options.max_nodes) || 100;

  var result = await this._traversalService.traverseAccusedVictim(personId, 3, {
    max_nodes: maxNodes,
    caller_scope: this._callerScope
  });

  if (result.error) return { error: result.error };

  var associates = [];
  for (var ni = 0; ni < result.nodes.length; ni++) {
    if (result.nodes[ni].person_id !== personId) {
      associates.push(result.nodes[ni]);
    }
  }

  var response = {
    root: personId,
    associates: associates,
    edges: result.edges
  };

  if (result.truncated) {
    response.truncated = true;
  }

  return response;
};

NetworkAnalysisService.prototype.getNetworkSummary = async function (personId, options) {
  try {
    var person = await this._getRepository().getPerson(personId);
    if (!person) return null;
  } catch (err) {
    return null;
  }

  var maxNodes = (options && options.max_nodes) || 100;

  var fullTraversal = await this._traversalService.traverse(personId, {
    max_hops: 3,
    include_unconfirmed: false,
    max_nodes: maxNodes,
    caller_scope: this._callerScope
  });

  if (fullTraversal.error) {
    return { error: fullTraversal.error, person: person };
  }

  var knownAssociates = [];
  var victimLinks = [];
  var coAccused = [];
  var edgeBreakdown = {};
  var degree = 0;

  for (var ni = 0; ni < fullTraversal.nodes.length; ni++) {
    if (fullTraversal.nodes[ni].person_id !== personId) {
      knownAssociates.push(fullTraversal.nodes[ni].person_id);
    }
  }

  for (var ei = 0; ei < fullTraversal.edges.length; ei++) {
    var edge = fullTraversal.edges[ei];
    if (edge.from !== personId && edge.to !== personId) continue;

    var et = edge.edge_type;
    if (!edgeBreakdown[et]) edgeBreakdown[et] = 0;
    edgeBreakdown[et]++;
    degree++;

    if (et === 'CO_ACCUSED') {
      var other = edge.from === personId ? edge.to : edge.from;
      if (knownAssociates.indexOf(other) >= 0) {
        coAccused.push(other);
      }
    }

    if (et === 'ACCUSED_TO_VICTIM' && edge.from === personId) {
      if (knownAssociates.indexOf(edge.to) >= 0) {
        victimLinks.push(edge.to);
      }
    }
  }

  var result = {
    person: person,
    degree: degree,
    known_associates: knownAssociates.length,
    victim_links: victimLinks.length,
    co_accused: coAccused.length,
    edge_breakdown: edgeBreakdown
  };

  if (fullTraversal.truncated) {
    result.truncated = true;
  }

  return result;
};

module.exports = { NetworkAnalysisService: NetworkAnalysisService };
