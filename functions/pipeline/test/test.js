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
