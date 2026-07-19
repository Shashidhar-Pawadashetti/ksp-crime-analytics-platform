'use strict';

/*
 * personmaster-writer — PersonMaster Document Generation & Persistence
 *
 * Phase 4.2.1 of the KSP Crime Analytics Platform.
 *
 * Pipeline:
 *   Relational Data Store  →  Entity Matching Engine  →  Matched Groups
 *   → buildPersonMaster()  →  Catalyst NoSQL PersonMaster Collection
 *
 * NOTE on cross-function requires:
 *   This function imports the entity-matching-engine modules via relative path
 *   for local development. For Catalyst production deployment, these modules
 *   must be copied into this function's directory or bundled via the deploy
 *   step (e.g., by adding them to a build script).
 */

var express = require('express');
var helmet = require('helmet');
var catalyst = require('zcatalyst-sdk-node');
var { buildPersonMaster } = require('./documentBuilder');

/* ------------------------------------------------------------------ */
/*  Entity Matching Engine modules (local requires)                   */
/* ------------------------------------------------------------------ */
var { normaliseName } = require('./entity-matching-engine/normaliser');
var { generatePhoneticKey } = require('./entity-matching-engine/phonetic');
var { generateUniquePairs } = require('./entity-matching-engine/blocking');
var { computeScore } = require('./entity-matching-engine/scorer');
var { classify, CONFIRMED, UNCONFIRMED, THRESHOLD } = require('./entity-matching-engine/threshold');

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */
var PM_TABLE_NAME = 'PersonMaster';
var BATCH_SIZE = 75;

var GENDER_MAP = { '1': 'M', '2': 'F', '3': 'O' };

/* ------------------------------------------------------------------ */
/*  Express setup                                                     */
/* ------------------------------------------------------------------ */
var app = express();
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

/* ------------------------------------------------------------------ */
/*  Union-Find (DSU) — cluster connected pairwise matches             */
/* ------------------------------------------------------------------ */
function DSU() {
  this.parent = {};
  this.rank = {};
}

DSU.prototype.makeSet = function (x) {
  if (!(x in this.parent)) {
    this.parent[x] = x;
    this.rank[x] = 0;
  }
};

DSU.prototype.find = function (x) {
  if (this.parent[x] !== x) {
    this.parent[x] = this.find(this.parent[x]);
  }
  return this.parent[x];
};

DSU.prototype.union = function (x, y) {
  this.makeSet(x);
  this.makeSet(y);
  var px = this.find(x);
  var py = this.find(y);
  if (px === py) return;
  if (this.rank[px] < this.rank[py]) {
    this.parent[px] = py;
  } else if (this.rank[px] > this.rank[py]) {
    this.parent[py] = px;
  } else {
    this.parent[py] = px;
    this.rank[px]++;
  }
};

DSU.prototype.getClusters = function () {
  var clusters = {};
  var keys = Object.keys(this.parent);
  for (var i = 0; i < keys.length; i++) {
    var root = this.find(keys[i]);
    if (!clusters[root]) clusters[root] = [];
    clusters[root].push(keys[i]);
  }
  return Object.values(clusters);
};

/* ------------------------------------------------------------------ */
/*  ZCQL helpers                                                      */
/* ------------------------------------------------------------------ */

/** Execute a single ZCQL query and flatten each row. */
async function queryZCQL(appInstance, sql) {
  var result = await appInstance.zcql().executeZCQLQuery(sql);
  if (!Array.isArray(result)) return [];
  return result.map(function (row) {
    var flat = {};
    var keys = Object.keys(row);
    for (var ki = 0; ki < keys.length; ki++) {
      var val = row[keys[ki]];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        var subKeys = Object.keys(val);
        for (var si = 0; si < subKeys.length; si++) {
          flat[subKeys[si]] = val[subKeys[si]];
        }
      } else {
        flat[keys[ki]] = val;
      }
    }
    return flat;
  });
}

/**
 * Query ALL rows from a ZCQL query using LIMIT/OFFSET pagination.
 * ZCQL V2 uses LIMIT offset,rowcount syntax.
 */
async function queryAllZCQL(appInstance, baseSql, pageSize) {
  pageSize = pageSize || 300;
  var allRows = [];
  var offset = 0;
  var limit = pageSize;

  for (var iter = 0; iter < 50; iter++) {
    var paginatedSQL = baseSql + ' LIMIT ' + offset + ',' + limit;
    var rows = await queryZCQL(appInstance, paginatedSQL);
    if (rows.length === 0) break;
    allRows = allRows.concat(rows);
    offset += rows.length;
    if (rows.length < limit) break;
  }

  return allRows;
}

async function queryLimitedZCQL(appInstance, baseSql, pageSize, maxTotal) {
  var allRows = [];
  var offset = 0;
  maxTotal = maxTotal || 300;

  while (allRows.length < maxTotal) {
    var take = Math.min(pageSize, maxTotal - allRows.length);
    var paginatedSQL = baseSql + ' LIMIT ' + offset + ',' + take;
    var rows = await queryZCQL(appInstance, paginatedSQL);
    if (rows.length === 0) break;
    allRows = allRows.concat(rows);
    offset += rows.length;
    if (rows.length < take) break;
  }

  return allRows;
}

/* ------------------------------------------------------------------ */
/*  Data loading from Catalyst Data Store (ZCQL)                      */
/* ------------------------------------------------------------------ */

/**
 * Load all person-source records from Accused, Victim, and
 * ComplainantDetails, enriched with CaseMaster and Unit context.
 */
async function loadSourceRecords(appInstance, options) {
  console.log('[load] Loading source records from Data Store...');
  var allRecords = [];
  var errors = [];
  var totalAvailable = 0;
  var limit = (options && options.records_per_table) || 500;
  var PAGE = Math.min(limit, 300);

  var joinClause = 'INNER JOIN CaseMaster AS cm ON a.CaseMasterID = cm.ROWID INNER JOIN Unit AS u ON cm.PoliceStationID = u.ROWID';

  var accusedSQL = 'SELECT a.ROWID, a.AccusedMasterID, a.CaseMasterID, a.AccusedName, a.AgeYear, a.GenderID, cm.IncidentFromDate, cm.PoliceStationID, cm.Latitude, cm.Longitude, u.DistrictID FROM Accused AS a ' + joinClause;
  var victimSQL   = 'SELECT a.ROWID, a.VictimMasterID, a.CaseMasterID, a.VictimName, a.AgeYear, a.GenderID, cm.IncidentFromDate, cm.PoliceStationID, cm.Latitude, cm.Longitude, u.DistrictID FROM Victim AS a ' + joinClause;
  var compSQL     = 'SELECT a.ROWID, a.ComplainantID, a.CaseMasterID, a.ComplainantName, a.AgeYear, a.GenderID, cm.IncidentFromDate, cm.PoliceStationID, cm.Latitude, cm.Longitude, u.DistrictID FROM ComplainantDetails AS a ' + joinClause;

  /* ---- Accused --------------------------------------------------- */
  try {
    var accusedRows = await queryLimitedZCQL(appInstance, accusedSQL, PAGE, limit);
    mapSourceRows(accusedRows, 'Accused', 'AccusedMasterID', 'AccusedName', 'A-', allRecords);
    console.log('[load] Accused: ' + accusedRows.length + ' records' + (accusedRows.length >= limit ? ' (truncated to ' + limit + ')' : ''));
  } catch (err) {
    errors.push('Accused: ' + err.message);
    console.error('[load] Accused query failed: ' + err.message);
  }

  /* ---- Victim ---------------------------------------------------- */
  try {
    var victimRows = await queryLimitedZCQL(appInstance, victimSQL, PAGE, limit);
    mapSourceRows(victimRows, 'Victim', 'VictimMasterID', 'VictimName', 'V-', allRecords);
    console.log('[load] Victim: ' + victimRows.length + ' records' + (victimRows.length >= limit ? ' (truncated to ' + limit + ')' : ''));
  } catch (err) {
    errors.push('Victim: ' + err.message);
    console.error('[load] Victim query failed: ' + err.message);
  }

  /* ---- ComplainantDetails ---------------------------------------- */
  try {
    var compRows = await queryLimitedZCQL(appInstance, compSQL, PAGE, limit);
    mapSourceRows(compRows, 'ComplainantDetails', 'ComplainantID', 'ComplainantName', 'C-', allRecords);
    console.log('[load] ComplainantDetails: ' + compRows.length + ' records' + (compRows.length >= limit ? ' (truncated to ' + limit + ')' : ''));
  } catch (err) {
    errors.push('ComplainantDetails: ' + err.message);
    console.error('[load] ComplainantDetails query failed: ' + err.message);
  }

  console.log('[load] Total source records: ' + allRecords.length);
  return { records: allRecords, errors: errors };
}

function mapSourceRows(rows, tableName, idCol, nameCol, prefix, dest) {
  rows.forEach(function (r) {
    dest.push({
      source_table: tableName,
      source_id: prefix + r[idCol],
      row_id: r.ROWID || r[idCol],
      case_id: r.CaseMasterID,
      name: r[nameCol] || '',
      age: r.AgeYear != null ? Number(r.AgeYear) : null,
      gender: GENDER_MAP[String(r.GenderID)] || String(r.GenderID || ''),
      date_of_offence: r.IncidentFromDate || null,
      unit_id: r.PoliceStationID || null,
      district_id: r.DistrictID || null,
      lat: r.Latitude != null ? Number(r.Latitude) : null,
      lon: r.Longitude != null ? Number(r.Longitude) : null
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Entity matching pipeline                                          */
/* ------------------------------------------------------------------ */

/**
 * Normalise every record in-place and generate phonetic keys.
 */
function normaliseAndPhoneticize(records) {
  records.forEach(function (r) {
    r.normalised_name = normaliseName(r.name);
    r.phonetic_key = generatePhoneticKey(r.name);
  });
}

/**
 * Run blocking → pairwise scoring → threshold → clustering.
 * Returns { clusters, unconfirmedPairs }.
 *   clusters: array of record arrays (each cluster = one resolved person)
 *   unconfirmedPairs: scored pairs that are below THRESHOLD but >= CANDIDATE_MIN
 */
function runEntityMatching(records) {
  /* -- Generate candidate pairs via blocking (LLD §3.2 single phonetic strategy) -- */
  var pairs = generateUniquePairs(records);
  console.log('[match] Candidate pairs: ' + pairs.length);

  /* -- Score each pair -- */
  var matchedPairs = [];
  var unconfirmedPairs = [];
  for (var pi = 0; pi < pairs.length; pi++) {
    var pair = pairs[pi];
    var result = computeScore(pair.a, pair.b);
    var gate = classify(result.confidence);

    var pairEntry = {
      a: pair.a,
      b: pair.b,
      confidence: result.confidence,
      score_breakdown: result.score_breakdown,
      classification: gate.label
    };

    if (gate.label === CONFIRMED) {
      matchedPairs.push(pairEntry);
    } else if (gate.label === UNCONFIRMED) {
      unconfirmedPairs.push(pairEntry);
    }
  }
  console.log('[match] CONFIRMED pairs: ' + matchedPairs.length + ', UNCONFIRMED: ' + unconfirmedPairs.length);

  /* -- Cluster via Union-Find -- */
  var dsu = new DSU();
  var recordByKey = {};

  for (var mi = 0; mi < matchedPairs.length; mi++) {
    var mp = matchedPairs[mi];
    var keyA = mp.a.source_table + ':' + mp.a.source_id;
    var keyB = mp.b.source_table + ':' + mp.b.source_id;

    dsu.makeSet(keyA);
    dsu.makeSet(keyB);
    dsu.union(keyA, keyB);

    if (!recordByKey[keyA]) recordByKey[keyA] = mp.a;
    if (!recordByKey[keyB]) recordByKey[keyB] = mp.b;
  }

  /* -- Also add singles (records that never matched anyone) -- */
  records.forEach(function (r) {
    var key = r.source_table + ':' + r.source_id;
    if (!recordByKey[key]) recordByKey[key] = r;
    dsu.makeSet(key); // ensure every record has a set
  });

  var clusterKeys = dsu.getClusters();
  var clusters = clusterKeys.map(function (keys) {
    return keys.map(function (k) { return recordByKey[k]; });
  });

  console.log('[match] Clusters formed: ' + clusters.length);

  /* -- Attach average confidence to each record in cluster -- */
  var pairConfMap = {};
  for (var ci = 0; ci < matchedPairs.length; ci++) {
    var pairConf = matchedPairs[ci];
    var pkA = pairConf.a.source_table + ':' + pairConf.a.source_id;
    var pkB = pairConf.b.source_table + ':' + pairConf.b.source_id;
    if (!pairConfMap[pkA]) pairConfMap[pkA] = [];
    if (!pairConfMap[pkB]) pairConfMap[pkB] = [];
    pairConfMap[pkA].push(pairConf.confidence);
    pairConfMap[pkB].push(pairConf.confidence);
  }

  clusters.forEach(function (cluster) {
    cluster.forEach(function (rec) {
      var key = rec.source_table + ':' + rec.source_id;
      var scores = pairConfMap[key] || [];
      if (scores.length > 0) {
        var sum = scores.reduce(function (a, b) { return a + b; }, 0);
        rec.confidence = Math.round((sum / scores.length) * 100) / 100;
      }
    });
  });

  return { clusters: clusters, unconfirmedPairs: unconfirmedPairs };
}

/* ------------------------------------------------------------------ */
/*  Deterministic Person ID                                           */
/* ------------------------------------------------------------------ */

/**
 * Produces a content-addressed PersonMaster ID that is stable across
 * resolution runs regardless of cluster processing order.
 *
 * The hash input is the sorted list of (source_table:source_id) tokens
 * from the cluster — identical clusters always yield identical IDs.
 *
 * Format: PM_ + 8 lowercase hex chars  (4.3 billion namespace,
 * collision probability < 0.3% for 5000 clusters).
 */
function deterministicPersonId(cluster) {
  var tokens = cluster.map(function (r) {
    return (r.source_table || '') + ':' + (r.source_id || '');
  }).sort();
  var seed = tokens.join('|');

  var hash = 0xFFFFFFFF;
  for (var i = 0; i < seed.length; i++) {
    var c = seed.charCodeAt(i);
    hash ^= c;
    for (var j = 0; j < 8; j++) {
      if (hash & 1) hash = (hash >>> 1) ^ 0xEDB88320;
      else hash = hash >>> 1;
    }
  }
  hash = (~hash >>> 0);

  return 'PM_' + hash.toString(16).padStart(8, '0');
}

/* ------------------------------------------------------------------ */
/*  NoSQL persistence helpers                                         */
/* ------------------------------------------------------------------ */

/**
 * Upsert a PersonMaster document into the NoSQL collection.
 *
 * Uses insertItems for new documents. If the document already exists
 * (person_id collision), falls back to updateItems.
 */
async function upsertPersonMaster(appInstance, doc) {
  var noSql = appInstance.nosql();
  var table = await noSql.getTable(PM_TABLE_NAME);
  var { NoSQLItem, NoSQLEnum, NoSQLMarshall } = require('zcatalyst-sdk-node/lib/no-sql');
  var { NoSQLUpdateOperationType, NoSQLOperator } = NoSQLEnum;

  var insertBody = {
    item: NoSQLItem.from(doc)
  };

  try {
    await table.insertItems(insertBody);
    return { action: 'created' };
  } catch (insertErr) {
    console.log('[nosql] Document ' + doc.person_id + ' exists, updating...');
    try {
      var updateBody = {
        keys: NoSQLItem.from({ type: 'PM', person_id: doc.person_id }),
        update_attributes: [{
          operation_type: NoSQLUpdateOperationType.PUT,
          update_value: NoSQLMarshall.make(doc),
          attribute_path: []
        }]
      };
      await table.updateItems(updateBody);
      return { action: 'updated' };
    } catch (updateErr) {
      throw new Error('Update failed for ' + doc.person_id + ': ' + updateErr.message);
    }
  }
}

/**
 * Persist all PersonMaster documents in batches.
 * Returns summary counters.
 */
async function persistDocuments(appInstance, documents) {
  var created = 0;
  var updated = 0;

  for (var di = 0; di < documents.length; di += BATCH_SIZE) {
    var batch = documents.slice(di, di + BATCH_SIZE);
    var batchPromises = batch.map(function (doc) {
      return upsertPersonMaster(appInstance, doc)
        .then(function (result) {
          if (result.action === 'created') created++;
          else updated++;
        })
        .catch(function (err) {
          console.error('[persist] Error writing ' + doc.person_id + ': ' + err.message);
        });
    });
    await Promise.all(batchPromises);
    console.log('[persist] Batch ' + Math.floor(di / BATCH_SIZE + 1) + ' done (' + batch.length + ' docs)');
  }

  return { created: created, updated: updated };
}

/* ------------------------------------------------------------------ */
/*  Resolution pipeline — two separate exported phases                 */
/* ------------------------------------------------------------------ */

/**
 * Phase 1 — load + match + cluster.
 *
 * Returns { clusters, records, loadErrors, runId, t0 } so the caller
 * can inspect clusters before persisting (needed by Phase 4.3).
 */
async function resolveClusters(appInstance, options) {
  var runId = options.runId || 'RUN-' + Date.now().toString(36).toUpperCase();
  var t0 = Date.now();

  console.log('=== resolveClusters [' + runId + '] ===');

  var { records, errors: loadErrors } = await loadSourceRecords(appInstance, options);
  if (records.length === 0) {
    var errMsg = 'No source records loaded. Data Store may be empty or unreachable.';
    if (loadErrors.length > 0) {
      errMsg += ' Errors: ' + loadErrors.join(' | ');
    }
    throw new Error(errMsg);
  }

  normaliseAndPhoneticize(records);

  var matchResult = runEntityMatching(records);

  console.log('[resolve] Clusters: ' + matchResult.clusters.length + ', records: ' + records.length + ', load errors: ' + loadErrors.length);

  return {
    clusters: matchResult.clusters,
    unconfirmedPairs: matchResult.unconfirmedPairs,
    records: records,
    loadErrors: loadErrors,
    runId: runId,
    t0: t0
  };
}

/**
 * Phase 2 — build PersonMaster documents from clusters and persist.
 *
 * After persisting, generates and persists confirmed edges
 * (co-accused, accused-to-victim) and unconfirmed candidate-match edges.
 */
async function persistClusters(appInstance, clusters, unconfirmedPairs, options) {
  var opts = options || {};
  var runId = opts.runId || 'UNKNOWN';
  var runStart = opts.runStart || new Date();
  var t0 = opts.t0 || Date.now();
  var loadErrors = opts.loadErrors || [];

  console.log('=== persistClusters [' + runId + '] ===');

  var documents = [];
  var singles = 0;

  clusters.forEach(function (cluster) {
    var personId = deterministicPersonId(cluster);

    var confidences = [];
    cluster.forEach(function (r) {
      if (r.confidence != null) confidences.push(r.confidence);
    });
    var clusterConfidence = confidences.length > 0
      ? Math.round((confidences.reduce(function (a, b) { return a + b; }, 0) / confidences.length) * 100) / 100
      : null;

    var doc = buildPersonMaster(cluster, {
      person_id: personId,
      confidence_score: clusterConfidence,
      resolution_method: 'phonetic_weighted_score_v1',
      resolved_by: 'personmaster-writer-v1',
      resolution_run_id: runId
    });

    documents.push(doc);
    if (cluster.length === 1) singles++;
  });

  console.log('[persist] Documents to write: ' + documents.length + ' (' + singles + ' singles)');

  var { created, updated } = await persistDocuments(appInstance, documents);

  /* -- Edge generation & persistence -- */
  var confirmedEdgesWritten = 0;
  var unconfirmedEdgesWritten = 0;
  var sharedLocationEdgesWritten = 0;

  try {
    if (documents.length > 0) {
      var { generateConfirmedEdges, generateCandidateMatchEdges, generateSharedLocationEdges } = require('./edgeGenerator');
      var { persistEdges } = require('./edgePersistence');

      /* Build source-to-person lookup */
      var sourceToPerson = {};
      documents.forEach(function (doc) {
        (doc.source_records || []).forEach(function (sr) {
          if (sr.table && sr.row_id) {
            sourceToPerson[sr.table + ':' + sr.row_id] = doc.person_id;
          }
        });
      });

      /* Generate confirmed edges (co-accused, accused-to-victim) */
      var confirmedResult = generateConfirmedEdges(documents);

      /* Generate shared location edges and merge into confirmed */
      var sharedLocationResult = generateSharedLocationEdges(documents);

      var mergedEdgesByPerson = {};
      function mergeEdgeDict(dest, src) {
        Object.keys(src).forEach(function (pid) {
          if (!dest[pid]) dest[pid] = [];
          dest[pid] = dest[pid].concat(src[pid]);
        });
      }
      mergeEdgeDict(mergedEdgesByPerson, confirmedResult.confirmed_edges_by_person);
      mergeEdgeDict(mergedEdgesByPerson, sharedLocationResult.shared_location_edges_by_person);

      /* Persist merged confirmed edges */
      if (Object.keys(mergedEdgesByPerson).length > 0) {
        var confirmPersist = await persistEdges(appInstance, mergedEdgesByPerson, {
          edgeField: 'confirmed_edges',
          runId: runId + '-confirmed'
        });
        confirmedEdgesWritten = confirmPersist.edges_written;
        sharedLocationEdgesWritten = sharedLocationResult.all_shared_location_edges.length;
      }

      /* Generate and persist unconfirmed (candidate match) edges */
      var personIdLookup = function (table, sourceId) {
        return sourceToPerson[table + ':' + sourceId] || null;
      };

      var unconfirmedResult = generateCandidateMatchEdges(unconfirmedPairs, personIdLookup, documents);

      if (Object.keys(unconfirmedResult.unconfirmed_edges_by_person).length > 0) {
        var unconfirmPersist = await persistEdges(appInstance, unconfirmedResult.unconfirmed_edges_by_person, {
          edgeField: 'unconfirmed_edges',
          runId: runId + '-unconfirmed'
        });
        unconfirmedEdgesWritten = unconfirmPersist.edges_written;
      }
    }
  } catch (edgeErr) {
    console.error('[edges] Edge generation/persistence failed (non-fatal): ' + edgeErr.message);
  }

  var elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  /* -- Audit log -- */
  var totalRecords = clusters.reduce(function (sum, c) { return sum + c.length; }, 0);
  try {
    var auditLog = require('./resolution-audit-log');
    await auditLog.createAuditRecord(appInstance, {
      runId: runId,
      runType: 'full',
      triggerType: 'api',
      startedAt: runStart.toISOString(),
      completedAt: new Date().toISOString(),
      status: 'SUCCESS',
      thresholdUsed: Number(THRESHOLD),
      documentsCreated: created,
      documentsUpdated: updated,
      personsProcessed: totalRecords,
      confirmedEdgesWritten: confirmedEdgesWritten,
      unconfirmedEdgesWritten: unconfirmedEdgesWritten,
      errorCount: loadErrors.length,
      errorMessage: ''
    });
  } catch (auditErr) {
    console.error('[audit] Audit log write failed: ' + auditErr.message);
  }

  return {
    run_id: runId,
    documents_created: created,
    documents_updated: updated,
    persons_processed: totalRecords,
    clusters_formed: clusters.length,
    singles: singles,
    confirmed_edges_written: confirmedEdgesWritten,
    unconfirmed_edges_written: unconfirmedEdgesWritten,
    shared_location_edges_written: sharedLocationEdgesWritten,
    source_errors: loadErrors.length,
    elapsed_seconds: Number(elapsed),
    status: 'SUCCESS'
  };
}

/**
 * Full resolution: resolveClusters + persistClusters.
 */
async function runFullResolution(appInstance, options) {
  var { clusters, unconfirmedPairs, records, loadErrors, runId, t0 } = await resolveClusters(appInstance, options);
  return await persistClusters(appInstance, clusters, unconfirmedPairs, {
    runId: runId,
    runStart: new Date(t0),
    t0: t0,
    loadErrors: loadErrors
  });
}

/* ------------------------------------------------------------------ */
/*  HTTP handlers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Get a Catalyst app instance with fallback for local development.
 *
 * Production (AdvancedIO): catalyst.initialize(req) — reads project
 *   credentials from request headers (x-zc-projectid, etc.).
 * Local (mock):            ./catalyst-mock          — in-memory mock.
 */
function getAppInstance(req) {
  try {
    return catalyst.initialize(req);
  } catch (e) {
    try {
      var mockCatalyst = require('./catalyst-mock');
      console.log('[catalyst] Using in-memory mock (no Catalyst project detected)');
      return mockCatalyst(req);
    } catch (e2) {
      throw new Error('Failed to initialize Catalyst app: ' + (e.stack || e.message));
    }
  }
}

/* POST /resolve — trigger full resolution pipeline */
app.post('/resolve', async function (req, res) {
  var appInstance;
  try {
    appInstance = getAppInstance(req);
  } catch (e) {
    res.status(500).json({
      status: 'error',
      error_code: 'INIT_FAILED',
      message: 'Failed to initialize Catalyst app',
      fallback_answer: 'Unable to process request at this time.'
    });
    return;
  }

  try {
    var options = req.body || {};
    var summary = await runFullResolution(appInstance, {
      runId: options.run_id || null
    });
    res.status(200).json({ status: 'ok', data: summary });
  } catch (err) {
    console.error('[resolve] Fatal error: ' + err.message);
    res.status(500).json({
      status: 'error',
      error_code: 'RESOLUTION_FAILED',
      message: err.message,
      fallback_answer: 'The resolution pipeline encountered an error.'
    });
  }
});

/* POST /groups — accept pre-matched groups (bypasses entity matching) */
app.post('/groups', async function (req, res) {
  var appInstance;
  try {
    appInstance = getAppInstance(req);
  } catch (e) {
    res.status(500).json({ status: 'error', error_code: 'INIT_FAILED', message: 'Failed to initialize Catalyst app' });
    return;
  }

  try {
    var body = req.body;
    var groups = body.groups;
    var runId = body.run_id || 'GRP-' + Date.now().toString(36).toUpperCase();

    if (!Array.isArray(groups) || groups.length === 0) {
      res.status(400).json({ status: 'error', error_code: 'INVALID_INPUT', message: 'groups must be a non-empty array' });
      return;
    }

    console.log('[groups] Processing ' + groups.length + ' pre-matched groups (run: ' + runId + ')');

    var summary = await persistClusters(appInstance, groups, [], {
      runId: runId,
      runStart: new Date(),
      t0: Date.now(),
      loadErrors: []
    });

    res.status(200).json({ status: 'ok', data: summary });
  } catch (err) {
    console.error('[groups] Error: ' + err.message);
    res.status(500).json({ status: 'error', error_code: 'GROUPS_FAILED', message: err.message });
  }
});

/* GET / — health check */
app.get('/', function (req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'personmaster-writer',
    phase: '4.2.1',
    message: 'PersonMaster Document Generation & Persistence'
  });
});

/* GET /diagnose — test ZCQL connectivity */
app.get('/diagnose', async function (req, res) {
  try {
    var appInstance = getAppInstance(req);
    var results = {};

    /* Test 1: simple SELECT */
    try {
      var r1 = await appInstance.zcql().executeZCQLQuery('SELECT ROWID, AccusedMasterID, AccusedName FROM Accused LIMIT 0,1');
      results.accused_simple = { ok: true, rows: (r1 || []).length, data: JSON.stringify((r1 || [])[0]) };
    } catch (e1) { results.accused_simple = { ok: false, error: e1.message }; }

    /* Test 2: SELECT with alias */
    try {
      var r2 = await appInstance.zcql().executeZCQLQuery('SELECT a.ROWID, a.AccusedMasterID, a.AccusedName FROM Accused AS a LIMIT 0,1');
      results.accused_alias = { ok: true, rows: (r2 || []).length, data: JSON.stringify((r2 || [])[0]) };
    } catch (e2) { results.accused_alias = { ok: false, error: e2.message }; }

    /* Test 3: Count */
    try {
      var r3 = await appInstance.zcql().executeZCQLQuery('SELECT COUNT(a.AccusedMasterID) FROM Accused AS a');
      results.accused_count = { ok: true, rows: (r3 || []).length, data: JSON.stringify((r3 || [])[0]) };
    } catch (e3) { results.accused_count = { ok: false, error: e3.message }; }

    /* Test 4: JOIN without AS */
    try {
      var r4 = await appInstance.zcql().executeZCQLQuery('SELECT a.ROWID, a.AccusedName, cm.IncidentFromDate FROM Accused a INNER JOIN CaseMaster cm ON a.CaseMasterID = cm.ROWID LIMIT 0,1');
      results.accused_join_noas = { ok: true, rows: (r4 || []).length, data: JSON.stringify((r4 || [])[0]) };
    } catch (e4) { results.accused_join_noas = { ok: false, error: e4.message }; }

    /* Test 5: JOIN WITH AS */
    try {
      var r5 = await appInstance.zcql().executeZCQLQuery('SELECT a.ROWID, a.AccusedName, cm.IncidentFromDate FROM Accused AS a INNER JOIN CaseMaster AS cm ON a.CaseMasterID = cm.ROWID LIMIT 0,1');
      results.accused_join_as = { ok: true, rows: (r5 || []).length, data: JSON.stringify((r5 || [])[0]) };
    } catch (e5) { results.accused_join_as = { ok: false, error: e5.message }; }

    /* Test 6: DataStore insertRow */
    try {
      var dsTable = appInstance.datastore().table('ResolutionAuditLog');
      var testRow = {
        RunID: 'DIAG-' + Date.now(),
        RunType: 'diagnose',
        TriggeredBy: 'diagnose',
        StartedAt: new Date().toISOString(),
        CompletedAt: new Date().toISOString(),
        Status: 'TEST',
        ThresholdUsed: 0.78,
        DocumentsCreated: 1,
        DocumentsUpdated: 0,
        PersonsProcessed: 1,
        ConfirmedEdgesWritten: 0,
        UnconfirmedEdgesWritten: 0,
        ErrorCount: 0
      };
      var dsResult = await dsTable.insertRow(testRow);
      results.datastore_insert = { ok: true, rowid: (dsResult || {}).ROWID || 'unknown' };
    } catch (e6) {
      results.datastore_insert = { ok: false, error: e6.message, code: e6.code || e6.status || 'N/A', details: JSON.stringify(e6.cause || e6.details || e6.response || {}).substring(0, 500) };
    }

    /* Test 7: DataStore insertRow with Date objects (not ISO strings) */
    try {
      var dsTable2 = appInstance.datastore().table('ResolutionAuditLog');
      var testRow2 = {
        RunID: 'DIAG2-' + Date.now(),
        RunType: 'diagnose',
        TriggeredBy: 'diagnose',
        StartedAt: new Date(),
        CompletedAt: new Date(),
        Status: 'TEST',
        ThresholdUsed: 0.78,
        DocumentsCreated: 1,
        DocumentsUpdated: 0,
        PersonsProcessed: 1,
        ConfirmedEdgesWritten: 0,
        UnconfirmedEdgesWritten: 0,
        ErrorCount: 0
      };
      var dsResult2 = await dsTable2.insertRow(testRow2);
      results.datastore_insert_dateobj = { ok: true, rowid: (dsResult2 || {}).ROWID || 'unknown' };
    } catch (e7) {
      results.datastore_insert_dateobj = { ok: false, error: e7.message, code: e7.code || e7.status || 'N/A', details: JSON.stringify(e7.cause || e7.details || e7.response || {}).substring(0, 500) };
    }

    /* Test 8: ZCQL INSERT */
    try {
      var insertSQL = "INSERT INTO ResolutionAuditLog (RunID, RunType, TriggeredBy, Status) VALUES ('DIAG3-" + Date.now() + "', 'diagnose', 'diagnose', 'TEST')";
      var zcqlResult = await appInstance.zcql().executeZCQLQuery(insertSQL);
      results.zcql_insert = { ok: true, data: JSON.stringify(zcqlResult).substring(0, 200) };
    } catch (e8) {
      results.zcql_insert = { ok: false, error: e8.message };
    }

    /* Test 9: LIMIT 500 */
    try {
      var r9 = await appInstance.zcql().executeZCQLQuery('SELECT a.AccusedMasterID, a.AccusedName FROM Accused AS a LIMIT 0,500');
      results.limit_500 = { ok: true, rows: (r9 || []).length };
    } catch (e9) {
      results.limit_500 = { ok: false, error: e9.message };
    }

    /* Test 10: LIMIT 300 */
    try {
      var r10 = await appInstance.zcql().executeZCQLQuery('SELECT a.AccusedMasterID, a.AccusedName FROM Accused AS a LIMIT 0,300');
      results.limit_300 = { ok: true, rows: (r10 || []).length };
    } catch (e10) {
      results.limit_300 = { ok: false, error: e10.message };
    }

    /* Test 11: LIMIT 300,300 (page 2) */
    try {
      var r11 = await appInstance.zcql().executeZCQLQuery('SELECT a.AccusedMasterID, a.AccusedName FROM Accused AS a LIMIT 300,300');
      results.limit_300_300 = { ok: true, rows: (r11 || []).length };
    } catch (e11) {
      results.limit_300_300 = { ok: false, error: e11.message };
    }

    /* Test 12: quick pagination (3 pages of 100) */
    try {
      var p12 = [];
      for (var pi = 0; pi < 3; pi++) {
        var r12 = await appInstance.zcql().executeZCQLQuery('SELECT a.AccusedMasterID FROM Accused AS a LIMIT ' + (pi * 100) + ',100');
        if (r12) p12 = p12.concat(r12);
      }
      results.paginate_3x100 = { ok: true, rows: p12.length };
    } catch (e12) {
      results.paginate_3x100 = { ok: false, error: e12.message };
    }

    res.status(200).json({ status: 'ok', results: results });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message, stack: (err.stack || '').split('\n').slice(0,3).join('; ') });
  }
});

/* Global error handler */
app.use(function (err, req, res, next) {
  console.error('[unhandled] ' + err.message);
  res.status(500).json({
    status: 'error',
    error_code: 'INTERNAL_ERROR',
    message: err.message
  });
});

/* ------------------------------------------------------------------ */
/*  Export                                                            */
/* ------------------------------------------------------------------ */

/* -- Catalyst AdvancedIO Function entry point -- */
var handler = function (req, res) {
  app(req, res);
};

/* -- Export phases separately for Phase 4.3 reuse -- */
handler.resolveClusters = resolveClusters;
handler.persistClusters = persistClusters;
handler.runFullResolution = runFullResolution;
handler.deterministicPersonId = deterministicPersonId;
handler.buildPersonMaster = buildPersonMaster;

module.exports = handler;
