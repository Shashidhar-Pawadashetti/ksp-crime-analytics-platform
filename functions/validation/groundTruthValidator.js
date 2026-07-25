'use strict';

var fs = require('fs');
var path = require('path');

var PM_TABLE = 'PersonMaster';

function parseCSV(text) {
  var lines = text.split(/\r?\n/).filter(function (l) { return l.trim().length > 0; });
  if (lines.length === 0) return { headers: [], rows: [] };
  var headers = parseCSVLine(lines[0]);
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var values = parseCSVLine(lines[i]);
    if (values.length < headers.length) continue;
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }
    rows.push(row);
  }
  return { headers: headers, rows: rows };
}

function parseCSVLine(line) {
  var result = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
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

  return allDocs;
}

function extractAccusedId(rowId) {
  if (!rowId) return null;
  var match = rowId.match(/^A-?(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

function computePairwiseMetrics(accusedToGT, accusedToPM, allAccusedIds) {
  var tp = 0, fp = 0, fn = 0, tn = 0;

  for (var i = 0; i < allAccusedIds.length; i++) {
    var idA = allAccusedIds[i];
    for (var j = i + 1; j < allAccusedIds.length; j++) {
      var idB = allAccusedIds[j];
      var sameGT = accusedToGT[idA] === accusedToGT[idB];
      var samePred = accusedToPM[idA] === accusedToPM[idB];

      if (sameGT && samePred) tp++;
      else if (sameGT && !samePred) fn++;
      else if (!sameGT && samePred) fp++;
      else tn++;
    }
  }

  return { tp: tp, fp: fp, fn: fn, tn: tn };
}

function computeClusterPurity(accusedToGT, accusedToPM, allAccusedIds) {
  var personClusters = {};
  for (var i = 0; i < allAccusedIds.length; i++) {
    var id = allAccusedIds[i];
    var pid = accusedToPM[id];
    if (!personClusters[pid]) personClusters[pid] = [];
    personClusters[pid].push(id);
  }

  var purities = [];
  var pids = Object.keys(personClusters);
  for (var pi = 0; pi < pids.length; pi++) {
    var members = personClusters[pids[pi]];
    var profileFreq = {};
    for (var mi = 0; mi < members.length; mi++) {
      var bp = accusedToGT[members[mi]];
      if (bp != null) profileFreq[bp] = (profileFreq[bp] || 0) + 1;
    }
    var maxCount = 0;
    var bpKeys = Object.keys(profileFreq);
    for (var bi = 0; bi < bpKeys.length; bi++) {
      if (profileFreq[bpKeys[bi]] > maxCount) maxCount = profileFreq[bpKeys[bi]];
    }
    purities.push(members.length > 0 ? maxCount / members.length : 0);
  }

  return {
    cluster_purities: purities,
    average_purity: purities.length > 0
      ? purities.reduce(function (a, b) { return a + b; }, 0) / purities.length
      : 0
  };
}

async function validateAgainstGroundTruth(appInstance, options) {
  var opts = options || {};
  var csvText = null;

  if (opts.ground_truth_csv) {
    csvText = opts.ground_truth_csv;
  } else {
    var csvPath = opts.ground_truth_path ||
      path.join(__dirname, '..', '..', 'data_pipeline', 'data', 'ground_truth_identities.csv');
    if (!fs.existsSync(csvPath)) {
      csvPath = path.join(__dirname, 'data', 'ground_truth_identities.csv');
    }
    if (!fs.existsSync(csvPath)) {
      return {
        status: 'not_available',
        message: 'Ground truth file not found. Pass ground_truth_csv in request body or place file at: data_pipeline/data/ground_truth_identities.csv',
        scope: 'ACCUSED_SEEDED_IDENTITIES_ONLY',
        ground_truth_records: 0,
        mapped_records: 0,
        mapped_accused_ids: [],
        unmapped_accused_ids: [],
        coverage: 0,
        ground_truth_identity_count: 0,
        predicted_cluster_count: 0,
        pairwise: { tp: 0, fp: 0, fn: 0, tn: 0 },
        precision: 0,
        recall: 0,
        f1_score: 0,
        cluster_purity: 0,
        personmaster_documents_loaded: 0,
        accused_source_records_seen: 0,
        accused_ids_extracted: 0,
        accused_ids_failed_extraction: 0,
        duplicate_accused_ids: 0,
        limitations: [
          'Ground truth covers seeded recurring Accused identities only.',
          'Victim and Complainant cross-role entity resolution is not evaluated.'
        ]
      };
    }
    csvText = fs.readFileSync(csvPath, 'utf-8');
  }

  var parsed = parseCSV(csvText);
  if (parsed.rows.length === 0) {
    return {
      status: 'error',
      message: 'Ground truth CSV is empty',
      scope: 'ACCUSED_SEEDED_IDENTITIES_ONLY',
      ground_truth_records: 0,
      mapped_records: 0,
      mapped_accused_ids: [],
      unmapped_accused_ids: [],
      coverage: 0,
      ground_truth_identity_count: 0,
      predicted_cluster_count: 0,
      pairwise: { tp: 0, fp: 0, fn: 0, tn: 0 },
      precision: 0,
      recall: 0,
      f1_score: 0,
      cluster_purity: 0,
      personmaster_documents_loaded: 0,
      accused_source_records_seen: 0,
      accused_ids_extracted: 0,
      accused_ids_failed_extraction: 0,
      duplicate_accused_ids: 0,
      limitations: [
        'Ground truth covers seeded recurring Accused identities only.',
        'Victim and Complainant cross-role entity resolution is not evaluated.'
      ]
    };
  }

  /* Build ground truth map: accusedMasterId -> baseProfileId */
  var accusedToGT = {};
  var uniqueBaseProfiles = {};
  parsed.rows.forEach(function (row) {
    var accusedId = parseInt(row.AccusedMasterID, 10);
    var profileId = parseInt(row.BaseProfileID, 10);
    if (!isNaN(accusedId) && !isNaN(profileId)) {
      accusedToGT[accusedId] = profileId;
      uniqueBaseProfiles[profileId] = true;
    }
  });
  var groundTruthIdentityCount = Object.keys(uniqueBaseProfiles).length;

  /* Load PersonMaster documents */
  var documents = await loadAllDocuments(appInstance);

  /* --- TASK 1: PersonMaster loading diagnostics --- */
  var pmDiagnostics = {
    personmaster_documents_loaded: documents.length,
    sample_documents: []
  };

  if (documents.length > 0) {
    var sampleSize = Math.min(3, documents.length);
    for (var si = 0; si < sampleSize; si++) {
      var doc = documents[si];
      var srcRecords = doc.source_records || [];
      var sampleSrc = srcRecords.slice(0, 3).map(function (sr) {
        var allKeys = sr ? Object.keys(sr) : [];
        var kv = {};
        for (var ki = 0; ki < allKeys.length; ki++) {
          kv[allKeys[ki]] = sr[allKeys[ki]];
        }
        return kv;
      });
      pmDiagnostics.sample_documents.push({
        person_id: doc.person_id,
        type: doc.type,
        all_doc_keys: doc ? Object.keys(doc) : [],
        source_records_count: srcRecords.length,
        sample_source_records: sampleSrc
      });
    }
  }

  /* --- TASK 2: Build predicted map with instrumentation --- */
  var buildDiag = {
    accused_source_records_seen: 0,
    accused_ids_extracted: 0,
    accused_ids_failed_extraction: 0,
    duplicate_accused_ids: 0,
    failed_source_id_sample: []
  };

  var accusedToPM = {};
  documents.forEach(function (doc) {
    var pid = doc.person_id;
    if (!pid) return;
    (doc.source_records || []).forEach(function (sr) {
      if (sr.table !== 'Accused') return;
      buildDiag.accused_source_records_seen++;
      var accusedSourceId = sr.source_id ?? sr.row_id;
      var accusedId = extractAccusedId(accusedSourceId);
      if (accusedId != null) {
        if (accusedToGT[accusedId] != null) {
          if (accusedToPM[accusedId] != null) {
            buildDiag.duplicate_accused_ids++;
          }
          accusedToPM[accusedId] = pid;
          buildDiag.accused_ids_extracted++;
        }
      } else {
        buildDiag.accused_ids_failed_extraction++;
        if (buildDiag.failed_source_id_sample.length < 10) {
          buildDiag.failed_source_id_sample.push(accusedSourceId);
        }
      }
    });
  });

  var mappedAccusedIds = Object.keys(accusedToPM).map(Number).sort(function (a, b) { return a - b; });
  var mappedRecords = mappedAccusedIds.length;
  var totalRecords = Object.keys(accusedToGT).length;
  var unmappedRecords = totalRecords - mappedRecords;

  /* Find unmapped accused IDs */
  var allGtIds = Object.keys(accusedToGT).map(Number);
  var mappedSet = {};
  mappedAccusedIds.forEach(function (id) { mappedSet[id] = true; });
  var unmappedAccusedIds = allGtIds.filter(function (id) { return !mappedSet[id]; });

  var coverage = totalRecords > 0 ? mappedRecords / totalRecords : 0;

  if (mappedRecords < 2) {
    return {
      status: 'ok',
      scope: 'ACCUSED_SEEDED_IDENTITIES_ONLY',
      ground_truth_records: totalRecords,
      mapped_records: mappedRecords,
      unmapped_records: unmappedRecords,
      mapped_accused_ids: mappedAccusedIds,
      unmapped_accused_ids: unmappedAccusedIds,
      coverage: Math.round(coverage * 10000) / 10000,
      ground_truth_identity_count: groundTruthIdentityCount,
      predicted_cluster_count: Object.keys(getUniqueValues(accusedToPM)).length,
      pairwise: { tp: 0, fp: 0, fn: 0, tn: 0 },
      precision: 0,
      recall: 0,
      f1_score: 0,
      cluster_purity: 0,
      message: 'Need at least 2 mapped accused records for pairwise metrics.',
      personmaster_documents_loaded: pmDiagnostics.personmaster_documents_loaded,
      sample_documents: pmDiagnostics.sample_documents,
      accused_source_records_seen: buildDiag.accused_source_records_seen,
      accused_ids_extracted: buildDiag.accused_ids_extracted,
      accused_ids_failed_extraction: buildDiag.accused_ids_failed_extraction,
      duplicate_accused_ids: buildDiag.duplicate_accused_ids,
      failed_source_id_sample: buildDiag.failed_source_id_sample,
      limitations: [
        'Ground truth covers seeded recurring Accused identities only.',
        'Victim and Complainant cross-role entity resolution is not evaluated.'
      ]
    };
  }

  var pairwise = computePairwiseMetrics(accusedToGT, accusedToPM, mappedAccusedIds);

  var precision = pairwise.tp + pairwise.fp > 0
    ? pairwise.tp / (pairwise.tp + pairwise.fp) : 0;
  var recall = pairwise.tp + pairwise.fn > 0
    ? pairwise.tp / (pairwise.tp + pairwise.fn) : 0;
  var f1 = precision + recall > 0
    ? 2 * precision * recall / (precision + recall) : 0;

  var purityResult = computeClusterPurity(accusedToGT, accusedToPM, mappedAccusedIds);

  var predictedClusterSet = {};
  mappedAccusedIds.forEach(function (id) { predictedClusterSet[accusedToPM[id]] = true; });

  return {
    status: 'ok',
    scope: 'ACCUSED_SEEDED_IDENTITIES_ONLY',
    ground_truth_records: totalRecords,
    mapped_records: mappedRecords,
    unmapped_records: unmappedRecords,
    mapped_accused_ids: mappedAccusedIds,
    unmapped_accused_ids: unmappedAccusedIds,
    coverage: round4(coverage),
    ground_truth_identity_count: groundTruthIdentityCount,
    predicted_cluster_count: Object.keys(predictedClusterSet).length,
    pairwise: {
      true_positives: pairwise.tp,
      false_positives: pairwise.fp,
      false_negatives: pairwise.fn,
      true_negatives: pairwise.tn
    },
    precision: round4(precision),
    recall: round4(recall),
    f1_score: round4(f1),
    cluster_purity: round4(purityResult.average_purity),
    personmaster_documents_loaded: pmDiagnostics.personmaster_documents_loaded,
    sample_documents: pmDiagnostics.sample_documents,
    accused_source_records_seen: buildDiag.accused_source_records_seen,
    accused_ids_extracted: buildDiag.accused_ids_extracted,
    accused_ids_failed_extraction: buildDiag.accused_ids_failed_extraction,
    duplicate_accused_ids: buildDiag.duplicate_accused_ids,
    failed_source_id_sample: buildDiag.failed_source_id_sample,
    limitations: [
      'Ground truth covers seeded recurring Accused identities only.',
      'Victim and Complainant cross-role entity resolution is not evaluated.'
    ]
  };
}

function getUniqueValues(map) {
  var vals = {};
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) {
    vals[map[keys[i]]] = true;
  }
  return vals;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

module.exports = {
  validateAgainstGroundTruth: validateAgainstGroundTruth,
  computePairwiseMetrics: computePairwiseMetrics,
  computeClusterPurity: computeClusterPurity,
  extractAccusedId: extractAccusedId,
  parseCSV: parseCSV,
  loadAllDocuments: loadAllDocuments
};