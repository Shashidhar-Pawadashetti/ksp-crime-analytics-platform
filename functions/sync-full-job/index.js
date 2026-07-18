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
  res.status(200).json({ status: 'ok', message: 'sync-full-job stub — not yet implemented' });
});

app.get('/', function (req, res) {
  res.status(200).json({ status: 'ok', service: 'sync-full-job', description: 'Cron-triggered full sync job (Phase 4.5)' });
});

module.exports = app;
