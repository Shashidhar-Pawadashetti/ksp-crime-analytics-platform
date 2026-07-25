'use strict';

var express = require('express');
var helmet = require('helmet');
var catalyst = require('zcatalyst-sdk-node');
var { TraversalService } = require('./traversalService');
var { extractCallerScope } = require('./rbacFilter');

var app = express();
app.use(helmet());
app.use(express.json({ limit: '5mb' }));

var sharedInstance = null;

function getInstance() {
  if (!sharedInstance) {
    sharedInstance = new TraversalService();
  }
  return sharedInstance;
}

function resetInstance() {
  sharedInstance = null;
}

function getAppInstance(req) {
  try {
    return catalyst.initialize(req);
  } catch (e) {
    console.error('[catalyst] Init failed: ' + e.message);
    return null;
  }
}

function normalizeBody(body) {
  var personId = body.person_id || body.start_person_id;
  if (!personId) return null;

  var hops;
  if (body.hops !== undefined && body.hops !== null) {
    hops = parseInt(body.hops, 10);
  } else if (body.max_depth !== undefined && body.max_depth !== null) {
    hops = parseInt(body.max_depth, 10);
  } else {
    hops = 2;
  }

  if (hops < 0 || isNaN(hops)) hops = 2;

  var maxNodes;
  if (body.max_nodes !== undefined && body.max_nodes !== null) {
    maxNodes = parseInt(body.max_nodes, 10);
    if (isNaN(maxNodes) || maxNodes < 1) maxNodes = 50;
  } else {
    maxNodes = 50;
  }

  return {
    person_id: personId,
    max_hops: hops,
    max_nodes: maxNodes,
    include_unconfirmed: body.include_unconfirmed === true,
    edge_type_filter: body.edge_types || body.edge_type_filter || null,
    min_confidence: body.min_confidence || 0,
    caller_scope: body.caller_scope || null
  };
}

app.post('/traverse', async function (req, res) {
  var appInstance = getAppInstance(req);
  if (!appInstance) return;

  var body = req.body || {};
  var normalized = normalizeBody(body);

  if (!normalized) {
    res.status(400).json({
      status: 'error', error_code: 'MISSING_PERSON_ID',
      message: 'person_id or start_person_id is required'
    });
    return;
  }

  var callerScope = extractCallerScope(req);

  var service;
  try {
    service = getInstance();
    service.setAppInstance(appInstance);

    var result = await service.traverse(normalized.person_id, {
      max_hops: normalized.max_hops,
      max_nodes: normalized.max_nodes,
      include_unconfirmed: normalized.include_unconfirmed,
      edge_type_filter: normalized.edge_type_filter,
      min_confidence: normalized.min_confidence,
      caller_scope: callerScope
    });

    res.status(200).json({
      status: 'ok',
      data: result
    });
  } catch (err) {
    console.error('[graph] Traversal error: ' + err.message);
    res.status(500).json({
      status: 'error', error_code: 'TRAVERSAL_FAILED',
      message: err.message
    });
  }
});

app.get('/', function (req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'graph-traversal',
    description: 'Crime graph BFS traversal (LLD §6)'
  });
});

module.exports = app;
module.exports.TraversalService = TraversalService;
module.exports.getInstance = getInstance;
module.exports.resetInstance = resetInstance;
