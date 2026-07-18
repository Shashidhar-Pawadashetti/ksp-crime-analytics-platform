'use strict';

var express = require('express');
var { GraphService } = require('./graphService');

var app = express();
app.use(express.json());

function createService(req) {
  return new GraphService().init(req);
}

app.get('/', function (req, res) {
  res.json({ status: 'ok', service: 'graph-service', version: '1.0.0' });
});

app.get('/person/:personId', async function (req, res) {
  try {
    var gs = createService(req);
    var person = await gs.getPerson(req.params.personId);
    if (!person) return res.status(404).json({ status: 'error', error_code: 'NOT_FOUND', message: 'Person ' + req.params.personId + ' not found' });
    res.json({ status: 'ok', data: person });
  } catch (err) {
    res.status(500).json({ status: 'error', error_code: 'INTERNAL_ERROR', message: 'Internal error' });
  }
});

app.get('/person/:personId/neighbours', async function (req, res) {
  try {
    var gs = createService(req);
    var neighbours = await gs.getNeighbours(req.params.personId);
    res.json({ status: 'ok', data: neighbours });
  } catch (err) {
    res.status(500).json({ status: 'error', error_code: 'INTERNAL_ERROR', message: 'Internal error' });
  }
});

app.get('/person/:personId/edges', async function (req, res) {
  try {
    var gs = createService(req);
    var edges = await gs.getEdges(req.params.personId);
    res.json({ status: 'ok', data: edges });
  } catch (err) {
    res.status(500).json({ status: 'error', error_code: 'INTERNAL_ERROR', message: 'Internal error' });
  }
});

app.get('/person/:personId/degree', async function (req, res) {
  try {
    var gs = createService(req);
    var degree = await gs.getDegree(req.params.personId);
    res.json({ status: 'ok', data: { person_id: req.params.personId, degree: degree } });
  } catch (err) {
    res.status(500).json({ status: 'error', error_code: 'INTERNAL_ERROR', message: 'Internal error' });
  }
});

app.get('/person/:personId/exists', async function (req, res) {
  try {
    var gs = createService(req);
    var exists = await gs.personExists(req.params.personId);
    res.json({ status: 'ok', data: { person_id: req.params.personId, exists: exists } });
  } catch (err) {
    res.status(500).json({ status: 'error', error_code: 'INTERNAL_ERROR', message: 'Internal error' });
  }
});

app.get('/persons/by-role/:role', async function (req, res) {
  try {
    var gs = createService(req);
    var results = await gs.getPersonsByRole(req.params.role);
    res.json({ status: 'ok', data: results });
  } catch (err) {
    res.status(500).json({ status: 'error', error_code: 'INTERNAL_ERROR', message: 'Internal error' });
  }
});

app.get('/edge/:edgeId', async function (req, res) {
  try {
    var gs = createService(req);
    var edge = await gs.getEdge(req.params.edgeId);
    if (!edge) return res.status(404).json({ status: 'error', error_code: 'NOT_FOUND', message: 'Edge not found' });
    res.json({ status: 'ok', data: edge });
  } catch (err) {
    res.status(500).json({ status: 'error', error_code: 'INTERNAL_ERROR', message: 'Internal error' });
  }
});

app.get('/statistics', async function (req, res) {
  try {
    var gs = createService(req);
    var stats = await gs.getGraphStatistics();
    res.json({ status: 'ok', data: stats });
  } catch (err) {
    res.status(500).json({ status: 'error', error_code: 'INTERNAL_ERROR', message: 'Internal error' });
  }
});

app.get('/cache/info', function (req, res) {
  try {
    var gs = createService(req);
    res.json({ status: 'ok', data: gs.getCacheInfo() });
  } catch (err) {
    res.status(500).json({ status: 'error', error_code: 'INTERNAL_ERROR', message: 'Internal error' });
  }
});

app.post('/cache/reload', async function (req, res) {
  try {
    var gs = createService(req);
    await gs.reload();
    res.json({ status: 'ok', message: 'Cache reloaded' });
  } catch (err) {
    res.status(500).json({ status: 'error', error_code: 'INTERNAL_ERROR', message: 'Internal error' });
  }
});

app.post('/cache/clear', function (req, res) {
  try {
    var gs = createService(req);
    gs.clearCache();
    res.json({ status: 'ok', message: 'Cache cleared' });
  } catch (err) {
    res.status(500).json({ status: 'error', error_code: 'INTERNAL_ERROR', message: 'Internal error' });
  }
});

module.exports = function (req, res) {
  app(req, res);
};
