'use strict';

var { bfsTraverse } = require('./bfs');
var { TraversalService } = require('./traversalService');
var { validateInput, validateOutput } = require('./validation');
var { buildParentMap, reconstructPath, findAllPathsBetween } = require('./pathUtils');

var sharedInstance = null;

function getInstance(graphService) {
  if (!sharedInstance) {
    sharedInstance = new TraversalService(graphService);
  }
  return sharedInstance;
}

function resetInstance() {
  sharedInstance = null;
}

module.exports = {
  bfsTraverse: bfsTraverse,
  TraversalService: TraversalService,
  getInstance: getInstance,
  resetInstance: resetInstance,
  validateInput: validateInput,
  validateOutput: validateOutput,
  buildParentMap: buildParentMap,
  reconstructPath: reconstructPath,
  findAllPathsBetween: findAllPathsBetween
};
