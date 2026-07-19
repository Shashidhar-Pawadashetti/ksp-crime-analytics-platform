'use strict';

var express = require('express');
var helmet = require('helmet');
var https = require('https');
var url = require('url');

var app = express();
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

/**
 * Post a payload to personmaster-writer's /resolve endpoint.
 *
 * Uses the deployment URL pattern for Catalyst internal functions:
 *   https://{project-prefix}.development.catalystserverless.in/server/personmaster-writer/resolve
 */
function callResolveEndpoint(payload) {
  return new Promise(function (resolve, reject) {
    var postData = JSON.stringify(payload);
    var options = {
      hostname: 'datathon2026-60073929329.development.catalystserverless.in',
      path: '/server/personmaster-writer/resolve',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 120000
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
      reject(new Error('Request timed out after 120s'));
    });

    req.write(postData);
    req.end();
  });
}

/* POST / — trigger full reconciliation */
app.post('/', async function (req, res) {
  var t0 = Date.now();

  console.log('[sync-full] Full reconciliation triggered');

  try {
    var result = await callResolveEndpoint({
      records_per_table: 50000,
      run_id: 'FULL-NIGHTLY-' + Date.now().toString(36).toUpperCase()
    });

    var elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log('[sync-full] Reconciliation complete (' + elapsed + 's)');

    res.status(200).json({
      status: 'ok',
      data: result.data,
      elapsed_seconds: Number(elapsed),
      trigger: 'api'
    });
  } catch (err) {
    console.error('[sync-full] Reconciliation failed: ' + err.message);
    res.status(500).json({
      status: 'error',
      error_code: 'SYNC_FULL_FAILED',
      message: err.message
    });
  }
});

/* GET / — health check */
app.get('/', function (req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'sync-full',
    description: 'Full reconciliation job (LLD §5.2)',
    schedule: '0 3 * * * (nightly)'
  });
});

module.exports = app;
