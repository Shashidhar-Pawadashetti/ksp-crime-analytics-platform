'use strict';

var { deterministicEdgeId } = require('../personmaster-writer/edgeModel');

var CANDIDATE_EDGE_TYPE = 'candidate_match';

var passed = 0;
var failed = 0;

function assert(condition, message) {
  if (condition) { passed++; console.log('  \u2713 ' + message); }
  else { failed++; console.log('  \u2717 ' + message); }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) { passed++; console.log('  \u2713 ' + message); }
  else { failed++; console.log('  \u2717 ' + message + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')'); }
}

/* -- Import code from index.js by copying the relevant functions -- */
function isLegacyCandidateEdge(edge) {
  return edge && edge.with_person_id != null && !edge.edge_type && !edge.type;
}

function isCanonicalCandidateEdge(edge) {
  return edge && edge.edge_type != null && edge.target_person_id != null;
}

function isSemiCanonicalEdge(edge) {
  return edge && edge.with_person_id != null && edge.type != null && !edge.edge_type;
}

function generateEdgeId(personIdA, personIdB, edgeType, caseIds) {
  var ids = [personIdA, personIdB].sort();
  var parts = [ids[0], ids[1], edgeType];
  if (Array.isArray(caseIds) && caseIds.length > 0) {
    parts.push(caseIds.slice().sort().join('|'));
  }
  var seed = parts.join('|');
  var hash = 0xCBF29CE484222325;
  for (var i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x100000001B3);
    hash = hash >>> 0;
  }
  return 'E-' + hash.toString(16).padStart(12, '0').slice(0, 8).toUpperCase();
}

function convertLegacyEdge(edge, personId) {
  var targetPersonId = edge.with_person_id;
  var edgeId = generateEdgeId(personId, targetPersonId, CANDIDATE_EDGE_TYPE);
  var confidence = edge.confidence != null ? edge.confidence : 0.5;
  var now = new Date().toISOString();

  return {
    edge_id: edgeId,
    edge_type: CANDIDATE_EDGE_TYPE,
    target_person_id: targetPersonId,
    confidence: confidence,
    evidence: [{
      type: 'MATCH_SCORE',
      confidence: confidence,
      score_breakdown: edge.score_breakdown || {},
      weight: 1
    }],
    case_ids: edge.case_ids || [],
    created_at: now,
    version: 1
  };
}

function convertSemiCanonicalEdge(edge, personId) {
  var targetPersonId = edge.with_person_id;
  var edgeId = edge.edge_id || generateEdgeId(personId, targetPersonId, CANDIDATE_EDGE_TYPE);
  var confidence = edge.confidence != null ? edge.confidence : 0.5;
  var now = new Date().toISOString();

  var evidence = edge.evidence;
  if (!evidence || !Array.isArray(evidence) || evidence.length === 0) {
    evidence = [{
      type: 'MATCH_SCORE',
      confidence: confidence,
      score_breakdown: edge.score_breakdown || {},
      weight: 1
    }];
  }

  return {
    edge_id: edgeId,
    edge_type: CANDIDATE_EDGE_TYPE,
    target_person_id: targetPersonId,
    confidence: confidence,
    evidence: evidence,
    case_ids: edge.case_ids || [],
    created_at: edge.created_at || now,
    version: edge.version || 1
  };
}

/* ============================================================
   Tests
   ============================================================ */

console.log('=== Candidate Edge Migration Tests ===\n');

/* -- Test 1: isLegacyCandidateEdge -- */
console.log('Test 1: isLegacyCandidateEdge');
(function () {
  assert(isLegacyCandidateEdge({ with_person_id: 'PM_000411', confidence: 0.76 }) === true, 'detects legacy edge with with_person_id only');
  assert(isLegacyCandidateEdge({ with_person_id: 'PM_000411', confidence: 0.76, score_breakdown: { name_score: 0.7 } }) === true, 'detects legacy edge with score_breakdown');
  assert(isLegacyCandidateEdge({ edge_type: 'candidate_match', target_person_id: 'PM_000411' }) === false, 'rejects canonical edge');
  assert(isLegacyCandidateEdge({ type: 'candidate_match', with_person_id: 'PM_000411' }) === false, 'rejects semi-canonical edge (has type)');
  assert(!isLegacyCandidateEdge(null), 'rejects null');
  assert(!isLegacyCandidateEdge(undefined), 'rejects undefined');
  assert(isLegacyCandidateEdge({}) === false, 'rejects empty object');
})();

/* -- Test 2: isCanonicalCandidateEdge -- */
console.log('\nTest 2: isCanonicalCandidateEdge');
(function () {
  assert(isCanonicalCandidateEdge({ edge_type: 'candidate_match', target_person_id: 'PM_000411' }) === true, 'detects canonical edge');
  assert(isCanonicalCandidateEdge({ edge_type: 'candidate_match', target_person_id: 'PM_000411', confidence: 0.76 }) === true, 'detects canonical edge with confidence');
  assert(isCanonicalCandidateEdge({ with_person_id: 'PM_000411', confidence: 0.76 }) === false, 'rejects legacy edge');
  assert(isCanonicalCandidateEdge({ type: 'candidate_match', with_person_id: 'PM_000411' }) === false, 'rejects semi-canonical edge');
  assert(!isCanonicalCandidateEdge(null), 'rejects null');
})();

/* -- Test 3: isSemiCanonicalEdge -- */
console.log('\nTest 3: isSemiCanonicalEdge');
(function () {
  assert(isSemiCanonicalEdge({ type: 'candidate_match', with_person_id: 'PM_000411', edge_id: 'E-1234' }) === true, 'detects semi-canonical edge');
  assert(isSemiCanonicalEdge({ type: 'candidate_match', with_person_id: 'PM_000411' }) === true, 'detects semi-canonical edge without edge_id');
  assert(isSemiCanonicalEdge({ edge_type: 'candidate_match', target_person_id: 'PM_000411' }) === false, 'rejects canonical edge');
  assert(isSemiCanonicalEdge({ with_person_id: 'PM_000411' }) === false, 'rejects legacy edge (no type)');
})();

/* -- Test 4: generateEdgeId -- */
console.log('\nTest 4: generateEdgeId deterministic');
(function () {
  var id1 = generateEdgeId('PM_001', 'PM_002', CANDIDATE_EDGE_TYPE);
  var id2 = generateEdgeId('PM_002', 'PM_001', CANDIDATE_EDGE_TYPE);
  assertEqual(id1, id2, 'edge_id is same regardless of argument order (undirected)');
  assert(id1.indexOf('E-') === 0, 'edge_id starts with E-');
  assert(id1.length > 5, 'edge_id is non-trivial');

  var id3 = generateEdgeId('PM_001', 'PM_002', CANDIDATE_EDGE_TYPE, ['CASE_001']);
  assert(id1 !== id3, 'different case_ids produce different edge_id');

  var id4 = generateEdgeId('PM_001', 'PM_002', CANDIDATE_EDGE_TYPE, ['CASE_999']);
  assert(id3 !== id4, 'different case_ids produce different edge_id');

  /* Verify match with edgeModel.deterministicEdgeId */
  var refId = deterministicEdgeId('PM_001', 'PM_002', CANDIDATE_EDGE_TYPE);
  assertEqual(id1, refId, 'generateEdgeId matches edgeModel.deterministicEdgeId');
})();

/* -- Test 5: convertLegacyEdge full -- */
console.log('\nTest 5: convertLegacyEdge produces canonical format');
(function () {
  var legacy = {
    with_person_id: 'PM_000411',
    confidence: 0.76,
    score_breakdown: { location_score: 0.8, name_score: 0.7 }
  };

  var result = convertLegacyEdge(legacy, 'PM_000001');

  assertEqual(result.edge_type, 'candidate_match', 'edge_type is candidate_match');
  assertEqual(result.target_person_id, 'PM_000411', 'target_person_id matches with_person_id');
  assertEqual(result.confidence, 0.76, 'confidence preserved');
  assert(result.edge_id.indexOf('E-') === 0, 'edge_id starts with E-');

  assert(Array.isArray(result.evidence), 'evidence is array');
  assertEqual(result.evidence.length, 1, 'evidence has one entry');
  assertEqual(result.evidence[0].type, 'MATCH_SCORE', 'evidence type is MATCH_SCORE');
  assertEqual(result.evidence[0].confidence, 0.76, 'evidence confidence matches');
  assertEqual(result.evidence[0].score_breakdown.location_score, 0.8, 'evidence has score_breakdown');
  assertEqual(result.evidence[0].weight, 1, 'evidence weight is 1');

  assert(Array.isArray(result.case_ids), 'case_ids is array');
  assertEqual(result.case_ids.length, 0, 'case_ids is empty');
  assertEqual(result.version, 1, 'version is 1');
  assert(result.created_at != null, 'created_at is set');
})();

/* -- Test 6: convertLegacyEdge minimal -- */
console.log('\nTest 6: convertLegacyEdge handles minimal legacy edge');
(function () {
  var legacy = { with_person_id: 'PM_000411' };

  var result = convertLegacyEdge(legacy, 'PM_000001');

  assertEqual(result.confidence, 0.5, 'default confidence is 0.5');
  assertEqual(result.evidence[0].confidence, 0.5, 'evidence default confidence is 0.5');
  assert(typeof result.evidence[0].score_breakdown === 'object', 'evidence has score_breakdown object');
  assertEqual(Object.keys(result.evidence[0].score_breakdown).length, 0, 'evidence has empty score_breakdown');

  try {
    JSON.stringify(result);
    assert(true, 'converted edge is JSON-serializable');
  } catch (e) {
    assert(false, 'converted edge is JSON-serializable: ' + e.message);
  }
})();

/* -- Test 7: convertSemiCanonicalEdge -- */
console.log('\nTest 7: convertSemiCanonicalEdge');
(function () {
  var semi = {
    edge_id: 'E-FEEDBEAD',
    type: 'candidate_match',
    with_person_id: 'PM_000411',
    with_name_normalised: 'Ravi Kumar',
    confidence: 0.85,
    score_breakdown: { name_score: 0.9, age_score: 0.7 },
    case_ids: ['CASE_001'],
    source_records: [{ table: 'Accused', row_id: 'A-123' }]
  };

  var result = convertSemiCanonicalEdge(semi, 'PM_000001');

  assertEqual(result.edge_id, 'E-FEEDBEAD', 'edge_id preserved from semi-canonical');
  assertEqual(result.edge_type, 'candidate_match', 'edge_type set from constant');
  assertEqual(result.target_person_id, 'PM_000411', 'target_person_id from with_person_id');
  assertEqual(result.confidence, 0.85, 'confidence preserved');
  assertEqual(result.evidence[0].score_breakdown.name_score, 0.9, 'evidence includes score_breakdown');
  assertEqual(result.case_ids[0], 'CASE_001', 'case_ids preserved');
  assertEqual(result.version, 1, 'version defaults to 1');
})();

/* -- Test 8: convertSemiCanonicalEdge preserves evidence if present -- */
console.log('\nTest 8: convertSemiCanonicalEdge preserves existing evidence');
(function () {
  var semi = {
    edge_id: 'E-CAFEBABE',
    type: 'candidate_match',
    with_person_id: 'PM_000411',
    evidence: [{ type: 'MANUAL_REVIEW', note: 'confirmed by operator', weight: 1 }],
    confidence: 0.9
  };

  var result = convertSemiCanonicalEdge(semi, 'PM_000001');

  assertEqual(result.evidence.length, 1, 'evidence preserved');
  assertEqual(result.evidence[0].type, 'MANUAL_REVIEW', 'evidence type preserved');
  assertEqual(result.evidence[0].note, 'confirmed by operator', 'evidence note preserved');
})();

/* -- Test 9: Undirected edge_id consistency -- */
console.log('\nTest 9: Undirected edge_id consistency');
(function () {
  var legacyA = { with_person_id: 'PM_000411', confidence: 0.76 };
  var legacyB = { with_person_id: 'PM_000001', confidence: 0.76 };

  var resultA = convertLegacyEdge(legacyA, 'PM_000001');
  var resultB = convertLegacyEdge(legacyB, 'PM_000411');

  assertEqual(resultA.edge_id, resultB.edge_id, 'converted edge_id is same regardless of source person');
})();

/* -- Test 10: Sample migration scenario (in-memory, no DB) -- */
console.log('\nTest 10: In-memory migration scenario');
(function () {
  var docs = [
    {
      person_id: 'PM_000001',
      unconfirmed_edges: [
        { with_person_id: 'PM_000411', confidence: 0.76, score_breakdown: { location_score: 0.8, name_score: 0.7 } },
        { with_person_id: 'PM_000512', confidence: 0.62, score_breakdown: { name_score: 0.6 } }
      ]
    },
    {
      person_id: 'PM_000002',
      unconfirmed_edges: [
        { edge_type: 'candidate_match', target_person_id: 'PM_000411', confidence: 0.9, evidence: [], case_ids: [], created_at: new Date().toISOString(), version: 1 }
      ]
    },
    {
      person_id: 'PM_000003',
      unconfirmed_edges: [
        { type: 'candidate_match', with_person_id: 'PM_000512', edge_id: 'E-OLD1234', confidence: 0.8, score_breakdown: { name_score: 0.8 } }
      ]
    },
    {
      person_id: 'PM_000004',
      unconfirmed_edges: []
    }
  ];

  var legacyTotal = 0;
  var semiTotal = 0;
  var canonicalTotal = 0;
  var invalidTotal = 0;
  var docsChanged = 0;

  for (var di = 0; di < docs.length; di++) {
    var doc = docs[di];
    var edges = doc.unconfirmed_edges || [];
    var changed = false;
    var converted = [];

    for (var ei = 0; ei < edges.length; ei++) {
      var edge = edges[ei];

      if (isCanonicalCandidateEdge(edge)) {
        converted.push(edge);
        canonicalTotal++;
      } else if (isLegacyCandidateEdge(edge)) {
        converted.push(convertLegacyEdge(edge, doc.person_id));
        legacyTotal++;
        changed = true;
      } else if (isSemiCanonicalEdge(edge)) {
        converted.push(convertSemiCanonicalEdge(edge, doc.person_id));
        semiTotal++;
        changed = true;
      } else {
        invalidTotal++;
      }
    }

    if (changed) {
      doc.unconfirmed_edges = converted;
      docsChanged++;
    }
  }

  assertEqual(legacyTotal, 2, '2 legacy edges found across docs');
  assertEqual(semiTotal, 1, '1 semi-canonical edge found');
  assertEqual(canonicalTotal, 1, '1 canonical edge preserved');
  assertEqual(invalidTotal, 0, '0 invalid edges');
  assertEqual(docsChanged, 2, '2 documents modified (PM_000001, PM_000003)');

  /* Verify PM_000001 edges are now canonical */
  var pm1Edges = docs[0].unconfirmed_edges;
  assertEqual(pm1Edges.length, 2, 'PM_000001 has 2 edges after conversion');
  assert(isCanonicalCandidateEdge(pm1Edges[0]), 'PM_000001 edge 0 is canonical');
  assert(isCanonicalCandidateEdge(pm1Edges[1]), 'PM_000001 edge 1 is canonical');
  assertEqual(pm1Edges[0].target_person_id, 'PM_000411', 'PM_000001 edge 0 targets PM_000411');
  assertEqual(pm1Edges[1].target_person_id, 'PM_000512', 'PM_000001 edge 1 targets PM_000512');

  /* Verify PM_000002 edges unchanged */
  assertEqual(docs[1].unconfirmed_edges.length, 1, 'PM_000002 edges unchanged');
  assertEqual(docs[1].unconfirmed_edges[0].edge_type, 'candidate_match', 'PM_000002 edge_type preserved');

  /* Verify PM_000003 converted */
  var pm3Edge = docs[2].unconfirmed_edges[0];
  assertEqual(pm3Edge.edge_id, 'E-OLD1234', 'PM_000003 edge_id preserved');
  assertEqual(pm3Edge.edge_type, 'candidate_match', 'PM_000003 edge_type set');
  assertEqual(pm3Edge.target_person_id, 'PM_000512', 'PM_000003 target_person_id set');
})();

/* -- Summary -- */
if (require.main === module) {
  console.log('\n=== Results ===');
  console.log('Passed: ' + passed);
  console.log('Failed: ' + failed);
  if (failed > 0) {
    process.exit(1);
  }
}

/* ============================================================
   Pagination Tests (mocha)
   ============================================================ */
if (typeof describe === 'function') {
  var path = require('path');
  var indexFile = path.resolve(__dirname, 'index.js');
  var pmMigration = require(indexFile);
  var loadAllDocuments = pmMigration.loadAllDocuments;

  var NoSQLMarshall = {
    makeString: function (s) { return { S: s }; }
  };

  function makePagedDoc(index) {
    return {
      person_id: 'PM_PAGED_' + String(index).padStart(5, '0'),
      type: 'PM',
      source_records: []
    };
  }

  function createPaginatedTable(docCount, pageSize) {
    var docs = [];
    for (var i = 0; i < docCount; i++) {
      docs.push(makePagedDoc(i));
    }

    var callCount = 0;
    var capturedBodies = [];

    var queryFn = async function (queryBody) {
      callCount++;
      capturedBodies.push(JSON.parse(JSON.stringify(queryBody)));

      var startIdx = 0;
      if (queryBody.start_key) {
        var startPersonId = queryBody.start_key.person_id;
        for (var si = 0; si < docs.length; si++) {
          if (docs[si].person_id === startPersonId) {
            startIdx = si;
            break;
          }
        }
        if (startIdx >= docs.length) {
          return { getResponseData: function () { return []; }, start_key: null };
        }
      }

      var pageItems = docs.slice(startIdx, startIdx + pageSize);
      var responseData = pageItems.map(function (d) {
        return { item: { to: function () { return JSON.parse(JSON.stringify(d)); } } };
      });

      var nextIdx = startIdx + pageSize;
      var nextKey = null;
      if (nextIdx < docs.length) {
        nextKey = { person_id: docs[nextIdx].person_id, type: 'PM' };
      }

      return {
        getResponseData: function () { return responseData; },
        start_key: nextKey
      };
    };

    queryFn.getCallCount = function () { return callCount; };
    queryFn.getCapturedBodies = function () { return capturedBodies; };

    return queryFn;
  }

  function createMockApp(mockQueryTable) {
    return {
      nosql: function () {
        return {
          getTable: async function () {
            return { queryTable: mockQueryTable };
          }
        };
      }
    };
  }

  describe('loadAllDocuments pagination', function () {

    it('1. loads single page (< 100 docs) with correct query contract', async function () {
      var mockQuery = createPaginatedTable(50, 100);
      var app = createMockApp(mockQuery);
      var docs = await loadAllDocuments(app);
      if (docs.length !== 50) throw new Error('expected 50 docs, got ' + docs.length);
      if (mockQuery.getCallCount() !== 1) throw new Error('expected 1 call, got ' + mockQuery.getCallCount());
      var body = mockQuery.getCapturedBodies()[0];
      if (typeof body.key_condition.attribute !== 'string') throw new Error('attribute must be string');
      if (body.key_condition.attribute !== 'type') throw new Error('attribute must be "type"');
      if (body.key_condition.operator !== 'equals') throw new Error('operator must be EQUALS');
      if (!body.key_condition.value || !body.key_condition.value.S) throw new Error('value must be NoSQLMarshall string');
      if (body.key_condition.value.S !== 'PM') throw new Error('value must be "PM"');
      if (body.limit !== 100) throw new Error('limit must be 100');
      if (body.consistent_read !== true) throw new Error('consistent_read must be true');
      if (body.start_key !== undefined) throw new Error('first page must not have start_key');
    });

    it('2. loads exactly 100 documents (boundary)', async function () {
      var mockQuery = createPaginatedTable(100, 100);
      var app = createMockApp(mockQuery);
      var docs = await loadAllDocuments(app);
      if (docs.length !== 100) throw new Error('expected 100 docs, got ' + docs.length);
      if (mockQuery.getCallCount() !== 1) throw new Error('expected 1 call, got ' + mockQuery.getCallCount());
    });

    it('3. loads 3 pages (250 documents)', async function () {
      var mockQuery = createPaginatedTable(250, 100);
      var app = createMockApp(mockQuery);
      var docs = await loadAllDocuments(app);
      if (docs.length !== 250) throw new Error('expected 250 docs, got ' + docs.length);
      if (mockQuery.getCallCount() !== 3) throw new Error('expected 3 calls, got ' + mockQuery.getCallCount());
      var bodies = mockQuery.getCapturedBodies();
      if (bodies[0].start_key != null) throw new Error('first page should have no start_key');
      if (!bodies[1].start_key) throw new Error('second page should have start_key');
      if (!bodies[2].start_key) throw new Error('third page should have start_key');
    });

    it('4. final short page (250 docs, last page has 50)', async function () {
      var mockQuery = createPaginatedTable(250, 100);
      var app = createMockApp(mockQuery);
      var docs = await loadAllDocuments(app);
      if (docs.length !== 250) throw new Error('expected 250 docs, got ' + docs.length);
      var bodies = mockQuery.getCapturedBodies();
      if (bodies.length !== 3) throw new Error('expected 3 pages');
    });

    it('5. start_key propagates correctly across pages', async function () {
      var mockQuery = createPaginatedTable(250, 100);
      var app = createMockApp(mockQuery);
      await loadAllDocuments(app);
      var bodies = mockQuery.getCapturedBodies();
      if (bodies.length !== 3) throw new Error('expected 3 pages, got ' + bodies.length);
      if (bodies[0].start_key !== undefined) throw new Error('first page should not have start_key');
      if (!bodies[1].start_key) throw new Error('second page should have start_key');
      if (bodies[1].start_key.person_id !== 'PM_PAGED_00100') {
        throw new Error('second page start_key should be PM_PAGED_00100, got ' + bodies[1].start_key.person_id);
      }
      if (!bodies[2].start_key) throw new Error('third page should have start_key');
      if (bodies[2].start_key.person_id !== 'PM_PAGED_00200') {
        throw new Error('third page start_key should be PM_PAGED_00200, got ' + bodies[2].start_key.person_id);
      }
    });

    it('6. load/query failure is caught and reported', async function () {
      var failingTable = {
        queryTable: async function () {
          throw new Error('Simulated NoSQL queryTable failure');
        }
      };
      var failingApp = {
        nosql: function () {
          return { getTable: async function () { return failingTable; } };
        }
      };
      var threw = false;
      try {
        await loadAllDocuments(failingApp);
      } catch (err) {
        threw = true;
        if (err.message.indexOf('Simulated NoSQL') === -1) {
          throw new Error('unexpected error message: ' + err.message);
        }
      }
      if (!threw) throw new Error('should have thrown on query failure');
    });

  });
}
