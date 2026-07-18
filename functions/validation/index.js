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

expressApp.post('/validate', (req, res) => {
  const { data, rules } = req.body;
  if (!data) {
    return res.status(400).json({ status: 'error', error_code: 'VALIDATION_ERROR', message: 'data field is required' });
  }

  res.json({
    status: 'ok',
    data: {
      valid: true,
      checks: [],
      summary: 'Validation stub — implement groundTruthValidator.js logic here'
    }
  });
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
