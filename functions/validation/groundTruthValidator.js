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

function extractAccusedId(rowId) {
  if (!rowId) return null;
  var match = rowId.match(/^A-?(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

async function validateAgainstGroundTruth(appInstance, options) {
  var opts = options || {};
  var csvPath = opts.ground_truth_path ||
    path.join(__dirname, '..', '..', 'data_pipeline', 'data', 'ground_truth_identities.csv');
  if (!fs.existsSync(csvPath)) {
    csvPath = path.join(__dirname, 'data', 'ground_truth_identities.csv');
  }
  if (!fs.existsSync(csvPath)) {
    return {
      status: 'not_available',
      message: 'Ground truth file not found. Expected at: ' + opts.ground_truth_path || 'data_pipeline/data/ground_truth_identities.csv',
      metrics: null
    };
  }

  var csvText = fs.readFileSync(csvPath, 'utf-8');
  var parsed = parseCSV(csvText);
  if (parsed.rows.length === 0) {
    return { status: 'error', message: 'Ground truth CSV is empty', metrics: null };
  }
  console.log('[gtValidator] Loaded ' + parsed.rows.length + ' ground truth records');

  var gtMap = {};
  parsed.rows.forEach(function (row) {
    var id = parseInt(row.AccusedMasterID, 10);
    var profileId = parseInt(row.BaseProfileID, 10);
    if (!isNaN(id) && !isNaN(profileId)) {
      gtMap[id] = profileId;
    }
  });
  console.log('[gtValidator] Mapped ' + Object.keys(gtMap).length + ' accused IDs to base profiles');

  var documents = await loadAllDocuments(appInstance);
  console.log('[gtValidator] Loaded ' + documents.length + ' PersonMaster documents');

  var personToProfiles = {};

  documents.forEach(function (doc) {
    var pid = doc.person_id;
    if (!pid) return;
    var profileSet = {};

    (doc.source_records || []).forEach(function (sr) {
      if (sr.table !== 'Accused') return;
      var accusedId = extractAccusedId(sr.row_id);
      if (accusedId == null || !gtMap[accusedId]) return;
      profileSet[gtMap[accusedId]] = true;
    });

    var profiles = Object.keys(profileSet).map(Number);
    if (profiles.length > 0) {
      personToProfiles[pid] = profiles;
    }
  });

  var personIds = Object.keys(personToProfiles);
  console.log('[gtValidator] PersonMaster docs with ground truth: ' + personIds.length);

  if (personIds.length === 0) {
    return {
      status: 'ok',
      message: 'No PersonMaster documents matched ground truth records. Ensure resolution has been run.',
      metrics: { total_documents: documents.length, matched_documents: 0 }
    };
  }

  var tp = 0, fp = 0, fn = 0;
  var clusterPurities = [];
  var mergedClusters = 0;
  var profileToClusters = {};

  personIds.forEach(function (pid) {
    var profiles = personToProfiles[pid];
    var uniqueProfiles = {};
    profiles.forEach(function (p) { uniqueProfiles[p] = (uniqueProfiles[p] || 0) + 1; });
    var pList = Object.keys(uniqueProfiles).map(Number);
    var maxCount = 0;
    pList.forEach(function (p) { if (uniqueProfiles[p] > maxCount) maxCount = uniqueProfiles[p]; });
    clusterPurities.push(maxCount / profiles.length);

    if (pList.length > 1) mergedClusters++;

    profiles.forEach(function (p) {
      if (!profileToClusters[p]) profileToClusters[p] = [];
      profileToClusters[p].push(pid);
    });
  });

  for (var pi = 0; pi < personIds.length; pi++) {
    var p1Profiles = personToProfiles[personIds[pi]];
    for (var pj = pi + 1; pj < personIds.length; pj++) {
      var p2Profiles = personToProfiles[personIds[pj]];
      var shareProfile = false;
      for (var gi = 0; gi < p1Profiles.length && !shareProfile; gi++) {
        for (var gj = 0; gj < p2Profiles.length && !shareProfile; gj++) {
          if (p1Profiles[gi] === p2Profiles[gj]) shareProfile = true;
        }
      }
      if (shareProfile) {
        var sameDoc = personIds[pi] === personIds[pj];
        if (sameDoc) {
          tp++;
        } else {
          fn++;
        }
      } else {
        fp++;
      }
    }
  }

  var splitClusters = 0;
  Object.keys(profileToClusters).forEach(function (profileId) {
    if (profileToClusters[profileId].length > 1) splitClusters++;
  });

  var precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  var recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  var f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  var avgPurity = clusterPurities.length > 0
    ? clusterPurities.reduce(function (a, b) { return a + b; }, 0) / clusterPurities.length
    : 0;

  return {
    status: 'ok',
    message: 'Ground truth validation complete',
    metrics: {
      total_documents: documents.length,
      matched_documents: personIds.length,
      ground_truth_records: parsed.rows.length,
      unique_base_profiles: Object.keys(profileToClusters).length,
      true_positives: tp,
      false_positives: fp,
      false_negatives: fn,
      precision: Math.round(precision * 10000) / 10000,
      recall: Math.round(recall * 10000) / 10000,
      f1_score: Math.round(f1 * 10000) / 10000,
      avg_cluster_purity: Math.round(avgPurity * 10000) / 10000,
      merged_clusters: mergedClusters,
      split_profiles: splitClusters,
      total_clusters: personIds.length
    }
  };
}

module.exports = { validateAgainstGroundTruth: validateAgainstGroundTruth };
