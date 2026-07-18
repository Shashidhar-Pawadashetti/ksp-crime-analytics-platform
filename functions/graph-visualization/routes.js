'use strict';

var { GraphExportService } = require('./graphExportService');
var responseFormatter = require('./responseFormatter');
var validators = require('./validators');

var exportService = new GraphExportService();

var VALID_FORMATS = ['cytoscape', 'compact', 'debug'];

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
  var graphMatch = pathname.match(/^\/person\/([^/]+)\/graph$/);
  if (graphMatch) {
    return { route: 'graph', params: { personId: graphMatch[1] } };
  }

  var homeMatch = pathname === '/' || pathname === '';
  if (homeMatch) {
    return { route: 'home', params: {} };
  }

  return null;
}

function handleGraph(req, res, params, query) {
  var errors = validators.validatePersonId(params.personId);
  if (errors.length > 0) return responseFormatter.validationError(errors);

  var format = query.format || 'cytoscape';
  if (VALID_FORMATS.indexOf(format) === -1) {
    return responseFormatter.validationError(['Invalid format "' + format + '". Must be one of: ' + VALID_FORMATS.join(', ')]);
  }

  var maxHopsErrors = validators.validateMaxHops(query.max_hops);
  if (maxHopsErrors.length > 0) return responseFormatter.validationError(maxHopsErrors);

  var includeErrors = validators.validateIncludeUnconfirmed(query.include_unconfirmed);
  if (includeErrors.length > 0) return responseFormatter.validationError(includeErrors);

  var filterErrors = validators.validateEdgeTypeFilter(query.edge_type_filter);
  if (filterErrors.length > 0) return responseFormatter.validationError(filterErrors);

  var options = {
    max_hops: validators.parseMaxHops(query.max_hops),
    include_unconfirmed: validators.parseIncludeUnconfirmed(query.include_unconfirmed),
    edge_type_filter: validators.parseEdgeTypeFilter(query.edge_type_filter)
  };

  var result;
  switch (format) {
    case 'cytoscape':
      result = exportService.toCytoscape(params.personId, options);
      break;
    case 'compact':
      result = exportService.toCompact(params.personId, options);
      break;
    case 'debug':
      result = exportService.toDebug(params.personId, options);
      break;
  }

  if (!result) {
    return responseFormatter.notFound('Person ' + params.personId + ' not found');
  }

  if (result.error) {
    return responseFormatter.notFound(result.error[0] || 'Person not found');
  }

  return responseFormatter.success(result);
}

function handleHome(req, res, params, query) {
  return responseFormatter.success({
    service: 'Graph Visualization',
    version: '1.0.0',
    endpoints: {
      'GET /person/:personId/graph': 'Export graph visualization data',
      'GET /person/:personId/graph?format=compact': 'Compact format',
      'GET /person/:personId/graph?format=debug': 'Debug format with metadata'
    },
    queryParameters: {
      format: { type: 'string', values: ['cytoscape', 'compact', 'debug'], default: 'cytoscape' },
      max_hops: { type: 'integer', min: 1, max: 3, default: 2 },
      include_unconfirmed: { type: 'boolean', default: false },
      edge_type_filter: { type: 'string', description: 'Comma-separated edge types' }
    }
  });
}

var routeHandlers = {
  'graph': handleGraph,
  'home': handleHome
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
