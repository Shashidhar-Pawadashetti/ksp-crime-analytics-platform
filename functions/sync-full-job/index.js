'use strict';
var express = require('express');
var helmet = require('helmet');
var catalyst = require('zcatalyst-sdk-node');
var app = express();
app.use(helmet());
app.use(express.json({ limit: '5mb' }));

function getAppInstance(req) {
  try { return catalyst.initialize(req); }
  catch (e) { return null; }
}

app.post('/trigger', async function (req, res) {
  var appInstance = getAppInstance(req);
  if (!appInstance) { res.status(500).json({ status: 'error', error_code: 'INIT_FAILED' }); return; }

  try {
    console.log('[sync-full-job] Recording trigger event to cache...');
    var cache = appInstance.cache();
    var triggerEvent = {
      type: 'full_sync_trigger',
      triggered_at: new Date().toISOString(),
      run_id: 'FULL-NIGHTLY-' + Date.now().toString(36).toUpperCase(),
      status: 'pending'
    };
    await cache.put('sync_full_trigger', JSON.stringify(triggerEvent), { ttl: 3600 });
    console.log('[sync-full-job] Trigger recorded: ' + triggerEvent.run_id);
    res.status(200).json({
      status: 'ok',
      data: triggerEvent,
      message: 'Trigger recorded — cron handler will process shortly'
    });
  } catch (err) {
    console.error('[sync-full-job] Failed: ' + err.message);
    res.status(500).json({
      status: 'error',
      error_code: 'SYNC_JOB_FAILED',
      message: err.message
    });
  }
});

app.get('/', function (req, res) {
  res.status(200).json({ status: 'ok', service: 'sync-full-job', description: 'Cron-triggered full sync job (Phase 4.5)' });
});

module.exports = app;
