'use strict';

/*
 * sync-full — Full Reconciliation Entry Point
 *
 * Phase 4.2.3 Milestone 3.
 *
 * Provides the local automation entry point for full reconciliation.
 * Delegates all algorithmic work to fullReconciler.js which orchestrates
 * existing project modules (entity-matching-engine, personmaster-writer).
 */

var express = require('express');
var helmet = require('helmet');
var catalyst = require('zcatalyst-sdk-node');

var { fullReconcile } = require('./fullReconciler');

/* ------------------------------------------------------------------ */
/*  Express setup                                                     */
/* ------------------------------------------------------------------ */

var app = express();
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

/* ------------------------------------------------------------------ */
/*  POST /run — trigger full reconciliation                           */
/* ------------------------------------------------------------------ */

app.post('/run', async function (req, res) {
  var appInstance;
  try {
    appInstance = catalyst.initialize(req);
  } catch (e) {
    res.status(500).json({
      status: 'error',
      error_code: 'INIT_FAILED',
      message: 'Failed to initialize Catalyst app'
    });
    return;
  }

  try {
    var options = req.body || {};
    var result = await fullReconcile(appInstance, {
      runId: options.run_id || null,
      max_records: options.max_records != null ? Number(options.max_records) : null
    });

    res.status(200).json({
      status: 'ok',
      data: result
    });
  } catch (err) {
    console.error('[sync-full] Fatal error: ' + err.message);
    res.status(500).json({
      status: 'error',
      error_code: 'FULL_RECONCILE_FAILED',
      message: err.message
    });
  }
});

/* ------------------------------------------------------------------ */
/*  GET / — health check                                              */
/* ------------------------------------------------------------------ */

app.get('/', function (req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'sync-full',
    phase: '4.2.3',
    description: 'Full reconciliation pipeline (orchestrates entity matching, PersonMaster build, edge generation)'
  });
});



/* ------------------------------------------------------------------ */
/*  Global error handler                                              */
/* ------------------------------------------------------------------ */

app.use(function (err, req, res, next) {
  console.error('[sync-full] Unhandled error: ' + err.message);
  res.status(500).json({
    status: 'error',
    error_code: 'INTERNAL_ERROR',
    message: err.message
  });
});

/* ------------------------------------------------------------------ */
/*  Export                                                            */
/* ------------------------------------------------------------------ */

var handler = function (req, res) {
  app(req, res);
};

handler.fullReconcile = fullReconcile;

module.exports = handler;
