'use strict';

var express = require('express');
var helmet = require('helmet');
var catalyst = require('zcatalyst-sdk-node');
var training = require('./training');
var forecasting = require('./forecasting');
var auditLog = require('./analytics-audit-log');
var crc32 = require('./crc32');

var app = express();
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

var _nowFn = function () { return new Date(); };
function setNowFn(fn) { _nowFn = fn; }
function getNow() { return _nowFn(); }

function getAppInstance(req) {
  try { return catalyst.initialize(req); }
  catch (e) {
    try {
      var mockCatalyst = require('./catalyst-mock');
      console.log('[forecast] Using in-memory mock (no Catalyst project detected)');
      return mockCatalyst.initializeApp(req);
    } catch (e2) {
      throw new Error('Failed to initialize Catalyst app: ' + (e.stack || e.message));
    }
  }
}

app.get('/', function (req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'forecasting',
    phase: '5.3',
    message: 'Spatiotemporal Crime Forecasting — WBS 5.3'
  });
});

app.post('/train', async function (req, res) {
  var appInstance;
  try { appInstance = getAppInstance(req); }
  catch (e) { res.status(500).json({ status: 'error', error_code: 'INIT_FAILED', message: 'Failed to initialize Catalyst app' }); return; }

  var t0 = Date.now();
  var startedAt = new Date().toISOString();

  try {
    var options = req.body || {};
    var trainingResult = await training.runTraining(appInstance, options);

    try { await training.persistModelRecord(appInstance, trainingResult); }
    catch (persistErr) { console.error('[forecast] ModelRegistry persist failed: ' + persistErr.message); }

    try {
      await auditLog.createAuditRecord(appInstance, {
        runId: trainingResult.trainingRunId,
        runType: 'training',
        triggerType: options.triggerType || 'api',
        startedAt: startedAt,
        completedAt: trainingResult.trainedAt,
        status: 'SUCCESS',
        documentsCreated: 1,
        documentsUpdated: 0,
        personsProcessed: trainingResult.trainingStats.totalCTUFRecords,
        errorCount: 0,
        thresholdUsed: 0
      });
    } catch (auditErr) { console.error('[forecast] Audit log write failed: ' + auditErr.message); }

    var elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log('[forecast] Training complete (' + elapsed + 's)');

    res.status(200).json({
      status: 'ok',
      data: {
        run_id: trainingResult.trainingRunId,
        model_version: trainingResult.modelVersion,
        model_name: trainingResult.modelName,
        training_backend: trainingResult.trainingBackend,
        trained_at: trainingResult.trainedAt,
        elapsed_seconds: Number(elapsed),
        training_stats: trainingResult.trainingStats,
        validation_metrics: trainingResult.validationMetrics,
        series_count: trainingResult.seriesResults.length
      }
    });
  } catch (err) {
    console.error('[forecast] Training error: ' + err.message);
    try {
      await auditLog.createAuditRecord(appInstance, {
        runId: 'FTRN_FAILED_' + Date.now().toString(36).toUpperCase(),
        runType: 'training', triggerType: (req.body || {}).triggerType || 'api',
        startedAt: startedAt, completedAt: new Date().toISOString(),
        status: 'FAILED', documentsCreated: 0, documentsUpdated: 0,
        personsProcessed: 0, errorCount: 1, thresholdUsed: 0
      });
    } catch (auditErr) {}
    res.status(500).json({ status: 'error', error_code: 'TRAINING_FAILED', message: err.message });
  }
});

app.post('/forecast', async function (req, res) {
  var appInstance;
  try { appInstance = getAppInstance(req); }
  catch (e) { res.status(500).json({ status: 'error', error_code: 'INIT_FAILED' }); return; }

  var t0 = Date.now();
  var startedAt = new Date().toISOString();

  try {
    var options = req.body || {};
    var forecastResult = await forecasting.runForecasting(appInstance, options);

    try {
      await auditLog.createAuditRecord(appInstance, {
        runId: forecastResult.forecastingRunId,
        runType: 'forecasting', triggerType: options.triggerType || 'api',
        startedAt: startedAt, completedAt: new Date().toISOString(),
        status: 'SUCCESS',
        documentsCreated: forecastResult.recordsCreated,
        documentsUpdated: forecastResult.recordsUpdated,
        personsProcessed: forecastResult.recordsProcessed,
        errorCount: forecastResult.errors,
        thresholdUsed: 0
      });
    } catch (auditErr) { console.error('[forecast] Audit log write failed: ' + auditErr.message); }

    var elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log('[forecast] Forecasting complete (' + elapsed + 's)');

    res.status(200).json({
      status: 'ok',
      data: {
        forecasting_run_id: forecastResult.forecastingRunId,
        model_name: forecastResult.modelName,
        model_version: forecastResult.modelVersion,
        feature_snapshot_run_id: forecastResult.featureSnapshotRunId,
        records_processed: forecastResult.recordsProcessed,
        records_created: forecastResult.recordsCreated,
        records_updated: forecastResult.recordsUpdated,
        total_forecasts: forecastResult.totalForecasts,
        errors: forecastResult.errors,
        elapsed_seconds: Number(elapsed)
      }
    });
  } catch (err) {
    console.error('[forecast] Forecasting error: ' + err.message);
    try {
      await auditLog.createAuditRecord(appInstance, {
        runId: 'FCT_FAILED_' + Date.now().toString(36).toUpperCase(),
        runType: 'forecasting', triggerType: (req.body || {}).triggerType || 'api',
        startedAt: startedAt, completedAt: new Date().toISOString(),
        status: 'FAILED', documentsCreated: 0, documentsUpdated: 0,
        personsProcessed: 0, errorCount: 1, thresholdUsed: 0
      });
    } catch (auditErr) {}
    res.status(500).json({ status: 'error', error_code: 'FORECAST_FAILED', message: err.message });
  }
});

app.get('/model', async function (req, res) {
  var appInstance;
  try { appInstance = getAppInstance(req); }
  catch (e) { res.status(500).json({ status: 'error', error_code: 'INIT_FAILED' }); return; }

  try {
    var activeModel = await training.getActiveModel(appInstance);
    if (!activeModel) {
      res.status(200).json({ status: 'ok', data: { message: 'No active forecasting model found. Run POST /train first.', active_model: null } });
      return;
    }
    res.status(200).json({ status: 'ok', data: { active_model: activeModel } });
  } catch (err) {
    res.status(500).json({ status: 'error', error_code: 'MODEL_LOOKUP_FAILED', message: err.message });
  }
});

app.use(function (err, req, res, next) {
  console.error('[forecast] Unhandled error: ' + err.message);
  res.status(500).json({ status: 'error', error_code: 'INTERNAL_ERROR', message: err.message });
});

var handler = function (req, res) { app(req, res); };
handler.setNowFn = setNowFn;
handler.getNow = getNow;
handler.crc32 = crc32;

module.exports = handler;
