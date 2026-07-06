'use strict';

var path = require('path');
var fs = require('fs');
var candidateLoader = require('./candidateLoader');
var incrementalResolver = require('./incrementalResolver');
var personUpdater = require('./personUpdater');
var edgeUpdater = require('./edgeUpdater');
var documentBuilder = require('../personmaster-builder/documentBuilder');
var edgeBuilder = require('../personmaster-builder/edgeBuilder');

var BUILDER_OUTPUT_DIR = path.resolve(__dirname, '..', 'personmaster-builder', 'output');
var DOCUMENTS_PATH = path.join(BUILDER_OUTPUT_DIR, 'personmaster_documents.json');
var EDGES_PATH = path.join(BUILDER_OUTPUT_DIR, 'personmaster_edges.json');

async function processSignal(eventType, recordData, options) {
  var t0 = Date.now();
  console.log('\n=== Incremental Sync Signal ===');
  console.log('  Event: ' + eventType);
  console.log('  Table: ' + (recordData.source_table || recordData.table || 'unknown'));
  console.log('  ID:    ' + (recordData.source_id || recordData.id || 'unknown'));

  var sourceData = documentBuilder.loadSourceData();

  console.log('\n[1] Loading existing PersonMaster documents...');
  var pmDocuments = JSON.parse(fs.readFileSync(DOCUMENTS_PATH, 'utf8'));
  console.log('  Existing PMs: ' + pmDocuments.length);

  var existingEdges = JSON.parse(fs.readFileSync(EDGES_PATH, 'utf8'));
  var edges = existingEdges.edges || [];
  console.log('  Existing edges: ' + edges.length);

  console.log('\n[2] Preparing incoming record...');
  var incomingRecord = candidateLoader.prepareRecord(
    recordData.name || recordData.AccusedName || recordData.VictimName || recordData.ComplainantName || '',
    parseInt(recordData.age || recordData.AgeYear, 10) || null,
    recordData.gender || null,
    recordData.case_id || recordData.CaseMasterID || '',
    recordData.source_table || recordData.table || '',
    recordData.source_id || recordData.id || ''
  );

  var recKeys = candidateLoader.computeBlockingKeys(incomingRecord);
  console.log('  Name: ' + incomingRecord.name);
  console.log('  Normalised: ' + incomingRecord.normalised_name);
  console.log('  Blocking keys: ' + JSON.stringify(recKeys));

  console.log('\n[3] Finding candidate PersonMasters...');
  var candidates = candidateLoader.loadCandidates(incomingRecord, sourceData, pmDocuments);
  console.log('  Candidates found: ' + candidates.length);

  if (candidates.length > 0) {
    for (var ci = 0; ci < Math.min(candidates.length, 3); ci++) {
      console.log('    - ' + candidates[ci].person_id + ' (' + candidates[ci].canonical_name + ')');
    }
    if (candidates.length > 3) console.log('    ... and ' + (candidates.length - 3) + ' more');
  }

  console.log('\n[4] Running Entity Matching...');
  var resolution = incrementalResolver.resolve(incomingRecord, candidates, sourceData);
  console.log('  Matched: ' + resolution.matched);
  console.log('  Best score: ' + resolution.bestScore.toFixed(4));
  if (resolution.bestPM) {
    console.log('  Matched to: ' + resolution.bestPM.person_id + ' (' + resolution.bestPM.canonical_name + ')');
  }

  var affectedPM;

  console.log('\n[5] Updating PersonMaster...');
  if (resolution.matched && resolution.bestPM) {
    affectedPM = personUpdater.applyMatch(resolution.bestPM, incomingRecord, sourceData);
    console.log('  Updated: ' + affectedPM.person_id);
    console.log('  Source records: ' + affectedPM.source_records.length);
    console.log('  Aliases: ' + affectedPM.aliases.length);
  } else {
    var newId = personUpdater.generateNewPersonId(pmDocuments);
    affectedPM = personUpdater.createNew(incomingRecord, sourceData);
    affectedPM.person_id = newId;
    pmDocuments.push(affectedPM);
    console.log('  Created: ' + affectedPM.person_id);
  }

  console.log('\n[6] Recomputing edges...');
  var updatedEdges = edgeUpdater.recomputeEdgesForPM(
    affectedPM, pmDocuments,
    sourceData.cmLookup, edges
  );
  console.log('  Edges before: ' + edges.length);
  console.log('  Edges after:  ' + updatedEdges.length);

  var adjacency = edgeUpdater.extractAdjacencyForPM(affectedPM.person_id, updatedEdges);
  console.log('  Adjacency for ' + affectedPM.person_id + ':');
  console.log('    co_accused: ' + adjacency.co_accused.length);
  console.log('    accused_to_victim: ' + adjacency.accused_to_victim.length);
  console.log('    shared_location: ' + adjacency.shared_location.length);
  console.log('    unconfirmed_matches: ' + adjacency.unconfirmed_matches.length);

  var elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  console.log('\n[7] Result Summary');
  console.log('  ' + '-'.repeat(40));
  console.log('  Signal received:      ' + (eventType || 'SIMULATED'));
  console.log('  Person ' + (resolution.matched ? 'matched' : 'created') + ':');
  console.log('    PM ID:   ' + affectedPM.person_id);
  console.log('    Name:    ' + affectedPM.canonical_name);
  console.log('    Records: ' + affectedPM.source_records.length);
  console.log('  Edges updated:        ' + updatedEdges.length);
  console.log('  Elapsed time:         ' + elapsed + 's');
  console.log('  ' + '-'.repeat(40));

  return {
    eventType: eventType,
    matched: resolution.matched,
    personId: affectedPM.person_id,
    personName: affectedPM.canonical_name,
    sourceRecords: affectedPM.source_records.length,
    totalEdges: updatedEdges.length,
    elapsed: elapsed,
    pmDocument: affectedPM,
    edges: updatedEdges
  };
}

module.exports = { processSignal };
