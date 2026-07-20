'use strict';

var catalyst = require('zcatalyst-sdk-node');

var PM_TABLE_NAME = process.env.PM_TABLE_NAME || 'PersonMaster';
var PM_PARTITION_VALUE = 'PM';

function GraphRepository(options) {
  this._options = options || {};
  this._app = null;
}

GraphRepository.prototype._getApp = function () {
  if (this._app) return this._app;
  try {
    this._app = catalyst.app();
  } catch (e) {
    var projectKey = process.env.CATALYST_PROJECT_KEY;
    if (projectKey) {
      this._app = catalyst.initializeApp({
        project_id: process.env.CATALYST_PROJECT_ID || '47995000000013046',
        project_key: projectKey,
        environment: process.env.CATALYST_ENVIRONMENT || 'development'
      });
    } else {
      throw new Error(
        'Cannot initialize Catalyst. Deploy to Catalyst or set CATALYST_PROJECT_KEY.'
      );
    }
  }
  return this._app;
};

GraphRepository.prototype.loadNodes = async function () {
  var app = this._getApp();
  var noSql = app.nosql();
  var table = await noSql.getTable(PM_TABLE_NAME);
  var { NoSQLMarshall, NoSQLEnum } = require('zcatalyst-sdk-node/lib/no-sql');
  var { NoSQLOperator } = NoSQLEnum;

  var nodes = [];
  var hasMore = true;
  var lastKey = null;

  while (hasMore) {
    var queryBody = {
      key_condition: {
        attribute: ['type'],
        operator: NoSQLOperator.EQUALS,
        value: NoSQLMarshall.makeString(PM_PARTITION_VALUE)
      },
      limit: 200
    };

    if (lastKey) {
      queryBody.exclusive_start_key = lastKey;
    }

    var response = await table.queryTable(queryBody);
    var items = response.getResponseData();

    if (items && items.length > 0) {
      for (var di = 0; di < items.length; di++) {
        var data = items[di];
        if (data && data.item) {
          var doc = data.item.to();
          if (doc && doc.person_id) {
            var clean = {
              person_id: doc.person_id,
              canonical_name: doc.canonical_name || '',
              aliases: doc.aliases || [],
              source_records: doc.source_records || [],
              roles_summary: doc.roles_summary || { accused_count: 0, victim_count: 0, complainant_count: 0 },
              demographics: doc.demographics || {},
              confidence: doc.confidence || {},
              meta: doc.meta || {}
            };
            nodes.push(clean);
          }
        }
      }

      if (items.length < 200) {
        hasMore = false;
      } else {
        var lastItem = items[items.length - 1];
        if (lastItem && lastItem.item) {
          var lastDoc = lastItem.item.to();
          lastKey = {
            type: NoSQLMarshall.makeString(PM_PARTITION_VALUE),
            person_id: NoSQLMarshall.makeString(lastDoc.person_id)
          };
        } else {
          hasMore = false;
        }
      }
    } else {
      hasMore = false;
    }
  }

  return nodes;
};

GraphRepository.prototype.loadEdges = async function () {
  var nodes = await this.loadNodes();
  var edges = [];
  var edgeIdSet = {};

  for (var ni = 0; ni < nodes.length; ni++) {
    var doc = nodes[ni];
    if (!doc.adjacency) continue;

    var typeKeys = {
      'co_accused': 'CO_ACCUSED',
      'accused_to_victim': 'ACCUSED_TO_VICTIM',
      'shared_location': 'SHARED_LOCATION',
      'unconfirmed_matches': 'UNCONFIRMED_MATCH'
    };

    for (var typeKey in typeKeys) {
      var list = doc.adjacency[typeKey] || [];
      for (var ei = 0; ei < list.length; ei++) {
        var entry = list[ei];
        if (edgeIdSet[entry.edge_id]) continue;
        edgeIdSet[entry.edge_id] = true;
        edges.push({
          edge_id: entry.edge_id,
          source: doc.person_id,
          target: entry.person_id,
          edge_type: typeKeys[typeKey],
          weight: entry.weight || 1,
          metadata: {
            occurrence_count: entry.occurrence_count || 1
          }
        });
      }
    }
  }

  return edges;
};

GraphRepository.prototype.getNodeById = async function (personId) {
  var nodes = await this.loadNodes();
  for (var ni = 0; ni < nodes.length; ni++) {
    if (nodes[ni].person_id === personId) return nodes[ni];
  }
  return null;
};

GraphRepository.prototype.loadGraph = async function () {
  var nodes = await this.loadNodes();
  var edges = await this.loadEdges();
  return { nodes: nodes, edges: edges };
};

module.exports = { GraphRepository };
