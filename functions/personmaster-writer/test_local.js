'use strict';

/*
 * Functional test for Phase 4.2.2 Milestone 3 — CANDIDATE_MATCH edge generator.
 *
 * Also verifies Step 1: standardized evidence with weight.
 * Run: node test_local.js
 */

var { generateConfirmedEdges, generateCandidateMatchEdges } = require('./edgeGenerator');
var { EDGE_TYPES } = require('./edgeTypes');

var passed = 0;
var failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  \u2713 ' + message);
  } else {
    failed++;
    console.log('  \u2717 ' + message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
    console.log('  \u2713 ' + message);
  } else {
    failed++;
    console.log('  \u2717 ' + message + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
  }
}

console.log('=== CANDIDATE_MATCH Edge Generator Tests ===\n');

/* -- Setup: record-to-person mapping -- */
var recordToPersonMap = {
  'Accused:A-123': 'PM_001',
  'Victim:V-456': 'PM_002',
  'Accused:A-789': 'PM_003',
  'Complainant:C-111': 'PM_001',
  'Victim:V-999': null
};

var lookup = function (table, id) {
  var key = table + ':' + id;
  return recordToPersonMap[key] || null;
};

/* -- Test 1: Basic edge generation -- */
console.log('Test 1: Basic edge generation');
(function () {
  var pairs = [{
    a: { source_table: 'Accused', source_id: 'A-123', name: 'Ravi Kumar', confidence: 0.75 },
    b: { source_table: 'Victim', source_id: 'V-456', name: 'Ravi K', confidence: 0.75 },
    confidence: 0.75,
    score_breakdown: { name_score: 0.8, phonetic_score: 0.9, age_score: 0.5 },
    classification: 'UNCONFIRMED'
  }];

  var result = generateCandidateMatchEdges(pairs, lookup);

  assertEqual(result.all_unconfirmed_edges.length, 1, 'generates exactly one edge for one pair');

  var edge = result.all_unconfirmed_edges[0];
  assertEqual(edge.edge_type, EDGE_TYPES.CANDIDATE_MATCH, 'edge has CANDIDATE_MATCH type');
  assertEqual(edge.confidence, 0.75, 'edge confidence matches pair confidence');
  assert(edge.edge_id != null && edge.edge_id.indexOf('EDGE_') === 0, 'edge has valid edge_id');

  assertEqual(edge.evidence.length, 1, 'edge has one evidence item');
  assertEqual(edge.evidence[0].type, 'MATCH_SCORE', 'evidence has MATCH_SCORE type');
  assertEqual(edge.evidence[0].confidence, 0.75, 'evidence confidence matches pair confidence');
  assertEqual(edge.evidence[0].score_breakdown.name_score, 0.8, 'evidence has score_breakdown with name_score');
  assertEqual(edge.evidence[0].weight, 1, 'evidence has weight: 1');
})();

/* -- Test 2: Undirected — edges in both persons lists -- */
console.log('\nTest 2: Undirected edges appear in both persons lists');
(function () {
  var pairs = [{
    a: { source_table: 'Accused', source_id: 'A-123', name: 'Ravi Kumar', confidence: 0.75 },
    b: { source_table: 'Victim', source_id: 'V-456', name: 'Ravi K', confidence: 0.75 },
    confidence: 0.75,
    score_breakdown: { name_score: 0.8, phonetic_score: 0.9, age_score: 0.5 },
    classification: 'UNCONFIRMED'
  }];

  var result = generateCandidateMatchEdges(pairs, lookup);

  assert(Array.isArray(result.unconfirmed_edges_by_person['PM_001']), 'edge appears in PM_001 list');
  assert(Array.isArray(result.unconfirmed_edges_by_person['PM_002']), 'edge appears in PM_002 list');
  assertEqual(result.unconfirmed_edges_by_person['PM_001'].length, 1, 'PM_001 has one edge');
  assertEqual(result.unconfirmed_edges_by_person['PM_002'].length, 1, 'PM_002 has one edge');

  assertEqual(result.unconfirmed_edges_by_person['PM_001'][0].target_person_id, 'PM_002', 'PM_001 edge targets PM_002');
  assertEqual(result.unconfirmed_edges_by_person['PM_002'][0].target_person_id, 'PM_001', 'PM_002 edge targets PM_001');

  // Both edges share the same edge_id (undirected deterministic)
  assertEqual(
    result.unconfirmed_edges_by_person['PM_001'][0].edge_id,
    result.unconfirmed_edges_by_person['PM_002'][0].edge_id,
    'both directions produce the same edge_id'
  );
})();

/* -- Test 3: Skip pairs with unresolvable person_ids -- */
console.log('\nTest 3: Skip pairs with unresolvable person_ids');
(function () {
  var pairs = [{
    a: { source_table: 'Accused', source_id: 'A-123', name: 'Ravi', confidence: 0.75 },
    b: { source_table: 'Victim', source_id: 'V-999', name: 'Unknown', confidence: 0.75 },
    confidence: 0.75,
    score_breakdown: {},
    classification: 'UNCONFIRMED'
  }];

  var result = generateCandidateMatchEdges(pairs, lookup);
  assertEqual(result.all_unconfirmed_edges.length, 0, 'no edges when one person_id is null');
  assertEqual(Object.keys(result.unconfirmed_edges_by_person).length, 0, 'no person groups for unresolvable pair');
})();

/* -- Test 4: Empty input -- */
console.log('\nTest 4: Empty input');
(function () {
  var result = generateCandidateMatchEdges([], lookup);
  assertEqual(result.all_unconfirmed_edges.length, 0, 'no edges for empty input');
  assertEqual(Object.keys(result.unconfirmed_edges_by_person).length, 0, 'no persons for empty input');
})();

/* -- Test 5: Null/undefined input -- */
console.log('\nTest 5: Null/undefined input');
(function () {
  var r1 = generateCandidateMatchEdges(null, lookup);
  assertEqual(r1.all_unconfirmed_edges.length, 0, 'no edges for null input');

  var r2 = generateCandidateMatchEdges(undefined, lookup);
  assertEqual(r2.all_unconfirmed_edges.length, 0, 'no edges for undefined input');
})();

/* -- Test 6: Invalid lookup (not a function) -- */
console.log('\nTest 6: Invalid lookup function');
(function () {
  var pairs = [{
    a: { source_table: 'Accused', source_id: 'A-123', name: 'Ravi', confidence: 0.75 },
    b: { source_table: 'Victim', source_id: 'V-456', name: 'Ravi K', confidence: 0.75 },
    confidence: 0.75,
    score_breakdown: {},
    classification: 'UNCONFIRMED'
  }];

  var r = generateCandidateMatchEdges(pairs, null);
  assertEqual(r.all_unconfirmed_edges.length, 0, 'no edges when lookup is not a function');
})();

/* -- Test 7: Deduplication of identical pairs -- */
console.log('\nTest 7: Deduplication of identical pairs');
(function () {
  var pair = {
    a: { source_table: 'Accused', source_id: 'A-123', name: 'Ravi Kumar', confidence: 0.85 },
    b: { source_table: 'Victim', source_id: 'V-456', name: 'Ravi K', confidence: 0.85 },
    confidence: 0.85,
    score_breakdown: { name_score: 0.9, phonetic_score: 0.95, age_score: 0.7 },
    classification: 'UNCONFIRMED'
  };

  var result = generateCandidateMatchEdges([pair, pair], lookup);

  assertEqual(result.all_unconfirmed_edges.length, 1, 'deduplication yields one edge for identical pair');
  assertEqual(result.unconfirmed_edges_by_person['PM_001'].length, 1, 'PM_001 has one edge after dedup');
  assertEqual(result.unconfirmed_edges_by_person['PM_002'].length, 1, 'PM_002 has one edge after dedup');
  assertEqual(result.all_unconfirmed_edges[0].evidence.length, 1, 'evidence is deduplicated (both identical)');
})();

/* -- Test 8: Self-pair skip (same person resolved from both sides) -- */
console.log('\nTest 8: Skip pair where both sides resolve to the same person');
(function () {
  var pairs = [{
    a: { source_table: 'Accused', source_id: 'A-123', name: 'Ravi Kumar', confidence: 0.70 },
    b: { source_table: 'Complainant', source_id: 'C-111', name: 'Ravi K', confidence: 0.70 },
    confidence: 0.70,
    score_breakdown: { name_score: 0.75 },
    classification: 'UNCONFIRMED'
  }];

  var result = generateCandidateMatchEdges(pairs, lookup);
  assertEqual(result.all_unconfirmed_edges.length, 0, 'no edges when both sides resolve to same person');
})();

/* -- Test 9: Invalid pairs (null/undefined entries in array) -- */
console.log('\nTest 9: Invalid pairs gracefully skipped');
(function () {
  var pairs = [
    null,
    undefined,
    { a: null, b: { source_table: 'Victim', source_id: 'V-456' } },
    { a: { source_table: 'Accused', source_id: 'A-123' }, b: null }
  ];

  var result = generateCandidateMatchEdges(pairs, lookup);
  assertEqual(result.all_unconfirmed_edges.length, 0, 'no edges when all pairs are invalid');
})();

/* -- Test 10: Step 1 verification — evidence in confirmed edges now has weight -- */
console.log('\nTest 10: Step 1 — evidence in confirmed edges includes weight: 1');
(function () {
  var docs = [{
    person_id: 'PM_001',
    source_records: [
      { case_id: 'CASE_001', table: 'Accused' }
    ]
  }, {
    person_id: 'PM_002',
    source_records: [
      { case_id: 'CASE_001', table: 'Victim' }
    ]
  }];

  var result = generateConfirmedEdges(docs);

  // This pair should produce an ACCUSED_TO_VICTIM edge
  var edges = result.all_confirmed_edges;
  assert(edges.length >= 1, 'confirmed edges generated');

  // Check all evidence items have weight
  var allHaveWeight = true;
  edges.forEach(function (e) {
    (e.evidence || []).forEach(function (ev) {
      if (ev.weight !== 1) allHaveWeight = false;
    });
  });
  assert(allHaveWeight, 'all evidence items in confirmed edges have weight: 1');
})();

/* -- Summary -- */
console.log('\n=== Results ===');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
if (failed > 0) {
  process.exit(1);
}
