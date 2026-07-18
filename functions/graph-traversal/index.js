'use strict';

var express = require('express');
var helmet = require('helmet');
var catalyst = require('zcatalyst-sdk-node');
var { traverseGraph } = require('./bfs');
var { extractCallerScope } = require('./rbacFilter');

var app = express();
app.use(helmet());
app.use(express.json({ limit: '5mb' }));

function getAppInstance(req) {
  try {
    return catalyst.initialize(req);
  } catch (e) {
    console.error('[catalyst] Init failed: ' + e.message);
    return null;
  }
}

/**
 * POST /traverse — traverse the crime graph from a root person.
 *
 * LLD §6.3 — API handler for network queries.
 *
 * Body: { person_id, hops?, max_nodes?, caller_scope? }
 */
app.post('/traverse', async function (req, res) {
  var appInstance = getAppInstance(req);
  if (!appInstance) {
    res.status(500).json({ status: 'error', error_code: 'INIT_FAILED', message: 'Failed to initialize Catalyst app' });
    return;
  }

  var body = req.body || {};
  var personId = body.person_id;
  var hops = parseInt(body.hops, 10) || 2;
  var maxNodes = parseInt(body.max_nodes, 10) || 50;

  if (!personId) {
    res.status(400).json({
      status: 'error', error_code: 'MISSING_PERSON_ID',
      message: 'person_id is required'
    });
    return;
  }

  var callerScope = extractCallerScope(req);

  try {
    var result = await traverseGraph(appInstance, personId, hops, maxNodes, callerScope);

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

/**
 * GET / — health check.
 */
app.get('/', function (req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'graph-traversal',
    description: 'Crime graph BFS traversal (LLD §6)'
  });
});

module.exports = app;
