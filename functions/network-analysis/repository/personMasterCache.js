'use strict';

function PersonMasterCache() {
  this._nodeIndex = {};
  this._adjacency = {};
  this._loaded = false;
  this._loading = null;
  this._loadCount = 0;
  this._loadErrors = 0;
  this.loadedAt = null;
}

PersonMasterCache.prototype.isLoaded = function () {
  return this._loaded;
};

PersonMasterCache.prototype.loadAll = async function (repository) {
  if (this._loading) return this._loading;

  this._loading = this._doLoad(repository);
  try {
    await this._loading;
  } finally {
    this._loading = null;
  }
};

PersonMasterCache.prototype._doLoad = async function (repository) {
  var app = repository._getApp();
  if (!app) throw new Error('Cannot load PersonMaster cache: app instance not available');

  var { NoSQLEnum, NoSQLMarshall } = require('zcatalyst-sdk-node/lib/no-sql');
  var { NoSQLOperator } = NoSQLEnum;
  var noSql = app.nosql();
  var table = await noSql.getTable('PersonMaster');

  var allDocs = [];
  var startKey = null;

  while (true) {
    var queryParams = {
      key_condition: {
        attribute: 'type',
        operator: NoSQLOperator.EQUALS,
        value: NoSQLMarshall.makeString('PM')
      },
      limit: 100,
      consistent_read: true
    };
    if (startKey) {
      queryParams.start_key = startKey;
    }

    var result = await table.queryTable(queryParams);
    var items;
    try {
      items = result.getResponseData();
    } catch (e) {
      throw new Error('Failed to parse NoSQL response: ' + e.message);
    }

    if (items && items.length > 0) {
      for (var di = 0; di < items.length; di++) {
        var data = items[di];
        if (data && data.item && typeof data.item.to === 'function') {
          var doc = data.item.to();
          if (doc && doc.person_id) {
            allDocs.push(doc);
          }
        }
      }
    }

    this._loadCount++;
    startKey = result.start_key;
    if (!startKey) break;
  }

  var nodeIndex = {};
  var adjacency = {};

  for (var di = 0; di < allDocs.length; di++) {
    var doc = allDocs[di];
    nodeIndex[doc.person_id] = doc;

    var confirmed = doc.confirmed_edges || [];
    if (confirmed.length > 0) {
      adjacency[doc.person_id] = confirmed;
    }
  }

  this._nodeIndex = nodeIndex;
  this._adjacency = adjacency;
  this.loadedAt = Date.now();
  this._loaded = true;
};

PersonMasterCache.prototype.getPerson = function (personId) {
  if (!this._loaded) return null;
  return this._nodeIndex[personId] || null;
};

PersonMasterCache.prototype.getEdges = function (personId) {
  if (!this._loaded) return [];
  return this._adjacency[personId] || [];
};

PersonMasterCache.prototype.getDegree = function (personId) {
  if (!this._loaded) return 0;
  var edges = this._adjacency[personId];
  return edges ? edges.length : 0;
};

PersonMasterCache.prototype.getAdjacency = function () {
  return this._adjacency;
};

PersonMasterCache.prototype.reset = function () {
  this._nodeIndex = {};
  this._adjacency = {};
  this._loaded = false;
  this._loading = null;
  this._loadCount = 0;
  this._loadErrors = 0;
  this.loadedAt = null;
};

PersonMasterCache.prototype.getNodeIndex = function () {
  return this._nodeIndex;
};

module.exports = { PersonMasterCache: PersonMasterCache };
