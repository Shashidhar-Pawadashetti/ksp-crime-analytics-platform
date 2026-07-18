'use strict';

var catalyst = require('zcatalyst-sdk-node');

var PM_TABLE_NAME = process.env.PM_TABLE_NAME || 'PersonMaster';
var PM_PARTITION_VALUE = 'PM';

function GraphRepository() {
  this._app = null;
}

GraphRepository.prototype.init = function (req) {
  this._app = catalyst.initialize(req);
  return this;
};

GraphRepository.prototype.loadNodes = async function () {
  var noSql = this._app.nosql();
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
              meta: doc.meta || {},
              confirmed_edges: doc.confirmed_edges || [],
              unconfirmed_edges: doc.unconfirmed_edges || []
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

GraphRepository.prototype.loadEdges = async function (nodes) {
  if (!nodes) nodes = await this.loadNodes();
  var edges = [];
  var edgeIdSet = {};

  for (var ni = 0; ni < nodes.length; ni++) {
    var doc = nodes[ni];

    var confirmedList = doc.confirmed_edges || [];
    for (var cei = 0; cei < confirmedList.length; cei++) {
      var ce = confirmedList[cei];
      if (edgeIdSet[ce.edge_id]) continue;
      edgeIdSet[ce.edge_id] = true;
      edges.push({
        edge_id: ce.edge_id,
        source: doc.person_id,
        target: ce.with_person_id,
        edge_type: ce.type || 'UNKNOWN',
        weight: 1,
        metadata: {
          occurrence_count: (ce.case_ids || []).length || 1
        }
      });
    }

    var unconfirmedList = doc.unconfirmed_edges || [];
    for (var uei = 0; uei < unconfirmedList.length; uei++) {
      var ue = unconfirmedList[uei];
      var edgeKey = doc.person_id + '-' + ue.with_person_id + '-UNCONFIRMED_MATCH';
      if (edgeIdSet[edgeKey]) continue;
      edgeIdSet[edgeKey] = true;
      edges.push({
        edge_id: edgeKey,
        source: doc.person_id,
        target: ue.with_person_id,
        edge_type: 'UNCONFIRMED_MATCH',
        weight: ue.confidence || 0.5,
        metadata: {
          occurrence_count: 1,
          confidence: ue.confidence,
          score_breakdown: ue.score_breakdown
        }
      });
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
  var edges = await this.loadEdges(nodes);
  return { nodes: nodes, edges: edges };
};

module.exports = { GraphRepository };
