'use strict';

var { bfsTraverse } = require('./bfs');

function TraversalService(graphService) {
  if (!graphService) {
    var { getInstance } = require('../graph-service/index');
    graphService = getInstance();
  }
  this._graphService = graphService;
}

TraversalService.prototype.traverse = function(personId, options) {
  return bfsTraverse(this._graphService, personId, options || {});
};

TraversalService.prototype.traverseDepth1 = function(personId, options) {
  var opts = Object.assign({}, options || {}, { max_hops: 1 });
  return bfsTraverse(this._graphService, personId, opts);
};

TraversalService.prototype.traverseDepth2 = function(personId, options) {
  var opts = Object.assign({}, options || {}, { max_hops: 2 });
  return bfsTraverse(this._graphService, personId, opts);
};

TraversalService.prototype.traverseDepth3 = function(personId, options) {
  var opts = Object.assign({}, options || {}, { max_hops: 3 });
  return bfsTraverse(this._graphService, personId, opts);
};

TraversalService.prototype.traverseCoAccused = function(personId, maxHops) {
  return bfsTraverse(this._graphService, personId, {
    max_hops: maxHops || 3,
    edge_type_filter: ['CO_ACCUSED']
  });
};

TraversalService.prototype.traverseAccusedVictim = function(personId, maxHops) {
  return bfsTraverse(this._graphService, personId, {
    max_hops: maxHops || 3,
    edge_type_filter: ['ACCUSED_TO_VICTIM']
  });
};

TraversalService.prototype.traverseWithUnconfirmed = function(personId, maxHops) {
  return bfsTraverse(this._graphService, personId, {
    max_hops: maxHops || 3,
    include_unconfirmed: true
  });
};

module.exports = { TraversalService: TraversalService };
