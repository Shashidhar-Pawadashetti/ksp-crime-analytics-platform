'use strict';

var SUPPORTED_ROLES = {
  Inspector: true,
  'Superintendent of Police': true,
  'Deputy Superintendent of Police': true,
  Analyst: true,
  Policymaker: true
};

var POLICYMAKER_DENIED = true;

function callerCanAccess(personDoc, callerScope) {
  if (!personDoc || !callerScope) return false;

  if (POLICYMAKER_DENIED && callerScope.role === 'Policymaker') return false;

  var records = personDoc.source_records;
  if (!Array.isArray(records) || records.length === 0) return false;

  if (callerScope.state_wide === true) return true;

  if (callerScope.unit_id) {
    for (var ui = 0; ui < records.length; ui++) {
      if (records[ui].unit_id === callerScope.unit_id) return true;
    }
  }

  if (callerScope.district_id) {
    for (var di = 0; di < records.length; di++) {
      if (records[di].district_id === callerScope.district_id) return true;
    }
  }

  return false;
}

function extractCallerScope(req) {
  var scope = {
    role: null,
    unit_id: null,
    district_id: null,
    state_wide: false
  };

  if (req.headers && req.headers['x-catalyst-auth']) {
    try {
      var auth = JSON.parse(req.headers['x-catalyst-auth']);
      scope.role = auth.role || null;
      scope.unit_id = auth.unit_id || null;
      scope.district_id = auth.district_id || null;
      scope.state_wide = auth.state_wide === true;
      return scope;
    } catch (e) {
      // fall through to body-based extraction
    }
  }

  var body = req.body || {};
  if (body.caller_scope) {
    scope.role = body.caller_scope.role || null;
    scope.unit_id = body.caller_scope.unit_id || null;
    scope.district_id = body.caller_scope.district_id || null;
    scope.state_wide = body.caller_scope.state_wide === true;
  }

  return scope;
}

module.exports = {
  callerCanAccess: callerCanAccess,
  extractCallerScope: extractCallerScope
};
