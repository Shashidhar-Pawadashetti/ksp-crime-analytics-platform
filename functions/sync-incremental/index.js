'use strict';

/*
 * sync-incremental — Incremental Synchronisation — Change Detection
 *
 * Phase 4.2.3 Milestone 1.
 *
 * Detects which PersonMaster documents need re-resolution based on
 * changes in the underlying Data Store records via checksum comparison.
 *
 * Pipeline:
 *   Load Existing PersonMaster Documents  →  Load Current Source Records
 *   →  Build Indexes  →  Compare Checksums  →  Report Changes
 */

var express = require('express');
var helmet = require('helmet');
var catalyst = require('zcatalyst-sdk-node');

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

var GENDER_MAP = { '1': 'M', '2': 'F', '3': 'O' };
var PAGE_SIZE = 1000;

/* ------------------------------------------------------------------ */
/*  Express setup                                                     */
/* ------------------------------------------------------------------ */

var app = express();
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

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

/**
 * Load all person-source records from Accused, Victim, and
 * ComplainantDetails, enriched with CaseMaster and Unit context.
 */
async function loadSourceRecords(appInstance) {
  console.log('[sync] Loading source records from Data Store...');
  var allRecords = [];
  var errors = [];

  var personSQL = [
    'SELECT a.ROWID, a.AccusedMasterID, a.CaseMasterID, a.AccusedName, a.AgeYear, a.GenderID,',
    'cm.IncidentFromDate, cm.PoliceStationID, cm.Latitude, cm.Longitude,',
    'u.DistrictID',
    'FROM #TABLE# a',
    'INNER JOIN CaseMaster cm ON a.CaseMasterID = cm.ROWID',
    'INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID'
  ].join(' ');

  /* ---- Accused --------------------------------------------------- */
  try {
    var accusedSQL = personSQL.replace('#TABLE#', 'Accused');
    var accusedRows = await queryAllZCQL(appInstance, accusedSQL, 1000);
    mapSourceRows(accusedRows, 'Accused', 'AccusedMasterID', 'AccusedName', 'A-', allRecords);
    console.log('[sync] Accused: ' + accusedRows.length + ' records');
  } catch (err) {
    errors.push('Accused: ' + err.message);
    console.error('[sync] Accused query failed: ' + err.message);
  }

  /* ---- Victim ---------------------------------------------------- */
  try {
    var victimSQL = personSQL.replace('#TABLE#', 'Victim');
    var victimRows = await queryAllZCQL(appInstance, victimSQL, 1000);
    mapSourceRows(victimRows, 'Victim', 'VictimMasterID', 'VictimName', 'V-', allRecords);
    console.log('[sync] Victim: ' + victimRows.length + ' records');
  } catch (err) {
    errors.push('Victim: ' + err.message);
    console.error('[sync] Victim query failed: ' + err.message);
  }

  /* ---- ComplainantDetails ---------------------------------------- */
  try {
    var compSQL = personSQL.replace('#TABLE#', 'ComplainantDetails');
    var compRows = await queryAllZCQL(appInstance, compSQL, 1000);
    mapSourceRows(compRows, 'ComplainantDetails', 'ComplainantID', 'ComplainantName', 'C-', allRecords);
    console.log('[sync] ComplainantDetails: ' + compRows.length + ' records');
  } catch (err) {
    errors.push('ComplainantDetails: ' + err.message);
    console.error('[sync] ComplainantDetails query failed: ' + err.message);
  }

  console.log('[sync] Total source records: ' + allRecords.length);
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
/*  Checksum computation                                              */
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
/*  PersonMaster loading                                              */
/* ------------------------------------------------------------------ */

async function loadPersonMasterDocuments(appInstance) {
  console.log('[sync] Loading existing PersonMaster documents...');
  var sql = 'SELECT * FROM PersonMaster';
  var rows = await queryAllZCQL(appInstance, sql, 1000);

  var docs = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.person_id) {
      docs.push(r);
    }
  }

  console.log('[sync] Loaded ' + docs.length + ' PersonMaster documents');
  return docs;
}

/* ------------------------------------------------------------------ */
/*  Parse source_records from a PersonMaster row                      */
/* ------------------------------------------------------------------ */

function parseSourceRecords(row) {
  var sr = row.source_records;
  if (!sr) return [];
  if (Array.isArray(sr)) return sr;
  if (typeof sr === 'string') {
    try {
      return JSON.parse(sr);
    } catch (e) {
      console.error('[sync] Failed to parse source_records JSON: ' + e.message);
      return [];
    }
  }
  return [];
}

/* ------------------------------------------------------------------ */
/*  Index builders                                                    */
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

function buildCurrentRecordsIndex(records) {
  var index = {};
  for (var ri = 0; ri < records.length; ri++) {
    var rec = records[ri];
    var key = rec.source_table + ':' + rec.source_id;
    index[key] = rec;
  }
  return index;
}

/* ------------------------------------------------------------------ */
/*  Change detection                                                  */
/* ------------------------------------------------------------------ */

async function detectChanges(appInstance) {
  var t0 = Date.now();
  console.log('[sync] === Change Detection Run ===');

  /* Step 1: Load existing PersonMaster documents */
  var docs = await loadPersonMasterDocuments(appInstance);
  console.log('[sync] Existing documents: ' + docs.length);

  /* Step 2: Build source_to_person index */
  var sourceToPerson = buildSourceToPersonIndex(docs);
  console.log('[sync] Source-to-person mappings: ' + Object.keys(sourceToPerson).length);

  /* Step 3: Load current source records */
  var loadResult = await loadSourceRecords(appInstance);
  var records = loadResult.records;
  var loadErrors = loadResult.errors;
  console.log('[sync] Current source records: ' + records.length);

  /* Step 4: Build current records index */
  var currentRecordsIndex = buildCurrentRecordsIndex(records);
  console.log('[sync] Current records indexed: ' + Object.keys(currentRecordsIndex).length);

  /* Step 5-6: Detect changes per PersonMaster document */
  var changedPersonIds = [];
  var unchangedPersonIds = [];
  var orphanedRecords = [];

  for (var di = 0; di < docs.length; di++) {
    var doc = docs[di];
    var sourceRecords = parseSourceRecords(doc);

    if (sourceRecords.length === 0) {
      unchangedPersonIds.push(doc.person_id);
      continue;
    }

    var hasChanged = false;

    for (var si = 0; si < sourceRecords.length; si++) {
      var sr = sourceRecords[si];
      var key = (sr.table || '') + ':' + (sr.row_id || '');

      if (key === ':') continue;

      var currentRec = currentRecordsIndex[key];

      if (!currentRec) {
        /* Orphaned — record in PersonMaster but not in Data Store */
        hasChanged = true;
        orphanedRecords.push({
          person_id: doc.person_id,
          source_table: sr.table || '',
          source_id: sr.row_id || '',
          name: sr.name_as_recorded || '',
          age: sr.age_as_recorded != null ? sr.age_as_recorded : null,
          case_id: sr.case_id || '',
          unit_id: sr.unit_id || '',
          district_id: sr.district_id || ''
        });
        continue;
      }

      /* Compute stored checksum from PersonMaster source_record */
      var storedChecksum = recordChecksum({
        name_as_recorded: sr.name_as_recorded || '',
        age_as_recorded: sr.age_as_recorded,
        case_id: sr.case_id || '',
        unit_id: sr.unit_id || '',
        district_id: sr.district_id || ''
      });

      /* Compute current checksum from Data Store record */
      var currentChecksum = recordChecksum({
        name: currentRec.name || '',
        age: currentRec.age,
        case_id: currentRec.case_id || '',
        unit_id: currentRec.unit_id || '',
        district_id: currentRec.district_id || ''
      });

      if (storedChecksum !== currentChecksum) {
        hasChanged = true;
      }
    }

    if (hasChanged) {
      changedPersonIds.push(doc.person_id);
    } else {
      unchangedPersonIds.push(doc.person_id);
    }
  }

  /* Step 7: Detect new records */
  var newRecords = [];
  for (var ri = 0; ri < records.length; ri++) {
    var rec = records[ri];
    var recKey = rec.source_table + ':' + rec.source_id;
    if (!sourceToPerson[recKey]) {
      newRecords.push({
        source_table: rec.source_table,
        source_id: rec.source_id,
        name: rec.name,
        age: rec.age,
        case_id: rec.case_id,
        unit_id: rec.unit_id,
        district_id: rec.district_id,
        gender: rec.gender,
        date_of_offence: rec.date_of_offence
      });
    }
  }

  /* Step 8: Build result */
  var runId = 'CHG-' + Date.now().toString(36).toUpperCase();
  var timestamp = new Date().toISOString();
  var elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  console.log('[sync] === Change Detection Complete ===');
  console.log('[sync] Changed: ' + changedPersonIds.length +
    ', Unchanged: ' + unchangedPersonIds.length +
    ', New: ' + newRecords.length +
    ', Orphaned: ' + orphanedRecords.length +
    ' (' + elapsed + 's)');

  return {
    run_id: runId,
    timestamp: timestamp,
    stats: {
      existing_documents: docs.length,
      current_source_records: records.length,
      changed_documents: changedPersonIds.length,
      unchanged_documents: unchangedPersonIds.length,
      new_records: newRecords.length,
      orphaned_records: orphanedRecords.length
    },
    changed_person_ids: changedPersonIds,
    unchanged_person_ids: unchangedPersonIds,
    new_records: newRecords,
    orphaned_records: orphanedRecords,
    load_errors: loadErrors
  };
}

/* ------------------------------------------------------------------ */
/*  HTTP handlers                                                     */
/* ------------------------------------------------------------------ */

/* POST /detect — run change detection */
app.post('/detect', async function (req, res) {
  var appInstance;
  try {
    appInstance = catalyst.initializeApp(req);
  } catch (e) {
    res.status(500).json({
      status: 'error',
      error_code: 'INIT_FAILED',
      message: 'Failed to initialize Catalyst app'
    });
    return;
  }

  try {
    var result = await detectChanges(appInstance);
    res.status(200).json({ status: 'ok', data: result });
  } catch (err) {
    console.error('[sync] Fatal error: ' + err.message);
    res.status(500).json({
      status: 'error',
      error_code: 'DETECTION_FAILED',
      message: err.message
    });
  }
});

/* GET / — health check */
app.get('/', function (req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'sync-incremental',
    phase: '4.2.3',
    message: 'Change Detection'
  });
});

/* Global error handler */
app.use(function (err, req, res, next) {
  console.error('[sync] Unhandled error: ' + err.message);
  res.status(500).json({
    status: 'error',
    error_code: 'INTERNAL_ERROR',
    message: err.message
  });
});

/* ------------------------------------------------------------------ */
/*  Incremental Reconciliation — Phase 4.2.3 Milestone 2               */
/* ------------------------------------------------------------------ */

/* Load lazily to avoid circular dependency with incrementalResolver */
var incrementalResolve = null;

function getIncrementalResolver() {
  if (!incrementalResolve) {
    incrementalResolve = require('./incrementalResolver').incrementalResolve;
  }
  return incrementalResolve;
}

/* POST /reconcile — detect + resolve in one call */
app.post('/reconcile', async function (req, res) {
  var appInstance;
  try {
    appInstance = catalyst.initializeApp(req);
  } catch (e) {
    res.status(500).json({
      status: 'error',
      error_code: 'INIT_FAILED',
      message: 'Failed to initialize Catalyst app'
    });
    return;
  }

  try {
    var runId = 'REC-' + Date.now().toString(36).toUpperCase();
    console.log('[sync] === Reconcile Run [' + runId + '] ===');

    /* Step 1: Run change detection */
    var changeResult = await detectChanges(appInstance);

    /* Step 2: Run incremental resolution */
    var resolveFn = getIncrementalResolver();
    var resolveResult = await resolveFn(appInstance, changeResult, { runId: runId });

    /* Step 3: Return combined result */
    res.status(200).json({ status: 'ok', data: { detection: changeResult, resolution: resolveResult } });
  } catch (err) {
    console.error('[sync] Reconcile failed: ' + err.message);
    res.status(500).json({
      status: 'error',
      error_code: 'RECONCILE_FAILED',
      message: err.message
    });
  }
});

/* ------------------------------------------------------------------ */
/*  Export                                                            */
/* ------------------------------------------------------------------ */

/* -- Catalyst AdvancedIO Function entry point -- */
var handler = function (req, res) {
  app(req, res);
};

/* -- Export internals for testing and Phase 4.3 reuse -- */
handler.detectChanges = detectChanges;
handler.recordChecksum = recordChecksum;
handler.loadSourceRecords = loadSourceRecords;
handler.queryZCQL = queryZCQL;
handler.queryAllZCQL = queryAllZCQL;
handler.parseSourceRecords = parseSourceRecords;
handler.buildSourceToPersonIndex = buildSourceToPersonIndex;
handler.buildCurrentRecordsIndex = buildCurrentRecordsIndex;
handler.loadPersonMasterDocuments = loadPersonMasterDocuments;
handler.mapSourceRows = mapSourceRows;
handler.incrementalResolve = getIncrementalResolver;

module.exports = handler;
