'use strict';

/**
 * LLD §6.2 — RBAC filter for graph nodes.
 *
 * A person node is accessible if ANY of their source_records
 * falls within the caller's unit/district scope.
 *
 * @param {Object} personDoc  — PersonMaster document
 * @param {Object} callerScope — { role?, unit_id?, district_id?, state_wide? }
 * @returns {boolean}
 */
function callerCanAccess(personDoc, callerScope) {
  if (!personDoc || !callerScope) return false;

  var records = personDoc.source_records;
  if (!Array.isArray(records) || records.length === 0) return false;

  for (var i = 0; i < records.length; i++) {
    var record = records[i];

    if (callerScope.role === 'Policymaker') return false;

    if (callerScope.unit_id && record.unit_id === callerScope.unit_id) return true;

    if (callerScope.district_id && record.district_id === callerScope.district_id) return true;

    if (callerScope.state_wide) return true;
  }

  return false;
}

/**
 * Extract caller scope from request headers or body.
 *
 * In production, the JWT claims set by API Gateway provide this.
 * In development/fallback, we accept from request body.
 *
 * @param {Object} req — Express request object
 * @returns {Object} callerScope
 */
function extractCallerScope(req) {
  var scope = {
    role: null,
    unit_id: null,
    district_id: null,
    state_wide: true
  };

  if (req.headers['x-catalyst-auth']) {
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
