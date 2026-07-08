'use strict';

var { NetworkAnalysisService } = require('./networkAnalysisService');
var responseFormatter = require('./responseFormatter');
var validators = require('./validators');

var service = new NetworkAnalysisService();

function parsePath(url) {
  var parts = url.split('?');
  var pathname = parts[0].replace(/\/+$/, '') || '/';
  var query = {};

  if (parts[1]) {
    parts[1].split('&').forEach(function(pair) {
      var kv = pair.split('=');
      var key = decodeURIComponent(kv[0]);
      var val = kv.length > 1 ? decodeURIComponent(kv[1]) : '';
      query[key] = val;
    });
  }

  return { pathname: pathname, query: query };
}

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

function handlePerson(req, res, params, query) {
  var errors = validators.validatePersonId(params.personId);
  if (errors.length > 0) {
    return responseFormatter.validationError(errors);
  }

  var result = service.getPerson(params.personId);
  if (!result) {
    return responseFormatter.notFound('Person ' + params.personId + ' not found');
  }

  return responseFormatter.success(result);
}

function handleAssociates(req, res, params, query) {
  var errors = validators.validatePersonId(params.personId);
  if (errors.length > 0) return responseFormatter.validationError(errors);

  var maxHopsErrors = validators.validateMaxHops(query.max_hops);
  if (maxHopsErrors.length > 0) return responseFormatter.validationError(maxHopsErrors);

  var includeErrors = validators.validateIncludeUnconfirmed(query.include_unconfirmed);
  if (includeErrors.length > 0) return responseFormatter.validationError(includeErrors);

  var filterErrors = validators.validateEdgeTypeFilter(query.edge_type_filter);
  if (filterErrors.length > 0) return responseFormatter.validationError(filterErrors);

  var result = service.getKnownAssociates(params.personId, {
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

function handleCoAccused(req, res, params, query) {
  var errors = validators.validatePersonId(params.personId);
  if (errors.length > 0) return responseFormatter.validationError(errors);

  var result = service.getCoAccusedNetwork(params.personId);
  if (!result) {
    return responseFormatter.notFound('Person ' + params.personId + ' not found');
  }

  if (result.error) {
    return responseFormatter.validationError(result.error);
  }

  return responseFormatter.success(result);
}

function handleVictims(req, res, params, query) {
  var errors = validators.validatePersonId(params.personId);
  if (errors.length > 0) return responseFormatter.validationError(errors);

  var result = service.getVictimRelationships(params.personId);
  if (!result) {
    return responseFormatter.notFound('Person ' + params.personId + ' not found');
  }

  if (result.error) {
    return responseFormatter.validationError(result.error);
  }

  return responseFormatter.success(result);
}

function handleNetworkSummary(req, res, params, query) {
  var errors = validators.validatePersonId(params.personId);
  if (errors.length > 0) return responseFormatter.validationError(errors);

  var result = service.getNetworkSummary(params.personId);
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

function route(req) {
  var parsed = parsePath(req.url);
  var match = matchRoute(parsed.pathname);

  if (!match) {
    return responseFormatter.notFound('Route not found: ' + req.method + ' ' + parsed.pathname);
  }

  var handler = routeHandlers[match.route];
  if (!handler) {
    return responseFormatter.notFound('No handler for route: ' + match.route);
  }

  req.query = parsed.query;
  return handler(req, null, match.params, parsed.query);
}

module.exports = { route: route, matchRoute: matchRoute, parsePath: parsePath };
