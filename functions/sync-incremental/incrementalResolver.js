'use strict';

/*
 * incrementalResolver — Phase 4.2.3 Milestone 2: Incremental Reconciliation
 *
 * Takes the change detection result from detectChanges() and performs
 * targeted re-resolution of only the affected identities. Does NOT
 * rebuild the full graph — only recalculates changed persons and their
 * directly impacted edges.
 */

/* ------------------------------------------------------------------ */
/*  Entity Matching Engine + Document Builder (pure modules, no SDK)   */
/* ------------------------------------------------------------------ */

var { normaliseName } = require('../entity-matching-engine/normaliser');
var { generatePhoneticKey } = require('../entity-matching-engine/phonetic');
var { generateUniquePairs } = require('../entity-matching-engine/blocking');
var { computeScore } = require('../entity-matching-engine/scorer');
var { classify, CONFIRMED, UNCONFIRMED, THRESHOLD } = require('../entity-matching-engine/threshold');
var { buildPersonMaster } = require('../personmaster-writer/documentBuilder');
var { generateConfirmedEdges, generateCandidateMatchEdges } = require('../personmaster-writer/edgeGenerator');
var { mergeEdgesIntoDocument } = require('../personmaster-writer/edgePersistence');

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

var BATCH_SIZE = 75;
var PAGE_SIZE = 1000;
var GENDER_MAP = { '1': 'M', '2': 'F', '3': 'O' };
var PM_TABLE_NAME = 'PersonMaster';

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
/*  CRC32 — deterministic person ID (same as personmaster-writer)     */
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
/*  Checksum — same algorithm as index.js                             */
/* ------------------------------------------------------------------ */

function recordChecksum(rec) {
  var seed = (rec.name_as_recorded || rec.name || '') + '|' +
             (rec.age_as_recorded != null ? rec.age_as_recorded : rec.age != null ? rec.age : '') + '|' +
             (rec.case_id || '') + '|' +
             (rec.unit_id || '') + '|' +
             (rec.district_id || '');
  var hash = 0;
  for (var i = 0; i < seed.length; i++) {
    var c = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/* ------------------------------------------------------------------ */
/*  Parse source_records (handles JSON string or array)               */
/* ------------------------------------------------------------------ */

function parseSourceRecords(row) {
  var sr = row.source_records;
  if (!sr) return [];
  if (Array.isArray(sr)) return sr;
  if (typeof sr === 'string') {
    try {
      return JSON.parse(sr);
    } catch (e) {
      return [];
    }
  }
  return [];
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
/*  Map source rows (same pattern as sync-incremental index.js)       */
/* ------------------------------------------------------------------ */

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
/*  Normalise and phoneticize records                                 */
/* ------------------------------------------------------------------ */

function normaliseAndPhoneticize(records) {
  records.forEach(function (r) {
    r.normalised_name = normaliseName(r.name);
    r.phonetic_key = generatePhoneticKey(r.name);
  });
}

/* ------------------------------------------------------------------ */
/*  Build source → person index from PersonMaster docs                */
/* ------------------------------------------------------------------ */

function buildSourceToPersonIndex(docs) {
  var index = {};
  for (var di = 0; di < docs.length; di++) {
    var doc = docs[di];
    var sourceRecords = parseSourceRecords(doc);
    for (var si = 0; si < sourceRecords.length; si++) {
      var sr = sourceRecords[si];
      var key = (sr.table || '') + ':' + (sr.row_id || '');
      if (key !== ':') {
        index[key] = doc.person_id;
      }
    }
  }
  return index;
}

/* ------------------------------------------------------------------ */
/*  Step 1 — Load existing PersonMaster docs                          */
/* ------------------------------------------------------------------ */

async function loadExistingPMDocs(appInstance) {
  console.log('[incResolve] Loading existing PersonMaster documents...');
  var sql = 'SELECT * FROM PersonMaster';
  var rows = await queryAllZCQL(appInstance, sql, 1000);
  var docs = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].person_id) {
      docs.push(rows[i]);
    }
  }
  console.log('[incResolve] Loaded ' + docs.length + ' PersonMaster documents');
  return docs;
}

/* ------------------------------------------------------------------ */
/*  Step 2 — Build affected-case scope                                */
/* ------------------------------------------------------------------ */

function buildAffectedCaseScope(changeResult, existingDocMap) {
  var caseIds = {};

  (changeResult.changed_person_ids || []).forEach(function (pid) {
    var doc = existingDocMap[pid];
    if (!doc) return;
    var sr = parseSourceRecords(doc);
    sr.forEach(function (r) {
      if (r.case_id) caseIds[r.case_id] = true;
    });
  });

  (changeResult.new_records || []).forEach(function (r) {
    if (r.case_id) caseIds[r.case_id] = true;
  });

  (changeResult.orphaned_records || []).forEach(function (r) {
    if (r.case_id) caseIds[r.case_id] = true;
  });

  return Object.keys(caseIds);
}

/* ------------------------------------------------------------------ */
/*  Step 3 — Load affected source records (by case IDs)              */
/* ------------------------------------------------------------------ */

async function loadAffectedSourceRecords(appInstance, caseIds) {
  if (caseIds.length === 0) return [];

  console.log('[incResolve] Loading source records for ' + caseIds.length + ' affected cases...');

  var whereClause = caseIds.map(function (cid) {
    return "a.CaseMasterID = '" + cid + "'";
  }).join(' OR ');

  if (!whereClause) return [];

  var allRecords = [];

  var baseSQL = [
    'SELECT a.ROWID, a.AccusedMasterID, a.CaseMasterID, a.AccusedName, a.AgeYear, a.GenderID,',
    'cm.IncidentFromDate, cm.PoliceStationID, cm.Latitude, cm.Longitude,',
    'u.DistrictID',
    'FROM #TABLE# a',
    'INNER JOIN CaseMaster cm ON a.CaseMasterID = cm.ROWID',
    'INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID',
    'WHERE (' + whereClause + ')'
  ].join(' ');

  var tables = [
    { name: 'Accused', idCol: 'AccusedMasterID', nameCol: 'AccusedName', prefix: 'A-' },
    { name: 'Victim', idCol: 'VictimMasterID', nameCol: 'VictimName', prefix: 'V-' },
    { name: 'ComplainantDetails', idCol: 'ComplainantID', nameCol: 'ComplainantName', prefix: 'C-' }
  ];

  for (var ti = 0; ti < tables.length; ti++) {
    var t = tables[ti];
    try {
      var sql = baseSQL.replace('#TABLE#', t.name);
      var rows = await queryAllZCQL(appInstance, sql, 1000);
      mapSourceRows(rows, t.name, t.idCol, t.nameCol, t.prefix, allRecords);
      console.log('[incResolve] ' + t.name + ': ' + rows.length + ' records');
    } catch (err) {
      console.error('[incResolve] ' + t.name + ' query failed: ' + err.message);
    }
  }

  console.log('[incResolve] Total affected source records: ' + allRecords.length);
  return allRecords;
}

/* ------------------------------------------------------------------ */
/*  Step 4 — Run entity matching on affected records                  */
/* ------------------------------------------------------------------ */

function runEntityMatching(records) {
  if (records.length === 0) return { clusters: [], matchedPairs: [] };

  var pairs = generateUniquePairs(records);
  console.log('[incResolve] Candidate pairs: ' + pairs.length);

  var matchedPairs = [];
  var pairConfMap = {};

  for (var pi = 0; pi < pairs.length; pi++) {
    var pair = pairs[pi];
    var result = computeScore(pair.a, pair.b);
    var gate = classify(result.confidence);

    if (gate.label === CONFIRMED || gate.label === UNCONFIRMED) {
      matchedPairs.push({
        a: pair.a,
        b: pair.b,
        confidence: result.confidence,
        score_breakdown: result.score_breakdown,
        classification: gate.label
      });

      var pkA = pair.a.source_table + ':' + pair.a.source_id;
      var pkB = pair.b.source_table + ':' + pair.b.source_id;
      if (!pairConfMap[pkA]) pairConfMap[pkA] = [];
      if (!pairConfMap[pkB]) pairConfMap[pkB] = [];
      pairConfMap[pkA].push(result.confidence);
      pairConfMap[pkB].push(result.confidence);
    }
  }

  console.log('[incResolve] Matched pairs (CONFIRMED+UNCONFIRMED): ' + matchedPairs.length);

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

  records.forEach(function (r) {
    var key = r.source_table + ':' + r.source_id;
    if (!recordByKey[key]) recordByKey[key] = r;
    dsu.makeSet(key);
  });

  var clusterKeys = dsu.getClusters();
  var clusters = clusterKeys.map(function (keys) {
    return keys.map(function (k) { return recordByKey[k]; });
  });

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

  console.log('[incResolve] Clusters formed: ' + clusters.length);
  return { clusters: clusters, matchedPairs: matchedPairs };
}

/* ------------------------------------------------------------------ */
/*  Step 6 — Handle orphaned records                                  */
/* ------------------------------------------------------------------ */

function handleOrphanedRecords(orphanedRecords, existingDocMap) {
  var orphanHandledDocs = {};
  var deletionPersonIds = [];

  orphanedRecords.forEach(function (orphan) {
    var pid = orphan.person_id;
    if (!pid) return;
    if (!existingDocMap[pid]) return;

    var doc = existingDocMap[pid];
    var sr = parseSourceRecords(doc);

    var orphanKey = (orphan.source_table || '') + ':' + (orphan.source_id || '');
    var remaining = sr.filter(function (r) {
      var rKey = (r.table || '') + ':' + (r.row_id || '');
      return rKey !== orphanKey;
    });

    if (remaining.length === 0) {
      deletionPersonIds.push(pid);
      console.log('[incResolve] Person ' + pid + ' marked for deletion (all records orphaned)');
      return;
    }

    doc.source_records = remaining;

    /* Recompute role counters */
    var accusedCount = 0;
    var victimCount = 0;
    var complainantCount = 0;
    var caseIdSet = {};
    remaining.forEach(function (r) {
      if (r.table === 'Accused') accusedCount++;
      else if (r.table === 'Victim') victimCount++;
      else if (r.table === 'ComplainantDetails') complainantCount++;
      if (r.case_id) caseIdSet[r.case_id] = true;
    });

    var uniqueCaseIds = Object.keys(caseIdSet);
    var totalCaseAppearances = uniqueCaseIds.length > 0 ? uniqueCaseIds.length : remaining.length;

    doc.roles_summary = doc.roles_summary || {};
    doc.roles_summary.accused_count = accusedCount;
    doc.roles_summary.victim_count = victimCount;
    doc.roles_summary.complainant_count = complainantCount;
    doc.roles_summary.total_case_appearances = totalCaseAppearances;

    orphanHandledDocs[pid] = doc;
    console.log('[incResolve] Orphan removed from ' + pid + ', remaining records: ' + remaining.length);
  });

  return { orphanHandledDocs: orphanHandledDocs, deletionPersonIds: deletionPersonIds };
}

/* ------------------------------------------------------------------ */
/*  Step 5+7 — Map clusters to docs and rebuild                       */
/* ------------------------------------------------------------------ */

function mapClustersToDocs(clusters, existingDocMap, existingRecordsIndex, orphanHandledDocIds, runId) {
  var rebuiltDocs = [];
  var newDocs = [];
  var unchangedCount = 0;
  var changedCount = 0;

  clusters.forEach(function (cluster) {
    var personId = deterministicPersonId(cluster);

    var confidences = [];
    cluster.forEach(function (r) {
      if (r.confidence != null) confidences.push(r.confidence);
    });
    var clusterConfidence = confidences.length > 0
      ? Math.round((confidences.reduce(function (a, b) { return a + b; }, 0) / confidences.length) * 100) / 100
      : null;

    var existingDoc = existingDocMap[personId];

    if (existingDoc) {
      /* Check if cluster is actually different from existing doc:
       * compare both source record keys AND field-level checksums */
      var existingSR = parseSourceRecords(existingDoc);
      var clusterKeys = {};
      cluster.forEach(function (r) {
        clusterKeys[(r.source_table || '') + ':' + (r.source_id || '')] = true;
      });
      var existingKeys = {};
      existingSR.forEach(function (r) {
        existingKeys[(r.table || '') + ':' + (r.row_id || '')] = true;
      });

      var sameSize = Object.keys(clusterKeys).length === Object.keys(existingKeys).length;
      var sameKeys = sameSize && Object.keys(clusterKeys).every(function (k) { return existingKeys[k]; });

      if (sameKeys) {
        /* Same keys — also compare field-level checksums to detect
         * value changes (e.g., name update, age correction) */
        var allChecksumsMatch = cluster.every(function (r) {
          var key = (r.source_table || '') + ':' + (r.source_id || '');
          var matchedExisting = existingSR.filter(function (ex) {
            return (ex.table || '') + ':' + (ex.row_id || '') === key;
          });
          if (matchedExisting.length === 0) return false;

          var existingRec = matchedExisting[0];
          var clusterCS = recordChecksum({
            name_as_recorded: r.name || '',
            age_as_recorded: r.age,
            case_id: r.case_id || '',
            unit_id: r.unit_id || '',
            district_id: r.district_id || ''
          });
          var existingCS = recordChecksum({
            name_as_recorded: existingRec.name_as_recorded || '',
            age_as_recorded: existingRec.age_as_recorded,
            case_id: existingRec.case_id || '',
            unit_id: existingRec.unit_id || '',
            district_id: existingRec.district_id || ''
          });
          return clusterCS === existingCS;
        });

        if (allChecksumsMatch) {
          unchangedCount++;
          return;
        }
      }

      changedCount++;
      var doc = buildPersonMaster(cluster, {
        person_id: personId,
        confidence_score: clusterConfidence,
        resolution_method: 'phonetic_weighted_score_v1',
        resolved_by: 'sync-incremental-v1',
        resolution_run_id: runId
      });
      rebuiltDocs.push(doc);
      console.log('[incResolve] Rebuilding ' + personId + ' (cluster changed)');
    } else {
      newDocs.push(personId);
      var doc = buildPersonMaster(cluster, {
        person_id: personId,
        confidence_score: clusterConfidence,
        resolution_method: 'phonetic_weighted_score_v1',
        resolved_by: 'sync-incremental-v1',
        resolution_run_id: runId
      });
      rebuiltDocs.push(doc);
      console.log('[incResolve] Creating new doc ' + personId);
    }
  });

  console.log('[incResolve] Clusters mapped: ' + changedCount + ' changed, ' + newDocs.length + ' new, ' + unchangedCount + ' unchanged');
  return { rebuiltDocs: rebuiltDocs, newPersonIds: newDocs, unchangedCount: unchangedCount };
}

/* ------------------------------------------------------------------ */
/*  Step 9 — Find persons sharing cases with affected persons         */
/* ------------------------------------------------------------------ */

function findSharedCasePersons(eventPersonIds, allExistingDocs, affectedCaseIds) {
  var caseSet = {};
  affectedCaseIds.forEach(function (cid) { caseSet[cid] = true; });

  var sharedPersonIds = {};
  allExistingDocs.forEach(function (doc) {
    if (!doc.person_id) return;
    if (eventPersonIds.indexOf(doc.person_id) !== -1) return;

    var sr = parseSourceRecords(doc);
    var hasSharedCase = sr.some(function (r) {
      return r.case_id && caseSet[r.case_id];
    });

    if (hasSharedCase) {
      sharedPersonIds[doc.person_id] = true;
    }
  });

  return Object.keys(sharedPersonIds);
}

/* ------------------------------------------------------------------ */
/*  Persist — NoSQL upsert for full docs                              */
/* ------------------------------------------------------------------ */

async function upsertPersonMaster(appInstance, doc) {
  var noSql = appInstance.nosql();
  var table = await noSql.getTable(PM_TABLE_NAME);
  var { NoSQLItem, NoSQLEnum, NoSQLMarshall } = require('zcatalyst-sdk-node/lib/no-sql');
  var { NoSQLUpdateOperationType } = NoSQLEnum;

  var insertBody = {
    item: NoSQLItem.from(doc)
  };

  try {
    await table.insertItems(insertBody);
    return { action: 'created' };
  } catch (insertErr) {
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
          console.error('[incResolve] Error writing ' + doc.person_id + ': ' + err.message);
        });
    });
    await Promise.all(batchPromises);
    console.log('[incResolve] Persist batch ' + Math.floor(di / BATCH_SIZE + 1) + ' done (' + batch.length + ' docs, ' + created + ' created, ' + updated + ' updated)');
  }

  return { created: created, updated: updated };
}

/* ------------------------------------------------------------------ */
/*  Persist — NoSQL edge-only update                                  */
/* ------------------------------------------------------------------ */

async function updateDocumentEdges(appInstance, personId, edges, edgeField) {
  var noSql = appInstance.nosql();
  var table = await noSql.getTable(PM_TABLE_NAME);
  var { NoSQLItem, NoSQLEnum, NoSQLMarshall } = require('zcatalyst-sdk-node/lib/no-sql');
  var { NoSQLUpdateOperationType } = NoSQLEnum;

  try {
    var updateBody = {
      keys: NoSQLItem.from({ type: 'PM', person_id: personId }),
      update_attributes: [{
        operation_type: NoSQLUpdateOperationType.PUT,
        update_value: NoSQLMarshall.make(edges),
        attribute_path: [edgeField]
      }]
    };
    await table.updateItems(updateBody);
    return true;
  } catch (err) {
    console.error('[incResolve] Edge update failed for ' + personId + ': ' + err.message);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                  */
/* ------------------------------------------------------------------ */

async function incrementalResolve(appInstance, changeResult, options) {
  var runId = (options && options.runId) || 'REC-' + Date.now().toString(36).toUpperCase();
  var t0 = Date.now();

  console.log('[incResolve] === Incremental Resolution [' + runId + '] ===');

  /* ---- Step 1: Load existing PersonMaster documents ---- */
  var existingDocs = await loadExistingPMDocs(appInstance);
  var existingDocMap = {};
  existingDocs.forEach(function (d) { existingDocMap[d.person_id] = d; });
  var existingRecordsIndex = buildSourceToPersonIndex(existingDocs);
  console.log('[incResolve] Existing documents: ' + existingDocs.length + ', indexed records: ' + Object.keys(existingRecordsIndex).length);

  /* ---- Step 2: Build affected-case scope ---- */
  var affectedCaseIds = buildAffectedCaseScope(changeResult, existingDocMap);
  console.log('[incResolve] Affected case IDs: ' + affectedCaseIds.length);

  /* ---- Step 3: Load affected source records ---- */
  var affectedRecords = await loadAffectedSourceRecords(appInstance, affectedCaseIds);

  /* ---- Step 4: Normalise + phoneticize + entity matching ---- */
  normaliseAndPhoneticize(affectedRecords);
  var { clusters, matchedPairs } = runEntityMatching(affectedRecords);

  /* ---- Separate CONFIRMED and UNCONFIRMED pairs ---- */
  var confirmedPairs = matchedPairs.filter(function (p) { return p.classification === CONFIRMED; });
  var unconfirmedPairs = matchedPairs.filter(function (p) { return p.classification === UNCONFIRMED; });

  /* ---- Step 5: Map clusters to PersonMaster docs ---- */
  var mapped = mapClustersToDocs(clusters, existingDocMap, existingRecordsIndex, [], runId);

  /* ---- Step 6: Handle orphaned records ---- */
  var orphans = handleOrphanedRecords(changeResult.orphaned_records || [], existingDocMap);

  /* ---- Step 7-8: Merge orphan-handled docs into rebuilt docs ---- */
  var allAffectedDocs = mapped.rebuiltDocs.slice();

  var orphanHandledDocList = [];
  Object.keys(orphans.orphanHandledDocs).forEach(function (pid) {
    var doc = orphans.orphanHandledDocs[pid];
    /* Check if this doc was also rebuilt via entity matching;
     * if so, the rebuilt version takes precedence */
    var alreadyRebuilt = allAffectedDocs.some(function (d) { return d.person_id === pid; });
    if (!alreadyRebuilt) {
      orphanHandledDocList.push(doc);
    }
  });
  allAffectedDocs = allAffectedDocs.concat(orphanHandledDocList);

  var totalRebuilt = mapped.rebuiltDocs.length;
  var totalNew = mapped.newPersonIds.length;
  var deletedPersonIds = orphans.deletionPersonIds;

  console.log('[incResolve] Documents to persist: ' + allAffectedDocs.length + ' rebuilt/new, ' + deletedPersonIds.length + ' to delete');

  /* ---- Step 9: Regenerate edges ---- */

  /* Collect all persons who need edge updates:
   * changed persons + new persons + persons sharing cases with them */
  var directlyAffectedPids = (changeResult.changed_person_ids || []).concat(mapped.newPersonIds);

  /* Remove deleted persons from the directly-affected list */
  var deletedSet = {};
  deletedPersonIds.forEach(function (pid) { deletedSet[pid] = true; });
  directlyAffectedPids = directlyAffectedPids.filter(function (pid) { return !deletedSet[pid]; });

  var sharedCasePersonIds = findSharedCasePersons(directlyAffectedPids, existingDocs, affectedCaseIds);

  var edgeScopePersonIds = {};
  directlyAffectedPids.forEach(function (pid) { edgeScopePersonIds[pid] = true; });
  sharedCasePersonIds.forEach(function (pid) { edgeScopePersonIds[pid] = true; });

  var edgeScopePersonsList = Object.keys(edgeScopePersonIds);
  console.log('[incResolve] Edge regeneration scope: ' + edgeScopePersonsList.length + ' persons');

  /* Collect all docs for edge regeneration: rebuilt + existing shared-case */
  var edgeDocs = [];
  var edgeDocMap = {};

  allAffectedDocs.forEach(function (doc) {
    if (doc.person_id && !deletedSet[doc.person_id]) {
      edgeDocs.push(doc);
      edgeDocMap[doc.person_id] = doc;
    }
  });

  sharedCasePersonIds.forEach(function (pid) {
    if (!edgeDocMap[pid] && existingDocMap[pid]) {
      edgeDocs.push(existingDocMap[pid]);
      edgeDocMap[pid] = existingDocMap[pid];
    }
  });

  /* Fix orphan-handled docs that weren't in allAffectedDocs */
  Object.keys(orphans.orphanHandledDocs).forEach(function (pid) {
    if (!edgeDocMap[pid] && !deletedSet[pid]) {
      edgeDocs.push(orphans.orphanHandledDocs[pid]);
      edgeDocMap[pid] = orphans.orphanHandledDocs[pid];
    }
  });

  /* Ensure all edge docs have parsed source_records (not JSON strings) */
  edgeDocs.forEach(function (doc) {
    if (typeof doc.source_records === 'string') {
      try {
        doc.source_records = JSON.parse(doc.source_records);
      } catch (e) {
        doc.source_records = [];
      }
    }
  });

  /* Generate edges */
  var edgeResult = generateConfirmedEdges(edgeDocs);
  var confirmedEdgesByPerson = edgeResult.confirmed_edges_by_person;
  var allConfirmedEdges = edgeResult.all_confirmed_edges;

  /* Merge edges into each doc */
  var docsWithEdgeChanges = [];
  edgeDocs.forEach(function (doc) {
    if (!doc.person_id || deletedSet[doc.person_id]) return;
    var personEdges = confirmedEdgesByPerson[doc.person_id] || [];
    var mergeResult = mergeEdgesIntoDocument(doc, personEdges, 'confirmed_edges');
    doc.confirmed_edges = mergeResult.merged;
    if (mergeResult.added > 0) {
      docsWithEdgeChanges.push(doc.person_id);
    }
  });

  /* ---- Generate unconfirmed edges ---- */
  var personIdLookup = function (sourceTable, sourceId) {
    var key = sourceTable + ':' + sourceId;
    return existingRecordsIndex[key] || null;
  };
  var candidateResult = generateCandidateMatchEdges(unconfirmedPairs, personIdLookup);
  var unconfirmedEdgesByPerson = candidateResult.unconfirmed_edges_by_person;

  edgeDocs.forEach(function (doc) {
    if (!doc.person_id || deletedSet[doc.person_id]) return;
    var personEdges = unconfirmedEdgesByPerson[doc.person_id] || [];
    var mergeResult = mergeEdgesIntoDocument(doc, personEdges, 'unconfirmed_edges');
    doc.unconfirmed_edges = mergeResult.merged;
  });

  /* ---- Step 10: Persist ---- */

  /* Persist full documents for rebuilt/changed */
  var persistResult = await persistDocuments(appInstance, allAffectedDocs);

  /* Persist edge-only updates for shared-case docs that weren't rebuilt */
  var edgeOnlyUpdated = 0;
  var confirmedEdgesWritten = 0;
  var unconfirmedEdgesWritten = 0;

  for (var ei = 0; ei < edgeDocs.length; ei++) {
    var doc = edgeDocs[ei];
    if (!doc.person_id || deletedSet[doc.person_id]) continue;

    var alreadyPersisted = allAffectedDocs.some(function (d) { return d.person_id === doc.person_id; });
    if (alreadyPersisted) {
      /* Count edges already included in full persist */
      confirmedEdgesWritten += (doc.confirmed_edges || []).length;
      unconfirmedEdgesWritten += (doc.unconfirmed_edges || []).length;
      continue;
    }

    /* Edge-only update for shared-case docs */
    var confirmedOk = await updateDocumentEdges(appInstance, doc.person_id, doc.confirmed_edges || [], 'confirmed_edges');
    var unconfirmedOk = await updateDocumentEdges(appInstance, doc.person_id, doc.unconfirmed_edges || [], 'unconfirmed_edges');

    if (confirmedOk) {
      edgeOnlyUpdated++;
      confirmedEdgesWritten += (doc.confirmed_edges || []).length;
    }
    if (unconfirmedOk) {
      unconfirmedEdgesWritten += (doc.unconfirmed_edges || []).length;
    }
  }

  var elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  console.log('[incResolve] === Incremental Resolution Complete ===');
  console.log('[incResolve] Rebuilt: ' + persistResult.created + ' new, ' + persistResult.updated + ' updated, ' +
    edgeOnlyUpdated + ' edge-only, ' + deletedPersonIds.length + ' deleted (' + elapsed + 's)');

  return {
    run_id: runId,
    documents_rebuilt: persistResult.updated,
    documents_edge_only: edgeOnlyUpdated,
    documents_deleted: deletedPersonIds.length,
    new_documents: persistResult.created,
    confirmed_edges_written: confirmedEdgesWritten,
    unconfirmed_edges_written: unconfirmedEdgesWritten,
    persons_processed: edgeScopePersonsList.length,
    elapsed_seconds: Number(elapsed),
    status: 'SUCCESS'
  };
}

module.exports = {
  incrementalResolve: incrementalResolve,
  deterministicPersonId: deterministicPersonId
};
