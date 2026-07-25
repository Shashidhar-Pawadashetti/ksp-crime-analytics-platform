'use strict';

var catalyst = require('zcatalyst-sdk-node');

var PM_TABLE_NAME = process.env.PM_TABLE_NAME || 'PersonMaster';

var DIRECTED_EDGE_TYPES = {
  ACCUSED_TO_VICTIM: true
};

var UNDIRECTED_EDGE_TYPES = {
  CO_ACCUSED: true,
  SHARED_LOCATION: true,
  CANDIDATE_MATCH: true
};

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

GraphRepository.prototype._isDirected = function (edgeType) {
  return !!DIRECTED_EDGE_TYPES[edgeType];
};

GraphRepository.prototype._isUndirected = function (edgeType) {
  return !!UNDIRECTED_EDGE_TYPES[edgeType];
};

GraphRepository.prototype._isValidEdgeType = function (edgeType) {
  return this._isDirected(edgeType) || this._isUndirected(edgeType);
};

GraphRepository.prototype._loadAllDocuments = async function () {
  var app = this._getApp();
  var noSql = app.nosql();
  var table = await noSql.getTable(PM_TABLE_NAME);
  var { NoSQLMarshall, NoSQLEnum } = require('zcatalyst-sdk-node/lib/no-sql');
  var { NoSQLOperator } = NoSQLEnum;

  var allDocs = [];
  var lastKey = null;
  var hasMore = true;

  while (hasMore) {
    var queryBody = {
      key_condition: {
        attribute: 'type',
        operator: NoSQLOperator.EQUALS,
        value: NoSQLMarshall.makeString('PM')
      },
      limit: 100,
      consistent_read: true
    };

    if (lastKey) {
      queryBody.start_key = lastKey;
    }

    var response = await table.queryTable(queryBody);
    var items;
    try {
      items = response.getResponseData();
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

    try {
      lastKey = response.start_key;
    } catch (e) {
      lastKey = null;
    }
    hasMore = (lastKey != null) && (items && items.length > 0);
  }

  return allDocs;
};

GraphRepository.prototype._extractNode = function (doc) {
  return {
    person_id: doc.person_id,
    canonical_name: doc.canonical_name || '',
    name_normalised: doc.name_normalised || '',
    aliases: doc.aliases || [],
    age_estimate: doc.age_estimate || null,
    gender: doc.gender || null,
    source_records: doc.source_records || [],
    roles_summary: doc.roles_summary || { accused_count: 0, victim_count: 0, complainant_count: 0 },
    demographics: doc.demographics || {},
    confidence: doc.confidence || {},
    flags: doc.flags || {},
    meta: doc.meta || {}
  };
};

GraphRepository.prototype._extractEdges = function (doc, nodeIndex) {
  var edges = [];
  var diagnostics = {
    confirmed_edges_loaded: 0,
    unconfirmed_edges_loaded: 0,
    duplicate_edges_skipped: 0,
    self_loops_skipped: 0,
    dangling_edges_skipped: 0,
    unknown_edges_skipped: 0,
    malformed_edges_skipped: 0
  };
  var seenEdgeIds = {};

  var confirmed = doc.confirmed_edges || [];
  var unconfirmed = doc.unconfirmed_edges || [];

  function processEdgeEntry(raw, confirmedFlag) {
    if (!raw || !raw.edge_id) {
      diagnostics.malformed_edges_skipped++;
      return;
    }
    var tgtId = raw.target_person_id || raw.with_person_id;
    var eType = raw.edge_type || raw.type;
    if (!tgtId) {
      diagnostics.malformed_edges_skipped++;
      return;
    }
    if (!eType) {
      diagnostics.malformed_edges_skipped++;
      return;
    }

    if (seenEdgeIds[raw.edge_id]) {
      diagnostics.duplicate_edges_skipped++;
      return;
    }

    if (tgtId === doc.person_id) {
      diagnostics.self_loops_skipped++;
      return;
    }

    if (!nodeIndex[tgtId]) {
      diagnostics.dangling_edges_skipped++;
      return;
    }

    if (!this._isValidEdgeType(eType)) {
      diagnostics.unknown_edges_skipped++;
      return;
    }

    seenEdgeIds[raw.edge_id] = true;

    var edge = {
      edge_id: raw.edge_id,
      edge_type: eType,
      source_person_id: doc.person_id,
      target_person_id: tgtId,
      confidence: raw.confidence || null,
      evidence: raw.evidence || [],
      case_ids: raw.case_ids || [],
      created_at: raw.created_at || null,
      version: raw.version || 1,
      confirmed: confirmedFlag
    };

    edges.push(edge);

    if (confirmedFlag) {
      diagnostics.confirmed_edges_loaded++;
    } else {
      diagnostics.unconfirmed_edges_loaded++;
    }
  }

  for (var ci = 0; ci < confirmed.length; ci++) {
    processEdgeEntry.call(this, confirmed[ci], true);
  }
  for (var ui = 0; ui < unconfirmed.length; ui++) {
    processEdgeEntry.call(this, unconfirmed[ui], false);
  }

  return { edges: edges, diagnostics: diagnostics };
};

GraphRepository.prototype.loadGraph = async function (appInstance) {
  var app = appInstance || this._getApp();

  var allDocs = await this._loadAllDocuments.call(this, app);

  var nodeIndex = {};
  var nodes = [];

  for (var di = 0; di < allDocs.length; di++) {
    var doc = allDocs[di];
    var node = this._extractNode(doc);
    nodeIndex[node.person_id] = node;
    nodes.push(node);
  }

  var allEdges = [];
  var combinedDiagnostics = {
    documents_loaded: allDocs.length,
    nodes_loaded: nodes.length,
    edges_loaded: 0,
    confirmed_edges_loaded: 0,
    unconfirmed_edges_loaded: 0,
    duplicate_edges_skipped: 0,
    self_loops_skipped: 0,
    dangling_edges_skipped: 0,
    unknown_edges_skipped: 0,
    malformed_edges_skipped: 0
  };

  for (var ei = 0; ei < allDocs.length; ei++) {
    var result = this._extractEdges(allDocs[ei], nodeIndex);
    allEdges = allEdges.concat(result.edges);
    combinedDiagnostics.confirmed_edges_loaded += result.diagnostics.confirmed_edges_loaded;
    combinedDiagnostics.unconfirmed_edges_loaded += result.diagnostics.unconfirmed_edges_loaded;
    combinedDiagnostics.duplicate_edges_skipped += result.diagnostics.duplicate_edges_skipped;
    combinedDiagnostics.self_loops_skipped += result.diagnostics.self_loops_skipped;
    combinedDiagnostics.dangling_edges_skipped += result.diagnostics.dangling_edges_skipped;
    combinedDiagnostics.unknown_edges_skipped += result.diagnostics.unknown_edges_skipped;
    combinedDiagnostics.malformed_edges_skipped += result.diagnostics.malformed_edges_skipped;
  }

  combinedDiagnostics.edges_loaded = allEdges.length;

  return {
    nodes: nodes,
    edges: allEdges,
    diagnostics: combinedDiagnostics
  };
};

module.exports = { GraphRepository };