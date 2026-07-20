'use strict';

const express = require('express');
const helmet = require('helmet');
const catalyst = require('zcatalyst-sdk-node');

const { route: routeRequest } = require('./routes');
const { NetworkAnalysisService } = require('./networkAnalysisService');
const validators = require('./validators');

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
    service: 'network-analysis',
    version: '1.0.0',
    endpoints: {
      'GET /': 'Health check',
      'GET /person/:personId': 'Get person details',
      'GET /person/:personId/associates': 'Get known associates',
      'GET /person/:personId/co-accused': 'Get co-accused network',
      'GET /person/:personId/victims': 'Get victim relationships',
      'GET /person/:personId/network-summary': 'Get network summary',
      'POST /analyze': 'Analyze network for a person'
    }
  });
});

expressApp.get('/person/:personId', async (req, res) => {
  const routeRes = await routeRequest({ url: req.originalUrl, method: req.method });
  res.status(routeRes.statusCode || 200).set(routeRes.headers || {}).send(routeRes.body);
});

expressApp.get('/person/:personId/associates', async (req, res) => {
  const routeRes = await routeRequest({ url: req.originalUrl, method: req.method });
  res.status(routeRes.statusCode || 200).set(routeRes.headers || {}).send(routeRes.body);
});

expressApp.get('/person/:personId/co-accused', async (req, res) => {
  const routeRes = await routeRequest({ url: req.originalUrl, method: req.method });
  res.status(routeRes.statusCode || 200).set(routeRes.headers || {}).send(routeRes.body);
});

expressApp.get('/person/:personId/victims', async (req, res) => {
  const routeRes = await routeRequest({ url: req.originalUrl, method: req.method });
  res.status(routeRes.statusCode || 200).set(routeRes.headers || {}).send(routeRes.body);
});

expressApp.get('/person/:personId/network-summary', async (req, res) => {
  const routeRes = await routeRequest({ url: req.originalUrl, method: req.method });
  res.status(routeRes.statusCode || 200).set(routeRes.headers || {}).send(routeRes.body);
});

expressApp.post('/analyze', async (req, res) => {
  const { person_id } = req.body;
  if (!person_id) {
    return res.status(400).json({ status: 'error', error_code: 'VALIDATION_ERROR', message: 'person_id is required' });
  }

  const errors = validators.validatePersonId(person_id);
  if (errors.length > 0) {
    return res.status(400).json({ status: 'error', error_code: 'VALIDATION_ERROR', message: 'Validation failed', details: errors });
  }

  const service = new NetworkAnalysisService();
  try {
    const person = await service.getPerson(person_id);
    if (!person) {
      return res.status(404).json({ status: 'error', error_code: 'NOT_FOUND', message: 'Person ' + person_id + ' not found' });
    }

    const [associates, coAccused, victims, summary] = await Promise.all([
      service.getKnownAssociates(person_id, { max_hops: 2 }),
      service.getCoAccusedNetwork(person_id),
      service.getVictimRelationships(person_id),
      service.getNetworkSummary(person_id)
    ]);

    res.json({
      status: 'ok',
      data: {
        person,
        associates: associates || { associates: [], edges: [] },
        co_accused: coAccused || { associates: [], edges: [] },
        victims: victims || { associates: [], edges: [] },
        network_summary: summary
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error_code: 'INTERNAL_ERROR', message: err.message });
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
