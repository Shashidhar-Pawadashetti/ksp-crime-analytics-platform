'use strict';

/*
 * Integration test for Phase 4.1 → 4.2.1 → 4.2.2 Entity Resolution pipeline.
 *
 * Tests the full pipeline end-to-end:
 *   Entity Matching Engine → PersonMaster Writer → Edge Generator
 *
 * Run: node test_integration.js
 */

/* ------------------------------------------------------------------ */
/*  Imports                                                            */
/* ------------------------------------------------------------------ */

var normaliser = require('./entity-matching-engine/normaliser');
var phonetic = require('./entity-matching-engine/phonetic');
var blocking = require('./entity-matching-engine/blocking');
var scorer = require('./entity-matching-engine/scorer');
var threshold = require('./entity-matching-engine/threshold');

var { buildPersonMaster } = require('./documentBuilder');
var { deterministicPersonId } = require('./index');
var { generateConfirmedEdges, generateCandidateMatchEdges } = require('./edgeGenerator');
var { mergeEdgesIntoDocument } = require('./edgePersistence');
var { EDGE_TYPES } = require('./edgeTypes');

var normaliseName = normaliser.normaliseName;
var generatePhoneticKey = phonetic.generatePhoneticKey;
var generateUniquePairs = blocking.generateUniquePairs;
var computeScore = scorer.computeScore;
var classify = threshold.classify;

/* ------------------------------------------------------------------ */
/*  Test harness                                                       */
/* ------------------------------------------------------------------ */

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

function assertDeepEqual(actual, expected, message) {
  var aStr = JSON.stringify(actual);
  var eStr = JSON.stringify(expected);
  if (aStr === eStr) {
    passed++;
    console.log('  \u2713 ' + message);
  } else {
    failed++;
    console.log('  \u2717 ' + message);
    console.log('    expected: ' + eStr);
    console.log('    actual:   ' + aStr);
  }
}

/* ------------------------------------------------------------------ */
/*  DSU (Union-Find) — inlined from index.js lines 51-95              */
/* ------------------------------------------------------------------ */

function DSU() {
  this.parent = {};
  this.rank = {};
}

DSU.prototype.makeSet = function (x) {
  if (!(x in this.parent)) {
    this.parent[x] = x;
    this.rank[x] = 0;
  }
};

DSU.prototype.find = function (x) {
  if (this.parent[x] !== x) {
    this.parent[x] = this.find(this.parent[x]);
  }
  return this.parent[x];
};

DSU.prototype.union = function (x, y) {
  this.makeSet(x);
  this.makeSet(y);
  var px = this.find(x);
  var py = this.find(y);
  if (px === py) return;
  if (this.rank[px] < this.rank[py]) {
    this.parent[px] = py;
  } else if (this.rank[px] > this.rank[py]) {
    this.parent[py] = px;
  } else {
    this.parent[py] = px;
    this.rank[px]++;
  }
};

DSU.prototype.getClusters = function () {
  var clusters = {};
  var keys = Object.keys(this.parent);
  for (var i = 0; i < keys.length; i++) {
    var root = this.find(keys[i]);
    if (!clusters[root]) clusters[root] = [];
    clusters[root].push(keys[i]);
  }
  return Object.values(clusters);
};

/* ------------------------------------------------------------------ */
/*  Mock source records                                                */
/* ------------------------------------------------------------------ */

var mockRecords = [
  { source_table: 'Accused', source_id: 'A-1',  case_id: 'CM-001', name: 'Rajesh Kumar',  age: 32, gender: 'M', date_of_offence: '2024-01-15', unit_id: 'U1', district_id: 'D1' },
  { source_table: 'Accused', source_id: 'A-2',  case_id: 'CM-001', name: 'Suresh Patel',  age: 28, gender: 'M', date_of_offence: '2024-01-15', unit_id: 'U1', district_id: 'D1' },
  { source_table: 'Victim',  source_id: 'V-1',  case_id: 'CM-001', name: 'Anita Sharma',  age: 35, gender: 'F', date_of_offence: '2024-01-15', unit_id: 'U1', district_id: 'D1' },
  { source_table: 'Accused', source_id: 'A-3',  case_id: 'CM-002', name: 'Rajesh Kumar',  age: 33, gender: 'M', date_of_offence: '2024-03-20', unit_id: 'U2', district_id: 'D1' },
  { source_table: 'Victim',  source_id: 'V-2',  case_id: 'CM-002', name: 'Priya Singh',   age: 29, gender: 'F', date_of_offence: '2024-03-20', unit_id: 'U2', district_id: 'D1' },
  { source_table: 'Accused', source_id: 'A-4',  case_id: 'CM-003', name: 'Vikram Joshi',  age: 45, gender: 'M', date_of_offence: '2024-06-10', unit_id: 'U3', district_id: 'D2' },
  { source_table: 'ComplainantDetails', source_id: 'C-1', case_id: 'CM-001', name: 'Anita Sharma', age: 35, gender: 'F', date_of_offence: '2024-01-15', unit_id: 'U1', district_id: 'D1' },
  { source_table: 'ComplainantDetails', source_id: 'C-2', case_id: 'CM-003', name: 'Meena Devi',   age: 50, gender: 'F', date_of_offence: '2024-06-10', unit_id: 'U3', district_id: 'D2' }
];

/* ------------------------------------------------------------------ */
/*  Run the full pipeline once, returning all intermediate artifacts   */
/* ------------------------------------------------------------------ */

function runPipeline(recordsInput) {
  /* -- Deep copy so multiple runs are independent -- */
  var records = JSON.parse(JSON.stringify(recordsInput));

  /* ---- Step 1: Normalise & Phoneticize ---- */
  records.forEach(function (r) {
    r.normalised_name = normaliseName(r.name);
    r.phonetic_key = generatePhoneticKey(r.name);
  });

  /* ---- Step 2: Entity Matching ---- */
  var pairs = generateUniquePairs(records);

  var matchedPairs = [];
  for (var pi = 0; pi < pairs.length; pi++) {
    var pair = pairs[pi];
    var result = computeScore(pair.a, pair.b);
    var gate = classify(result.confidence);
    if (gate.label === 'CONFIRMED' || gate.label === 'UNCONFIRMED') {
      matchedPairs.push({
        a: pair.a,
        b: pair.b,
        confidence: result.confidence,
        score_breakdown: result.score_breakdown,
        classification: gate.label
      });
    }
  }

  /* ---- Step 3: Cluster via DSU ---- */
  var dsu = new DSU();
  var recordByKey = {};

  for (var mi = 0; mi < matchedPairs.length; mi++) {
    var mp = matchedPairs[mi];
    var keyA = mp.a.source_table + ':' + mp.a.source_id;
    var keyB = mp.b.source_table + ':' + mp.b.source_id;
    dsu.makeSet(keyA);
    dsu.makeSet(keyB);
    dsu.union(keyA, keyB);
    if (!recordByKey[keyA]) recordByKey[keyA] = mp.a;
    if (!recordByKey[keyB]) recordByKey[keyB] = mp.b;
  }

  records.forEach(function (r) {
    var key = r.source_table + ':' + r.source_id;
    if (!recordByKey[key]) recordByKey[key] = r;
    dsu.makeSet(key);
  });

  var clusterKeys = dsu.getClusters();
  var clusters = clusterKeys.map(function (keys) {
    return keys.map(function (k) { return recordByKey[k]; });
  });

  /* -- Attach average confidence to each record -- */
  var pairConfMap = {};
  for (var ci = 0; ci < matchedPairs.length; ci++) {
    var pairConf = matchedPairs[ci];
    var pkA = pairConf.a.source_table + ':' + pairConf.a.source_id;
    var pkB = pairConf.b.source_table + ':' + pairConf.b.source_id;
    if (!pairConfMap[pkA]) pairConfMap[pkA] = [];
    if (!pairConfMap[pkB]) pairConfMap[pkB] = [];
    pairConfMap[pkA].push(pairConf.confidence);
    pairConfMap[pkB].push(pairConf.confidence);
  }

  clusters.forEach(function (cluster) {
    cluster.forEach(function (rec) {
      var key = rec.source_table + ':' + rec.source_id;
      var scores = pairConfMap[key] || [];
      if (scores.length > 0) {
        var sum = scores.reduce(function (a, b) { return a + b; }, 0);
        rec.confidence = Math.round((sum / scores.length) * 100) / 100;
      }
    });
  });

  /* ---- Step 4: Build PersonMaster Documents ---- */
  var documents = [];
  clusters.forEach(function (cluster) {
    var personId = deterministicPersonId(cluster);

    var confidences = [];
    cluster.forEach(function (r) {
      if (r.confidence != null) confidences.push(r.confidence);
    });
    var clusterConfidence = confidences.length > 0
      ? Math.round((confidences.reduce(function (a, b) { return a + b; }, 0) / confidences.length) * 100) / 100
      : null;

    var doc = buildPersonMaster(cluster, {
      person_id: personId,
      confidence_score: clusterConfidence,
      resolution_method: 'phonetic_weighted_score_v1',
      resolved_by: 'personmaster-writer-v1',
      resolution_run_id: 'INTEGRATION-TEST'
    });

    documents.push(doc);
  });

  /* ---- Step 5: Generate Confirmed Edges ---- */
  var confirmedEdgesResult = generateConfirmedEdges(documents);
  var confirmedEdgesByPerson = confirmedEdgesResult.confirmed_edges_by_person;
  var allConfirmedEdges = confirmedEdgesResult.all_confirmed_edges;

  /* ---- Step 6: Generate Candidate Match Edges ---- */
  var unconfirmedPairs = [];
  for (var uip = 0; uip < matchedPairs.length; uip++) {
    if (matchedPairs[uip].classification === 'UNCONFIRMED') {
      unconfirmedPairs.push(matchedPairs[uip]);
    }
  }

  /* -- Build personIdLookup from documents' source_records -- */
  var sourceToPerson = {};
  documents.forEach(function (doc) {
    (doc.source_records || []).forEach(function (sr) {
      var key = sr.table + ':' + sr.row_id;
      sourceToPerson[key] = doc.person_id;
    });
  });

  var personIdLookup = function (table, id) {
    return sourceToPerson[table + ':' + id] || null;
  };

  var candidateMatchResult = generateCandidateMatchEdges(unconfirmedPairs, personIdLookup);
  var unconfirmedEdgesByPerson = candidateMatchResult.unconfirmed_edges_by_person;
  var allUnconfirmedEdges = candidateMatchResult.all_unconfirmed_edges;

  /* ---- Step 7: Merge Edges into Documents ---- */
  documents.forEach(function (doc) {
    var pid = doc.person_id;
    var confirmed = confirmedEdgesByPerson[pid] || [];
    var unconfirmed = unconfirmedEdgesByPerson[pid] || [];

    mergeEdgesIntoDocument(doc, confirmed, 'confirmed_edges');
    mergeEdgesIntoDocument(doc, unconfirmed, 'unconfirmed_edges');
  });

  return {
    records: records,
    pairs: pairs,
    matchedPairs: matchedPairs,
    clusters: clusters,
    documents: documents,
    confirmedEdgesByPerson: confirmedEdgesByPerson,
    allConfirmedEdges: allConfirmedEdges,
    unconfirmedEdgesByPerson: unconfirmedEdgesByPerson,
    allUnconfirmedEdges: allUnconfirmedEdges
  };
}

/* ------------------------------------------------------------------ */
/*  RUN TEST                                                           */
/* ------------------------------------------------------------------ */

console.log('=== Entity Resolution Pipeline — Integration Test ===\n');

var result = runPipeline(mockRecords);
var docs = result.documents;
var clusters = result.clusters;

/* ================================================================== */
/*  CHECKPOINT 1: PersonMaster Integrity                               */
/* ================================================================== */

console.log('\n--- Checkpoint 1: PersonMaster Integrity ---\n');

assertEqual(docs.length, 6, 'Total document count is 6 (2 multi-record clusters + 4 singles)');

docs.forEach(function (doc) {
  assert(
    doc.person_id && typeof doc.person_id === 'string' && doc.person_id.indexOf('PM_') === 0,
    'Document ' + doc.person_id + ' has person_id starting with PM_'
  );
  assert(
    doc.confidence_score === null || (doc.confidence_score >= 0 && doc.confidence_score <= 1),
    'Document ' + doc.person_id + ' has confidence_score between 0 and 1'
  );
});

/* -- Find specific documents by role summary -- */
var rajeshes = docs.filter(function (d) { return d.roles_summary.accused_count === 2 && d.roles_summary.victim_count === 0 && d.roles_summary.complainant_count === 0; });
assertEqual(rajeshes.length, 1, 'Rajesh Kumar doc combines 2 accused records');

var rajsDoc = rajeshes[0];
if (rajsDoc) {
  assertEqual(rajsDoc.roles_summary.total_case_appearances, 2, 'Rajesh Kumar appears in 2 unique cases (CM-001, CM-002)');
  assertEqual(rajsDoc.gender, 'M', 'Rajesh Kumar gender is M');
  assert(rajsDoc.flags.repeat_offender === true, 'Rajesh Kumar flagged as repeat_offender (2 accused cases)');
}

var anitas = docs.filter(function (d) { return d.roles_summary.victim_count === 1 && d.roles_summary.complainant_count === 1; });
assertEqual(anitas.length, 1, 'Anita Sharma doc combines 1 victim + 1 complainant record');

var anitaDoc = anitas[0];
if (anitaDoc) {
  assertEqual(anitaDoc.roles_summary.accused_count, 0, 'Anita Sharma has 0 accused_count');
  assertEqual(anitaDoc.roles_summary.total_case_appearances, 1, 'Anita Sharma appears in 1 unique case (CM-001)');
  assertEqual(anitaDoc.gender, 'F', 'Anita Sharma gender is F');
  assert(anitaDoc.flags.repeat_offender === false, 'Anita Sharma not flagged as repeat_offender');
}

/* -- Verify singles -- */
var singles = docs.filter(function (d) { return d.source_records.length === 1; });
assertEqual(singles.length, 4, '4 singleton documents (Suresh, Priya, Vikram, Meena)');

/* -- Verify total source records across all docs matches input -- */
var totalSources = 0;
docs.forEach(function (d) { totalSources += d.source_records.length; });
assertEqual(totalSources, 8, 'Total source_records across all documents equals 8');

/* -- Verify roles_summary counts match source records -- */
var totalAccused = 0, totalVictim = 0, totalComplainant = 0;
docs.forEach(function (d) {
  totalAccused += d.roles_summary.accused_count;
  totalVictim += d.roles_summary.victim_count;
  totalComplainant += d.roles_summary.complainant_count;
});
assertEqual(totalAccused, 4, 'Total accused_count across all docs is 4');
assertEqual(totalVictim, 2, 'Total victim_count across all docs is 2');
assertEqual(totalComplainant, 2, 'Total complainant_count across all docs is 2');

/* -- Verify all person_ids are unique -- */
var seenPids = {};
var allUnique = true;
docs.forEach(function (d) {
  if (seenPids[d.person_id]) allUnique = false;
  seenPids[d.person_id] = true;
});
assert(allUnique, 'All person_ids are unique');

/* ================================================================== */
/*  CHECKPOINT 2: Confirmed Edges                                      */
/* ================================================================== */

console.log('\n--- Checkpoint 2: Confirmed Edges ---\n');

assert(result.allConfirmedEdges.length > 0, 'At least one confirmed edge exists');

/* -- Build person_id → name mapping for readable assertions -- */
var pidToName = {};
docs.forEach(function (d) {
  pidToName[d.person_id] = d.name_normalised;
});

/* -- Verify CO_ACCUSED edges between co-accused persons -- */
var coAccusedEdges = result.allConfirmedEdges.filter(function (e) { return e.edge_type === EDGE_TYPES.CO_ACCUSED; });
assertEqual(coAccusedEdges.length, 1, 'Exactly 1 unique CO_ACCUSED edge (Rajesh ↔ Suresh in CM-001)');

/* -- Verify ACCUSED_TO_VICTIM edges -- */
var a2vEdges = result.allConfirmedEdges.filter(function (e) { return e.edge_type === EDGE_TYPES.ACCUSED_TO_VICTIM; });
assertEqual(a2vEdges.length, 3, '3 unique ACCUSED_TO_VICTIM edges');

/* -- Verify ACCUSED_TO_VICTIM edges point from accused → victim -- */
/* -- Rajesh (accused in CM-001) → Anita (victim in CM-001) -- */
/* -- Suresh (accused in CM-001) → Anita (victim in CM-001) -- */
/* -- Rajesh (accused in CM-002) → Priya (victim in CM-002) -- */

/* Find documents by name_normalised */
var rajsDocFinal = null;
var sureshesDocFinal = null;
var anitaDocFinal = null;
var priyaDocFinal = null;

docs.forEach(function (d) {
  var name = d.name_normalised;
  if (name === 'rajesh kumar') rajsDocFinal = d;
  else if (name === 'suresh patel') sureshesDocFinal = d;
  else if (name === 'anita sharma') anitaDocFinal = d;
  else if (name === 'priya singh') priyaDocFinal = d;
});

/* -- Rajesh has CO_ACCUSED + 2 ACCUSED_TO_VICTIM edges -- */
if (rajsDocFinal) {
  var rajConfirmed = rajsDocFinal.confirmed_edges || [];
  var rajCoAccused = rajConfirmed.filter(function (e) { return e.edge_type === EDGE_TYPES.CO_ACCUSED; });
  var rajA2V = rajConfirmed.filter(function (e) { return e.edge_type === EDGE_TYPES.ACCUSED_TO_VICTIM; });

  assertEqual(rajCoAccused.length, 1, 'Rajesh Kumar has 1 CO_ACCUSED edge → Suresh');
  assertEqual(rajA2V.length, 2, 'Rajesh Kumar has 2 ACCUSED_TO_VICTIM edges (→ Anita, → Priya)');
  assertEqual(rajConfirmed.length, 3, 'Rajesh Kumar total confirmed_edges = 3');
}

/* -- Suresh has CO_ACCUSED + 1 ACCUSED_TO_VICTIM edge -- */
if (sureshesDocFinal) {
  var surConfirmed = sureshesDocFinal.confirmed_edges || [];
  var surCoAccused = surConfirmed.filter(function (e) { return e.edge_type === EDGE_TYPES.CO_ACCUSED; });
  var surA2V = surConfirmed.filter(function (e) { return e.edge_type === EDGE_TYPES.ACCUSED_TO_VICTIM; });

  assertEqual(surCoAccused.length, 1, 'Suresh Patel has 1 CO_ACCUSED edge → Rajesh');
  assertEqual(surA2V.length, 1, 'Suresh Patel has 1 ACCUSED_TO_VICTIM edge (→ Anita)');
  assertEqual(surConfirmed.length, 2, 'Suresh Patel total confirmed_edges = 2');
}

/* -- Anita (victim) should have NO confirmed edges -- */
if (anitaDocFinal) {
  assertEqual(anitaDocFinal.confirmed_edges.length, 0, 'Anita Sharma (victim/complainant) has 0 confirmed_edges');
}

/* -- Priya (victim) should have NO confirmed edges -- */
if (priyaDocFinal) {
  assertEqual(priyaDocFinal.confirmed_edges.length, 0, 'Priya Singh (victim) has 0 confirmed_edges');
}

/* -- No duplicate edges -- */
var allEdgeIds = [];
var hasDupe = false;
result.allConfirmedEdges.forEach(function (e) {
  if (allEdgeIds.indexOf(e.edge_id) !== -1) hasDupe = true;
  allEdgeIds.push(e.edge_id);
});
assert(!hasDupe, 'No duplicate edge_ids in all_confirmed_edges');

/* -- Bidirectional consistency for CO_ACCUSED -- */
var coAccusedCheck = true;
docs.forEach(function (d) {
  (d.confirmed_edges || []).forEach(function (e) {
    if (e.edge_type === EDGE_TYPES.CO_ACCUSED) {
      var tgt = e.target_person_id;
      var tgtDoc = null;
      for (var di = 0; di < docs.length; di++) {
        if (docs[di].person_id === tgt) { tgtDoc = docs[di]; break; }
      }
      if (tgtDoc) {
        var reciprocal = false;
        (tgtDoc.confirmed_edges || []).forEach(function (te) {
          if (te.edge_type === EDGE_TYPES.CO_ACCUSED && te.target_person_id === d.person_id) {
            reciprocal = true;
          }
        });
        if (!reciprocal) coAccusedCheck = false;
      }
    }
  });
});
assert(coAccusedCheck, 'CO_ACCUSED edges are bidirectional');

/* -- Directed edges (ACCUSED_TO_VICTIM) appear only on accused's document -- */
var a2vOnlyOnAccused = true;
docs.forEach(function (d) {
  (d.confirmed_edges || []).forEach(function (e) {
    if (e.edge_type === EDGE_TYPES.ACCUSED_TO_VICTIM) {
      var isAccused = d.roles_summary.accused_count > 0;
      if (!isAccused) a2vOnlyOnAccused = false;
    }
  });
});
assert(a2vOnlyOnAccused, 'ACCUSED_TO_VICTIM edges only appear on accused documents');

/* -- Confidence on confirmed edges is 1.0 -- */
var allConfOne = true;
result.allConfirmedEdges.forEach(function (e) {
  if (e.confidence !== 1.0) allConfOne = false;
});
assert(allConfOne, 'All confirmed edges have confidence = 1.0');

/* -- Each confirmed edge has at least one case_id -- */
var allHaveCaseIds = true;
result.allConfirmedEdges.forEach(function (e) {
  if (!e.case_ids || e.case_ids.length === 0) allHaveCaseIds = false;
});
assert(allHaveCaseIds, 'All confirmed edges have non-empty case_ids');

/* ================================================================== */
/*  CHECKPOINT 3: Unconfirmed Edges                                    */
/* ================================================================== */

console.log('\n--- Checkpoint 3: Unconfirmed Edges ---\n');

assertEqual(result.allUnconfirmedEdges.length, 0, 'No unconfirmed edges (all matched pairs were CONFIRMED)');

/* -- All documents have empty unconfirmed_edges -- */
var allUnconfEmpty = true;
docs.forEach(function (d) {
  if (d.unconfirmed_edges.length > 0) allUnconfEmpty = false;
});
assert(allUnconfEmpty, 'All documents have empty unconfirmed_edges array');

/* ================================================================== */
/*  CHECKPOINT 4: Determinism                                          */
/* ================================================================== */

console.log('\n--- Checkpoint 4: Determinism ---\n');

var run2 = runPipeline(mockRecords);

/* -- Compare person_ids -- */
var pidsMatch = true;
if (run2.documents.length !== docs.length) {
  pidsMatch = false;
} else {
  for (var pi2 = 0; pi2 < docs.length; pi2++) {
    if (docs[pi2].person_id !== run2.documents[pi2].person_id) {
      pidsMatch = false;
      break;
    }
  }
}
assert(pidsMatch, 'Deterministic person_ids match across two runs');

/* -- Compare edge_ids -- */
var edgeIds1 = result.allConfirmedEdges.map(function (e) { return e.edge_id; }).sort();
var edgeIds2 = run2.allConfirmedEdges.map(function (e) { return e.edge_id; }).sort();

var edgeIdsMatch = edgeIds1.length === edgeIds2.length;
if (edgeIdsMatch) {
  for (var ei2 = 0; ei2 < edgeIds1.length; ei2++) {
    if (edgeIds1[ei2] !== edgeIds2[ei2]) {
      edgeIdsMatch = false;
      break;
    }
  }
}
assert(edgeIdsMatch, 'Deterministic edge_ids match across two runs');

/* -- Compare confidence values -- */
var confMatch = true;
for (var ci2 = 0; ci2 < docs.length; ci2++) {
  if (docs[ci2].confidence_score !== run2.documents[ci2].confidence_score) {
    confMatch = false;
    break;
  }
}
assert(confMatch, 'Confidence scores match across two runs');

/* ================================================================== */
/*  CHECKPOINT 5: Edge Type Constants                                  */
/* ================================================================== */

console.log('\n--- Checkpoint 5: Edge Type Constants ---\n');

assertEqual(EDGE_TYPES.CO_ACCUSED, 'CO_ACCUSED', 'EDGE_TYPES.CO_ACCUSED is CO_ACCUSED');
assertEqual(EDGE_TYPES.ACCUSED_TO_VICTIM, 'ACCUSED_TO_VICTIM', 'EDGE_TYPES.ACCUSED_TO_VICTIM is ACCUSED_TO_VICTIM');
assertEqual(EDGE_TYPES.CANDIDATE_MATCH, 'CANDIDATE_MATCH', 'EDGE_TYPES.CANDIDATE_MATCH is CANDIDATE_MATCH');
assertEqual(EDGE_TYPES.SHARED_COMPLAINANT, 'SHARED_COMPLAINANT', 'EDGE_TYPES.SHARED_COMPLAINANT is SHARED_COMPLAINANT');
assertEqual(EDGE_TYPES.SHARED_LOCATION, 'SHARED_LOCATION', 'EDGE_TYPES.SHARED_LOCATION is SHARED_LOCATION');

/* ================================================================== */
/*  CHECKPOINT 6: Merge Edges (edgePersistence pure function)          */
/* ================================================================== */

console.log('\n--- Checkpoint 6: mergeEdgesIntoDocument ---\n');

var mergeDoc = { person_id: 'PM_MERGE_TEST', confirmed_edges: [], unconfirmed_edges: [] };
var testEdge = { edge_id: 'EDGE_TEST001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_OTHER', confidence: 1.0, evidence: [], case_ids: ['CASE_X'] };

var mergeResult1 = mergeEdgesIntoDocument(mergeDoc, [testEdge], 'confirmed_edges');
assertEqual(mergeResult1.added, 1, 'First merge adds 1 edge');
assertEqual(mergeResult1.skipped, 0, 'First merge skips 0');
assertEqual(mergeResult1.merged.length, 1, 'Merged array has 1 edge');

var mergeResult2 = mergeEdgesIntoDocument(mergeDoc, [testEdge], 'confirmed_edges');
assertEqual(mergeResult2.added, 0, 'Second merge adds 0 (duplicate)');
assertEqual(mergeResult2.skipped, 1, 'Second merge skips 1 (duplicate edge_id)');

/* -- Empty input edge list -- */
var mergeResult3 = mergeEdgesIntoDocument(mergeDoc, [], 'confirmed_edges');
assertEqual(mergeResult3.added, 0, 'Empty edge list adds 0');
assertEqual(mergeResult3.merged.length, 1, 'Empty edge list preserves existing edges');

/* -- Edge missing edge_id is skipped -- */
var badEdge = { edge_type: 'CO_ACCUSED', target_person_id: 'PM_BAD' };
var mergeResult4 = mergeEdgesIntoDocument(mergeDoc, [badEdge], 'unconfirmed_edges');
assertEqual(mergeResult4.added, 0, 'Edge without edge_id is skipped');
assertEqual(mergeResult4.skipped, 1, 'Edge without edge_id counted as skipped');

/* ================================================================== */
/*  SUMMARY                                                            */
/* ================================================================== */

console.log('\n=== Summary ===');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);

if (failed > 0) {
  process.exit(1);
}
