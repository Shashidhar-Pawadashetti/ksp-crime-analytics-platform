'use strict';

/*
 * Edge persistence — persist generated edges into PersonMaster NoSQL documents.
 *
 * Phase 4.2.2 Milestone 4.
 *
 * This module handles ONLY persistence operations:
 *   - Loading existing PersonMaster documents from Catalyst NoSQL
 *   - Merging new edges into confirmed_edges / unconfirmed_edges arrays
 *   - Deduplication via edge_id
 *   - Batch processing for efficiency
 *   - Audit counters
 *
 * It does NOT generate edges, validate edges, perform graph traversal,
 * or classify relationships.
 */

var auditLog = require('./resolution-audit-log');

/**
 * Load a single PersonMaster document from Catalyst NoSQL by person_id.
 *
 * @param {Object} appInstance — initialized Catalyst SDK instance
 * @param {Object} table       — Catalyst NoSQL table handle
 * @param {string} personId    — person_id (e.g. 'PM_XXXX')
 * @returns {Object|null}      — parsed document, or null if not found
 */
async function loadPersonDocument(appInstance, table, personId) {
  var { NoSQLItem } = require('zcatalyst-sdk-node/lib/no-sql');

  try {
    var result = await table.getItems({
      keys: NoSQLItem.from({ type: 'PM', person_id: personId })
    });

    if (!result || !result.data || result.data.length === 0) {
      console.log('[edgePersist] Document not found: ' + personId);
      return null;
    }

    var firstItem = result.data[0];

    /* -- Catalyst NoSQL returns items directly with person_id -- */
    if (typeof firstItem === 'object' && firstItem.person_id) {
      return firstItem;
    }

    /* -- Some Catalyst SDK versions nest under { data: ... } -- */
    if (firstItem.data && typeof firstItem.data === 'object') {
      return firstItem.data;
    }

    /* -- Fallback: try the first object value that has person_id -- */
    var keys = Object.keys(firstItem);
    for (var ki = 0; ki < keys.length; ki++) {
      var val = firstItem[keys[ki]];
      if (val && typeof val === 'object' && val.person_id) {
        return val;
      }
    }

    console.log('[edgePersist] Unexpected document format for ' + personId);
    return null;
  } catch (err) {
    console.error('[edgePersist] Error loading document ' + personId + ': ' + err.message);
    return null;
  }
}

/**
 * Merge new edges into an existing document's edge array.
 * Deduplicates by edge_id.
 *
 * @param {Object} doc         — existing PersonMaster document
 * @param {Array}  newEdges    — array of edge objects to merge
 * @param {string} edgeField   — 'confirmed_edges' or 'unconfirmed_edges'
 * @returns {Object}
 *   @property {Array}  merged  — the merged edge array
 *   @property {number} added   — count of new edges added
 *   @property {number} skipped — count of duplicates skipped
 */
function mergeEdgesIntoDocument(doc, newEdges, edgeField) {
  if (!Array.isArray(newEdges) || newEdges.length === 0) {
    return { merged: doc[edgeField] || [], added: 0, skipped: 0 };
  }

  var existing = doc[edgeField] || [];
  var existingIds = {};

  for (var ei = 0; ei < existing.length; ei++) {
    var e = existing[ei];
    if (e && e.edge_id) {
      existingIds[e.edge_id] = true;
    }
  }

  var added = 0;
  var skipped = 0;

  for (var ni = 0; ni < newEdges.length; ni++) {
    var edge = newEdges[ni];
    if (!edge || !edge.edge_id) {
      skipped++;
      continue;
    }

    if (existingIds[edge.edge_id]) {
      skipped++;
    } else {
      existing.push(edge);
      existingIds[edge.edge_id] = true;
      added++;
    }
  }

  return { merged: existing, added: added, skipped: skipped };
}

/**
 * Update a document's edge field in Catalyst NoSQL.
 *
 * Uses updateItems with NoSQLUpdateOperationType.PUT on the specific
 * attribute path so only the edge array is updated, not the entire document.
 *
 * @param {Object} appInstance — initialized Catalyst SDK instance
 * @param {Object} table       — Catalyst NoSQL table handle
 * @param {string} personId    — person_id
 * @param {Array}  mergedEdges — the merged array of edge objects
 * @param {string} edgeField   — 'confirmed_edges' or 'unconfirmed_edges'
 * @returns {boolean}           — true if update succeeded
 */
async function updateDocumentEdges(appInstance, table, personId, mergedEdges, edgeField) {
  var { NoSQLItem, NoSQLEnum, NoSQLMarshall } = require('zcatalyst-sdk-node/lib/no-sql');
  var { NoSQLUpdateOperationType } = NoSQLEnum;

  try {
    var updateBody = {
      keys: NoSQLItem.from({ type: 'PM', person_id: personId }),
      update_attributes: [{
        operation_type: NoSQLUpdateOperationType.PUT,
        update_value: NoSQLMarshall.make(mergedEdges),
        attribute_path: [edgeField]
      }]
    };

    await table.updateItems(updateBody);
    return true;
  } catch (err) {
    console.error('[edgePersist] Update failed for ' + personId + ': ' + err.message);
    return false;
  }
}

/**
 * Persist edges into PersonMaster NoSQL documents.
 *
 * @param {Object} appInstance   — initialized Catalyst SDK instance
 * @param {Object} edgesByPerson — object mapping person_id to array of edge objects
 * @param {Object} [options]
 * @param {string} [options.edgeField]     — 'confirmed_edges' (default) or 'unconfirmed_edges'
 * @param {string} [options.tableName]     — default 'PersonMaster'
 * @param {number} [options.batchSize]     — default 75
 * @param {string} [options.runId]         — optional run ID for audit logging
 * @returns {Object}
 *   @property {number} documents_updated
 *   @property {number} edges_written
 *   @property {number} edges_skipped_duplicate
 */
async function persistEdges(appInstance, edgesByPerson, options) {
  var opts = options || {};
  var edgeField = opts.edgeField || 'confirmed_edges';
  var tableName = opts.tableName || 'PersonMaster';
  var batchSize = opts.batchSize || 75;
  var runId = opts.runId || 'EDGE-' + Date.now().toString(36).toUpperCase();

  var personIds = Object.keys(edgesByPerson);
  if (personIds.length === 0) {
    console.log('[edgePersist] No edges to persist.');
    return { documents_updated: 0, edges_written: 0, edges_skipped_duplicate: 0 };
  }

  console.log('[edgePersist] Starting persistence for ' + personIds.length + ' persons (field: ' + edgeField + ')');

  var noSql = appInstance.nosql();
  var table = await noSql.getTable(tableName);

  var totalDocumentsUpdated = 0;
  var totalEdgesWritten = 0;
  var totalEdgesSkipped = 0;

  /* -- Process in batches -- */
  for (var pi = 0; pi < personIds.length; pi += batchSize) {
    var batchPids = personIds.slice(pi, pi + batchSize);
    var batchPromises = batchPids.map(async function (pid) {
      var newEdges = edgesByPerson[pid];
      if (!Array.isArray(newEdges) || newEdges.length === 0) {
        return { updated: false, written: 0, skipped: 0 };
      }

      /* -- Step 1: Load existing document -- */
      var doc = await loadPersonDocument(appInstance, table, pid);
      if (!doc) {
        console.log('[edgePersist] Skipping ' + pid + ' — document not found');
        return { updated: false, written: 0, skipped: 0 };
      }

      /* -- Step 2: Merge edges -- */
      var mergeResult = mergeEdgesIntoDocument(doc, newEdges, edgeField);

      if (mergeResult.added === 0) {
        return { updated: false, written: 0, skipped: mergeResult.skipped };
      }

      /* -- Step 3: Update document -- */
      var success = await updateDocumentEdges(appInstance, table, pid, mergeResult.merged, edgeField);

      if (success) {
        return { updated: true, written: mergeResult.added, skipped: mergeResult.skipped };
      }

      return { updated: false, written: 0, skipped: mergeResult.skipped };
    });

    var batchResults = await Promise.all(batchPromises);

    for (var ri = 0; ri < batchResults.length; ri++) {
      var br = batchResults[ri];
      if (br.updated) totalDocumentsUpdated++;
      totalEdgesWritten += br.written;
      totalEdgesSkipped += br.skipped;
    }

    console.log('[edgePersist] Batch ' + Math.floor(pi / batchSize + 1) + ' done (' + batchPids.length + ' persons, ' + totalEdgesWritten + ' edges written)');
  }

  /* -- Audit log -- */
  try {
    await auditLog.createAuditRecord(appInstance, {
      runId: runId,
      runType: 'edges',
      triggerType: 'api',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'SUCCESS',
      documentsCreated: 0,
      documentsUpdated: totalDocumentsUpdated,
      personsProcessed: personIds.length,
      confirmedEdgesWritten: edgeField === 'confirmed_edges' ? totalEdgesWritten : 0,
      unconfirmedEdgesWritten: edgeField === 'unconfirmed_edges' ? totalEdgesWritten : 0,
      errorCount: 0,
      errorMessage: ''
    });
  } catch (auditErr) {
    console.error('[edgePersist] Audit log write failed: ' + auditErr.message);
  }

  console.log('[edgePersist] Complete — ' + totalDocumentsUpdated + ' documents updated, ' + totalEdgesWritten + ' edges written, ' + totalEdgesSkipped + ' duplicates skipped');

  return {
    documents_updated: totalDocumentsUpdated,
    edges_written: totalEdgesWritten,
    edges_skipped_duplicate: totalEdgesSkipped
  };
}

module.exports = {
  persistEdges: persistEdges,
  loadPersonDocument: loadPersonDocument,
  mergeEdgesIntoDocument: mergeEdgesIntoDocument,
  updateDocumentEdges: updateDocumentEdges
};
