'use strict';

var express = require('express');
var helmet = require('helmet');
var catalyst = require('zcatalyst-sdk-node');

var app = express();
app.use(helmet());
app.use(express.json({ limit: '5mb' }));

var PM_TABLE = 'PersonMaster';

function getAppInstance(req) {
  try {
    return catalyst.initialize(req);
  } catch (e) {
    console.error('[catalyst] Init failed: ' + e.message);
    return null;
  }
}

/**
 * Load all PersonMaster documents using queryTable with a broad condition.
 */
async function loadAllDocuments(appInstance) {
  var { NoSQLEnum, NoSQLMarshall } = require('zcatalyst-sdk-node/lib/no-sql');
  var noSql = appInstance.nosql();
  var table = await noSql.getTable(PM_TABLE);
  var result = await table.queryTable({
    key_condition: {
      attribute: ['type'],
      operator: NoSQLEnum.NoSQLOperator.EQUALS,
      value: NoSQLMarshall.makeString('PM')
    },
    limit: 1000
  });
  return parseResponse(result);
}

/**
 * Fetch a single PersonMaster document by person_id.
 */
async function fetchDocument(appInstance, personId) {
  var { NoSQLItem } = require('zcatalyst-sdk-node/lib/no-sql');
  var noSql = appInstance.nosql();
  var table = await noSql.getTable(PM_TABLE);
  var result = await table.fetchItem({
    keys: NoSQLItem.from({ type: 'PM', person_id: personId })
  });
  if (!result) return null;
  var items = parseResponse(result);
  return items && items.length > 0 ? items[0] : null;
}

/**
 * Parse a Catalyst NoSQLResponse into plain JS objects.
 */
function parseResponse(result) {
  if (!result) return [];
  var responseData;
  try {
    responseData = result.getResponseData();
  } catch (e) {
    return [];
  }
  if (!Array.isArray(responseData)) return [];
  return responseData.map(function (d) {
    if (d && d.item && typeof d.item.to === 'function') {
      return d.item.to();
    }
    return null;
  }).filter(Boolean);
}

/**
 * LLD §7 — GET /personmaster/search
 *
 * IMPORTANT: This must be defined BEFORE the /:person_id wildcard route.
 */
app.get('/personmaster/search', async function (req, res) {
  var appInstance = getAppInstance(req);
  if (!appInstance) {
    res.status(500).json({ status: 'error', error_code: 'INIT_FAILED', message: 'Failed to initialize Catalyst app' });
    return;
  }

  var queryName = (req.query.name || '').toLowerCase().trim();
  var queryGender = (req.query.gender || '').toUpperCase();
  var minAge = req.query.min_age ? parseInt(req.query.min_age, 10) : null;
  var maxAge = req.query.max_age ? parseInt(req.query.max_age, 10) : null;
  var limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

  try {
    var allDocs = await loadAllDocuments(appInstance);
    var results = [];

    allDocs.forEach(function (doc) {
      var score = 0;
      var reasons = [];

      if (queryName) {
        var bestNameScore = 0;
        (doc.name_variants || []).forEach(function (nv) {
          var n = nv.toLowerCase();
          if (n === queryName) bestNameScore = Math.max(bestNameScore, 1.0);
          else if (n.indexOf(queryName) !== -1) bestNameScore = Math.max(bestNameScore, 0.8);
          else if (n.indexOf(queryName.split(' ')[0]) !== -1) bestNameScore = Math.max(bestNameScore, 0.5);
        });
        if (doc.name_normalised && doc.name_normalised.indexOf(queryName) !== -1) {
          bestNameScore = Math.max(bestNameScore, 0.7);
        }
        score += bestNameScore * 0.5;
        if (bestNameScore > 0) reasons.push('name=' + bestNameScore.toFixed(2));
        else return;
      } else {
        score += 0.5;
      }

      if (queryGender && doc.gender) {
        var gs = doc.gender.toUpperCase() === queryGender ? 1.0 : 0.0;
        score += gs * 0.2;
        reasons.push('gender=' + gs.toFixed(2));
      } else {
        score += 0.2;
      }

      if (minAge != null || maxAge != null) {
        var age = doc.age_estimate;
        if (age != null) {
          var inRange = true;
          if (minAge != null && age < minAge) inRange = false;
          if (maxAge != null && age > maxAge) inRange = false;
          if (inRange) {
            score += 0.3;
            reasons.push('age=1.00');
          } else {
            return;
          }
        }
      } else {
        score += 0.3;
      }

      results.push({
        person_id: doc.person_id,
        name_normalised: doc.name_normalised || '',
        confidence: Math.round(score * 100) / 100,
        roles_summary: doc.roles_summary || {},
        match_reason: reasons.join(', ')
      });
    });

    results.sort(function (a, b) { return b.confidence - a.confidence; });
    results = results.slice(0, limit);

    res.status(200).json({ results: results, total: results.length });
  } catch (err) {
    console.error('[api] Search error: ' + err.message);
    res.status(500).json({ status: 'error', error_code: 'SEARCH_FAILED', message: err.message });
  }
});

/**
 * LLD §7 — GET /personmaster/repeat-offenders
 *
 * IMPORTANT: This must be defined BEFORE the /:person_id wildcard route.
 */
app.get('/personmaster/repeat-offenders', async function (req, res) {
  var appInstance = getAppInstance(req);
  if (!appInstance) {
    res.status(500).json({ status: 'error', error_code: 'INIT_FAILED', message: 'Failed to initialize Catalyst app' });
    return;
  }

  var unitId = req.query.unit_id || null;
  var districtId = req.query.district_id || null;
  var limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  try {
    var allDocs = await loadAllDocuments(appInstance);
    var offenders = [];

    allDocs.forEach(function (doc) {
      var roles = doc.roles_summary || {};
      var accusedCount = roles.accused_count || 0;
      if (accusedCount < 2) return;

      if (unitId || districtId) {
        var inScope = false;
        (doc.source_records || []).forEach(function (sr) {
          if (unitId && sr.unit_id === unitId) inScope = true;
          if (districtId && sr.district_id === districtId) inScope = true;
        });
        if (!inScope) return;
      }

      offenders.push({
        person_id: doc.person_id,
        name_normalised: doc.name_normalised || '',
        accused_count: accusedCount,
        last_arrest_date: roles.last_arrest_date || null,
        source_records: (doc.source_records || []).map(function (sr) {
          return { table: sr.table, case_id: sr.case_id, unit_id: sr.unit_id };
        })
      });
    });

    offenders.sort(function (a, b) { return b.accused_count - a.accused_count; });
    offenders = offenders.slice(0, limit);

    var scopeApplied = 'state';
    if (unitId) scopeApplied = 'unit:' + unitId;
    else if (districtId) scopeApplied = 'district:' + districtId;

    res.status(200).json({
      repeat_offenders: offenders,
      scope_applied: scopeApplied,
      total: offenders.length
    });
  } catch (err) {
    console.error('[api] Repeat offenders error: ' + err.message);
    res.status(500).json({ status: 'error', error_code: 'REPEAT_OFFENDERS_FAILED', message: err.message });
  }
});

/**
 * LLD §7 — GET /personmaster/:person_id
 *
 * WARNING: This wildcard route must be defined AFTER specific routes
 * (/search, /repeat-offenders) to avoid them being captured by :person_id.
 */
app.get('/personmaster/:person_id', async function (req, res) {
  var appInstance = getAppInstance(req);
  if (!appInstance) {
    res.status(500).json({ status: 'error', error_code: 'INIT_FAILED', message: 'Failed to initialize Catalyst app' });
    return;
  }

  var personId = req.params.person_id;

  try {
    var doc = await fetchDocument(appInstance, personId);
    if (!doc) {
      res.status(404).json({ error: 'person_not_found', person_id: personId });
      return;
    }
    res.status(200).json(doc);
  } catch (err) {
    console.error('[api] Get error: ' + err.message);
    res.status(500).json({ status: 'error', error_code: 'GET_FAILED', message: err.message });
  }
});

/**
 * LLD §7 — GET /personmaster/:person_id/network
 *
 * IMPORTANT: Routes specific sub-paths like /network must be defined
 * AFTER the /:person_id wildcard route since it uses app.get (not a Router).
 */
app.get('/personmaster/:person_id/network', async function (req, res) {
  var appInstance = getAppInstance(req);
  if (!appInstance) {
    res.status(500).json({ status: 'error', error_code: 'INIT_FAILED', message: 'Failed to initialize Catalyst app' });
    return;
  }

  var personId = req.params.person_id;
  var hops = Math.min(parseInt(req.query.hops, 10) || 2, 3);
  var maxNodes = Math.min(parseInt(req.query.max_nodes, 10) || 50, 100);

  try {
    var { traverseGraph } = require('./bfs');
    var { extractCallerScope } = require('./rbacFilter');
    var callerScope = extractCallerScope(req);

    var result = await traverseGraph(appInstance, personId, hops, maxNodes, callerScope);

    res.status(200).json(result);
  } catch (err) {
    console.error('[api] Network error: ' + err.message);
    res.status(500).json({ status: 'error', error_code: 'NETWORK_FAILED', message: err.message });
  }
});

app.get('/', function (req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'personmaster-api',
    description: 'Public-facing PersonMaster API (LLD §7)'
  });
});

module.exports = app;
