'use strict';

var VALID_EDGE_TYPES = ['CO_ACCUSED', 'ACCUSED_TO_VICTIM', 'SHARED_LOCATION', 'UNCONFIRMED_MATCH'];
var MAX_ALLOWED_HOPS = 3;

function validateInput(graphService, personId, options) {
  var errors = [];

  if (!personId || typeof personId !== 'string') {
    errors.push('person_id is required and must be a string');
  } else if (!graphService.personExists(personId)) {
    errors.push('person_id "' + personId + '" not found');
  }

  var maxHops = (options && options.max_hops !== undefined) ? options.max_hops : 3;

  if (typeof maxHops !== 'number' || maxHops < 1 || !isFinite(maxHops)) {
    errors.push('max_hops must be a positive number');
  } else if (maxHops > MAX_ALLOWED_HOPS) {
    errors.push('max_hops cannot exceed ' + MAX_ALLOWED_HOPS + ' (got ' + maxHops + ')');
  }

  var includeUnconfirmed = options && options.include_unconfirmed;
  if (includeUnconfirmed !== undefined && typeof includeUnconfirmed !== 'boolean') {
    errors.push('include_unconfirmed must be a boolean');
  }

  var edgeTypeFilter = options && options.edge_type_filter;
  if (edgeTypeFilter !== undefined) {
    if (!Array.isArray(edgeTypeFilter)) {
      errors.push('edge_type_filter must be an array');
    } else if (edgeTypeFilter.length === 0) {
      errors.push('edge_type_filter must not be empty');
    } else {
      for (var ei = 0; ei < edgeTypeFilter.length; ei++) {
        if (VALID_EDGE_TYPES.indexOf(edgeTypeFilter[ei]) === -1) {
          errors.push('invalid edge_type "' + edgeTypeFilter[ei] + '" in filter');
        }
      }
    }
  }

  return errors;
}

function validateOutput(result, graphService) {
  var errors = [];
  var nodeIds = {};
  var edgeIds = {};

  for (var ni = 0; ni < result.nodes.length; ni++) {
    var n = result.nodes[ni];
    if (nodeIds[n.person_id]) {
      errors.push('duplicate node: ' + n.person_id);
    }
    nodeIds[n.person_id] = true;

    if (typeof n.hop_distance !== 'number') {
      errors.push('node ' + n.person_id + ' missing hop_distance');
    }
  }

  for (var ei = 0; ei < result.edges.length; ei++) {
    var e = result.edges[ei];
    if (edgeIds[e.edge_id]) {
      errors.push('duplicate edge: ' + e.edge_id);
    }
    edgeIds[e.edge_id] = true;

    if (!nodeIds[e.source]) {
      errors.push('edge ' + e.edge_id + ' source ' + e.source + ' not in result nodes');
    }
    if (!nodeIds[e.target]) {
      errors.push('edge ' + e.edge_id + ' target ' + e.target + ' not in result nodes');
    }
  }

  return errors;
}

module.exports = {
  validateInput: validateInput,
  validateOutput: validateOutput,
  MAX_ALLOWED_HOPS: MAX_ALLOWED_HOPS,
  VALID_EDGE_TYPES: VALID_EDGE_TYPES
};
