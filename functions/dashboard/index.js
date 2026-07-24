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

function normalizeChartRows(rows, labelKey, valueKey) {
  if (!rows || rows.length === 0) return [];
  return rows.map(function (row) {
    const label = row[labelKey] != null ? String(row[labelKey]) : '';
    const value = row[valueKey] != null ? Number(row[valueKey]) : 0;
    return { label: label, value: value };
  });
}

const ENDPOINTS = {
  '/dashboard/trend': async function (app, body) {
    const sql = trendQuery(body.filters || {});
    const rows = await app.zcql().executeZCQLQuery(sql);
    return normalizeChartRows(zcqlRows(rows), 'CrimeRegisteredDate', 'COUNT(CaseMasterID)');
  },
  '/dashboard/breakdown': async function (app, body) {
    const sql = breakdownQuery(body.filters || {});
    const rows = await app.zcql().executeZCQLQuery(sql);
    return normalizeChartRows(zcqlRows(rows), 'CrimeGroupName', 'COUNT(CaseMasterID)');
  },
  '/dashboard/location': async function (app, body) {
    const sql = locationQuery(body.filters || {});
    const rows = await app.zcql().executeZCQLQuery(sql);
    return normalizeChartRows(zcqlRows(rows), 'DistrictName', 'COUNT(CaseMasterID)');
  },
  '/dashboard/hotspots': async function (app, body) {
    const sql = hotspotsQuery(body.filters || {});
    const rows = await app.zcql().executeZCQLQuery(sql);
    return zcqlRows(rows);
  },
  '/dashboard/risk-ranked': async function (app, body) {
    const sql = riskRankedQuery(body.filters || {});
    const rows = await app.zcql().executeZCQLQuery(sql);
    return normalizeChartRows(zcqlRows(rows), 'AccusedName', 'case_count');
  },
  '/dashboard/riskRanked': async function (app, body) {
    const sql = riskRankedQuery(body.filters || {});
    const rows = await app.zcql().executeZCQLQuery(sql);
    return normalizeChartRows(zcqlRows(rows), 'AccusedName', 'case_count');
  },
  '/dashboard/seasonal': async function (app, body) {
    const sql = seasonalQuery(body.filters || {});
    const rows = await app.zcql().executeZCQLQuery(sql);
    return normalizeChartRows(zcqlRows(rows), 'CrimeRegisteredDate', 'COUNT(CaseMasterID)');
  },
  '/dashboard/person-search': async function (app, body) {
    const searchTerm = (body.filters && body.filters.searchTerm) || body.searchTerm || '';
    if (!searchTerm || searchTerm.trim().length === 0) return [];
    const sqls = personSearchQuery(searchTerm);
    const allRows = [];
    for (const sql of sqls) {
      try {
        const raw = await app.zcql().executeZCQLQuery(sql);
        const rows = zcqlRows(raw);
        for (const r of rows) {
          const name = r.AccusedName || r.VictimName || r.ComplainantName || '';
          const id = String(r.AccusedMasterID || r.VictimMasterID || r.ComplainantID || '');
          if (name) allRows.push({ name: name, id: id });
        }
      } catch (e) {
        continue;
      }
    }
    if (allRows.length === 0) return [];
    const seen = new Set();
    const unique = [];
    for (const row of allRows) {
      const key = row.name.toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        unique.push(row);
      }
    }
    return unique.slice(0, 10);
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
