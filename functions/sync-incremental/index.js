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
var PAGE_SIZE = 300;

var SOURCE_TABLES = [
  { table: 'Accused', idCol: 'AccusedMasterID', nameCol: 'AccusedName', prefix: 'A-' },
  { table: 'Victim', idCol: 'VictimMasterID', nameCol: 'VictimName', prefix: 'V-' },
  { table: 'ComplainantDetails', idCol: 'ComplainantID', nameCol: 'ComplainantName', prefix: 'C-' }
];

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
function buildSourceSQL(cfg) {
  return [
    'SELECT a.ROWID, a.' + cfg.idCol + ', a.CaseMasterID, a.' + cfg.nameCol + ', a.AgeYear, a.GenderID,',
    'cm.IncidentFromDate, cm.PoliceStationID, cm.Latitude, cm.Longitude,',
    'u.DistrictID',
    'FROM ' + cfg.table + ' a',
    'INNER JOIN CaseMaster cm ON a.CaseMasterID = cm.ROWID',
    'INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID'
  ].join(' ');
}

async function loadSourceTable(appInstance, cfg) {
  var sql = buildSourceSQL(cfg);
  var rows = await queryAllZCQL(appInstance, sql, PAGE_SIZE);
  var records = [];
  mapSourceRows(rows, cfg.table, cfg.idCol, cfg.nameCol, cfg.prefix, records);
  return records;
}

async function loadSourceRecords(appInstance) {
  console.log('[sync] Loading source records from Data Store...');
  var allRecords = [];
  var failedTables = [];
  var originalErrors = [];

  for (var ti = 0; ti < SOURCE_TABLES.length; ti++) {
    var cfg = SOURCE_TABLES[ti];
    try {
      var records = await loadSourceTable(appInstance, cfg);
      allRecords = allRecords.concat(records);
    } catch (err) {
      failedTables.push(cfg.table);
      originalErrors.push({ table: cfg.table, message: err.message || String(err) });
    }
  }

  if (failedTables.length > 0) {
    var detail = originalErrors.map(function(e) {
      return e.table + ': ' + e.message;
    }).join('; ');
    throw new Error('SOURCE_LOAD_FAILED: ' + detail);
  }

  if (allRecords.length === 0) {
    throw new Error('EMPTY_SOURCE_DATASET: All source tables returned 0 records');
  }

  console.log('[sync] Total source records: ' + allRecords.length);
  return { records: allRecords, errors: [] };
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
  console.log('[sync] Loading existing PersonMaster documents via NoSQL...');
  var { NoSQLEnum, NoSQLMarshall } = require('zcatalyst-sdk-node/lib/no-sql');
  var { NoSQLOperator } = NoSQLEnum;
  var noSql = appInstance.nosql();
  var table = await noSql.getTable('PersonMaster');
  var allDocs = [];
  var startKey = null;
  var hasMore = true;

  while (hasMore) {
    var queryParams = {
      key_condition: {
        attribute: 'type',
        operator: NoSQLOperator.EQUALS,
        value: NoSQLMarshall.makeString('PM')
      },
      limit: 100,
      consistent_read: true
    };
    if (startKey) {
      queryParams.start_key = startKey;
    }

    var result;
    try {
      result = await table.queryTable(queryParams);
    } catch (e) {
      throw new Error('NoSQL PersonMaster query failed: ' + e.message);
    }

    var items;
    try {
      items = result.getResponseData();
    } catch (e) {
      throw new Error('Failed to parse NoSQL response: ' + e.message);
    }

    if (items && items.length > 0) {
      for (var di = 0; di < items.length; di++) {
        var data = items[di];
        if (data && data.item && typeof data.item.to === 'function') {
          var doc = data.item.to();
          if (doc && doc.person_id) {
            allDocs.push(doc);
          }
        }
      }
    }

    try {
      startKey = result.start_key;
    } catch (e) {
      startKey = null;
    }
    hasMore = (startKey != null) && (items && items.length > 0);
  }

  console.log('[sync] Loaded ' + allDocs.length + ' PersonMaster documents');
  return allDocs;
}

/* ------------------------------------------------------------------ */
/*  Source record parsing diagnostics                                  */
/* ------------------------------------------------------------------ */

var sourceRecordDiagnostics = { total: 0, objects: 0, stringified: 0, parsed: 0, malformed: 0 };

function resetSourceRecordDiagnostics() {
  sourceRecordDiagnostics = { total: 0, objects: 0, stringified: 0, parsed: 0, malformed: 0 };
}

/* ------------------------------------------------------------------ */
/*  Parse source_records from a PersonMaster row                      */
/* ------------------------------------------------------------------ */

function parseSourceRecords(row) {
  var sr = row.source_records;
  if (!sr) return [];
  
  /* Case B: Entire field is a stringified JSON array */
  if (typeof sr === 'string') {
    try {
      var parsed = JSON.parse(sr);
      if (Array.isArray(parsed)) sr = parsed;
      else return [];
    } catch (e) {
      return [];
    }
  }
  
  if (!Array.isArray(sr)) return [];
  
  /* Cases A, C, D: iterate elements, handle objects, strings, and other primitives */
  var records = [];
  
  for (var i = 0; i < sr.length; i++) {
    var item = sr[i];
    sourceRecordDiagnostics.total++;
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      records.push(item);
      sourceRecordDiagnostics.objects++;
    } else if (typeof item === 'string') {
      sourceRecordDiagnostics.stringified++;
      try {
        var obj = JSON.parse(item);
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          records.push(obj);
          sourceRecordDiagnostics.parsed++;
        } else {
          sourceRecordDiagnostics.malformed++;
        }
      } catch (e) {
        sourceRecordDiagnostics.malformed++;
      }
    } else {
      sourceRecordDiagnostics.malformed++;
    }
  }
  
  return records;
}

/* ------------------------------------------------------------------ */
/*  Source Record Identity Helpers                                     */
/* ------------------------------------------------------------------ */

var ROLE_TO_TABLE = {
  'Accused': 'Accused',
  'Victim': 'Victim',
  'Complainant': 'ComplainantDetails',
  'complainant': 'ComplainantDetails',
  'accused': 'Accused',
  'victim': 'Victim'
};

function getSourceRecordId(sr) {
  if (sr.source_id) return sr.source_id;
  if (sr.row_id) return sr.row_id;
  return null;
}

function getSourceRecordTable(sr) {
  if (sr.table) return sr.table;
  if (sr.source_table) return sr.source_table;
  if (sr.role) {
    return ROLE_TO_TABLE[sr.role] || null;
  }
  return null;
}

function buildSourceRecordKey(sr) {
  var table = getSourceRecordTable(sr);
  var id = getSourceRecordId(sr);
  if (!table || !id) return null;
  return table + ':' + id;
}

/* ------------------------------------------------------------------ */
/*  Index builders                                                    */
/* ------------------------------------------------------------------ */

function buildSourceToPersonIndex(docs) {
  var index = {};
  var simpleIndex = {};
  var diag = {
    total_failed: 0, missing_table: 0, missing_source_id: 0,
    missing_both: 0, has_role_no_table: 0, unknown_role: 0, samples: [],
    unique_keys: 0, duplicate_keys: 0, valid_records: 0,
    duplicate_references: 0, same_person_duplicates: 0,
    cross_person_keys: 0, cross_person_duplicates: 0,
    max_persons_per_key: 0, dup_key_count: 0,
    ownership_distribution: { single_person_keys: 0, two_person_keys: 0, multi_person_keys: 0 },
    dup_samples: []
  };

  for (var di = 0; di < docs.length; di++) {
    var doc = docs[di];
    var sourceRecords = parseSourceRecords(doc);
    for (var si = 0; si < sourceRecords.length; si++) {
      var sr = sourceRecords[si];
      var key = buildSourceRecordKey(sr);
      if (key) {
        diag.valid_records++;

        if (!index[key]) {
          index[key] = { persons: {}, count: 0 };
          diag.unique_keys++;
          simpleIndex[key] = doc.person_id;
        }

        index[key].count++;
        var personId = doc.person_id;
        if (!index[key].persons[personId]) {
          index[key].persons[personId] = 0;
        }
        index[key].persons[personId]++;

        if (index[key].count > 1) {
          diag.duplicate_keys++;
          diag.duplicate_references++;
          if (Object.keys(index[key].persons).length === 1) {
            diag.same_person_duplicates++;
          }
        }
      } else {
        diag.total_failed++;
        var tid = getSourceRecordId(sr);
        var tbl = sr.table || sr.source_table || '';
        var roleTbl = sr.role ? (ROLE_TO_TABLE[sr.role] || null) : null;
        if (!tbl && !tid) diag.missing_both++;
        if (!tbl) diag.missing_table++;
        if (!tid) diag.missing_source_id++;
        if (!tbl && sr.role && !roleTbl) diag.unknown_role++;
        if (!tbl && sr.role && roleTbl) diag.has_role_no_table++;
        if (diag.samples.length < 10) {
          diag.samples.push({
            role: sr.role || null,
            table: sr.table || null,
            source_table: sr.source_table || null,
            source_id: sr.source_id || null
          });
        }
      }
    }
  }

  var dupSamples = [];
  var crossPersonKeys = 0;
  var crossPersonDuplicates = 0;
  var maxPersons = 0;
  var singlePerson = 0, twoPerson = 0, multiPerson = 0;
  var dupKeyCount = 0;

  for (var k in index) {
    var entry = index[k];
    var numPersons = Object.keys(entry.persons).length;

    if (numPersons === 1) singlePerson++;
    else if (numPersons === 2) twoPerson++;
    else multiPerson++;

    if (entry.count > 1) dupKeyCount++;

    if (numPersons > 1) {
      crossPersonKeys++;
      crossPersonDuplicates += entry.count;
    }

    if (numPersons > maxPersons) {
      maxPersons = numPersons;
    }

    if (dupSamples.length < 10 && numPersons > 1) {
      dupSamples.push({
        source_key: k,
        person_ids: Object.keys(entry.persons).sort(),
        occurrence_count: entry.count,
        persons_per_key: numPersons
      });
    }
  }

  if (dupSamples.length === 0) {
    for (var k in index) {
      var entry = index[k];
      if (entry.count > 1 && dupSamples.length < 10) {
        dupSamples.push({
          source_key: k,
          person_ids: Object.keys(entry.persons).sort(),
          occurrence_count: entry.count,
          persons_per_key: Object.keys(entry.persons).length
        });
      }
    }
  }

  diag.cross_person_keys = crossPersonKeys;
  diag.cross_person_duplicates = crossPersonDuplicates;
  diag.max_persons_per_key = maxPersons;
  diag.dup_key_count = dupKeyCount;
  diag.ownership_distribution = { single_person_keys: singlePerson, two_person_keys: twoPerson, multi_person_keys: multiPerson };
  diag.dup_samples = dupSamples;

  return { index: simpleIndex, diagnostics: diag };
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

  /* Step 2: Build source_to_person index (track parse diagnostics) */
  resetSourceRecordDiagnostics();
  var buildResult = buildSourceToPersonIndex(docs);
  var sourceToPerson = buildResult.index;
  var sourceToPersonDiag = buildResult.diagnostics;
  var parseDiag = {
    total: sourceRecordDiagnostics.total,
    objects: sourceRecordDiagnostics.objects,
    stringified: sourceRecordDiagnostics.stringified,
    parsed: sourceRecordDiagnostics.parsed,
    malformed: sourceRecordDiagnostics.malformed
  };
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
  resetSourceRecordDiagnostics(); // Reset so comparison loop doesn't double-count
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
      var key = buildSourceRecordKey(sr);
      if (!key) continue;

      var currentRec = currentRecordsIndex[key];

      if (!currentRec) {
        /* Orphaned — record in PersonMaster but not in Data Store */
        hasChanged = true;
        orphanedRecords.push({
          person_id: doc.person_id,
          source_table: sr.table || '',
          source_id: sr.row_id || sr.source_id || '',
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

  /* Step 8: Identity diagnostics */
  var identity_diagnostics = null;
  try {
    var knownPrefixes = { 'A-': true, 'V-': true, 'C-': true };
    var currentCountLogical = 0;
    var currentCountMissing = 0;
    for (var dki = 0; dki < records.length; dki++) {
      var rec_ = records[dki];
      if (rec_.source_id) {
        currentCountLogical++;
      } else {
        currentCountMissing++;
      }
    }
    var currentKeys = Object.keys(currentRecordsIndex).slice(0, 10);
    var existingKeys = Object.keys(sourceToPerson).slice(0, 10);
    var sourceRecordKeysIndexed = Object.keys(sourceToPerson).length;

    /* Current-side key uniqueness */
    var currentKeyCounts = {};
    for (var cri = 0; cri < records.length; cri++) {
      var cr = records[cri];
      var ck = cr.source_table + ':' + cr.source_id;
      if (!currentKeyCounts[ck]) currentKeyCounts[ck] = 0;
      currentKeyCounts[ck]++;
    }
    var currentUniqueKeyCount = Object.keys(currentKeyCounts).length;

    /* Set arithmetic: historical vs current keys */
    var historicalKeys = {};
    for (var hk in sourceToPerson) {
      if (sourceToPerson.hasOwnProperty(hk)) {
        historicalKeys[hk] = true;
      }
    }
    var currentKeySet = {};
    for (var cki in currentKeyCounts) {
      currentKeySet[cki] = true;
    }
    var hMinusC = 0, hIntersectC = 0;
    for (var hk in historicalKeys) {
      if (currentKeySet[hk]) hIntersectC++;
      else hMinusC++;
    }
    var cMinusH = 0;
    for (var ck in currentKeySet) {
      if (!historicalKeys[ck]) cMinusH++;
    }

    identity_diagnostics = {
      /* Current record stats */
      current_total: records.length,
      current_with_source_id: currentCountLogical,
      current_missing_source_id: currentCountMissing,
      current_with_logical_source_id: currentCountLogical,
      current_missing_logical_source_id: currentCountMissing,
      current_sample_keys: currentKeys,
      /* Existing PM source record parse diagnostics */
      existing_indexed_keys: sourceRecordKeysIndexed,
      existing_with_source_id: parseDiag.objects + parseDiag.parsed,
      existing_missing_source_id: parseDiag.malformed,
      existing_sample_keys: existingKeys,
      /* Source record element breakdown */
      source_record_elements_total: parseDiag.total,
      source_record_elements_objects: parseDiag.objects,
      source_record_elements_stringified: parseDiag.stringified,
      source_record_elements_parsed: parseDiag.parsed,
      source_record_elements_malformed: parseDiag.malformed,
      source_record_keys_indexed: sourceRecordKeysIndexed,
      source_record_keys_missing_identity: parseDiag.total - sourceRecordKeysIndexed,
      missing_identity: {
        total_failed: sourceToPersonDiag.total_failed,
        missing_table: sourceToPersonDiag.missing_table,
        missing_source_id: sourceToPersonDiag.missing_source_id,
        missing_both: sourceToPersonDiag.missing_both,
        has_role_no_table: sourceToPersonDiag.has_role_no_table,
        unknown_role: sourceToPersonDiag.unknown_role,
        samples: sourceToPersonDiag.samples
      },
      existing_valid_identity_records: sourceToPersonDiag.valid_records,
      existing_unique_identity_keys: sourceToPersonDiag.unique_keys,
      existing_duplicate_identity_keys: sourceToPersonDiag.duplicate_keys,
      /* Duplicate source key ownership diagnostics */
      duplicate_ownership: {
        total_references: sourceToPersonDiag.valid_records,
        unique_keys: sourceToPersonDiag.unique_keys,
        duplicate_keys: sourceToPersonDiag.dup_key_count || 0,
        duplicate_references_extra: sourceToPersonDiag.duplicate_keys,
        same_person_duplicates: sourceToPersonDiag.same_person_duplicates || 0,
        cross_person_keys: sourceToPersonDiag.cross_person_keys || 0,
        cross_person_duplicates: sourceToPersonDiag.cross_person_duplicates || 0,
        max_persons_per_key: sourceToPersonDiag.max_persons_per_key || 0,
        ownership_distribution: sourceToPersonDiag.ownership_distribution || { single_person_keys: 0, two_person_keys: 0, multi_person_keys: 0 },
        samples: sourceToPersonDiag.dup_samples || []
      },
      /* Current-side uniqueness */
      current_side: {
        total_references: records.length,
        unique_keys: currentUniqueKeyCount,
        duplicate_references_extra: records.length - currentUniqueKeyCount
      },
      /* Set arithmetic: historical vs current */
      set_arithmetic: {
        historical_unique_keys: Object.keys(historicalKeys).length,
        current_unique_keys: Object.keys(currentKeySet).length,
        intersection: hIntersectC,
        historical_minus_current: hMinusC,
        current_minus_historical: cMinusH
      }
    };
  } catch (_de) {
    identity_diagnostics = { error: _de.message };
  }

  /* Step 9: Build result */
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
    load_errors: loadErrors,
    identity_diagnostics: identity_diagnostics
  };
}

/* ------------------------------------------------------------------ */
/*  HTTP handlers                                                     */
/* ------------------------------------------------------------------ */

/* POST /detect — run change detection */
app.post('/detect', async function (req, res) {
  var appInstance = req.catalystApp || catalyst.initialize();
  if (!appInstance) {
    res.status(500).json({
      status: 'error',
      error_code: 'INIT_FAILED',
      message: 'Catalyst app not initialized'
    });
    return;
  }

  try {
    var result = await detectChanges(appInstance);
    res.status(200).json({ status: 'ok', data: result });
  } catch (err) {
    console.error('[sync] Fatal error: ' + err.message);
    var errorCode = 'DETECTION_FAILED';
    if (err.message.indexOf('SOURCE_LOAD_FAILED') !== -1) errorCode = 'SOURCE_LOAD_FAILED';
    else if (err.message.indexOf('EMPTY_SOURCE_DATASET') !== -1) errorCode = 'EMPTY_SOURCE_DATASET';
    res.status(500).json({
      status: 'error',
      error_code: errorCode,
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

var auditLog = require('./__vendored/resolution-audit-log');
var { THRESHOLD } = require('./__vendored/threshold');

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
  var appInstance = req.catalystApp || catalyst.initialize();
  if (!appInstance) {
    res.status(500).json({
      status: 'error',
      error_code: 'INIT_FAILED',
      message: 'Catalyst app not initialized'
    });
    return;
  }

  var runId = 'REC-' + Date.now().toString(36).toUpperCase();
  var t0 = Date.now();
  console.log('[sync] === Reconcile Run [' + runId + '] ===');

  try {
    /* Step 1: Run change detection */
    var changeResult = await detectChanges(appInstance);

    /* Step 2: Run incremental resolution */
    var resolveFn = getIncrementalResolver();
    var resolveResult = await resolveFn(appInstance, changeResult, { runId: runId });

    /* Step 3: Audit log — SUCCESS */
    try {
      await auditLog.createAuditRecord(appInstance, {
        runId: runId,
        runType: 'incremental',
        triggerType: 'api',
        startedAt: new Date(t0).toISOString(),
        completedAt: new Date().toISOString(),
        status: 'SUCCESS',
        thresholdUsed: Number(THRESHOLD),
        documentsCreated: resolveResult.new_documents || 0,
        documentsUpdated: resolveResult.documents_rebuilt || 0,
        personsProcessed: resolveResult.persons_processed || 0,
        confirmedEdgesWritten: resolveResult.confirmed_edges_written || 0,
        unconfirmedEdgesWritten: resolveResult.unconfirmed_edges_written || 0,
        errorCount: (changeResult.load_errors || []).length,
        errorMessage: ''
      });
    } catch (auditErr) {
      console.error('[sync] Audit log write failed: ' + auditErr.message);
    }

    /* Step 4: Return combined result */
    res.status(200).json({ status: 'ok', data: { detection: changeResult, resolution: resolveResult } });
  } catch (err) {
    console.error('[sync] Reconcile failed: ' + err.message);

    /* Audit log — FAILED (never misleading SUCCESS) */
    try {
      await auditLog.createAuditRecord(appInstance, {
        runId: runId,
        runType: 'incremental',
        triggerType: 'api',
        startedAt: new Date(t0).toISOString(),
        completedAt: new Date().toISOString(),
        status: 'FAILED',
        thresholdUsed: Number(THRESHOLD),
        documentsCreated: 0,
        documentsUpdated: 0,
        personsProcessed: 0,
        confirmedEdgesWritten: 0,
        unconfirmedEdgesWritten: 0,
        errorCount: 1,
        errorMessage: err.message
      });
    } catch (auditErr) {
      console.error('[sync] Audit log write failed on error path: ' + auditErr.message);
    }

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
var handler = async function (req, res) {
  var catApp;
  try {
    catApp = catalyst.initialize(req);
  } catch (e) {
    console.error('[sync] catalyst.initialize failed:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'error',
      error_code: 'INIT_FAILED',
      message: 'Failed to initialize Catalyst app'
    }));
    return;
  }
  req.catalystApp = catApp;
  app(req, res);
};

/* -- Export internals for testing and Phase 4.3 reuse -- */
handler.detectChanges = detectChanges;
handler.recordChecksum = recordChecksum;
handler.loadSourceTable = loadSourceTable;
handler.loadSourceRecords = loadSourceRecords;
handler.queryZCQL = queryZCQL;
handler.queryAllZCQL = queryAllZCQL;
handler.parseSourceRecords = parseSourceRecords;
handler.buildSourceToPersonIndex = buildSourceToPersonIndex;
handler.buildCurrentRecordsIndex = buildCurrentRecordsIndex;
handler.loadPersonMasterDocuments = loadPersonMasterDocuments;
handler.mapSourceRows = mapSourceRows;
handler.buildSourceSQL = buildSourceSQL;
handler.SOURCE_TABLES = SOURCE_TABLES;
handler.incrementalResolve = getIncrementalResolver;
handler.getSourceRecordId = getSourceRecordId;
handler.getSourceRecordTable = getSourceRecordTable;
handler.buildSourceRecordKey = buildSourceRecordKey;
handler.ROLE_TO_TABLE = ROLE_TO_TABLE;

module.exports = handler;
