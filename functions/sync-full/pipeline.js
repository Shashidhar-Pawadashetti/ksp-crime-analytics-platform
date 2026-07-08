'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');

var normaliser = require('../entity-matching-engine/normaliser');
var phonetic = require('../entity-matching-engine/phonetic');
var scorer = require('../entity-matching-engine/scorer');
var threshold = require('../entity-matching-engine/threshold');
var documentBuilder = require('../personmaster-builder/documentBuilder');
var clusterBuilder = require('../personmaster-builder/clusterBuilder');
var edgeBuilder = require('../personmaster-builder/edgeBuilder');
var writer = require('../personmaster-writer/writer');
var edgeValidation = require('../personmaster-builder/edgeValidation');

var DATA_DIR = path.resolve(__dirname, '..', '..', 'data_pipeline', 'data');
var OUTPUT_DIR = path.resolve(__dirname, 'output');
var TEMP_MATCHES_PATH = path.join(OUTPUT_DIR, 'candidate_matches.json');
var TEMP_CLUSTERS_PATH = path.join(OUTPUT_DIR, 'person_clusters.json');
var TEMP_DOCUMENTS_PATH = path.join(OUTPUT_DIR, 'personmaster_documents.json');
var TEMP_EDGES_PATH = path.join(OUTPUT_DIR, 'personmaster_edges.json');

function parseCSVLine(line) {
  var result = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function loadCSV(filePath) {
  var raw = fs.readFileSync(filePath, 'utf8');
  var lines = raw.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
  if (lines.length < 2) return [];
  var headers = parseCSVLine(lines[0]);
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var values = parseCSVLine(lines[i]);
    var row = {};
    for (var j = 0; j < headers.length; j++) row[headers[j]] = values[j] || '';
    rows.push(row);
  }
  return rows;
}

function loadCaseMasterLookup(rows) {
  var lookup = {};
  for (var ri = 0; ri < rows.length; ri++) {
    var row = rows[ri];
    var rowid = String(row.CaseMasterID || '').trim();
    if (!rowid) continue;
    lookup[rowid] = {
      latitude: parseFloat(row.Latitude || row.latitude || '0') || null,
      longitude: parseFloat(row.Longitude || row.longitude || '0') || null
    };
  }
  return lookup;
}

function genderToChar(genderID) {
  var g = String(genderID || '').trim();
  if (g === '1' || g.toUpperCase() === 'M' || g.toUpperCase() === 'MALE') return 'M';
  if (g === '2' || g.toUpperCase() === 'F' || g.toUpperCase() === 'FEMALE') return 'F';
  return null;
}

function collectPersonRecords(caseMasterLookup) {
  var records = [];

  var accused = loadCSV(path.join(DATA_DIR, 'Accused.csv'));
  for (var ai = 0; ai < accused.length; ai++) {
    var row = accused[ai];
    var cm = caseMasterLookup[String(row.CaseMasterID).trim()] || {};
    records.push({
      source_table: 'Accused',
      source_id: 'A-' + row.AccusedMasterID,
      name: row.AccusedName || '',
      age: parseInt(row.AgeYear, 10) || null,
      gender: genderToChar(row.GenderID),
      lat: cm.latitude,
      lon: cm.longitude,
      unit_id: null,
      district_id: null,
      caseMasterID: row.CaseMasterID
    });
  }

  var victims = loadCSV(path.join(DATA_DIR, 'Victim.csv'));
  for (var vi = 0; vi < victims.length; vi++) {
    var row2 = victims[vi];
    var cm2 = caseMasterLookup[String(row2.CaseMasterID).trim()] || {};
    records.push({
      source_table: 'Victim',
      source_id: 'V-' + row2.VictimMasterID,
      name: row2.VictimName || '',
      age: parseInt(row2.AgeYear, 10) || null,
      gender: genderToChar(row2.GenderID),
      lat: cm2.latitude,
      lon: cm2.longitude,
      unit_id: null,
      district_id: null,
      caseMasterID: row2.CaseMasterID
    });
  }

  var complainants = loadCSV(path.join(DATA_DIR, 'ComplainantDetails.csv'));
  for (var ci = 0; ci < complainants.length; ci++) {
    var row3 = complainants[ci];
    var cm3 = caseMasterLookup[String(row3.CaseMasterID).trim()] || {};
    records.push({
      source_table: 'ComplainantDetails',
      source_id: 'C-' + row3.ComplainantID,
      name: row3.ComplainantName || '',
      age: parseInt(row3.AgeYear, 10) || null,
      gender: genderToChar(row3.GenderID),
      lat: cm3.latitude,
      lon: cm3.longitude,
      unit_id: null,
      district_id: null,
      caseMasterID: row3.CaseMasterID
    });
  }

  return records;
}

function runMatching(records) {
  for (var ri = 0; ri < records.length; ri++) {
    var rec = records[ri];
    rec.normalised_name = normaliser.normaliseName(rec.name);
    rec.phonetic_key = phonetic.generatePhoneticKey(rec.normalised_name);
  }

  var buckets = {};
  for (var rj = 0; rj < records.length; rj++) {
    var rec2 = records[rj];
    if (!rec2.phonetic_key) continue;
    if (!buckets[rec2.phonetic_key]) buckets[rec2.phonetic_key] = [];
    buckets[rec2.phonetic_key].push(rec2);
  }

  var allMatches = [];
  var stats = { totalComparisons: 0, confirmed: 0, unconfirmed: 0, discarded: 0 };

  for (var bk in buckets) {
    var group = buckets[bk];
    if (group.length < 2) continue;

    for (var i = 0; i < group.length; i++) {
      for (var j = i + 1; j < group.length; j++) {
        stats.totalComparisons++;

        var recA = group[i];
        var recB = group[j];

        if (recA.source_id === recB.source_id && recA.source_table === recB.source_table) {
          stats.totalComparisons--;
          continue;
        }

        var tables = [recA.source_table, recB.source_table];
        if (tables[0] === tables[1]) tables = [tables[0]];
        else tables.sort();

        var result = scorer.computeScore(recA, recB);
        var { label: classification } = threshold.classify(result.confidence);

        if (classification === 'DISCARD') {
          stats.discarded++;
          continue;
        }

        var match = {
          recordA: {
            source_id: recA.source_id,
            source_table: recA.source_table,
            caseMasterID: recA.caseMasterID,
            name: recA.name,
            normalised_name: recA.normalised_name,
            phonetic_key: recA.phonetic_key,
            age: recA.age,
            gender: recA.gender
          },
          recordB: {
            source_id: recB.source_id,
            source_table: recB.source_table,
            caseMasterID: recB.caseMasterID,
            name: recB.name,
            normalised_name: recB.normalised_name,
            phonetic_key: recB.phonetic_key,
            age: recB.age,
            gender: recB.gender
          },
          tables: tables,
          confidence: result.confidence,
          classification: classification,
          score_breakdown: result.score_breakdown
        };

        allMatches.push(match);

        if (classification === 'CONFIRMED') stats.confirmed++;
        else if (classification === 'UNCONFIRMED') stats.unconfirmed++;
      }
    }
  }

  return { allMatches: allMatches, matchStats: stats };
}

function getClassification(match) {
  var c = match.classification;
  if (typeof c === 'object' && c !== null) return c.label;
  return c;
}

function buildSrToPm(documents) {
  var map = {};
  for (var di = 0; di < documents.length; di++) {
    for (var si = 0; si < documents[di].source_records.length; si++) {
      var sr = documents[di].source_records[si];
      map[sr.table + ':' + sr.source_id] = documents[di].person_id;
    }
  }
  return map;
}

function validatePipeline(documents, edges) {
  console.log('\n=== Pipeline Validation ===');

  var pmIds = {};
  for (var di = 0; di < documents.length; di++) {
    if (pmIds[documents[di].person_id]) {
      throw new Error('Duplicate person_id: ' + documents[di].person_id);
    }
    pmIds[documents[di].person_id] = true;
  }
  console.log('  No duplicate person_ids: PASS');

  var edgeIds = {};
  for (var ei = 0; ei < edges.length; ei++) {
    if (edgeIds[edges[ei].edge_id]) {
      throw new Error('Duplicate edge_id: ' + edges[ei].edge_id);
    }
    edgeIds[edges[ei].edge_id] = true;
  }
  console.log('  No duplicate edge_ids:   PASS');

  var docIds = {};
  for (var di2 = 0; di2 < documents.length; di2++) {
    docIds[documents[di2].person_id] = true;
  }
  var orphanCount = 0;
  for (var ei2 = 0; ei2 < edges.length; ei2++) {
    if (!docIds[edges[ei2].source] || !docIds[edges[ei2].target]) {
      orphanCount++;
    }
  }
  if (orphanCount > 0) {
    throw new Error('Orphan edges found: ' + orphanCount + ' edges reference non-existent PersonMaster nodes');
  }
  console.log('  No orphan edges:         PASS');

  return { documentCount: documents.length, edgeCount: edges.length };
}

async function run(options) {
  var tStart = Date.now();
  var dryRun = options && options.dryRun;
  var stageTimes = {};

  console.log('=== Full Graph Rebuild Pipeline ===\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  try {
    var t0, t1, stage;

    stage = 'Load CaseMaster';
    t0 = Date.now();
    console.log('[' + stage + ']');
    var cmRows = loadCSV(path.join(DATA_DIR, 'CaseMaster.csv'));
    var caseMasterLookup = loadCaseMasterLookup(cmRows);
    t1 = Date.now();
    stageTimes[stage] = t1 - t0;
    console.log('  CaseMaster records: ' + cmRows.length);
    console.log('  Time: ' + stageTimes[stage] + 'ms');

    stage = 'Load Person Records';
    t0 = Date.now();
    console.log('\n[' + stage + ']');
    var records = collectPersonRecords(caseMasterLookup);
    t1 = Date.now();
    stageTimes[stage] = t1 - t0;
    console.log('  Person records: ' + records.length);
    console.log('  Time: ' + stageTimes[stage] + 'ms');

    stage = 'Candidate Matching';
    t0 = Date.now();
    console.log('\n[' + stage + ']');
    var { allMatches, matchStats } = runMatching(records);
    t1 = Date.now();
    stageTimes[stage] = t1 - t0;
    console.log('  Total comparisons: ' + matchStats.totalComparisons);
    console.log('  CONFIRMED: ' + matchStats.confirmed);
    console.log('  UNCONFIRMED: ' + matchStats.unconfirmed);
    console.log('  DISCARD: ' + matchStats.discarded);
    console.log('  Time: ' + stageTimes[stage] + 'ms');

    var confirmedEdges = allMatches.filter(function(m) { return getClassification(m) === 'CONFIRMED'; });
    var allMatchEdges = allMatches;

    stage = 'Cluster Builder';
    t0 = Date.now();
    console.log('\n[' + stage + ']');
    var rawClusters = clusterBuilder.buildClusters(confirmedEdges);
    var clusters = rawClusters.map(function(members, idx) {
      return { person_id: 'PM_' + String(idx + 1).padStart(6, '0'), members: members };
    });
    t1 = Date.now();
    stageTimes[stage] = t1 - t0;
    console.log('  Clusters: ' + clusters.length);
    console.log('  Time: ' + stageTimes[stage] + 'ms');

    stage = 'Document Builder';
    t0 = Date.now();
    console.log('\n[' + stage + ']');
    var sourceData = documentBuilder.loadSourceData();
    var documents = documentBuilder.buildAllDocuments(clusters, sourceData, confirmedEdges);
    documentBuilder.validateAllDocuments(documents);
    t1 = Date.now();
    stageTimes[stage] = t1 - t0;
    console.log('  Documents: ' + documents.length);
    console.log('  Validation: PASS');
    console.log('  Time: ' + stageTimes[stage] + 'ms');

    stage = 'Edge Builder';
    t0 = Date.now();
    console.log('\n[' + stage + ']');
    var srToPm = buildSrToPm(documents);
    var edges = edgeBuilder.buildEdges(documents, allMatchEdges, srToPm);
    t1 = Date.now();
    stageTimes[stage] = t1 - t0;
    console.log('  Edges: ' + edges.length);
    console.log('  Time: ' + stageTimes[stage] + 'ms');

    stage = 'Pipeline Validation';
    t0 = Date.now();
    console.log('\n[' + stage + ']');
    var validPmIds = documents.map(function(d) { return d.person_id; });
    edgeValidation.validateEdges(edges, validPmIds);
    var validationResult = validatePipeline(documents, edges);
    t1 = Date.now();
    stageTimes[stage] = t1 - t0;
    console.log('  Time: ' + stageTimes[stage] + 'ms');

    if (dryRun) {
      console.log('\n=== DRY RUN - Skipping Catalyst write ===');
    } else {
      stage = 'Catalyst NoSQL Writer';
      t0 = Date.now();
      console.log('\n[' + stage + ']');
      var writeOpts = Object.assign({}, options, { batchSize: options && options.batchSize ? options.batchSize : 75 });
      var writeStats = await writer.writeDocuments(documents, edges, writeOpts);
      t1 = Date.now();
      stageTimes[stage] = t1 - t0;
      console.log('  Inserted: ' + writeStats.inserted);
      console.log('  Updated: ' + writeStats.updated);
      console.log('  Failed: ' + writeStats.failed);
      console.log('  Time: ' + stageTimes[stage] + 'ms');
    }

    var tEnd = Date.now();
    var elapsed = tEnd - tStart;

    printSummary({
      elapsed: elapsed,
      stageTimes: stageTimes,
      totalComparisons: matchStats.totalComparisons,
      clusters: clusters.length,
      documents: documents.length,
      edges: edges.length,
      dryRun: dryRun,
      matchStats: matchStats,
      clustersData: clusters,
      documentsData: documents,
      edgesData: edges
    });

    return {
      status: 'SUCCESS',
      documents: documents.length,
      edges: edges.length,
      elapsed_ms: elapsed,
      stages: stageTimes
    };
  } catch (err) {
    var tEnd2 = Date.now();
    console.error('\n=== PIPELINE FAILED ===');
    console.error('  Stage: ' + (stage || 'unknown'));
    console.error('  Error: ' + err.message);
    console.error('  Elapsed before failure: ' + (tEnd2 - tStart) + 'ms');

    if (err.stack) {
      console.error('  Stack: ' + err.stack.split('\n').slice(0, 3).join('\n'));
    }

    throw err;
  }
}

function printSummary(result) {
  var doc = result.documentsData;
  var sizes = doc.map(function(d) { return d.source_records.length; });
  var totalSourceRecords = sizes.length > 0
    ? sizes.reduce(function(a, b) { return a + b; })
    : 0;
  var maxClusterSize = sizes.length > 0 ? Math.max.apply(null, sizes) : 0;

  var aliasCounts = doc.map(function(d) { return d.aliases.length; });
  var avgAliases = aliasCounts.length > 0
    ? (aliasCounts.reduce(function(a, b) { return a + b; }) / aliasCounts.length).toFixed(1)
    : '0.0';

  var totalEdges = result.edgesData ? result.edgesData.length : 0;

  var stageOrder = [
    'Load CaseMaster', 'Load Person Records', 'Candidate Matching',
    'Cluster Builder', 'Document Builder', 'Edge Builder',
    'Pipeline Validation', 'Catalyst NoSQL Writer'
  ];

  console.log('');
  console.log('='.repeat(60));
  console.log('  FULL GRAPH REBUILD  \u2014  SUMMARY');
  console.log('='.repeat(60));
  console.log('  Total time:              ' + (result.elapsed / 1000).toFixed(1) + 's');
  console.log('  Total comparisons:       ' + result.totalComparisons.toLocaleString());
  console.log('  CONFIRMED matches:       ' + result.matchStats.confirmed.toLocaleString());
  console.log('  UNCONFIRMED matches:     ' + result.matchStats.unconfirmed.toLocaleString());
  console.log('');
  console.log('  Clusters created:        ' + result.clusters);
  console.log('  Documents generated:     ' + result.documents);
  console.log('  Edges generated:         ' + totalEdges);
  console.log('');
  console.log('  Total source records:    ' + totalSourceRecords);
  console.log('  Largest cluster:         ' + maxClusterSize + ' records');
  console.log('  Average aliases/doc:     ' + avgAliases);
  console.log('');
  console.log('  Stage timings:');
  for (var si = 0; si < stageOrder.length; si++) {
    var sName = stageOrder[si];
    var ms = result.stageTimes[sName];
    if (ms !== undefined) {
      console.log('    ' + sName.padEnd(28) + (ms / 1000).toFixed(1) + 's');
    }
  }
  if (result.dryRun) {
    console.log('\n  Mode: DRY RUN (Catalyst write skipped)');
  }
  console.log('='.repeat(60));
}

module.exports = { run, runMatching, collectPersonRecords, loadCSV, loadCaseMasterLookup, parseCSVLine };
