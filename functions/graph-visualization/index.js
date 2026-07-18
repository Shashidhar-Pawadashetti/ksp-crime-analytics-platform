'use strict';

const express = require('express');
const helmet = require('helmet');
const catalyst = require('zcatalyst-sdk-node');

const { route: routeRequest } = require('./routes');
const { toCytoscape } = require('./cytoscapeFormatter');

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
    service: 'graph-visualization',
    version: '1.0.0',
    endpoints: {
      'GET /': 'Health check',
      'GET /person/:personId/graph': 'Export graph visualization data (cytoscape, compact, debug)',
      'POST /visualize': 'Accept graph structure and return cytoscape-formatted JSON'
    }
  });
});

expressApp.get('/person/:personId/graph', (req, res) => {
  const routeRes = routeRequest({ url: req.originalUrl, method: req.method });
  res.status(routeRes.statusCode || 200).set(routeRes.headers || {}).send(routeRes.body);
});

expressApp.post('/visualize', (req, res) => {
  const { nodes, edges, options } = req.body;
  if (!nodes || !edges) {
    return res.status(400).json({ status: 'error', error_code: 'VALIDATION_ERROR', message: 'nodes and edges are required' });
  }

  const traversalResult = { nodes, edges, statistics: req.body.statistics || null };
  const cytoscapeResult = toCytoscape(traversalResult);

  res.json({ status: 'ok', data: cytoscapeResult });
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
