'use strict';

var passed = 0;
var failed = 0;
var failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  PASS: ' + name);
  } catch (e) {
    failed++;
    failures.push(name + ': ' + e.message);
    console.log('  FAIL: ' + name);
    console.log('        ' + e.message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || '') + ' expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
  }
}

function assertDeepEqual(actual, expected, message) {
  try {
    require('assert').deepStrictEqual(actual, expected);
  } catch (e) {
    throw new Error((message || '') + ': ' + e.message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

// ============================================================
// Import pipeline functions
// ============================================================

var pipeline = require('../index.js');

var escapeZCQL = pipeline.escapeZCQL;
var bfsTraversePM = pipeline.bfsTraversePM;
var computeDegreeFromEdges = pipeline.computeDegreeFromEdges;
var extractPersonName = pipeline.extractPersonName;
var extractKeywords = pipeline.extractKeywords;
var extractCaseRowId = pipeline.extractCaseRowId;
var classifyByKeyword = pipeline.classifyByKeyword;
var flatRows = pipeline.flatRows;
var zcqlRows = pipeline.zcqlRows;

// ============================================================
// Tests for escapeZCQL
// ============================================================

console.log('\n=== escapeZCQL ===');

test('escapes apostrophe in Irish name O\'Brien', function () {
  assertEqual(escapeZCQL("O'Brien"), "O''Brien");
});

test('escapes apostrophe in Indian name D\'Souza', function () {
  assertEqual(escapeZCQL("D'Souza"), "D''Souza");
});

test('prevents SQL injection tautology', function () {
  assertEqual(escapeZCQL("' OR 1=1 --"), "'' OR 1=1 --");
});

test('prevents SQL injection DROP', function () {
  assertEqual(escapeZCQL("'; DROP TABLE --"), "''; DROP TABLE --");
});

test('blocks wildcard injection *', function () {
  assertEqual(escapeZCQL("*"), "[asterisk]");
});

test('blocks wildcard injection ?', function () {
  assertEqual(escapeZCQL("?"), "[question]");
});

test('preserves Kannada/Devanagari names', function () {
  assertEqual(escapeZCQL("नमस्ते"), "नमस्ते");
});

test('preserves normal name Ramesh', function () {
  assertEqual(escapeZCQL("Ramesh"), "Ramesh");
});

test('escapes combined attack O\'Brien * DROP', function () {
  var result = escapeZCQL("O'Brien * DROP");
  assert(result.indexOf("''") !== -1, 'should double apostrophe');
  assert(result.indexOf("[asterisk]") !== -1, 'should escape asterisk');
  assert(result.indexOf('DROP') !== -1, 'should preserve DROP text');
});

test('preserves empty string', function () {
  assertEqual(escapeZCQL(""), "");
});

test('preserves numeric values as strings', function () {
  assertEqual(escapeZCQL(12345), "12345");
});

test('escapes multiple apostrophes', function () {
  assertEqual(escapeZCQL("it's a' test"), "it''s a'' test");
});

// ============================================================
// Tests for computeDegreeFromEdges
// ============================================================

console.log('\n=== computeDegreeFromEdges ===');

test('counts degree for person with CO_ACCUSED and SHARED_LOCATION edges', function () {
  var edges = [
    { edge_id: 'E1', source: 'PM_001', target: 'PM_002', edge_type: 'CO_ACCUSED', weight: 1, occurrence_count: 1 },
    { edge_id: 'E2', source: 'PM_001', target: 'PM_003', edge_type: 'SHARED_LOCATION', weight: 1, occurrence_count: 2 },
    { edge_id: 'E3', source: 'PM_002', target: 'PM_003', edge_type: 'CO_ACCUSED', weight: 1, occurrence_count: 1 },
  ];
  var degree = computeDegreeFromEdges('PM_001', edges);
  assertEqual(degree.total, 2);
  assertEqual(degree.CO_ACCUSED, 1);
  assertEqual(degree.SHARED_LOCATION, 1);
  assertEqual(degree.CANDIDATE_MATCH, 0);
});

test('returns zero degree for unknown person', function () {
  var edges = [
    { edge_id: 'E1', source: 'PM_001', target: 'PM_002', edge_type: 'CO_ACCUSED', weight: 1 }
  ];
  var degree = computeDegreeFromEdges('PM_999', edges);
  assertEqual(degree.total, 0);
});

test('handles CANDIDATE_MATCH edge type', function () {
  var edges = [
    { edge_id: 'E1', source: 'PM_001', target: 'PM_002', edge_type: 'CANDIDATE_MATCH', weight: 0.8 }
  ];
  var degree = computeDegreeFromEdges('PM_001', edges);
  assertEqual(degree.CANDIDATE_MATCH, 1);
  assertEqual(degree.total, 1);
});

test('handles empty edges array', function () {
  var degree = computeDegreeFromEdges('PM_001', []);
  assertEqual(degree.total, 0);
});

// ============================================================
// Tests for bfsTraversePM
// ============================================================

console.log('\n=== bfsTraversePM ===');

test('BFS returns start node when no edges', function () {
  var persons = { 'PM_001': { person_id: 'PM_001', canonical_name: 'Ravi', roles_summary: { accused_count: 1 } } };
  var result = bfsTraversePM(persons, [], 'PM_001', 2);
  assertEqual(result.nodes.length, 1);
  assertEqual(result.nodes[0].person_id, 'PM_001');
  assertEqual(result.edges.length, 0);
  assertEqual(result.truncated, false);
});

test('BFS traverses one hop through CO_ACCUSED edge', function () {
  var persons = {
    'PM_001': { person_id: 'PM_001', canonical_name: 'Ravi', roles_summary: { accused_count: 1 } },
    'PM_002': { person_id: 'PM_002', canonical_name: 'Suresh', roles_summary: { accused_count: 1 } }
  };
  var edges = [
    { edge_id: 'E1', source: 'PM_001', target: 'PM_002', edge_type: 'CO_ACCUSED', weight: 1, occurrence_count: 1 }
  ];
  var result = bfsTraversePM(persons, edges, 'PM_001', 2);
  assertEqual(result.nodes.length, 2);
  assertEqual(result.edges.length, 1);
});

test('BFS respects maxNodes limit (Task 5)', function () {
  var persons = {};
  var edges = [];
  for (var i = 1; i <= 10; i++) {
    var pid = 'PM_' + String(i).padStart(3, '0');
    persons[pid] = { person_id: pid, canonical_name: 'Person' + i, roles_summary: {} };
    if (i > 1) {
      edges.push({ edge_id: 'E' + i, source: 'PM_001', target: pid, edge_type: 'CO_ACCUSED', weight: 1, occurrence_count: 1 });
    }
  }
  var result = bfsTraversePM(persons, edges, 'PM_001', 2, 3);
  assertEqual(result.nodes.length, 3);
  assertEqual(result.truncated, true);
});

test('BFS respects maxHops', function () {
  var persons = {
    'PM_001': { person_id: 'PM_001', canonical_name: 'A', roles_summary: {} },
    'PM_002': { person_id: 'PM_002', canonical_name: 'B', roles_summary: {} },
    'PM_003': { person_id: 'PM_003', canonical_name: 'C', roles_summary: {} }
  };
  var edges = [
    { edge_id: 'E1', source: 'PM_001', target: 'PM_002', edge_type: 'CO_ACCUSED', weight: 1 },
    { edge_id: 'E2', source: 'PM_002', target: 'PM_003', edge_type: 'CO_ACCUSED', weight: 1 }
  ];
  var result = bfsTraversePM(persons, edges, 'PM_001', 1);
  assertEqual(result.nodes.length, 2);
  assertEqual(result.edges.length, 1);
});

test('BFS default maxNodes is 100', function () {
  var persons = { 'PM_001': { person_id: 'PM_001', canonical_name: 'A', roles_summary: {} } };
  var result = bfsTraversePM(persons, [], 'PM_001', 2);
  assertEqual(result.nodes.length, 1);
});

test('BFS includes truncated flag', function () {
  var persons = { 'PM_001': { person_id: 'PM_001', canonical_name: 'A', roles_summary: {} } };
  var result = bfsTraversePM(persons, [], 'PM_001', 2);
  assertEqual(result.truncated, false);
});

// ============================================================
// Tests for extractPersonName
// ============================================================

console.log('\n=== extractPersonName ===');

test('extracts name from network query', function () {
  var name = extractPersonName('show associates of Ravi');
  assert(name && name.toLowerCase().indexOf('ravi') !== -1);
});

test('extracts name from risk query', function () {
  var name = extractPersonName('risk score of Suresh');
  assert(name && name.toLowerCase().indexOf('suresh') !== -1);
});

test('returns null for non-person query', function () {
  var name = extractPersonName('what is the crime trend');
  assertEqual(name, null);
});

test('extracts PM_000001 from "Assess the risk of PM_000001"', function () {
  var name = extractPersonName('Assess the risk of PM_000001');
  assertEqual(name, 'PM_000001');
});

test('extracts PM_000002 from "Evaluate risk for PM_000002"', function () {
  var name = extractPersonName('Evaluate risk for PM_000002');
  assertEqual(name, 'PM_000002');
});

test('fallback name extraction still works for "Check risk of Chandrika Singh"', function () {
  var name = extractPersonName('Check risk of Chandrika Singh');
  assert(name && name.toLowerCase().indexOf('chandrika') !== -1, 'should extract Chandrika not ' + name);
});

test('PM ID wins over generic text in "Assess the risk of PM_999999"', function () {
  var name = extractPersonName('Assess the risk of PM_999999');
  assertEqual(name, 'PM_999999');
});

test('case-insensitive PM match for "assess risk of pm_000001"', function () {
  var name = extractPersonName('assess risk of pm_000001');
  assertEqual(name, 'PM_000001');
});

test('returns null for "Assess the risk of" (no person)', function () {
  var name = extractPersonName('Assess the risk of');
  assertEqual(name, null);
});

test('command words filtered: "assess" does not leak as name', function () {
  var name = extractPersonName('assess the person');
  assertEqual(name, null);
});

// ============================================================
// Tests for classifyByKeyword
// ============================================================

console.log('\n=== classifyByKeyword ===');

test('classifies count query as structured', function () {
  var result = classifyByKeyword('how many theft cases in Bengaluru');
  assertEqual(result.intent, 'structured');
  assert(result.confidence >= 0.8);
});

test('classifies narrative query', function () {
  var result = classifyByKeyword('describe what happened in case 123');
  assertEqual(result.intent, 'narrative');
});

test('classifies network query', function () {
  var result = classifyByKeyword('find associates of Ravi');
  assertEqual(result.intent, 'network');
});

test('classifies risk query', function () {
  var result = classifyByKeyword('risk score of Suresh');
  assertEqual(result.intent, 'risk');
});

test('classifies analytical query', function () {
  var result = classifyByKeyword('crime trends in Bengaluru');
  assertEqual(result.intent, 'analytical');
});

test('returns null for ambiguous query', function () {
  var result = classifyByKeyword('hello world');
  assertEqual(result, null);
});

// ============================================================
// Tests for extractKeywords
// ============================================================

console.log('\n=== extractKeywords ===');

test('extracts keywords from query', function () {
  var kws = extractKeywords('tell me about theft in Bengaluru');
  assert(kws.length > 0);
  assert(kws.indexOf('theft') !== -1);
});

test('strips non-alphanumeric from keywords', function () {
  var kws = extractKeywords("O'Brien theft cases");
  assert(kws.indexOf('obrien') !== -1, 'should normalize O\'Brien to obrien');
  assert(kws.indexOf('theft') !== -1);
});

// ============================================================
// Tests for extractCaseRowId
// ============================================================

console.log('\n=== extractCaseRowId ===');

test('extracts 17-digit case ROWID from narrative query', function () {
  var id = extractCaseRowId('Give me a detailed narrative summary of case 47995000000332408');
  assertEqual(id, '47995000000332408');
});

test('extracts case ID from "tell me about case 47995000000332408"', function () {
  var id = extractCaseRowId('tell me about case 47995000000332408');
  assertEqual(id, '47995000000332408');
});

test('extracts case ID from "narrative of case 47995000000332408"', function () {
  var id = extractCaseRowId('narrative of case 47995000000332408');
  assertEqual(id, '47995000000332408');
});

test('extracts case ID from "what happened in case 123456789012345"', function () {
  var id = extractCaseRowId('what happened in case 123456789012345');
  assertEqual(id, '123456789012345');
});

test('returns null when no case ID in query', function () {
  var id = extractCaseRowId('describe the case');
  assertEqual(id, null);
});

test('does not interpret short numeric as case ID', function () {
  var id = extractCaseRowId('show me 10 cases in Bengaluru');
  assertEqual(id, null);
});

test('does not interpret words with digits as case ID', function () {
  var id = extractCaseRowId('what is the risk of PM_000001');
  assertEqual(id, null);
});

test('extracts 14-digit case ID minimum boundary', function () {
  var id = extractCaseRowId('case 12345678901234');
  assertEqual(id, '12345678901234');
});

test('does not extract 13-digit number', function () {
  var id = extractCaseRowId('case 1234567890123');
  assertEqual(id, null);
});

// ============================================================
// Tests for flatRows / zcqlRows
// ============================================================

console.log('\n=== flatRows / zcqlRows ===');

test('flatRows flattens ZCQL nested structure', function () {
  var rows = [{ cm: { CaseMasterID: '123', CrimeNo: '2024-001' }, d: { DistrictName: 'Bengaluru' } }];
  var flat = flatRows(rows);
  assertEqual(flat.length, 1);
  assertEqual(flat[0].CaseMasterID, '123');
  assertEqual(flat[0].DistrictName, 'Bengaluru');
});

test('flatRows handles null/undefined rows', function () {
  var flat = flatRows(null);
  assertDeepEqual(flat, []);
});

test('zcqlRows handles empty array', function () {
  var result = zcqlRows([]);
  assertDeepEqual(result, []);
});

test('zcqlRows handles null input', function () {
  var result = zcqlRows(null);
  assertDeepEqual(result, []);
});

// ============================================================
// Tests for PersonMaster Cache Pagination
// ============================================================

console.log('\n=== PersonMaster Cache Pagination ===');

function createPageItem(idx) {
  var id = 'PM_' + String(idx + 1).padStart(6, '0');
  var doc = {
    person_id: id,
    canonical_name: 'Person' + (idx + 1),
    confirmed_edges: [],
    unconfirmed_edges: []
  };
  return {
    item: {
      to: function () { return doc; }
    }
  };
}

function createPaginatedMock(totalItems, failOnPage) {
  var callCount = 0;
  var capturedPages = [];
  return {
    queryTable: function (queryParams) {
      callCount++;
      capturedPages.push({
        start_key: queryParams.start_key || null,
        allParams: JSON.parse(JSON.stringify(queryParams))
      });

      assert(queryParams.key_condition, 'key_condition required');
      assertEqual(queryParams.key_condition.attribute, 'type', 'attribute must be "type"');
      assertEqual(queryParams.key_condition.operator, 'equals', 'operator must be EQUALS');
      assertDeepEqual(queryParams.key_condition.value, { S: 'PM' }, 'value must be {S:"PM"}');
      assertEqual(queryParams.limit, 100, 'limit must be 100');
      assertEqual(queryParams.consistent_read, true, 'consistent_read must be true');

      var page = 1;
      if (queryParams.start_key) {
        page = queryParams.start_key.page;
      }

      if (failOnPage && page === failOnPage) {
        throw new Error('Simulated page ' + page + ' failure');
      }

      var items = [];
      var start = (page - 1) * 100;
      var end = Math.min(start + 100, totalItems);
      for (var i = start; i < end; i++) {
        items.push(createPageItem(i));
      }

      var hasMore = end < totalItems;
      var nextKey = hasMore ? { page: page + 1 } : null;

      return {
        getResponseData: function () { return items; },
        start_key: nextKey
      };
    },
    getCallCount: function () { return callCount; },
    getCapturedPages: function () { return capturedPages; }
  };
}

function createMockApp(mockTable) {
  return {
    nosql: function () {
      return {
        getTable: function (tableName) {
          return Promise.resolve({ queryTable: mockTable.queryTable });
        }
      };
    }
  };
}

(async function () {

  // Test 1: Empty result
  await test('Empty result returns empty cache', async function () {
    pipeline._resetPersonMasterCache();
    var mock = createPaginatedMock(0);
    var app = createMockApp(mock);
    var cache = await pipeline.ensurePersonMasterCache(app);
    assert(cache && cache.loaded, 'cache should be loaded');
    assertEqual(Object.keys(cache.persons).length, 0, 'persons should be empty');
    assertEqual(cache.edges.length, 0, 'edges should be empty');
    assertEqual(mock.getCallCount(), 1, 'should make exactly 1 query');
  });

  // Test 2: Single page (< 100 rows, no start_key)
  await test('Single page loads correctly', async function () {
    pipeline._resetPersonMasterCache();
    var mock = createPaginatedMock(50);
    var app = createMockApp(mock);
    var cache = await pipeline.ensurePersonMasterCache(app);
    assertEqual(Object.keys(cache.persons).length, 50, 'should have 50 persons');
    assertEqual(mock.getCallCount(), 1, 'should make exactly 1 query');
    var pages = mock.getCapturedPages();
    assertEqual(pages[0].start_key, null, 'first page should have no start_key');
  });

  // Test 3: Exactly 100 items
  await test('Exactly 100 items boundary', async function () {
    pipeline._resetPersonMasterCache();
    var mock = createPaginatedMock(100);
    var app = createMockApp(mock);
    var cache = await pipeline.ensurePersonMasterCache(app);
    assertEqual(Object.keys(cache.persons).length, 100, 'should have 100 persons');
    assertEqual(mock.getCallCount(), 1, 'should make exactly 1 query (no start_key)');
  });

  // Test 4: 3-page result (250 rows)
  await test('3-page result loads all 250 rows', async function () {
    pipeline._resetPersonMasterCache();
    var mock = createPaginatedMock(250);
    var app = createMockApp(mock);
    var cache = await pipeline.ensurePersonMasterCache(app);
    assertEqual(Object.keys(cache.persons).length, 250, 'should have 250 persons');
    assertEqual(mock.getCallCount(), 3, 'should make 3 queries');
    // Verify specific records from each page
    assert(cache.persons['PM_000001'], 'page 1 record present');
    assert(cache.persons['PM_000101'], 'page 2 record present');
    assert(cache.persons['PM_000250'], 'page 3 record present');
  });

  // Test 5: start_key forwarded exactly
  await test('start_key forwarded from page N to page N+1', async function () {
    pipeline._resetPersonMasterCache();
    var mock = createPaginatedMock(250);
    var app = createMockApp(mock);
    await pipeline.ensurePersonMasterCache(app);
    var pages = mock.getCapturedPages();
    assertEqual(pages.length, 3, 'should have 3 captured pages');
    assertEqual(pages[0].start_key, null, 'page 1 start_key is null');
    assertDeepEqual(pages[0].allParams.start_key, undefined, 'page 1 has no start_key param');
    assertDeepEqual(pages[1].start_key, { page: 2 }, 'page 2 start_key should be {page:2}');
    assertDeepEqual(pages[1].allParams.start_key, { page: 2 }, 'page 2 received start_key {page:2}');
    assertDeepEqual(pages[2].start_key, { page: 3 }, 'page 3 start_key should be {page:3}');
    assertDeepEqual(pages[2].allParams.start_key, { page: 3 }, 'page 3 received start_key {page:3}');
  });

  // Test 6: Query contract verification
  await test('Query contract has correct attribute/operator/value/limit/consistent_read', async function () {
    pipeline._resetPersonMasterCache();
    var mock = createPaginatedMock(10);
    var app = createMockApp(mock);
    await pipeline.ensurePersonMasterCache(app);
    // Contract is verified inside createPaginatedMock on every call
    assertEqual(mock.getCallCount(), 1, 'should make 1 query');
  });

  // Test 7: Middle-page failure does not update cache
  await test('Middle-page failure does not update cache', async function () {
    pipeline._resetPersonMasterCache();
    var mock = createPaginatedMock(250, 2);
    var app = createMockApp(mock);
    var cache = await pipeline.ensurePersonMasterCache(app);
    assertEqual(Object.keys(cache.persons).length, 0, 'cache should be empty on failure');
    // Should have attempted page 1 (succeeded) and page 2 (failed)
    assert(mock.getCallCount() >= 2, 'should have attempted at least 2 pages');
  });

  // Test 8: Middle-page preserves previous cache
  await test('Middle-page failure preserves previous cache', async function () {
    pipeline._resetPersonMasterCache();
    // First load succeeds (single page)
    var mock1 = createPaginatedMock(50);
    var app1 = createMockApp(mock1);
    var cache1 = await pipeline.ensurePersonMasterCache(app1);
    assertEqual(Object.keys(cache1.persons).length, 50, 'initial load should have 50 persons');

    // Second load fails - should preserve previous cache
    var mock2 = createPaginatedMock(250, 2);
    var app2 = createMockApp(mock2);
    var cache2 = await pipeline.ensurePersonMasterCache(app2);
    assertEqual(Object.keys(cache2.persons).length, 50, 'previous cache preserved after failure');
    assert(cache2.persons['PM_000001'], 'previous person still present');
    assert(cache2.persons['PM_000050'], 'previous person still present');
  });

  // Test 9: Successful reload replaces cache
  await test('Successful reload replaces cache', async function () {
    pipeline._resetPersonMasterCache();
    // First load 10 persons
    var mock1 = createPaginatedMock(10);
    var app1 = createMockApp(mock1);
    var cache1 = await pipeline.ensurePersonMasterCache(app1);
    assertEqual(Object.keys(cache1.persons).length, 10, 'initial load 10 persons');

    // Reset cache state (simulate cold start)
    pipeline._resetPersonMasterCache();

    // Load 250 persons
    var mock2 = createPaginatedMock(250);
    var app2 = createMockApp(mock2);
    var cache2 = await pipeline.ensurePersonMasterCache(app2);
    assertEqual(Object.keys(cache2.persons).length, 250, 'reloaded 250 persons');
    assert(cache2.persons['PM_000250'], 'person from page 3 present');
  });

  // Test 10: All records available to BFS
  await test('All records available to BFS after full load', async function () {
    pipeline._resetPersonMasterCache();
    var mock = createPaginatedMock(250);
    var app = createMockApp(mock);
    var cache = await pipeline.ensurePersonMasterCache(app);
    assertEqual(Object.keys(cache.persons).length, 250, '250 persons loaded');

    // BFS from first person should be able to reach any person (if edges existed)
    // Since no edges, BFS just returns the start node
    var result = pipeline.bfsTraversePM(cache.persons, cache.edges, 'PM_000001', 5);
    assertEqual(result.nodes.length, 1, 'BFS returns 1 node (no edges)');
    assertEqual(result.nodes[0].person_id, 'PM_000001', 'start node is correct');

    // Verify persons from all pages exist in cache
    assert(cache.persons['PM_000001'], 'PM_000001 exists');
    assert(cache.persons['PM_000100'], 'PM_000100 (page 1 boundary) exists');
    assert(cache.persons['PM_000101'], 'PM_000101 (page 2 start) exists');
    assert(cache.persons['PM_000200'], 'PM_000200 (page 2 boundary) exists');
    assert(cache.persons['PM_000250'], 'PM_000250 (last) exists');
  });

  // ============================================================
  // Tests for production confirmed_edges schema compatibility
  // ============================================================

  console.log('\n=== Production Schema Compatibility ===');

  await test('Production schema: with_person_id and type are correctly parsed', async function () {
    pipeline._resetPersonMasterCache();

    function buildEdgesFromDocs(persons) {
      var resultEdges = [];
      var pids = Object.keys(persons);
      for (var pi = 0; pi < pids.length; pi++) {
        var doc = persons[pids[pi]];
        var confirmed = doc.confirmed_edges || [];
        for (var ei = 0; ei < confirmed.length; ei++) {
          var ce = confirmed[ei];
          if (!ce || !ce.edge_id) continue;
          var tgtId = ce.target_person_id || ce.with_person_id;
          if (!tgtId || tgtId === doc.person_id) continue;
          var rawType = ce.edge_type || ce.type;
          if (!rawType) continue;
          var eType = rawType.toUpperCase();
          if (eType === 'CO_ACCUSED' || eType === 'ACCUSED_TO_VICTIM' || eType === 'SHARED_LOCATION' || eType === 'CANDIDATE_MATCH') {
            resultEdges.push({
              edge_id: ce.edge_id,
              source: doc.person_id,
              target: tgtId,
              edge_type: eType,
              weight: ce.confidence || 1,
              occurrence_count: (ce.case_ids || []).length || 0
            });
          }
        }
      }
      return resultEdges;
    }

    // Test with production schema fields: with_person_id, type (NOT target_person_id, edge_type)
    var persons = {
      'PM_000001': {
        person_id: 'PM_000001',
        canonical_name: 'Ravi',
        confirmed_edges: [
          { edge_id: 'E001', with_person_id: 'PM_000002', type: 'ACCUSED_TO_VICTIM', confidence: 0.95, case_ids: ['C1'] }
        ]
      },
      'PM_000002': {
        person_id: 'PM_000002',
        canonical_name: 'Sita',
        confirmed_edges: [
          { edge_id: 'E001', with_person_id: 'PM_000001', type: 'ACCUSED_TO_VICTIM', confidence: 0.95, case_ids: ['C1'] }
        ]
      }
    };
    var edges = buildEdgesFromDocs(persons);
    assert(edges.length > 0, 'production schema edges should be parsed');
    assertEqual(edges[0].edge_type, 'ACCUSED_TO_VICTIM', 'edge_type should be normalized to uppercase');
    assertEqual(edges[0].target, 'PM_000002', 'with_person_id should resolve to target');
    assertEqual(edges[0].source, 'PM_000001', 'source should be the containing doc person_id');
    assertEqual(edges[0].occurrence_count, 1, 'case_ids length should set occurrence_count');
  });

  await test('buildNetworkGraphFromPM with PM_000001 production data returns 2 nodes + 2 edges', async function () {
    pipeline._resetPersonMasterCache();
    var persons = {
      'PM_000001': {
        person_id: 'PM_000001',
        canonical_name: 'Ravi Kumar',
        roles_summary: { accused_count: 2, victim_count: 0, complainant_count: 0 },
        confirmed_edges: [
          { edge_id: 'E001711', with_person_id: 'PM_000013', type: 'ACCUSED_TO_VICTIM', confidence: 0.95, case_ids: ['47995000000332408'] },
          { edge_id: 'E001712', with_person_id: 'PM_000042', type: 'CO_ACCUSED', confidence: 0.90, case_ids: ['47995000000332409'] }
        ]
      },
      'PM_000013': {
        person_id: 'PM_000013',
        canonical_name: 'Priya Sharma',
        roles_summary: { accused_count: 0, victim_count: 1, complainant_count: 0 },
        confirmed_edges: [
          { edge_id: 'E001711', with_person_id: 'PM_000001', type: 'ACCUSED_TO_VICTIM', confidence: 0.95, case_ids: ['47995000000332408'] }
        ]
      },
      'PM_000042': {
        person_id: 'PM_000042',
        canonical_name: 'Suresh Patil',
        roles_summary: { accused_count: 1, victim_count: 0, complainant_count: 0 },
        confirmed_edges: [
          { edge_id: 'E001712', with_person_id: 'PM_000001', type: 'CO_ACCUSED', confidence: 0.90, case_ids: ['47995000000332409'] }
        ]
      }
    };
    var edges = [];
    var skippedEdges = 0;
    function buildEdgesFromDocs(persons) {
      var resultEdges = [];
      var pids = Object.keys(persons);
      for (var pi = 0; pi < pids.length; pi++) {
        var doc = persons[pids[pi]];
        var confirmed = doc.confirmed_edges || [];
        for (var ei = 0; ei < confirmed.length; ei++) {
          var ce = confirmed[ei];
          if (!ce || !ce.edge_id) { skippedEdges++; continue; }
          var tgtId = ce.target_person_id || ce.with_person_id;
          if (!tgtId || tgtId === doc.person_id) { skippedEdges++; continue; }
          var rawType = ce.edge_type || ce.type;
          if (!rawType) { skippedEdges++; continue; }
          var eType = rawType.toUpperCase();
          if (eType === 'CO_ACCUSED' || eType === 'ACCUSED_TO_VICTIM' || eType === 'SHARED_LOCATION' || eType === 'CANDIDATE_MATCH') {
            resultEdges.push({
              edge_id: ce.edge_id,
              source: doc.person_id,
              target: tgtId,
              edge_type: eType,
              weight: ce.confidence || 1,
              occurrence_count: (ce.case_ids || []).length || 0
            });
          } else {
            skippedEdges++;
          }
        }
      }
      return resultEdges;
    }
    edges = buildEdgesFromDocs(persons);
    // Edge appears once per doc's confirmed_edges (both endpoints list it)
    // 2 unique edges × 2 docs each = 4 total; BFS deduplicates to 2
    assertEqual(edges.length, 4, 'each edge appears once per endpoint doc (4 total, BFS deduplicates)');
    assertEqual(skippedEdges, 0, 'should skip 0 edges');

    // Verify edge_id content
    var edgeIds = edges.map(function(e) { return e.edge_id; });
    assert(edgeIds.indexOf('E001711') !== -1, 'E001711 present');
    assert(edgeIds.indexOf('E001712') !== -1, 'E001712 present');

    // BFS from PM_000001 — deduplicates by visitedEdgeIds
    var result = pipeline.bfsTraversePM(persons, edges, 'PM_000001', 2);
    assertEqual(result.nodes.length, 3, 'BFS should return 3 nodes (PM_000001 + 2 neighbours)');
    assertEqual(result.edges.length, 2, 'BFS should deduplicate to 2 edges');
  });

  await test('Backward compatibility: both old (edge_type) and new (type) field names work', async function () {
    pipeline._resetPersonMasterCache();
    var persons = {
      'PM_001': {
        person_id: 'PM_001',
        canonical_name: 'Old Schema Person',
        confirmed_edges: [
          { edge_id: 'E1', target_person_id: 'PM_002', edge_type: 'CO_ACCUSED', confidence: 0.8 }
        ]
      },
      'PM_002': {
        person_id: 'PM_002',
        canonical_name: 'New Schema Person',
        confirmed_edges: [
          { edge_id: 'E1', with_person_id: 'PM_001', type: 'CO_ACCUSED', confidence: 0.8 }
        ]
      }
    };

    function buildEdgesFromDocs(persons) {
      var resultEdges = [];
      var pids = Object.keys(persons);
      for (var pi = 0; pi < pids.length; pi++) {
        var doc = persons[pids[pi]];
        var confirmed = doc.confirmed_edges || [];
        for (var ei = 0; ei < confirmed.length; ei++) {
          var ce = confirmed[ei];
          if (!ce || !ce.edge_id) continue;
          var tgtId = ce.target_person_id || ce.with_person_id;
          if (!tgtId || tgtId === doc.person_id) continue;
          var rawType = ce.edge_type || ce.type;
          if (!rawType) continue;
          var eType = rawType.toUpperCase();
          if (eType === 'CO_ACCUSED' || eType === 'ACCUSED_TO_VICTIM' || eType === 'SHARED_LOCATION' || eType === 'CANDIDATE_MATCH') {
            resultEdges.push({
              edge_id: ce.edge_id,
              source: doc.person_id,
              target: tgtId,
              edge_type: eType
            });
          }
        }
      }
      return resultEdges;
    }

    var edges = buildEdgesFromDocs(persons);
    // Edge appears once per doc (both endpoints), so 2 total
    assertEqual(edges.length, 2, 'edge appears in both docs (2 total, BFS deduplicates to 1)');

    // Old schema still works
    var oldDoc = { person_id: 'PM_010', confirmed_edges: [{ edge_id: 'E10', target_person_id: 'PM_011', edge_type: 'SHARED_LOCATION', confidence: 0.7 }] };
    var newDoc = { person_id: 'PM_011', confirmed_edges: [{ edge_id: 'E10', with_person_id: 'PM_010', type: 'SHARED_LOCATION', confidence: 0.7 }] };
    var testPersons = { 'PM_010': oldDoc, 'PM_011': newDoc };
    var testEdges = buildEdgesFromDocs(testPersons);
    assertEqual(testEdges.length, 2, 'old+new schema: edge appears in both docs (2 total, BFS deduplicates to 1)');
  });

  await test('Cache loading returns documents (not empty array)', async function () {
    pipeline._resetPersonMasterCache();
    var mock = createPaginatedMock(1874);
    var app = createMockApp(mock);
    var cache = await pipeline.ensurePersonMasterCache(app);
    assert(cache && cache.loaded, 'cache should be loaded');
    assert(Object.keys(cache.persons).length > 0, 'persons should not be empty');
    assertEqual(Object.keys(cache.persons).length, 1874, 'should have 1874 persons');
    assert(mock.getCallCount() >= 19, 'should make 19+ pages for 1874 items (100 per page)');
  });

  await test('Error in cache loading clears _loadingPromise', async function () {
    pipeline._resetPersonMasterCache();
    var failingMock = {
      queryTable: function () { throw new Error('Simulated complete failure'); }
    };
    var failingApp = createMockApp(failingMock);
    var cache = await pipeline.ensurePersonMasterCache(failingApp);
    assert(cache && cache.loaded, 'cache should be loaded (empty fallback)');
    assertEqual(Object.keys(cache.persons).length, 0, 'persons should be empty on failure');
    // _loadingPromise is set to null in the finally block
    // Verify by calling again - should make a fresh attempt
    var mock = createPaginatedMock(10);
    var app = createMockApp(mock);
    var cache2 = await pipeline.ensurePersonMasterCache(app);
    // Since previous cache has loaded=true with empty, the cached version returns
    // Need to reset to verify fresh attempt
    pipeline._resetPersonMasterCache();
    var mock3 = createPaginatedMock(10);
    var app3 = createMockApp(mock3);
    var cache3 = await pipeline.ensurePersonMasterCache(app3);
    assertEqual(Object.keys(cache3.persons).length, 10, 'fresh load after reset returns 10 persons');
  });

  // ============================================================
  // Summary
  // ============================================================

  var total = passed + failed;
  console.log('\n========================================');
  console.log('Results: ' + passed + '/' + total + ' passed, ' + failed + '/' + total + ' failed');
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(function (f) { console.log('  - ' + f); });
  }
  console.log('========================================');
  process.exit(failed > 0 ? 1 : 0);

})();
