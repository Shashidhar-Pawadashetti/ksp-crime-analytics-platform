'use strict';
var express = require('express');
var helmet = require('helmet');
var catalyst = require('zcatalyst-sdk-node');
var app = express();
app.use(helmet());
app.use(express.json({ limit: '5mb' }));

var PM_TABLE = 'PersonMaster';
var BATCH_SIZE = 10;
var CANDIDATE_EDGE_TYPE = 'candidate_match';

function getAppInstance(req) {
  try { return catalyst.initialize(req); }
  catch (e) { return null; }
}

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

async function loadAllDocuments(appInstance) {
  var { NoSQLEnum, NoSQLMarshall } = require('zcatalyst-sdk-node/lib/no-sql');
  var { NoSQLOperator } = NoSQLEnum;
  var noSql = appInstance.nosql();
  var table = await noSql.getTable(PM_TABLE);
  var allDocs = [];
  var startKey = null;

  while (true) {
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
    var result = await table.queryTable(queryParams);
    var docs = parseResponse(result);
    allDocs = allDocs.concat(docs);
    startKey = result.start_key;
    if (!startKey) break;
  }

  return allDocs;
}

function migrateV1toV2(doc) {
  var changed = false;

  if (!doc.schema_version || doc.schema_version < 2) {
    doc.schema_version = 2;
    changed = true;
  }

  if (!doc.roles_summary || typeof doc.roles_summary !== 'object') {
    doc.roles_summary = {
      accused_count: 0,
      victim_count: 0,
      complainant_count: 0,
      total_case_appearances: (doc.source_records || []).length,
      first_appearance: null,
      last_appearance: null,
      last_arrest_date: null
    };
    changed = true;
  } else {
    if (doc.roles_summary.accused_count == null) { doc.roles_summary.accused_count = 0; changed = true; }
    if (doc.roles_summary.victim_count == null) { doc.roles_summary.victim_count = 0; changed = true; }
    if (doc.roles_summary.complainant_count == null) { doc.roles_summary.complainant_count = 0; changed = true; }
    if (doc.roles_summary.total_case_appearances == null) {
      doc.roles_summary.total_case_appearances = (doc.source_records || []).length;
      changed = true;
    }
  }

  if (!doc.flags || typeof doc.flags !== 'object') {
    doc.flags = {
      repeat_offender: (doc.roles_summary && doc.roles_summary.accused_count >= 2) || false,
      supervisor_review_pending: false
    };
    changed = true;
  } else {
    if (doc.flags.repeat_offender == null) {
      doc.flags.repeat_offender = (doc.roles_summary && doc.roles_summary.accused_count >= 2) || false;
      changed = true;
    }
    if (doc.flags.supervisor_review_pending == null) {
      doc.flags.supervisor_review_pending = false;
      changed = true;
    }
  }

  return changed;
}

function migrateV2toV3(doc) {
  var changed = false;

  if (!doc.schema_version || doc.schema_version < 3) {
    doc.schema_version = 3;
    changed = true;
  }

  if (!doc.last_synced_at) {
    doc.last_synced_at = new Date().toISOString();
    changed = true;
  }

  if (!doc.name_variants || !Array.isArray(doc.name_variants) || doc.name_variants.length === 0) {
    if (doc.name_normalised) {
      doc.name_variants = [doc.name_normalised];
      changed = true;
    }
  } else {
    var seen = {};
    var canonical = [];
    doc.name_variants.forEach(function (nv) {
      if (nv && !seen[nv]) {
        seen[nv] = true;
        canonical.push(nv);
      }
    });
    if (canonical.length !== doc.name_variants.length) {
      doc.name_variants = canonical;
      changed = true;
    }
  }

  if (!doc.meta) {
    doc.meta = {
      created_at: new Date().toISOString(),
      last_resolved_at: new Date().toISOString(),
      resolved_by: 'pm-migration-v2tov3'
    };
    changed = true;
  } else {
    if (!doc.meta.created_at) { doc.meta.created_at = new Date().toISOString(); changed = true; }
    if (!doc.meta.last_resolved_at) { doc.meta.last_resolved_at = new Date().toISOString(); changed = true; }
  }

  return changed;
}

/* ------------------------------------------------------------------ */
/*  Candidate Edge Legacy Migration (Phase 4.7)                       */
/* ------------------------------------------------------------------ */

function isLegacyCandidateEdge(edge) {
  return edge && edge.with_person_id != null && !edge.edge_type && !edge.type;
}

function isCanonicalCandidateEdge(edge) {
  return edge && edge.edge_type != null && edge.target_person_id != null;
}

function isSemiCanonicalEdge(edge) {
  return edge && edge.with_person_id != null && edge.type != null && !edge.edge_type;
}

function generateEdgeId(personIdA, personIdB, edgeType, caseIds) {
  var ids = [personIdA, personIdB].sort();
  var parts = [ids[0], ids[1], edgeType];
  if (Array.isArray(caseIds) && caseIds.length > 0) {
    parts.push(caseIds.slice().sort().join('|'));
  }
  var seed = parts.join('|');
  var hash = 0xCBF29CE484222325;
  for (var i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x100000001B3);
    hash = hash >>> 0;
  }
  return 'E-' + hash.toString(16).padStart(12, '0').slice(0, 8).toUpperCase();
}

function convertLegacyEdge(edge, personId) {
  var targetPersonId = edge.with_person_id;
  var edgeId = generateEdgeId(personId, targetPersonId, CANDIDATE_EDGE_TYPE);
  var confidence = edge.confidence != null ? edge.confidence : 0.5;
  var now = new Date().toISOString();

  return {
    edge_id: edgeId,
    edge_type: CANDIDATE_EDGE_TYPE,
    target_person_id: targetPersonId,
    confidence: confidence,
    evidence: [{
      type: 'MATCH_SCORE',
      confidence: confidence,
      score_breakdown: edge.score_breakdown || {},
      weight: 1
    }],
    case_ids: edge.case_ids || [],
    created_at: now,
    version: 1
  };
}

function convertSemiCanonicalEdge(edge, personId) {
  var targetPersonId = edge.with_person_id;
  var edgeId = edge.edge_id || generateEdgeId(personId, targetPersonId, CANDIDATE_EDGE_TYPE);
  var confidence = edge.confidence != null ? edge.confidence : 0.5;
  var now = new Date().toISOString();

  var evidence = edge.evidence;
  if (!evidence || !Array.isArray(evidence) || evidence.length === 0) {
    evidence = [{
      type: 'MATCH_SCORE',
      confidence: confidence,
      score_breakdown: edge.score_breakdown || {},
      weight: 1
    }];
  }

  return {
    edge_id: edgeId,
    edge_type: CANDIDATE_EDGE_TYPE,
    target_person_id: targetPersonId,
    confidence: confidence,
    evidence: evidence,
    case_ids: edge.case_ids || [],
    created_at: edge.created_at || now,
    version: edge.version || 1
  };
}

async function updateDocument(appInstance, doc) {
  var { NoSQLItem, NoSQLEnum, NoSQLMarshall } = require('zcatalyst-sdk-node/lib/no-sql');
  var { NoSQLUpdateOperationType } = NoSQLEnum;
  var noSql = appInstance.nosql();
  var table = await noSql.getTable(PM_TABLE);

  var insertBody = {
    item: NoSQLItem.from(doc)
  };

  try {
    await table.insertItems(insertBody);
    return;
  } catch (insertErr) {
    console.log('[pm-migration] Document ' + doc.person_id + ' exists, updating...');
    try {
      var updateBody = {
        keys: NoSQLItem.from({ type: 'PM', person_id: doc.person_id }),
        update_attributes: [{
          operation_type: require('zcatalyst-sdk-node/lib/no-sql').NoSQLEnum.NoSQLUpdateOperationType.PUT,
          update_value: require('zcatalyst-sdk-node/lib/no-sql').NoSQLMarshall.make(doc),
          attribute_path: []
        }]
      };
      await table.updateItems(updateBody);
    } catch (updateErr) {
      throw new Error('Update failed for ' + doc.person_id + ': ' + updateErr.message);
    }
  }
}

app.post('/migrate', async function (req, res) {
  var appInstance = getAppInstance(req);
  if (!appInstance) { res.status(500).json({ status: 'error', error_code: 'INIT_FAILED' }); return; }

  var fromVersion = req.body && req.body.from_version ? String(req.body.from_version) : '1';
  var toVersion = req.body && req.body.to_version ? String(req.body.to_version) : '2';

  console.log('[pm-migration] Starting migration v' + fromVersion + ' → v' + toVersion);

  try {
    var documents = await loadAllDocuments(appInstance);
    console.log('[pm-migration] Loaded ' + documents.length + ' documents');

    var migratedCount = 0;
    var skippedCount = 0;
    var errors = [];

    for (var di = 0; di < documents.length; di += BATCH_SIZE) {
      var batch = documents.slice(di, di + BATCH_SIZE);
      var batchResults = [];

      for (var bi = 0; bi < batch.length; bi++) {
        var doc = batch[bi];
        try {
          var currentVersion = String(doc.schema_version || 1);
          var needsMigration = false;
          var migratedDoc = JSON.parse(JSON.stringify(doc));

          if (fromVersion === '1' && (currentVersion === '1' || currentVersion < toVersion)) {
            if (toVersion === '2' || toVersion === '3') {
              needsMigration = migrateV1toV2(migratedDoc) || needsMigration;
            }
          }

          if ((fromVersion === '2' || (fromVersion === '1' && toVersion === '3')) &&
              (String(migratedDoc.schema_version || 1) === '2' || currentVersion === '2')) {
            needsMigration = migrateV2toV3(migratedDoc) || needsMigration;
          }

          if (fromVersion === '2' && toVersion === '3' && currentVersion === '2') {
            needsMigration = migrateV2toV3(migratedDoc) || true;
          }

          if (needsMigration) {
            await updateDocument(appInstance, migratedDoc);
            batchResults.push({ status: 'migrated', person_id: doc.person_id });
          } else {
            batchResults.push({ status: 'skipped', person_id: doc.person_id });
          }
        } catch (err) {
          batchResults.push({ status: 'error', person_id: doc.person_id, error: err.message });
        }
      }
      batchResults.forEach(function (r) {
        if (r.status === 'migrated') migratedCount++;
        else if (r.status === 'skipped') skippedCount++;
        else if (r.status === 'error') errors.push(r);
      });

      console.log('[pm-migration] Batch ' + Math.floor(di / BATCH_SIZE + 1) + ' done (' + batch.length + ' docs, ' + migratedCount + ' migrated)');
    }

    console.log('[pm-migration] Complete — migrated: ' + migratedCount + ', skipped: ' + skippedCount + ', errors: ' + errors.length);

    res.status(200).json({
      status: 'ok',
      data: {
        total_documents: documents.length,
        migrated_count: migratedCount,
        skipped_count: skippedCount,
        error_count: errors.length,
        errors: errors.length > 0 ? errors.slice(0, 5) : []
      }
    });
  } catch (err) {
    console.error('[pm-migration] Fatal error: ' + err.message);
    res.status(500).json({
      status: 'error',
      error_code: 'MIGRATION_FAILED',
      message: err.message
    });
  }
});

app.post('/migrate-candidates', async function (req, res) {
  var appInstance = getAppInstance(req);
  if (!appInstance) { res.status(500).json({ status: 'error', error_code: 'INIT_FAILED' }); return; }

  var dryRun = req.body && req.body.dryRun !== false;

  console.log('[pm-migration] Starting candidate edge migration (dryRun=' + dryRun + ')');

  try {
    var documents = await loadAllDocuments(appInstance);
    console.log('[pm-migration] Loaded ' + documents.length + ' documents');

    var docsNeedingMigration = 0;
    var legacyEdgeCount = 0;
    var semiCanonicalCount = 0;
    var canonicalCount = 0;
    var invalidCount = 0;
    var samples = [];
    var errors = [];

    for (var di = 0; di < documents.length; di++) {
      var doc = documents[di];
      var edges = doc.unconfirmed_edges;
      if (!Array.isArray(edges) || edges.length === 0) continue;

      var docChanged = false;
      var convertedEdges = [];

      for (var ei = 0; ei < edges.length; ei++) {
        var edge = edges[ei];

        if (isCanonicalCandidateEdge(edge)) {
          convertedEdges.push(edge);
          canonicalCount++;
          continue;
        }

        if (isLegacyCandidateEdge(edge)) {
          var converted = convertLegacyEdge(edge, doc.person_id);
          convertedEdges.push(converted);
          legacyEdgeCount++;
          docChanged = true;

          if (samples.length < 3 && docsNeedingMigration < 3) {
            samples.push({
              person_id: doc.person_id,
              before: { with_person_id: edge.with_person_id, confidence: edge.confidence, score_breakdown: edge.score_breakdown },
              after: converted
            });
          }
          continue;
        }

        if (isSemiCanonicalEdge(edge)) {
          var converted = convertSemiCanonicalEdge(edge, doc.person_id);
          convertedEdges.push(converted);
          semiCanonicalCount++;
          docChanged = true;

          if (samples.length < 3 && docsNeedingMigration < 3) {
            samples.push({
              person_id: doc.person_id,
              before: { edge_id: edge.edge_id, type: edge.type, with_person_id: edge.with_person_id, confidence: edge.confidence },
              after: converted
            });
          }
          continue;
        }

        invalidCount++;
      }

      if (docChanged) {
        docsNeedingMigration++;

        if (!dryRun) {
          try {
            var updatedDoc = JSON.parse(JSON.stringify(doc));
            updatedDoc.unconfirmed_edges = convertedEdges;
            await updateDocument(appInstance, updatedDoc);
          } catch (err) {
            errors.push({ person_id: doc.person_id, error: err.message });
          }
        }
      }
    }

    var totalConvertible = legacyEdgeCount + semiCanonicalCount;

    console.log('[pm-migration] Complete — scanned: ' + documents.length +
      ', needing migration: ' + docsNeedingMigration +
      ', legacy: ' + legacyEdgeCount +
      ', semi-canonical: ' + semiCanonicalCount +
      ', canonical: ' + canonicalCount +
      ', invalid: ' + invalidCount +
      ', errors: ' + errors.length);

    if (dryRun) {
      res.status(200).json({
        status: 'ok',
        data: {
          mode: 'dry-run',
          documents_scanned: documents.length,
          documents_needing_migration: docsNeedingMigration,
          legacy_edges_found: legacyEdgeCount,
          edges_convertible: totalConvertible,
          already_canonical_edges: canonicalCount,
          invalid_edges: invalidCount,
          semi_canonical_edges_found: semiCanonicalCount,
          duplicate_edges_removed: 0,
          documents_that_would_update: docsNeedingMigration,
          samples: samples
        }
      });
    } else {
      res.status(200).json({
        status: 'ok',
        data: {
          mode: 'apply',
          documents_scanned: documents.length,
          documents_updated: docsNeedingMigration,
          legacy_edges_migrated: legacyEdgeCount,
          semi_canonical_edges_migrated: semiCanonicalCount,
          already_canonical_edges_preserved: canonicalCount,
          invalid_edges_skipped: invalidCount,
          errors: errors
        }
      });
    }
  } catch (err) {
    console.error('[pm-migration] Fatal error: ' + err.message);
    res.status(500).json({
      status: 'error',
      error_code: 'MIGRATION_FAILED',
      message: err.message
    });
  }
});

app.get('/migrate-candidates', async function (req, res) {
  req.body = { dryRun: true };
  app._router.handle(req, res, function () {});
});

app.get('/', function (req, res) {
  res.status(200).json({ status: 'ok', service: 'pm-migration', description: 'PersonMaster schema migration tool (Phase 4.6)' });
});

app.loadAllDocuments = loadAllDocuments;
module.exports = app;
