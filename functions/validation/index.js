'use strict';

const express = require('express');
const helmet = require('helmet');
const catalyst = require('zcatalyst-sdk-node');

const expressApp = express();
expressApp.use(helmet());
expressApp.use(express.json({ limit: '1mb' }));

function getAppInstance(req) {
  try { return catalyst.initialize(req); }
  catch (e) { return null; }
}

expressApp.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'validation',
    version: '1.0.0',
    endpoints: {
      'GET /': 'Health check',
      'POST /validate': 'Validate ground truth data'
    }
  });
});

expressApp.post('/validate', async (req, res) => {
  var catApp;
  try {
    catApp = catalyst.initialize(req);
  } catch (e) {
    return res.status(500).json({ status: 'error', error_code: 'INIT_FAILED', message: 'Failed to initialize Catalyst' });
  }

  if (!req.body || !req.body.data) {
    return res.status(400).json({ status: 'error', error_code: 'VALIDATION_ERROR', message: 'data field is required' });
  }

  try {
    var { validateAgainstGroundTruth } = require('./groundTruthValidator');
    var opts = {};
    if (req.body.data.type === 'full') opts.type = 'full';
    if (req.body.data.ground_truth_path) opts.ground_truth_path = req.body.data.ground_truth_path;
    if (req.body.data.ground_truth_csv) opts.ground_truth_csv = req.body.data.ground_truth_csv;
    if (req.body.ground_truth_csv) opts.ground_truth_csv = req.body.ground_truth_csv;
    var result = await validateAgainstGroundTruth(catApp, opts);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    console.error('[validation] Error: ' + err.message);
    res.status(500).json({ status: 'error', error_code: 'VALIDATION_FAILED', message: err.message });
  }
});

module.exports = async (req, res) => {
  let catApp;
  try {
    catApp = catalyst.initialize(req);
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', error_code: 'INIT_FAILED', message: 'Failed to initialize Catalyst SDK' }));
    return;
  }
  expressApp(req, res);
};
