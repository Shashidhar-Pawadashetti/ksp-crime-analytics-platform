'use strict';

var { NetworkAnalysisService } = require('./networkAnalysisService');
var responseFormatter = require('./responseFormatter');
var validators = require('./validators');
var { extractCallerScope } = require('./traversal/rbacFilter');

var service = new NetworkAnalysisService();

function setAppInstance(appInstance) {
  service.setAppInstance(appInstance);
}

function setCallerScope(scope) {
  service.setCallerScope(scope);
}

async function handlePerson(params, query) {
  var errors = validators.validatePersonId(params.personId);
  if (errors.length > 0) {
    return responseFormatter.validationError(errors);
  }

  var result = await service.getPerson(params.personId);
  if (!result) {
    return responseFormatter.notFound('Person ' + params.personId + ' not found');
  }

  return responseFormatter.success(result);
}

async function handleAssociates(params, query) {
  var errors = validators.validatePersonId(params.personId);
  if (errors.length > 0) return responseFormatter.validationError(errors);

  var maxHopsErrors = validators.validateMaxHops(query.max_hops);
  if (maxHopsErrors.length > 0) return responseFormatter.validationError(maxHopsErrors);

  var includeErrors = validators.validateIncludeUnconfirmed(query.include_unconfirmed);
  if (includeErrors.length > 0) return responseFormatter.validationError(includeErrors);

  var filterErrors = validators.validateEdgeTypeFilter(query.edge_type_filter);
  if (filterErrors.length > 0) return responseFormatter.validationError(filterErrors);

  var result = await service.getKnownAssociates(params.personId, {
    max_hops: validators.parseMaxHops(query.max_hops),
    include_unconfirmed: validators.parseIncludeUnconfirmed(query.include_unconfirmed),
    edge_type_filter: validators.parseEdgeTypeFilter(query.edge_type_filter)
  });

  if (!result) {
    return responseFormatter.notFound('Person ' + params.personId + ' not found');
  }

  if (result.error) {
    return responseFormatter.validationError(result.error);
  }

  return responseFormatter.success(result);
}

async function handleCoAccused(params, query) {
  var errors = validators.validatePersonId(params.personId);
  if (errors.length > 0) return responseFormatter.validationError(errors);

  var result = await service.getCoAccusedNetwork(params.personId);
  if (!result) {
    return responseFormatter.notFound('Person ' + params.personId + ' not found');
  }

  if (result.error) {
    return responseFormatter.validationError(result.error);
  }

  return responseFormatter.success(result);
}

async function handleVictims(params, query) {
  var errors = validators.validatePersonId(params.personId);
  if (errors.length > 0) return responseFormatter.validationError(errors);

  var result = await service.getVictimRelationships(params.personId);
  if (!result) {
    return responseFormatter.notFound('Person ' + params.personId + ' not found');
  }

  if (result.error) {
    return responseFormatter.validationError(result.error);
  }

  return responseFormatter.success(result);
}

async function handleNetworkSummary(params, query) {
  var errors = validators.validatePersonId(params.personId);
  if (errors.length > 0) return responseFormatter.validationError(errors);

  var result = await service.getNetworkSummary(params.personId);
  if (!result) {
    return responseFormatter.notFound('Person ' + params.personId + ' not found');
  }

  if (result.error) {
    return responseFormatter.validationError(result.error);
  }

  return responseFormatter.success(result);
}

var routeHandlers = {
  'person': handlePerson,
  'associates': handleAssociates,
  'co-accused': handleCoAccused,
  'victims': handleVictims,
  'network-summary': handleNetworkSummary
};

function matchRoute(pathname) {
  var personMatch = pathname.match(/^\/person\/([^/]+)$/);
  if (personMatch) {
    return { route: 'person', params: { personId: personMatch[1] } };
  }

  var associatesMatch = pathname.match(/^\/person\/([^/]+)\/associates$/);
  if (associatesMatch) {
    return { route: 'associates', params: { personId: associatesMatch[1] } };
  }

  var coAccusedMatch = pathname.match(/^\/person\/([^/]+)\/co-accused$/);
  if (coAccusedMatch) {
    return { route: 'co-accused', params: { personId: coAccusedMatch[1] } };
  }

  var victimsMatch = pathname.match(/^\/person\/([^/]+)\/victims$/);
  if (victimsMatch) {
    return { route: 'victims', params: { personId: victimsMatch[1] } };
  }

  var networkMatch = pathname.match(/^\/person\/([^/]+)\/network-summary$/);
  if (networkMatch) {
    return { route: 'network-summary', params: { personId: networkMatch[1] } };
  }

  return null;
}

async function route(req) {
  var callerScope = extractCallerScope(req);
  service.setCallerScope(callerScope);

  var pathname = (req.url || '').split('?')[0].replace(/\/+$/, '') || '/';
  var query = req.query || {};

  var match = matchRoute(pathname);

  if (!match) {
    return responseFormatter.notFound('Route not found: ' + (req.method || 'GET') + ' ' + pathname);
  }

  var handler = routeHandlers[match.route];
  if (!handler) {
    return responseFormatter.notFound('No handler for route: ' + match.route);
  }

  return handler(match.params, query);
}

module.exports = { route: route, matchRoute: matchRoute, setAppInstance: setAppInstance, setCallerScope: setCallerScope, _service: service };
