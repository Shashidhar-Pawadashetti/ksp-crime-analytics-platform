'use strict';

var fs = require('fs');
var path = require('path');
var documentBuilder = require('./documentBuilder');
var docStats = require('./statistics');
var edgeBuilder = require('./edgeBuilder');
var edgeValidation = require('./edgeValidation');
var edgeStats = require('./edgeStatistics');

var SCRIPT_DIR = __dirname;
var EM_OUTPUT_DIR = path.resolve(SCRIPT_DIR, '..', 'entity-matching-engine', 'output');
var CLUSTERS_PATH = path.resolve(SCRIPT_DIR, 'output', 'person_clusters.json');
var CANDIDATE_MATCHES_PATH = path.resolve(EM_OUTPUT_DIR, 'candidate_matches.json');
var OUTPUT_DIR = path.resolve(SCRIPT_DIR, 'output');
var DOCUMENTS_PATH = path.resolve(OUTPUT_DIR, 'personmaster_documents.json');
var EDGES_PATH = path.resolve(OUTPUT_DIR, 'personmaster_edges.json');

function getClassification(match) {
  var c = match.classification;
  if (typeof c === 'object' && c !== null) return c.label;
  return c;
}

function phase1_buildDocuments() {
  console.log('=== PHASE 1: PersonMaster Document Builder ===\n');

  console.log('Reading clusters...');
  var clusters = JSON.parse(fs.readFileSync(CLUSTERS_PATH, 'utf8'));
  console.log('  Clusters loaded: ' + clusters.length);

  if (clusters.length === 0) {
    console.log('\nNo clusters to process. Writing empty documents array.');
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(DOCUMENTS_PATH, '[]\n', 'utf8');
    console.log('  Written: ' + DOCUMENTS_PATH);
    docStats.printDocumentStats([]);
    return [];
  }

  console.log('\nLoading source data from CSVs...');
  var sourceData = documentBuilder.loadSourceData();
  var totalRecords = Object.keys(sourceData.sourceByKey).length;
  console.log('  Source records indexed: ' + totalRecords);

  console.log('\nLoading candidate matches...');
  var rawMatches = fs.readFileSync(CANDIDATE_MATCHES_PATH, 'utf8');
  var allMatches = JSON.parse(rawMatches);
  console.log('  Matches loaded: ' + allMatches.length);

  var confirmedEdges = allMatches.filter(function(m) {
    return getClassification(m) === 'CONFIRMED';
  });
  console.log('  CONFIRMED edges: ' + confirmedEdges.length);

  console.log('\nBuilding PersonMaster documents...');
  var documents = documentBuilder.buildAllDocuments(clusters, sourceData, confirmedEdges);
  console.log('  Documents built: ' + documents.length);

  console.log('\nValidating documents...');
  documentBuilder.validateAllDocuments(documents);
  console.log('  Validation passed.');

  console.log('\nWriting documents...');
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(DOCUMENTS_PATH, JSON.stringify(documents, null, 2), 'utf8');
  console.log('  Written: ' + DOCUMENTS_PATH);

  var fileSizeKB = (fs.statSync(DOCUMENTS_PATH).size / 1024).toFixed(0);
  console.log('  File size: ' + fileSizeKB + ' KB');

  docStats.printDocumentStats(documents);
  return documents;
}

function phase2_buildEdges() {
  console.log('\n=== PHASE 2: Typed Edge Builder ===\n');

  console.log('Reading documents...');
  var documents = JSON.parse(fs.readFileSync(DOCUMENTS_PATH, 'utf8'));
  console.log('  Documents loaded: ' + documents.length);

  if (documents.length === 0) {
    console.log('\nNo documents to process. Writing empty edges array.');
    var emptyResult = { nodes: 0, edges: [] };
    fs.writeFileSync(EDGES_PATH, JSON.stringify(emptyResult, null, 2), 'utf8');
    console.log('  Written: ' + EDGES_PATH);
    edgeStats.printEdgeStats([], 0);
    return;
  }

  var validPmIds = documents.map(function(d) { return d.person_id; });

  console.log('Building source-record to PersonMaster index...');
  var srToPm = {};
  for (var di = 0; di < documents.length; di++) {
    for (var si = 0; si < documents[di].source_records.length; si++) {
      var sr = documents[di].source_records[si];
      var key = sr.table + ':' + sr.source_id;
      srToPm[key] = documents[di].person_id;
    }
  }
  console.log('  Index entries: ' + Object.keys(srToPm).length);

  console.log('Loading candidate matches...');
  var rawMatches = fs.readFileSync(CANDIDATE_MATCHES_PATH, 'utf8');
  var allMatches = JSON.parse(rawMatches);
  console.log('  Matches loaded: ' + allMatches.length);

  console.log('Building all edge types...');
  var edges = edgeBuilder.buildEdges(documents, allMatches, srToPm);
  console.log('\n  Total edges built: ' + edges.length);

  console.log('\nValidating edges...');
  edgeValidation.validateEdges(edges, validPmIds);
  console.log('  Validation passed.');

  console.log('\nWriting edges...');
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  var edgeOutput = {
    nodes: documents.length,
    edges: edges
  };
  fs.writeFileSync(EDGES_PATH, JSON.stringify(edgeOutput, null, 2), 'utf8');
  console.log('  Written: ' + EDGES_PATH);

  var fileSizeKB2 = (fs.statSync(EDGES_PATH).size / 1024).toFixed(0);
  console.log('  File size: ' + fileSizeKB2 + ' KB');

  edgeStats.printEdgeStats(edges, documents.length);
}

function main() {
  var args = process.argv.slice(2);
  var runPhase = args.length > 0 ? args[0] : 'all';

  if (runPhase === 'documents' || runPhase === 'all' || runPhase === 'phase1') {
    phase1_buildDocuments();
  }

  if (runPhase === 'edges' || runPhase === 'all' || runPhase === 'phase2') {
    phase2_buildEdges();
  }
}

if (require.main === module) {
  main();
}

module.exports = { phase1_buildDocuments, phase2_buildEdges, main };
