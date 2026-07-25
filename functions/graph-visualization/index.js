'use strict';

const express = require('express');
const helmet = require('helmet');
const catalyst = require('zcatalyst-sdk-node');

const { GraphExportService } = require('./graphExportService');
const { toCytoscape } = require('./cytoscapeFormatter');

const expressApp = express();
expressApp.use(helmet());
expressApp.use(express.json({ limit: '1mb' }));

expressApp.use(function (req, res, next) {
  try {
    var catApp = catalyst.initialize(req);
    req.catalystApp = catApp;
    req.graphService = new GraphExportService(catApp);
  } catch (e) {
  }
  next();
});

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

expressApp.get('/person/:personId/graph', async (req, res) => {
  try {
    if (!req.graphService) {
      return res.status(500).json({ status: 'error', error_code: 'SERVICE_UNAVAILABLE', message: 'Graph service not initialized' });
    }
    var graphService = req.graphService;
    var extractCallerScope = require('./__vendored/traversal/rbacFilter').extractCallerScope;
    var callerScope = extractCallerScope(req);

    var format = req.query.format || 'cytoscape';
    var maxHops = parseInt(req.query.max_hops, 10) || 2;
    var includeUnconfirmed = req.query.include_unconfirmed === 'true';
    var edgeTypeFilter = req.query.edge_type_filter ? req.query.edge_type_filter.split(',') : undefined;
    var maxNodes = parseInt(req.query.max_nodes, 10) || 100;

    var options = {
      hops: maxHops,
      include_unconfirmed: includeUnconfirmed,
      edge_type_filter: edgeTypeFilter,
      max_nodes: maxNodes,
      caller_scope: callerScope
    };

    var result;
    switch (format) {
      case 'compact':
        result = await graphService.toCompact(req.params.personId, options);
        break;
      case 'debug':
        result = await graphService.toDebug(req.params.personId, options);
        break;
      default:
        result = await graphService.toCytoscape(req.params.personId, options);
    }

    if (result && result.error) {
      return res.status(404).json({ status: 'error', error_code: 'NOT_FOUND', message: result.error[0] || 'Person not found' });
    }

    res.json({ status: 'ok', data: result });
  } catch (e) {
    res.status(500).json({ status: 'error', error_code: 'INTERNAL_ERROR', message: e.message });
  }
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
