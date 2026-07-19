'use strict';
var express = require('express');
var helmet = require('helmet');
var catalyst = require('zcatalyst-sdk-node');
var https = require('https');
var app = express();
app.use(helmet());
app.use(express.json({ limit: '5mb' }));

function getAppInstance(req) {
  try { return catalyst.initialize(req); }
  catch (e) { return null; }
}

function callSyncFullEndpoint() {
  return new Promise(function (resolve, reject) {
    var postData = JSON.stringify({});
    var options = {
      hostname: 'datathon2026-60073929329.development.catalystserverless.in',
      path: '/server/sync-full/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 180000
    };

    var req = https.request(options, function (res) {
      var body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Failed to parse response: ' + body.slice(0, 200)));
        }
      });
    });

    req.on('error', function (err) {
      reject(new Error('HTTP request failed: ' + err.message));
    });

    req.on('timeout', function () {
      req.destroy();
      reject(new Error('Request timed out after 180s'));
    });

    req.write(postData);
    req.end();
  });
}

app.post('/trigger', async function (req, res) {
  var appInstance = getAppInstance(req);
  if (!appInstance) { res.status(500).json({ status: 'error', error_code: 'INIT_FAILED' }); return; }

  try {
    console.log('[sync-full-job] Triggering full reconciliation...');
    var result = await callSyncFullEndpoint();
    console.log('[sync-full-job] Sync-full completed: ' + JSON.stringify(result).substring(0, 200));
    res.status(200).json({
      status: 'ok',
      data: result,
      message: 'Full reconciliation triggered and completed'
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
