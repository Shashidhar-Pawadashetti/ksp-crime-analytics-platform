'use strict';

var fs = require('fs');
var path = require('path');
var { createBatches, retryWithBackoff } = require('./batch');

var TABLE_NAME = 'PersonMaster';
var BATCH_SIZE = 75;
var MAX_RETRIES = 3;

function buildAdjacency(documents, edges) {
  var adjacencyMap = {};
  for (var di = 0; di < documents.length; di++) {
    adjacencyMap[documents[di].person_id] = {
      co_accused: [],
      accused_to_victim: [],
      shared_location: [],
      unconfirmed_matches: []
    };
  }

  for (var ei = 0; ei < edges.length; ei++) {
    var e = edges[ei];
    var occ = 1;
    if (e.metadata && e.metadata.occurrence_count) occ = e.metadata.occurrence_count;

    var entry = {
      person_id: null,
      edge_id: e.edge_id,
      weight: e.weight,
      occurrence_count: occ
    };

    var typeList = null;
    if (e.edge_type === 'CO_ACCUSED') typeList = 'co_accused';
    else if (e.edge_type === 'ACCUSED_TO_VICTIM') typeList = 'accused_to_victim';
    else if (e.edge_type === 'SHARED_LOCATION') typeList = 'shared_location';
    else if (e.edge_type === 'UNCONFIRMED_MATCH') typeList = 'unconfirmed_matches';

    if (!typeList) continue;

    var entryA = Object.assign({}, entry, { person_id: e.target });
    if (adjacencyMap[e.source]) adjacencyMap[e.source][typeList].push(entryA);

    var entryB = Object.assign({}, entry, { person_id: e.source });
    if (adjacencyMap[e.target]) adjacencyMap[e.target][typeList].push(entryB);
  }

  return adjacencyMap;
}

function attachAdjacency(documents, adjacencyMap) {
  return documents.map(function(doc) {
    var adj = adjacencyMap[doc.person_id] || {
      co_accused: [],
      accused_to_victim: [],
      shared_location: [],
      unconfirmed_matches: []
    };
    return Object.assign({}, doc, { adjacency: adj });
  });
}

function initCatalystLocally() {
  var rcPath = path.resolve(__dirname, '..', '..', '.catalystrc');
  if (!fs.existsSync(rcPath)) return null;
  var rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
  var proj = rc.projects[rc.actives.project - 1];
  var envVar = proj.env[rc.actives.env - 1];
  var projectKey = process.env.CATALYST_PROJECT_KEY;
  if (!projectKey) return null;
  var catalyst = require('zcatalyst-sdk-node');
  return catalyst.initializeApp({
    project_id: proj.id,
    project_key: projectKey,
    environment: envVar.name
  });
}

async function insertBatch(table, batch, stats) {
  var { NoSQLItem } = require('zcatalyst-sdk-node/lib/no-sql');
  var items = batch.map(function(doc) { return { item: NoSQLItem.from(doc) }; });
  await table.insertItems.apply(table, items);
  stats.inserted += batch.length;
}

async function updateBatch(table, batch, stats) {
  var { NoSQLItem, NoSQLMarshall, NoSQLEnum } = require('zcatalyst-sdk-node/lib/no-sql');

  for (var i = 0; i < batch.length; i++) {
    var doc = batch[i];
    try {
      await table.updateItems({
        keys: new NoSQLItem().addString('person_id', doc.person_id),
        update_attributes: [{
          operation_type: NoSQLEnum.NoSQLUpdateOperationType.PUT,
          update_value: NoSQLMarshall.make(doc),
          attribute_path: []
        }]
      });
      stats.updated++;
    } catch (err) {
      stats.failed++;
      console.error('  Failed to update ' + doc.person_id + ': ' + err.message);
    }
  }
}

async function processBatch(table, batch, stats) {
  try {
    await retryWithBackoff(async function() {
      await insertBatch(table, batch, stats);
    }, MAX_RETRIES);
  } catch (err) {
    var errMsg = (err && err.message) || String(err);
    if (errMsg.toLowerCase().indexOf('exist') !== -1 ||
        errMsg.toLowerCase().indexOf('duplicate') !== -1 ||
        errMsg.toLowerCase().indexOf('conflict') !== -1) {
      await updateBatch(table, batch, stats);
    } else {
      console.error('  Batch insert failed: ' + errMsg);
      console.error('  Falling back to individual upserts...');
      for (var bi = 0; bi < batch.length; bi++) {
        try {
          await retryWithBackoff(async function() {
            await insertBatch(table, [batch[bi]], stats);
          }, MAX_RETRIES);
        } catch (indErr) {
          var indMsg = (indErr && indErr.message) || String(indErr);
          if (indMsg.toLowerCase().indexOf('exist') !== -1 ||
              indMsg.toLowerCase().indexOf('duplicate') !== -1 ||
              indMsg.toLowerCase().indexOf('conflict') !== -1) {
            await updateBatch(table, [batch[bi]], stats);
          } else {
            stats.failed++;
            console.error('  Failed to write ' + batch[bi].person_id + ': ' + indMsg);
          }
        }
      }
    }
  }
}

async function writeDocuments(documents, edges, options) {
  var batchSize = (options && options.batchSize) || BATCH_SIZE;
  var dryRun = options && options.dryRun;

  console.log('Building adjacency lists...');
  var adjacencyMap = buildAdjacency(documents, edges);
  var enrichedDocs = attachAdjacency(documents, adjacencyMap);
  console.log('  Enriched ' + enrichedDocs.length + ' documents with adjacency');

  var batches = createBatches(enrichedDocs, batchSize);
  console.log('  Batches: ' + batches.length + ' (batch size: ' + batchSize + ')');

  var stats = { inserted: 0, updated: 0, failed: 0, total_batches: batches.length };

  if (dryRun) {
    console.log('\n  DRY RUN - No Catalyst writes performed');
    stats.inserted = enrichedDocs.length;
    console.log('  Would insert: ' + enrichedDocs.length + ' documents');
    return stats;
  }

  var catalyst = require('zcatalyst-sdk-node');

  var app;
  if (options && options.app) {
    app = options.app;
  } else {
    try {
      app = catalyst.app();
    } catch (e) {
      app = initCatalystLocally();
      if (!app) {
        throw new Error(
          'Cannot initialize Catalyst. Set CATALYST_PROJECT_KEY env var ' +
          'or run in dry-run mode (options.dryRun = true).'
        );
      }
    }
  }

  var noSql = app.nosql();
  var table = noSql.table(TABLE_NAME);

  for (var bi = 0; bi < batches.length; bi++) {
    var bStart = Date.now();
    await processBatch(table, batches[bi], stats);
    var bDuration = Date.now() - bStart;
    console.log(
      '  Batch ' + (bi + 1) + '/' + batches.length +
      ' done (' + bDuration + 'ms)' +
      '  |  inserted=' + stats.inserted +
      '  updated=' + stats.updated +
      '  failed=' + stats.failed
    );
  }

  return stats;
}

module.exports = { writeDocuments, buildAdjacency, attachAdjacency, initCatalystLocally };
