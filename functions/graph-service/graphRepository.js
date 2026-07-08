'use strict';

var fs = require('fs');
var path = require('path');

var BUILDER_OUTPUT_DIR = path.resolve(__dirname, '..', 'personmaster-builder', 'output');
var DOCUMENTS_PATH = path.join(BUILDER_OUTPUT_DIR, 'personmaster_documents.json');
var EDGES_PATH = path.join(BUILDER_OUTPUT_DIR, 'personmaster_edges.json');

function GraphRepository(options) {
  this._options = options || {};
  this._documentsPath = this._options.documentsPath || DOCUMENTS_PATH;
  this._edgesPath = this._options.edgesPath || EDGES_PATH;
}

GraphRepository.prototype.loadNodes = function() {
  return JSON.parse(fs.readFileSync(this._documentsPath, 'utf8'));
};

GraphRepository.prototype.loadEdges = function() {
  var raw = JSON.parse(fs.readFileSync(this._edgesPath, 'utf8'));
  return raw.edges || [];
};

GraphRepository.prototype.getNodeById = function(personId) {
  var nodes = this.loadNodes();
  for (var ni = 0; ni < nodes.length; ni++) {
    if (nodes[ni].person_id === personId) return nodes[ni];
  }
  return null;
};

GraphRepository.prototype.loadGraph = function() {
  var nodes = this.loadNodes();
  var edges = this.loadEdges();
  return { nodes: nodes, edges: edges };
};

module.exports = { GraphRepository };
