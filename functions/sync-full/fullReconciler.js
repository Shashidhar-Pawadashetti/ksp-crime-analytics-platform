'use strict';

/*
 * fullReconciler — Phase 4.2.3 Milestone 3: Full Reconciliation
 *
 * Orchestrates the existing entity matching, PersonMaster document building,
 * edge generation, and edge persistence modules into a single idempotent
 * full reconciliation pipeline.
 *
 * This module does NOT reimplement any algorithm — it delegates to the
 * existing modules imported from sibling Catalyst functions.
 */

/* ------------------------------------------------------------------ */
/*  Existing module imports (delegate, never duplicate)                */
/*                                                                     */
/*  On Catalyst deployment, dependencies are bundled into vendor/      */
/*  subdirectories by deploy-prep.js.  Fall back to sibling-functions  */
/*  paths for local development and CI.                                */
/* ------------------------------------------------------------------ */

function vendorRequire(vendorRelPath, fallbackRelPath) {
  try {
    return require('./vendor/' + vendorRelPath);
  } catch (e) {
    /* istanbul ignore next */
    return require('../' + fallbackRelPath);
  }
}

var { normaliseName } = vendorRequire('entity-matching-engine/normaliser', 'entity-matching-engine/normaliser');
var { generatePhoneticKey } = vendorRequire('entity-matching-engine/phonetic', 'entity-matching-engine/phonetic');
var { buildBlocks, STRATEGIES } = vendorRequire('entity-matching-engine/blocking', 'entity-matching-engine/blocking');
var { computeScore } = vendorRequire('entity-matching-engine/scorer', 'entity-matching-engine/scorer');
var { classify, CONFIRMED, UNCONFIRMED, THRESHOLD } = vendorRequire('entity-matching-engine/threshold', 'entity-matching-engine/threshold');
var { buildPersonMaster } = vendorRequire('personmaster-writer/documentBuilder', 'personmaster-writer/documentBuilder');
var { generateConfirmedEdges, generateCandidateMatchEdges } = vendorRequire('personmaster-writer/edgeGenerator', 'personmaster-writer/edgeGenerator');
var { mergeEdgesIntoDocument } = vendorRequire('personmaster-writer/edgePersistence', 'personmaster-writer/edgePersistence');
var auditLog = vendorRequire('personmaster-writer/resolution-audit-log', 'personmaster-writer/resolution-audit-log');

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

var PM_TABLE_NAME = 'PersonMaster';
var BATCH_SIZE = 20;
var PAGE_SIZE = 300;
var GENDER_MAP = { '1': 'M', '2': 'F', '3': 'O' };

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
/*  Deterministic Person ID (must match personmaster-writer)          */
/* ------------------------------------------------------------------ */

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
/*  Identity preservation — map existing PersonMaster owners          */
/* ------------------------------------------------------------------ */

function buildSourceKeySet(cluster) {
  var keys = {};
  cluster.forEach(function (r) {
    var k = (r.source_table || '') + ':' + (r.source_id || '');
    if (k !== ':') keys[k] = true;
  });
  return keys;
}

function buildExistingSourceIndex(existingDocs) {
  var index = {};
  existingDocs.forEach(function (doc) {
    if (!doc.person_id) return;
    var sr = doc.source_records;
    if (!sr) return;
    var records;
    if (Array.isArray(sr)) {
      records = sr;
    } else if (typeof sr === 'string') {
      try { records = JSON.parse(sr); } catch (e) { records = []; }
    } else {
      records = [];
    }
    if (!Array.isArray(records)) return;
    records.forEach(function (r) {
      var key = (r.table || '') + ':' + (r.row_id || '');
      if (key !== ':') {
        index[key] = doc.person_id;
      }
    });
  });
  return index;
}

/**
 * Map clusters to person IDs with identity preservation.
 *
 * For each cluster:
 *   - Check overlap with existing PersonMaster docs via source-key index
 *   - If exactly one existing doc owns the overlapping records → reuse that person_id
 *   - If multiple existing docs overlap → survivor wins (most records, lexicographic tie-break),
 *     other IDs tracked as mergeVictimPids (to be deleted)
 *   - If no overlap → generate new deterministic ID
 *
 * @param {Array} clusters         — array of clusters (each cluster is array of record objects)
 * @param {Array} existingDocs     — existing PersonMaster documents
 * @param {string} runId           — current reconciliation run ID
 * @returns {Object}
 *   @property {Array}  mappedClusters     — [{ cluster, person_id, survival: 'existing'|'new'|'merge_survivor' }]
 *   @property {Array}  mergeVictimPids    — person_ids that lost the merge and must be deleted
 *   @property {number} preservedCount     — count of surviving identities
 *   @property {number} newCount           — count of new identities
 */
function mapClustersToIds(clusters, existingDocs, runId) {
  var sourceToPerson = buildExistingSourceIndex(existingDocs);

  var mappedClusters = [];
  var mergeVictimPids = [];
  var preservedCount = 0;
  var newCount = 0;

  /* --- Build reverse index: person_id → list of overlapping cluster indices --- */
  clusters.forEach(function (cluster, ci) {
    var clusterKeys = buildSourceKeySet(cluster);
    var owners = {};
    Object.keys(clusterKeys).forEach(function (key) {
      var ownerPid = sourceToPerson[key];
      if (ownerPid) {
        owners[ownerPid] = (owners[ownerPid] || 0) + 1;
      }
    });

    var ownerPids = Object.keys(owners);

    if (ownerPids.length === 0) {
      /* No overlap — new identity */
      var newPid = deterministicPersonId(cluster);
      mappedClusters.push({
        cluster: cluster,
        person_id: newPid,
        survival: 'new'
      });
      newCount++;
    } else if (ownerPids.length === 1) {
      /* Single existing owner — reuse */
      var existingPid = ownerPids[0];
      var isMergeSurvivor = false;
      mappedClusters.push({
        cluster: cluster,
        person_id: existingPid,
        survival: isMergeSurvivor ? 'merge_survivor' : 'existing'
      });
      preservedCount++;
    } else {
      /* Multiple owners — pick survivor (most overlapping records, lexicographic tie-break) */
      ownerPids.sort(function (a, b) {
        var diff = (owners[b] || 0) - (owners[a] || 0);
        if (diff !== 0) return diff;
        return a < b ? -1 : (a > b ? 1 : 0);
      });
      var survivorPid = ownerPids[0];

      mappedClusters.push({
        cluster: cluster,
        person_id: survivorPid,
        survival: 'merge_survivor'
      });
      preservedCount++;

      /* All other owners are merge victims */
      for (var oi = 1; oi < ownerPids.length; oi++) {
        if (mergeVictimPids.indexOf(ownerPids[oi]) === -1) {
          mergeVictimPids.push(ownerPids[oi]);
        }
      }
    }
  });

  /* --- Identify stale owners (existing person_ids that match NO cluster) --- */
  var assignedPids = {};
  mappedClusters.forEach(function (m) { assignedPids[m.person_id] = true; });
  mergeVictimPids.forEach(function (pid) { assignedPids[pid] = true; });

  var stalePids = [];
  existingDocs.forEach(function (doc) {
    if (!assignedPids[doc.person_id]) {
      stalePids.push(doc.person_id);
    }
  });

  return {
    mappedClusters: mappedClusters,
    mergeVictimPids: mergeVictimPids,
    stalePids: stalePids,
    preservedCount: preservedCount,
    newCount: newCount
  };
}



/* ------------------------------------------------------------------ */
/*  ZCQL helpers                                                      */
/* ------------------------------------------------------------------ */

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

async function queryAllZCQL(appInstance, baseSql, pageSize) {
  pageSize = pageSize || PAGE_SIZE;
  var allRows = [];
  var offset = 0;
  var keepGoing = true;

  while (keepGoing) {
    var paginatedSQL = baseSql + ' LIMIT ' + offset + ',' + pageSize;
    var rows = await queryZCQL(appInstance, paginatedSQL);
    if (rows.length > 0) {
      allRows = allRows.concat(rows);
      offset += rows.length;
      keepGoing = rows.length >= pageSize;
    } else {
      keepGoing = false;
    }
  }

  return allRows;
}

/* ------------------------------------------------------------------ */
/*  Data loading from Catalyst Data Store (ZCQL)                      */
/* ------------------------------------------------------------------ */

async function loadSourceRecords(appInstance, maxRecords) {
  var useLimit = maxRecords != null;
  var label = useLimit ? 'LIMITED (' + maxRecords + ' max per table)' : 'FULL';
  console.log('[fullReconcile] Loading source records (' + label + ')...');
  var allRecords = [];
  var errors = [];

  var tableConfigs = [
    { table: 'Accused', idCol: 'AccusedMasterID', nameCol: 'AccusedName', prefix: 'A-' },
    { table: 'Victim', idCol: 'VictimMasterID', nameCol: 'VictimName', prefix: 'V-' },
    { table: 'ComplainantDetails', idCol: 'ComplainantID', nameCol: 'ComplainantName', prefix: 'C-' }
  ];

  var loadPromises = tableConfigs.map(function (tc) {
    return (async function () {
      var baseSql = [
        'SELECT a.ROWID, a.' + tc.idCol + ', a.CaseMasterID, a.' + tc.nameCol + ', a.AgeYear, a.GenderID,',
        'cm.IncidentFromDate, cm.PoliceStationID, cm.Latitude, cm.Longitude,',
        'u.DistrictID',
        'FROM ' + tc.table + ' a',
        'INNER JOIN CaseMaster cm ON a.CaseMasterID = cm.ROWID',
        'INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID'
      ].join(' ');

      try {
        var rows;
        if (useLimit) {
          rows = await queryZCQL(appInstance, baseSql + ' LIMIT ' + maxRecords);
        } else {
          rows = await queryAllZCQL(appInstance, baseSql, PAGE_SIZE);
        }
        mapSourceRows(rows, tc.table, tc.idCol, tc.nameCol, tc.prefix, allRecords);
        console.log('[fullReconcile] ' + tc.table + ': ' + rows.length + ' records');
      } catch (err) {
        errors.push(tc.table + ': ' + err.message);
        console.error('[fullReconcile] ' + tc.table + ' query failed: ' + err.message);
      }
    })();
  });

  await Promise.all(loadPromises);

  console.log('[fullReconcile] Total source records: ' + allRecords.length);
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
/*  PersonMaster loading                                              */
/* ------------------------------------------------------------------ */

async function loadPersonMasterDocuments(appInstance) {
  console.log('[fullReconcile] Loading existing PersonMaster documents...');

  var { NoSQLEnum, NoSQLMarshall } = require('zcatalyst-sdk-node/lib/no-sql');
  var { NoSQLOperator } = NoSQLEnum;

  var noSql = appInstance.nosql();
  var table = await noSql.getTable(PM_TABLE_NAME);

  var allDocs = [];
  var lastKey = null;
  var hasMore = true;

  while (hasMore) {
    var queryBody = {
      key_condition: {
        attribute: 'type',
        operator: NoSQLOperator.EQUALS,
        value: NoSQLMarshall.makeString('PM')
      },
      limit: 100,
      consistent_read: true
    };

    if (lastKey) {
      queryBody.start_key = lastKey;
    }

    var response = await table.queryTable(queryBody);
    var items = response.getResponseData();

    if (items && items.length > 0) {
      for (var di = 0; di < items.length; di++) {
        var data = items[di];
        if (data && data.item) {
          var doc = data.item.to();
          if (doc && doc.person_id) {
            allDocs.push(doc);
          }
        }
      }
    }

    lastKey = response.start_key;
    hasMore = (lastKey != null) && (items && items.length > 0);
  }

  console.log('[fullReconcile] Loaded ' + allDocs.length + ' existing PersonMaster documents');
  return allDocs;
}

/* ------------------------------------------------------------------ */
/*  Entity matching pipeline                                          */
/* ------------------------------------------------------------------ */

function normaliseAndPhoneticize(records) {
  records.forEach(function (r) {
    r.normalised_name = normaliseName(r.name);
    r.phonetic_key = generatePhoneticKey(r.name);
  });
}

async function runEntityMatching(records) {
  console.log('[fullReconcile] Building blocks from ' + records.length + ' records...');

  var dsu = new DSU();
  var recordByKey = {};
  var unconfirmedPairs = [];
  var pairConfMap = {};
  var totalPairsProcessed = 0;
  var pairCount = 0;
  var matchingPairsCount = 0;

  records.forEach(function (r) {
    var key = r.source_table + ':' + r.source_id;
    recordByKey[key] = r;
    dsu.makeSet(key);
  });

  var blocks = buildBlocks(records, STRATEGIES[0].fn);

  for (var bk in blocks) {
    var group = blocks[bk];
    if (group.length < 2) continue;

    var blockConfirmed = 0;
    var blockUnconfirmed = 0;

    for (var i = 0; i < group.length; i++) {
      for (var j = i + 1; j < group.length; j++) {
        var a = group[i];
        var b = group[j];

        if (a.source_id === b.source_id && a.source_table === b.source_table) continue;

        pairCount++;
        totalPairsProcessed++;

        var result = computeScore(a, b);
        var gate = classify(result.confidence);

        if (gate.label === CONFIRMED) {
          var keyA = a.source_table + ':' + a.source_id;
          var keyB = b.source_table + ':' + b.source_id;

          dsu.union(keyA, keyB);

          if (!pairConfMap[keyA]) pairConfMap[keyA] = [];
          if (!pairConfMap[keyB]) pairConfMap[keyB] = [];
          pairConfMap[keyA].push(result.confidence);
          pairConfMap[keyB].push(result.confidence);

          blockConfirmed++;
          matchingPairsCount++;
        } else if (gate.label === UNCONFIRMED) {
          blockUnconfirmed++;
          unconfirmedPairs.push({
            a: a, b: b,
            confidence: result.confidence,
            score_breakdown: result.score_breakdown,
            classification: gate.label
          });
        }

        if (pairCount % 5000 === 0) {
          console.log('[fullReconcile] Scored ' + totalPairsProcessed + ' pairs...');
          await new Promise(function (resolve) { setImmediate(resolve); });
        }
      }
    }

    if (blockConfirmed > 0 || blockUnconfirmed > 0) {
      console.log('[fullReconcile] Block "' + bk + '": ' + (blockConfirmed + blockUnconfirmed) + ' pairs (' + blockConfirmed + ' confirmed, ' + blockUnconfirmed + ' unconfirmed)');
    }
  }

  console.log('[fullReconcile] Total pairs processed: ' + totalPairsProcessed + ', confirmed: ' + matchingPairsCount + ', unconfirmed: ' + unconfirmedPairs.length);

  var clusterKeys = dsu.getClusters();
  var clusters = clusterKeys.map(function (keys) {
    return keys.map(function (k) { return recordByKey[k]; });
  });

  console.log('[fullReconcile] Clusters formed: ' + clusters.length);

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

  return {
    clusters: clusters,
    unconfirmedPairs: unconfirmedPairs
  };
}

/* ------------------------------------------------------------------ */
/*  NoSQL persistence helpers                                         */
/* ------------------------------------------------------------------ */

async function upsertPersonMaster(appInstance, doc) {
  var maxRetries = 3;

  for (var retryAttempt = 0; retryAttempt <= maxRetries; retryAttempt++) {
    try {
      var noSql = appInstance.nosql();
      var table = await noSql.getTable(PM_TABLE_NAME);
      var { NoSQLItem, NoSQLEnum, NoSQLMarshall } = require('zcatalyst-sdk-node/lib/no-sql');
      var { NoSQLUpdateOperationType } = NoSQLEnum;

      try {
        var insertBody = { item: NoSQLItem.from(doc) };
        await table.insertItems(insertBody);
        return { action: 'created', person_id: doc.person_id };
      } catch (insertErr) {
        if (insertErr.message && insertErr.message.indexOf('Concurrency limit reached for the feature COMPONENT') !== -1 && retryAttempt < maxRetries) {
          var delay = 500 * (retryAttempt + 1) * (retryAttempt + 1);
          console.log('[fullReconcile] Concurrency limit on insert for ' + doc.person_id + ', retry ' + (retryAttempt + 1) + '/' + maxRetries + ' in ' + delay + 'ms');
          await new Promise(function (resolve) { setTimeout(resolve, delay); });
          continue;
        }
        console.log('[fullReconcile] Document ' + doc.person_id + ' exists, updating...');
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
          return { action: 'updated', person_id: doc.person_id };
        } catch (updateErr) {
          if (updateErr.message && updateErr.message.indexOf('Concurrency limit reached for the feature COMPONENT') !== -1 && retryAttempt < maxRetries) {
            var delay2 = 500 * (retryAttempt + 1) * (retryAttempt + 1);
            console.log('[fullReconcile] Concurrency limit on update for ' + doc.person_id + ', retry ' + (retryAttempt + 1) + '/' + maxRetries + ' in ' + delay2 + 'ms');
            await new Promise(function (resolve) { setTimeout(resolve, delay2); });
            continue;
          }
          throw new Error('Update failed for ' + doc.person_id + ': ' + updateErr.message);
        }
      }
    } catch (err) {
      if (retryAttempt >= maxRetries) {
        console.error('[fullReconcile] Skipping upsertPersonMaster for ' + doc.person_id + ': ' + err.message);
        return { action: 'skipped', person_id: doc.person_id, error: err.message };
      }
    }
  }

  return { action: 'skipped', person_id: doc.person_id, error: 'Max retries exceeded' };
}

async function persistDocuments(appInstance, documents) {
  var created = 0;
  var updated = 0;
  var persistT0 = Date.now();

  for (var di = 0; di < documents.length; di += BATCH_SIZE) {
    var batch = documents.slice(di, di + BATCH_SIZE);
    for (var bi = 0; bi < batch.length; bi++) {
      try {
        var result = await upsertPersonMaster(appInstance, batch[bi]);
        if (result.action === 'created') created++;
        else if (result.action === 'updated') updated++;
      } catch (err) {
        console.error('[fullReconcile] Error writing ' + batch[bi].person_id + ': ' + err.message);
      }
    }
    console.log('[fullReconcile] Persist batch ' + Math.floor(di / BATCH_SIZE + 1) + ' done (' + batch.length + ' docs, elapsed=' + (Date.now() - persistT0) + 'ms)');
  }

  return { created: created, updated: updated };
}

async function deleteOneDoc(appInstance, personId) {
  var { NoSQLItem } = require('zcatalyst-sdk-node/lib/no-sql');
  var noSql = appInstance.nosql();
  var table = await noSql.getTable(PM_TABLE_NAME);
  try {
    await table.deleteItems({
      keys: NoSQLItem.from({ type: 'PM', person_id: personId })
    });
    return 'deleted';
  } catch (err) {
    if (err && (err.message || '').indexOf('not found') !== -1 || (err.statusCode === 404)) {
      return 'not_found';
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Full reconciliation orchestrator                                  */
/* ------------------------------------------------------------------ */

/**
 * Run the full reconciliation pipeline.
 *
 * Pipeline:
 *   1. Load all source records from Accused / Victim / ComplainantDetails
 *   2. Normalise and phoneticize every record
 *   3. Run entity matching (blocking → scoring → threshold → clustering)
 *   4. Build PersonMaster documents from clusters
 *   5. Load existing PersonMaster documents
 *   6. Identify stale documents (existing person_ids not in new set)
 *   7. Upsert all new/updated PersonMaster documents
 *   8. Delete stale documents
 *   9. Generate confirmed edges (co-accused, accused-to-victim)
 *  10. Generate candidate-match edges from unconfirmed pairs
 *  11. Persist confirmed and unconfirmed edges
 *  12. Write ResolutionAuditLog
 *  13. Return structured counters
 *
 * @param {Object} appInstance — initialized Catalyst SDK instance
 * @param {Object} [options]  — { runId }
 * @returns {Object} structured result with counters
 */
function stageLog(stage, t0) {
  console.log('[fullReconcile] [' + stage + '] elapsed=' + (Date.now() - t0) + 'ms');
}

function logRemaining(jobContext, stage) {
  if (jobContext) {
    try {
      console.log('[fullReconcile] [' + stage + '] remaining_ms=' + jobContext.getRemainingExecutionTimeMs());
    } catch (_) {}
  }
}

async function fullReconcile(appInstance, options, jobContext) {
  var opts = options || {};
  var runId = opts.runId || 'FULL-' + Date.now().toString(36).toUpperCase();
  var maxRecords = opts.max_records != null ? Number(opts.max_records) : null;
  var isLimited = maxRecords !== null;
  var t0 = Date.now();
  var runStart = new Date(t0);

  console.log('[fullReconcile] === Full Reconciliation [' + runId + '] ===');

  /* ---------------------------------------------------------------- */
  /*  Step 1: Load all source records                                 */
  /* ---------------------------------------------------------------- */
  var loadResult = await loadSourceRecords(appInstance, maxRecords);
  stageLog('SOURCE_LOAD', t0);
  logRemaining(jobContext, 'SOURCE_LOAD');
  var records = loadResult.records;
  var loadErrors = loadResult.errors;
  var mode = isLimited ? 'LIMITED' : 'FULL';
  var mergeVictimDeletionEnabled = loadErrors.length === 0 && records.length > 0;
  var staleDeletionEnabled = mergeVictimDeletionEnabled && !isLimited;

  stageLog('MATCHING', t0);
  logRemaining(jobContext, 'MATCHING');

  if (records.length === 0) {
    if (loadErrors.length > 0) {
      var failMsg = 'Source loading failed completely. Aborting. Errors: ' + loadErrors.join(' | ');
      console.log('[fullReconcile] ' + failMsg);
      try {
        await auditLog.createAuditRecord(appInstance, {
          runId: runId, runType: 'full', triggerType: 'MANUAL',
          startedAt: runStart.toISOString(), completedAt: new Date().toISOString(),
          status: 'FAILED', thresholdUsed: Number(THRESHOLD),
          documentsCreated: 0, documentsUpdated: 0, personsProcessed: 0,
          confirmedEdgesWritten: 0, unconfirmedEdgesWritten: 0,
          errorCount: loadErrors.length, errorMessage: failMsg
        });
      } catch (auditErr) {
        console.error('[fullReconcile] Audit log write failed: ' + auditErr.message);
      }
      return {
        run_id: runId, mode: mode, authoritative: !isLimited,
        stale_deletion_enabled: false,
        merge_victim_deletion_enabled: false,
        merge_victims: { identified: 0, deleted: 0, already_absent: 0, errors: 0 },
        stale_documents: { identified: 0, deleted: 0, already_absent: 0, errors: 0 },
        documents_created: 0, documents_updated: 0,
        documents_deleted: 0, persons_processed: 0, clusters_formed: 0, singles: 0,
        confirmed_edges_written: 0, unconfirmed_edges_written: 0,
        source_errors: loadErrors, stale_deleted: 0, elapsed_seconds: 0,
        error_count: loadErrors.length, source_load_complete: false, status: 'FAILED'
      };
    }

    var emptyMsg = 'No source records loaded. Data Store may be empty.';
    console.log('[fullReconcile] ' + emptyMsg);

    var existingDocs;
    try {
      existingDocs = await loadPersonMasterDocuments(appInstance);
    } catch (err) {
      console.error('[fullReconcile] Fatal: failed to load existing PersonMaster:', err.message);
      return {
        run_id: runId, mode: mode, authoritative: !isLimited,
        stale_deletion_enabled: false,
        merge_victim_deletion_enabled: false,
        merge_victims: { identified: 0, deleted: 0, already_absent: 0, errors: 0 },
        stale_documents: { identified: 0, deleted: 0, already_absent: 0, errors: 0 },
        status: 'FAILED',
        error_count: 1,
        source_errors: ['PersonMaster load failed: ' + err.message],
        documents_created: 0, documents_updated: 0,
        documents_deleted: 0, persons_processed: 0,
        clusters_formed: 0, singles: 0,
        confirmed_edges_written: 0, unconfirmed_edges_written: 0,
        stale_deleted: 0, elapsed_seconds: 0, source_load_complete: true
      };
    }
    var staleDeleted = 0;
    for (var si = 0; si < existingDocs.length; si++) {
      var result = await deleteOneDoc(appInstance, existingDocs[si].person_id);
      if (result === 'deleted') staleDeleted++;
    }

    console.log('[fullReconcile] No records — deleted ' + staleDeleted + ' stale documents');

    var auditErrMsg = null;
    try {
      await auditLog.createAuditRecord(appInstance, {
        runId: runId,
        runType: 'full',
        triggerType: 'MANUAL',
        startedAt: runStart.toISOString(),
        completedAt: new Date().toISOString(),
        status: 'SUCCESS',
        thresholdUsed: Number(THRESHOLD),
        documentsCreated: 0,
        documentsUpdated: 0,
        personsProcessed: 0,
        confirmedEdgesWritten: 0,
        unconfirmedEdgesWritten: 0,
        errorCount: 0,
        errorMessage: ''
      });
    } catch (auditErr) {
      auditErrMsg = auditErr.message;
      console.error('[fullReconcile] Audit log write failed: ' + auditErr.message);
    }

    return {
      run_id: runId, mode: mode, authoritative: !isLimited,
      stale_deletion_enabled: staleDeletionEnabled,
      merge_victim_deletion_enabled: mergeVictimDeletionEnabled,
      merge_victims: { identified: 0, deleted: 0, already_absent: 0, errors: 0 },
      stale_documents: { identified: 0, deleted: 0, already_absent: 0, errors: 0 },
      documents_created: 0,
      documents_updated: 0,
      documents_deleted: staleDeleted,
      persons_processed: 0,
      clusters_formed: 0,
      singles: 0,
      confirmed_edges_written: 0,
      unconfirmed_edges_written: 0,
      source_errors: [],
      stale_deleted: staleDeleted,
      elapsed_seconds: 0,
      error_count: 0,
      audit_error: auditErrMsg,
      source_load_complete: true,
      status: 'SUCCESS'
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Step 2: Normalise and phoneticize                               */
  /* ---------------------------------------------------------------- */
  normaliseAndPhoneticize(records);
  console.log('[fullReconcile] Normalisation complete: ' + records.length + ' records');
  stageLog('NORMALISE', t0);
  logRemaining(jobContext, 'NORMALISE');

  /* ---------------------------------------------------------------- */
  /*  Step 3: Run entity matching                                     */
  /* ---------------------------------------------------------------- */
  var matchResult = await runEntityMatching(records);
  stageLog('ENTITY_MATCH', t0);
  logRemaining(jobContext, 'ENTITY_MATCH');
  var clusters = matchResult.clusters;
  var unconfirmedPairs = matchResult.unconfirmedPairs;

  console.log('[fullReconcile] Entity matching: ' + clusters.length + ' clusters from ' + records.length + ' records');

  /* ---------------------------------------------------------------- */
  /*  Step 4: Load existing PersonMaster documents (before building)  */
  /* ---------------------------------------------------------------- */
  var existingDocs;
  try {
    existingDocs = await loadPersonMasterDocuments(appInstance);
  } catch (err) {
    console.error('[fullReconcile] Fatal: failed to load existing PersonMaster:', err.message);
    return {
      run_id: runId, mode: mode, authoritative: !isLimited,
      stale_deletion_enabled: false,
      merge_victim_deletion_enabled: false,
      merge_victims: { identified: 0, deleted: 0, already_absent: 0, errors: 0 },
      stale_documents: { identified: 0, deleted: 0, already_absent: 0, errors: 0 },
      status: 'FAILED',
      error_count: 1,
      source_errors: ['PersonMaster load failed: ' + err.message],
      documents_created: 0, documents_updated: 0,
      documents_deleted: 0, persons_processed: 0,
      clusters_formed: 0, singles: 0,
      confirmed_edges_written: 0, unconfirmed_edges_written: 0,
      stale_deleted: 0, elapsed_seconds: 0, source_load_complete: true
    };
  }
  stageLog('PM_LOAD', t0);
  logRemaining(jobContext, 'PM_LOAD');

  /* ---------------------------------------------------------------- */
  /*  Step 5: Map clusters to person_ids with identity preservation   */
  /* ---------------------------------------------------------------- */
  var mapped = mapClustersToIds(clusters, existingDocs, runId);

  console.log('[fullReconcile] Identity mapping: ' + mapped.preservedCount + ' preserved, ' +
    mapped.newCount + ' new, ' + mapped.stalePids.length + ' stale, ' +
    mapped.mergeVictimPids.length + ' merge victims');

  /* ---------------------------------------------------------------- */
  /*  Step 6: Build PersonMaster documents                            */
  /* ---------------------------------------------------------------- */
  var documents = [];
  var singles = 0;

  mapped.mappedClusters.forEach(function (m) {
    var cluster = m.cluster;

    var confidences = [];
    cluster.forEach(function (r) {
      if (r.confidence != null) confidences.push(r.confidence);
    });
    var clusterConfidence = confidences.length > 0
      ? Math.round((confidences.reduce(function (a, b) { return a + b; }, 0) / confidences.length) * 100) / 100
      : null;

    var doc = buildPersonMaster(cluster, {
      person_id: m.person_id,
      confidence_score: clusterConfidence,
      resolution_method: 'phonetic_weighted_score_v1',
      resolved_by: 'sync-full-v1',
      resolution_run_id: runId
    });

    documents.push(doc);
    if (cluster.length === 1) singles++;
  });

  console.log('[fullReconcile] Documents built: ' + documents.length + ' (' + singles + ' singles)');
  stageLog('DOC_BUILD', t0);
  logRemaining(jobContext, 'DOC_BUILD');

  /* ---------------------------------------------------------------- */
  /*  Step 6.5: Generate and merge edges into documents               */
  /* ---------------------------------------------------------------- */
  var confirmedEdgesWritten = 0;
  var unconfirmedEdgesWritten = 0;

  if (documents.length > 0) {
    var sourceToPerson = {};
    documents.forEach(function (doc) {
      (doc.source_records || []).forEach(function (sr) {
        if (sr.table && sr.row_id) {
          sourceToPerson[sr.table + ':' + sr.row_id] = doc.person_id;
        }
      });
    });
    stageLog('SOURCE_TO_PERSON', t0);

    console.log('[fullReconcile] generateConfirmedEdges on ' + documents.length + ' documents...');
    logRemaining(jobContext, 'PRE_CONFIRMED_EDGES');
    var confirmedResult = generateConfirmedEdges(documents);
    console.log('[fullReconcile] generateConfirmedEdges done.');
    logRemaining(jobContext, 'POST_CONFIRMED_EDGES');
    var confirmedEdgesByPerson = confirmedResult.confirmed_edges_by_person;

    documents.forEach(function (doc) {
      if (!doc.person_id) return;
      var personEdges = confirmedEdgesByPerson[doc.person_id] || [];
      if (personEdges.length > 0) {
        var mergeResult = mergeEdgesIntoDocument(doc, personEdges, 'confirmed_edges');
        doc.confirmed_edges = mergeResult.merged;
        confirmedEdgesWritten += mergeResult.added;
      }
    });

    var personIdLookup = function (sourceTable, sourceId) {
      return sourceToPerson[sourceTable + ':' + sourceId] || null;
    };

    console.log('[fullReconcile] generateCandidateMatchEdges on ' + (unconfirmedPairs ? unconfirmedPairs.length : 0) + ' pairs...');
    logRemaining(jobContext, 'PRE_CANDIDATE_EDGES');
    var unconfirmedResult = generateCandidateMatchEdges(unconfirmedPairs, personIdLookup, documents);
    console.log('[fullReconcile] generateCandidateMatchEdges done.');
    logRemaining(jobContext, 'POST_CANDIDATE_EDGES');
    var unconfirmedEdgesByPerson = unconfirmedResult.unconfirmed_edges_by_person;

    documents.forEach(function (doc) {
      if (!doc.person_id) return;
      var personEdges = unconfirmedEdgesByPerson[doc.person_id] || [];
      if (personEdges.length > 0) {
        var mergeResult = mergeEdgesIntoDocument(doc, personEdges, 'unconfirmed_edges');
        doc.unconfirmed_edges = mergeResult.merged;
        unconfirmedEdgesWritten += mergeResult.added;
      }
    });
  }

  console.log('[fullReconcile] Edges generated: ' + confirmedEdgesWritten + ' confirmed, ' + unconfirmedEdgesWritten + ' unconfirmed');
  stageLog('EDGES', t0);
  logRemaining(jobContext, 'EDGES');

  /* ---------------------------------------------------------------- */
  /*  Step 7: Upsert all PersonMaster documents                       */
  /* ---------------------------------------------------------------- */
  var persistResult = await persistDocuments(appInstance, documents);
  console.log('[fullReconcile] Persist complete: ' + persistResult.created + ' created, ' + persistResult.updated + ' updated');
  stageLog('PERSIST', t0);
  logRemaining(jobContext, 'PERSIST');

  /* ---------------------------------------------------------------- */
  /*  Step 8: Delete merge victims (safe, survivor already persisted) */
  /* ---------------------------------------------------------------- */
  var mergeStats = { identified: 0, deleted: 0, already_absent: 0, errors: 0 };
  if (mergeVictimDeletionEnabled && mapped.mergeVictimPids.length > 0) {
    mergeStats.identified = mapped.mergeVictimPids.length;
    console.log('[fullReconcile] Merge victims to delete: ' + mapped.mergeVictimPids.length);
    for (var mvi = 0; mvi < mapped.mergeVictimPids.length; mvi++) {
      try {
        var result = await deleteOneDoc(appInstance, mapped.mergeVictimPids[mvi]);
        if (result === 'deleted') mergeStats.deleted++;
        else if (result === 'not_found') mergeStats.already_absent++;
      } catch (err) {
        mergeStats.errors++;
        console.error('[fullReconcile] Merge victim delete error: ' + mapped.mergeVictimPids[mvi] + ': ' + err.message);
      }
    }
  } else if (mapped.mergeVictimPids.length > 0) {
    console.log('[fullReconcile] Merge victim deletion disabled (errors=' + loadErrors.length + ', mode=' + mode + ')');
  }

  /* ---------------------------------------------------------------- */
  /*  Step 9: Delete stale orphans (general cleanup)                  */
  /* ---------------------------------------------------------------- */
  var staleStats = { identified: 0, deleted: 0, already_absent: 0, errors: 0 };
  if (staleDeletionEnabled && mapped.stalePids.length > 0) {
    staleStats.identified = mapped.stalePids.length;
    console.log('[fullReconcile] Stale orphans to delete: ' + mapped.stalePids.length);
    for (var sdi = 0; sdi < mapped.stalePids.length; sdi++) {
      try {
        var result = await deleteOneDoc(appInstance, mapped.stalePids[sdi]);
        if (result === 'deleted') staleStats.deleted++;
        else if (result === 'not_found') staleStats.already_absent++;
      } catch (err) {
        staleStats.errors++;
        console.error('[fullReconcile] Stale orphan delete error: ' + mapped.stalePids[sdi] + ': ' + err.message);
      }
    }
  } else if (mapped.stalePids.length > 0) {
    console.log('[fullReconcile] Stale orphan deletion disabled (mode=' + mode + ', errors=' + loadErrors.length + ')');
  }
  var staleDeleted = staleStats.deleted;
  stageLog('STALE_CLEANUP', t0);
  logRemaining(jobContext, 'STALE_CLEANUP');



  /* ---------------------------------------------------------------- */
  /*  Step 12: Audit log                                              */
  /* ---------------------------------------------------------------- */
  var totalRecords = clusters.reduce(function (sum, c) { return sum + c.length; }, 0);
  var elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  var successfulWrites = persistResult.created + persistResult.updated;
  var persistenceErrors = Math.max(0, documents.length - successfulWrites);
  var totalErrors = loadErrors.length + persistenceErrors;
  var runStatus = totalErrors > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS';

  try {
    await auditLog.createAuditRecord(appInstance, {
      runId: runId,
      runType: 'full',
      triggerType: 'MANUAL',
      startedAt: runStart.toISOString(),
      completedAt: new Date().toISOString(),
      status: runStatus,
      thresholdUsed: Number(THRESHOLD),
      documentsCreated: persistResult.created,
      documentsUpdated: persistResult.updated,
      personsProcessed: totalRecords,
      confirmedEdgesWritten: confirmedEdgesWritten,
      unconfirmedEdgesWritten: unconfirmedEdgesWritten,
      errorCount: totalErrors,
      errorMessage: ''
    });
  } catch (auditErr) {
    console.error('[fullReconcile] Audit log write failed: ' + auditErr.message);
  }

  /* ---------------------------------------------------------------- */
  /*  Step 13: Return structured result                               */
  /* ---------------------------------------------------------------- */
  console.log('[fullReconcile] === Full Reconciliation Complete ===');
  console.log('[fullReconcile] Created: ' + persistResult.created +
    ', Updated: ' + persistResult.updated +
    ', Deleted: ' + staleDeleted +
    ', Confirmed edges: ' + confirmedEdgesWritten +
    ', Unconfirmed edges: ' + unconfirmedEdgesWritten +
    ' (' + elapsed + 's)');

  return {
    run_id: runId, mode: mode, authoritative: !isLimited,
    stale_deletion_enabled: staleDeletionEnabled,
    merge_victim_deletion_enabled: mergeVictimDeletionEnabled,
    merge_victims: {
      identified: mergeStats.identified,
      deleted: mergeStats.deleted,
      already_absent: mergeStats.already_absent,
      errors: mergeStats.errors
    },
    stale_documents: {
      identified: staleStats.identified,
      deleted: staleStats.deleted,
      already_absent: staleStats.already_absent,
      errors: staleStats.errors
    },
    documents_created: persistResult.created,
    documents_updated: persistResult.updated,
    documents_deleted: staleDeleted,
    persons_processed: totalRecords,
    clusters_formed: clusters.length,
    singles: singles,
    confirmed_edges_written: confirmedEdgesWritten,
    unconfirmed_edges_written: unconfirmedEdgesWritten,
    source_errors: loadErrors.length,
    stale_deleted: staleDeleted,
    elapsed_seconds: Number(elapsed),
    error_count: totalErrors,
    source_load_complete: loadErrors.length === 0,
    status: runStatus
  };
}

module.exports = {
  fullReconcile: fullReconcile,
  loadPersonMasterDocuments: loadPersonMasterDocuments,
  deterministicPersonId: deterministicPersonId,
  mapClustersToIds: mapClustersToIds,
  buildSourceKeySet: buildSourceKeySet,
  buildExistingSourceIndex: buildExistingSourceIndex
};
