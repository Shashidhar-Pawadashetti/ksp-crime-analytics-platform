'use strict';

var VALID_EDGE_TYPES = ['CO_ACCUSED', 'ACCUSED_TO_VICTIM', 'SHARED_LOCATION', 'UNCONFIRMED_MATCH'];
var MAX_HOPS = 3;

function validatePersonId(personId) {
  var errors = [];
  if (!personId || typeof personId !== 'string') {
    errors.push('person_id is required and must be a string');
  } else if (!/^PM_\d{6}$/.test(personId)) {
    errors.push('invalid person_id format (expected PM_XXXXXX)');
  }
  return errors;
}

function validateMaxHops(value) {
  var errors = [];
  if (value === undefined || value === null) return errors;

  var num = typeof value === 'string' ? parseInt(value, 10) : value;

  if (typeof num !== 'number' || isNaN(num) || !isFinite(num)) {
    errors.push('max_hops must be a number');
  } else if (num < 1) {
    errors.push('max_hops must be at least 1');
  } else if (num > MAX_HOPS) {
    errors.push('max_hops cannot exceed ' + MAX_HOPS);
  }
  return errors;
}

function validateEdgeTypeFilter(value) {
  var errors = [];
  if (value === undefined || value === null) return errors;

  if (typeof value === 'string') {
    value = value.split(',');
  }

  if (!Array.isArray(value)) {
    errors.push('edge_type_filter must be an array or comma-separated string');
    return errors;
  }

  if (value.length === 0) {
    errors.push('edge_type_filter must not be empty');
    return errors;
  }

  for (var ei = 0; ei < value.length; ei++) {
    var t = typeof value[ei] === 'string' ? value[ei] : String(value[ei]);
    if (VALID_EDGE_TYPES.indexOf(t) === -1) {
      errors.push('invalid edge_type "' + t + '" in filter');
    }
  }

  return errors;
}

function validateIncludeUnconfirmed(value) {
  var errors = [];
  if (value === undefined || value === null) return errors;
  if (value === 'true' || value === 'false') return errors;
  if (typeof value === 'boolean') return errors;
  errors.push('include_unconfirmed must be a boolean');
  return errors;
}

function parseIncludeUnconfirmed(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  return value === 'true';
}

function parseMaxHops(value) {
  if (value === undefined || value === null) return 2;
  if (typeof value === 'number') return value;
  return parseInt(value, 10) || 2;
}

function parseEdgeTypeFilter(value) {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').filter(Boolean);
  return undefined;
}

module.exports = {
  validatePersonId: validatePersonId,
  validateMaxHops: validateMaxHops,
  validateEdgeTypeFilter: validateEdgeTypeFilter,
  validateIncludeUnconfirmed: validateIncludeUnconfirmed,
  parseIncludeUnconfirmed: parseIncludeUnconfirmed,
  parseMaxHops: parseMaxHops,
  parseEdgeTypeFilter: parseEdgeTypeFilter,
  MAX_HOPS: MAX_HOPS,
  VALID_EDGE_TYPES: VALID_EDGE_TYPES
};
