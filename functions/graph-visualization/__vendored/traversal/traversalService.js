'use strict';

var { bfs, MAX_ALLOWED_HOPS } = require('./bfs');
var { PersonMasterRepository } = require('../repository/personMasterRepository');
var { callerCanAccess } = require('./rbacFilter');

function TraversalService(options) {
  options = options || {};

  if (options.repository) {
    this._repository = options.repository;
  } else if (options.appInstance) {
    this._repository = new PersonMasterRepository({ appInstance: options.appInstance });
  } else {
    this._repository = null;
  }
}

TraversalService.prototype._getRepository = function () {
  if (this._repository) return this._repository;
  this._repository = new PersonMasterRepository();
  return this._repository;
};

TraversalService.prototype._createLoadNode = function () {
  var repo = this._getRepository();
  return async function (personId) {
    try {
      return await repo.getPerson(personId);
    } catch (err) {
      console.error('[TraversalService] loadNode error: ' + err.message);
      return null;
    }
  };
};

TraversalService.prototype._normalizeOptions = function (opts) {
  opts = opts || {};

  var maxHops = opts.max_hops;
  if (maxHops === undefined || maxHops === null) {
    maxHops = opts.max_depth;
  }
  if (maxHops === undefined || maxHops === null) {
    maxHops = 2;
  }

  if (typeof maxHops !== 'number' || maxHops < 0 || !isFinite(maxHops)) {
    maxHops = 2;
  }
  maxHops = Math.min(maxHops, MAX_ALLOWED_HOPS);

  var edgeTypeFilter = opts.edge_type_filter || opts.edge_types || null;
  if (typeof edgeTypeFilter === 'string') {
    edgeTypeFilter = edgeTypeFilter.split(',');
  }

  return {
    max_hops: maxHops,
    max_nodes: opts.max_nodes || 50,
    include_unconfirmed: opts.include_unconfirmed === true,
    edge_type_filter: edgeTypeFilter,
    min_confidence: opts.min_confidence || 0,
    caller_scope: opts.caller_scope || {}
  };
};

TraversalService.prototype.traverse = async function (personId, options) {
  options = this._normalizeOptions(options);
  var context = {
    loadNode: this._createLoadNode(),
    canAccess: callerCanAccess,
    callerScope: options.caller_scope || {}
  };

  var result = await bfs(personId, options, context);
  result.scope_applied = this._getScopeLabel(context.callerScope);
  return result;
};

TraversalService.prototype.traverseCoAccused = async function (personId, maxHops, options) {
  options = options || {};
  options.max_hops = maxHops !== undefined ? maxHops : 3;
  options.edge_type_filter = ['CO_ACCUSED'];
  return this.traverse(personId, options);
};

TraversalService.prototype.traverseAccusedVictim = async function (personId, maxHops, options) {
  options = options || {};
  options.max_hops = maxHops !== undefined ? maxHops : 3;
  options.edge_type_filter = ['ACCUSED_TO_VICTIM'];
  return this.traverse(personId, options);
};

TraversalService.prototype.setAppInstance = function (appInstance) {
  if (!this._repository) {
    this._repository = new PersonMasterRepository({ appInstance: appInstance });
  } else {
    this._repository.setAppInstance(appInstance);
  }
};

TraversalService.prototype._getScopeLabel = function (callerScope) {
  if (!callerScope) return 'unknown';
  if (callerScope.state_wide) return 'state';
  if (callerScope.unit_id) return 'unit:' + callerScope.unit_id;
  if (callerScope.district_id) return 'district:' + callerScope.district_id;
  return 'unknown';
};

module.exports = { TraversalService: TraversalService };
