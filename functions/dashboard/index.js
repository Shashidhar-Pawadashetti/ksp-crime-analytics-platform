'use strict';

const catalyst = require('zcatalyst-sdk-node');
const {
  trendQuery,
  breakdownQuery,
  locationQuery,
  hotspotsQuery,
  riskRankedQuery,
  seasonalQuery,
  personSearchQuery
} = require('./queries');

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function sendError(res, status, errorCode, message) {
  sendJson(res, status, {
    status: 'error',
    error_code: errorCode,
    message,
    fallback_answer: 'Unable to process request.'
  });
}

function getBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function zcqlRows(rows) {
  if (!rows || rows.length === 0) return [];
  return rows.map(function (r) {
    const flat = {};
    for (const key of Object.keys(r)) {
      const val = r[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        Object.assign(flat, val);
      } else {
        flat[key] = val;
      }
    }
    return flat;
  });
}

const ENDPOINTS = {
  '/dashboard/trend': async function (app, body) {
    const sql = trendQuery(body.filters || {});
    const rows = await app.zcql().executeZCQLQuery(sql);
    return zcqlRows(rows);
  },
  '/dashboard/breakdown': async function (app, body) {
    const sql = breakdownQuery(body.filters || {});
    const rows = await app.zcql().executeZCQLQuery(sql);
    return zcqlRows(rows);
  },
  '/dashboard/location': async function (app, body) {
    const sql = locationQuery(body.filters || {});
    const rows = await app.zcql().executeZCQLQuery(sql);
    return zcqlRows(rows);
  },
  '/dashboard/hotspots': async function (app, body) {
    const sql = hotspotsQuery(body.filters || {});
    const rows = await app.zcql().executeZCQLQuery(sql);
    return zcqlRows(rows);
  },
  '/dashboard/risk-ranked': async function (app, body) {
    const sql = riskRankedQuery(body.filters || {});
    const rows = await app.zcql().executeZCQLQuery(sql);
    return zcqlRows(rows);
  },
  '/dashboard/seasonal': async function (app, body) {
    const sql = seasonalQuery(body.filters || {});
    const rows = await app.zcql().executeZCQLQuery(sql);
    return zcqlRows(rows);
  },
  '/dashboard/person-search': async function (app, body) {
    const sql = personSearchQuery(body.searchTerm || '');
    const rows = await app.zcql().executeZCQLQuery(sql);
    return zcqlRows(rows);
  }
};

module.exports = async (req, res) => {
  let app;
  try {
    app = catalyst.initialize(req);
  } catch {
    sendError(res, 500, 'INIT_FAILED', 'Failed to initialize Catalyst SDK');
    return;
  }

  const method = req.method.toUpperCase();

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  if (method !== 'POST') {
    sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed');
    return;
  }

  const body = await getBody(req);
  const endpoint = body.endpoint || '';

  if (!endpoint) {
    sendError(res, 400, 'MISSING_PARAMS', 'endpoint field is required');
    return;
  }

  const handler = ENDPOINTS[endpoint];
  if (!handler) {
    sendError(res, 404, 'NOT_FOUND', 'Endpoint not found: ' + endpoint);
    return;
  }

  try {
    const data = await handler(app, body);
    sendJson(res, 200, { status: 'ok', data });
  } catch (err) {
    sendError(res, 500, 'QUERY_FAILED', err.message || 'Query execution failed');
  }
};
