'use strict';
var express = require('express');
var helmet = require('helmet');
var catalyst = require('zcatalyst-sdk-node');
var app = express();
app.use(helmet());
app.use(express.json({ limit: '5mb' }));

var PM_TABLE = 'PersonMaster';
var BATCH_SIZE = 75;

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
  var noSql = appInstance.nosql();
  var table = await noSql.getTable(PM_TABLE);
  var allDocs = [];
  var nextToken = null;

  for (var iter = 0; iter < 20; iter++) {
    var queryParams = {
      key_condition: {
        attribute: ['type'],
        operator: NoSQLEnum.NoSQLOperator.EQUALS,
        value: NoSQLMarshall.makeString('PM')
      },
      limit: 1000
    };
    if (nextToken) {
      queryParams.next_token = nextToken;
    }
    var result = await table.queryTable(queryParams);
    var docs = parseResponse(result);
    allDocs = allDocs.concat(docs);
    try {
      nextToken = result.getNextToken();
    } catch (e) {
      nextToken = null;
    }
    if (!nextToken || docs.length === 0) break;
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

async function updateDocument(appInstance, doc) {
  var { NoSQLItem, NoSQLEnum, NoSQLMarshall } = require('zcatalyst-sdk-node/lib/no-sql');
  var { NoSQLUpdateOperationType } = NoSQLEnum;
  var noSql = appInstance.nosql();
  var table = await noSql.getTable(PM_TABLE);

  var updateBody = {
    keys: NoSQLItem.from({ type: 'PM', person_id: doc.person_id }),
    update_attributes: [{
      operation_type: NoSQLUpdateOperationType.PUT,
      update_value: NoSQLMarshall.make(doc),
      attribute_path: []
    }]
  };

  await table.updateItems(updateBody);
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
      var batchPromises = batch.map(async function (doc) {
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
            return { status: 'migrated', person_id: doc.person_id };
          } else {
            return { status: 'skipped', person_id: doc.person_id };
          }
        } catch (err) {
          return { status: 'error', person_id: doc.person_id, error: err.message };
        }
      });

      var batchResults = await Promise.all(batchPromises);
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

app.get('/', function (req, res) {
  res.status(200).json({ status: 'ok', service: 'pm-migration', description: 'PersonMaster schema migration tool (Phase 4.6)' });
});

module.exports = app;
