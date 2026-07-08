'use strict';

var { GraphService } = require('./graphService');

var sharedInstance = null;

function getInstance(options) {
  if (!sharedInstance) {
    sharedInstance = new GraphService(options);
  }
  return sharedInstance;
}

function resetInstance() {
  if (sharedInstance) {
    sharedInstance.clearCache();
  }
  sharedInstance = null;
}

module.exports = {
  GraphService: GraphService,
  getInstance: getInstance,
  resetInstance: resetInstance
};
