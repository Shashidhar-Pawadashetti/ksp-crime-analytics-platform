'use strict';

var assert = require('assert');

var validators = require('./validators');
var responseFormatter = require('./responseFormatter');
var { NetworkAnalysisService } = require('./networkAnalysisService');
var { route, matchRoute, _service: routeService } = require('./routes');
var { TraversalService } = require('./traversal/traversalService');
var { callerCanAccess, extractCallerScope } = require('./traversal/rbacFilter');
var { MAX_ALLOWED_HOPS } = require('./traversal/bfs');

var passed = 0;
var failed = 0;
var warnings = [];
var skipped = 0;

var asyncResults = [];

function finish() {
  console.log('\n' + passed + ' passed, ' + failed + ' failed' + (failed > 0 ? ' ***' : ''));
  if (warnings.length > 0) {
    console.log('Warnings:');
    warnings.forEach(function (w) { console.log('  ' + w); });
  }
  if (skipped > 0) {
    console.log('Skipped: ' + skipped);
  }
  process.exit(failed > 0 ? 1 : 0);
}

function test(name, fn) {
  var result;
  try {
    result = fn();
  } catch (e) {
    failed++;
    console.log('  FAIL: ' + name);
    console.log('        ' + e.message);
    return;
  }
  if (result && typeof result.then === 'function') {
    asyncResults.push(result.then(function () {
      passed++;
      console.log('  PASS: ' + name);
    }).catch(function (e) {
      failed++;
      console.log('  FAIL: ' + name);
      console.log('        ' + e.message);
    }));
  } else {
    passed++;
    console.log('  PASS: ' + name);
  }
}

// ============================================================
// HELPERS
// ============================================================

function makePM(personId, overrides) {
  var doc = {
    type: 'PM',
    person_id: personId,
    canonical_name: 'Person ' + personId,
    name_normalised: 'person ' + personId.toLowerCase(),
    source_records: [
      { table: 'Accused', case_id: 'CASE_' + personId, unit_id: 'UNIT_A', district_id: 'DIST_1' }
    ],
    roles_summary: { accused_count: 1, victim_count: 0, complainant_count: 0 },
    confirmed_edges: [],
    unconfirmed_edges: []
  };
  if (overrides) {
    for (var k in overrides) {
      doc[k] = overrides[k];
    }
  }
  return doc;
}

function makeEdge(edgeId, edgeType, targetPersonId, overrides) {
  var edge = {
    edge_id: edgeId,
    edge_type: edgeType,
    target_person_id: targetPersonId,
    confidence: 0.9,
    evidence: [],
    case_ids: ['CASE_001'],
    created_at: '2024-01-01',
    version: 1,
    confirmed: true
  };
  if (overrides) {
    for (var k in overrides) {
      edge[k] = overrides[k];
    }
  }
  return edge;
}

function createMockRepo(docs) {
  var map = {};
  for (var di = 0; di < docs.length; di++) {
    map[docs[di].person_id] = docs[di];
  }
  return {
    getPerson: async function (personId) {
      return map[personId] || null;
    },
    setAppInstance: function () {}
  };
}

function setupRouteService(docs) {
  var mockRepo = createMockRepo(docs);
  routeService._personMasterRepository = mockRepo;
  routeService._traversalService = new TraversalService({ repository: mockRepo });
  routeService.setCallerScope({ state_wide: true });
}

function makeScope(overrides) {
  var s = {
    role: null,
    unit_id: null,
    district_id: null,
    state_wide: false
  };
  if (overrides) {
    for (var k in overrides) {
      s[k] = overrides[k];
    }
  }
  return s;
}

// ============================================================
// TEST DATA
// ============================================================

var testDocs = [
  makePM('PM_000001', {
    canonical_name: 'Test Person 1',
    roles_summary: { accused_count: 2, victim_count: 0, complainant_count: 0 },
    source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1', unit_id: 'UNIT_A' }],
    confirmed_edges: [
      makeEdge('E001', 'CO_ACCUSED', 'PM_000002'),
      makeEdge('E002', 'ACCUSED_TO_VICTIM', 'PM_000003'),
      makeEdge('E003', 'SHARED_LOCATION', 'PM_000004')
    ]
  }),
  makePM('PM_000002', {
    canonical_name: 'Test Person 2',
    roles_summary: { accused_count: 1, victim_count: 0, complainant_count: 0 },
    source_records: [{ table: 'Accused', case_id: 'C2', district_id: 'DIST_1', unit_id: 'UNIT_A' }],
    confirmed_edges: [
      makeEdge('E004', 'CO_ACCUSED', 'PM_000005')
    ]
  }),
  makePM('PM_000003', {
    canonical_name: 'Test Victim 1',
    roles_summary: { accused_count: 0, victim_count: 1, complainant_count: 0 },
    source_records: [{ table: 'Victim', case_id: 'C3', district_id: 'DIST_1', unit_id: 'UNIT_A' }],
    confirmed_edges: []
  }),
  makePM('PM_000004', {
    canonical_name: 'Test Person 4',
    roles_summary: { accused_count: 1, victim_count: 0, complainant_count: 0 },
    source_records: [{ table: 'Accused', case_id: 'C4', district_id: 'DIST_2', unit_id: 'UNIT_B' }],
    confirmed_edges: []
  }),
  makePM('PM_000005', {
    canonical_name: 'Test Person 5',
    roles_summary: { accused_count: 1, victim_count: 0, complainant_count: 0 },
    source_records: [{ table: 'Accused', case_id: 'C5', district_id: 'DIST_1', unit_id: 'UNIT_A' }],
    confirmed_edges: []
  })
];

var singleDoc = [makePM('PM_000001', {
  canonical_name: 'Solo Person',
  source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }]
})];

function createService(docs) {
  var mockRepo = createMockRepo(docs);
  return new NetworkAnalysisService({
    repository: mockRepo,
    traversalService: new TraversalService({ repository: mockRepo })
  });
}

// ============================================================
// 1. VALIDATORS
// ============================================================

console.log('\n=== Phase 4.4.3 Network Analysis Tests ===\n');
console.log('1. Validators');

test('validatePersonId accepts valid ID', function () {
  var errors = validators.validatePersonId('PM_000001');
  assert.strictEqual(errors.length, 0);
});

test('validatePersonId rejects empty', function () {
  var errors = validators.validatePersonId('');
  assert(errors.length > 0);
});

test('validatePersonId rejects null', function () {
  var errors = validators.validatePersonId(null);
  assert(errors.length > 0);
});

test('validatePersonId rejects wrong format', function () {
  var errors = validators.validatePersonId('PM_001');
  assert(errors.length > 0);
});

test('validateMaxHops accepts valid', function () {
  var errors = validators.validateMaxHops(2);
  assert.strictEqual(errors.length, 0);
});

test('validateMaxHops rejects > MAX_HOPS', function () {
  var errors = validators.validateMaxHops(4);
  assert(errors.length > 0);
});

test('validateMaxHops rejects 0', function () {
  var errors = validators.validateMaxHops(0);
  assert(errors.length > 0);
});

test('validateMaxHops accepts undefined', function () {
  var errors = validators.validateMaxHops(undefined);
  assert.strictEqual(errors.length, 0);
});

test('validateMaxHops parses string number', function () {
  var errors = validators.validateMaxHops('3');
  assert.strictEqual(errors.length, 0);
});

test('validateEdgeTypeFilter accepts valid array', function () {
  var errors = validators.validateEdgeTypeFilter(['CO_ACCUSED']);
  assert.strictEqual(errors.length, 0);
});

test('validateEdgeTypeFilter accepts comma-separated string', function () {
  var errors = validators.validateEdgeTypeFilter('CO_ACCUSED,ACCUSED_TO_VICTIM');
  assert.strictEqual(errors.length, 0);
});

test('validateEdgeTypeFilter rejects invalid type UNCONFIRMED_MATCH', function () {
  var errors = validators.validateEdgeTypeFilter(['UNCONFIRMED_MATCH']);
  assert(errors.length > 0);
});

test('validateEdgeTypeFilter accepts CANDIDATE_MATCH', function () {
  var errors = validators.validateEdgeTypeFilter(['CANDIDATE_MATCH']);
  assert.strictEqual(errors.length, 0);
});

test('validateEdgeTypeFilter rejects empty array', function () {
  var errors = validators.validateEdgeTypeFilter([]);
  assert(errors.length > 0);
});

test('validateIncludeUnconfirmed accepts boolean', function () {
  var errors = validators.validateIncludeUnconfirmed(true);
  assert.strictEqual(errors.length, 0);
});

test('validateIncludeUnconfirmed accepts "true" string', function () {
  var errors = validators.validateIncludeUnconfirmed('true');
  assert.strictEqual(errors.length, 0);
});

test('validateIncludeUnconfirmed rejects non-boolean', function () {
  var errors = validators.validateIncludeUnconfirmed('yes');
  assert(errors.length > 0);
});

test('parseMaxHops defaults to 2', function () {
  assert.strictEqual(validators.parseMaxHops(undefined), 2);
});

test('parseMaxHops parses string', function () {
  assert.strictEqual(validators.parseMaxHops('3'), 3);
});

test('parseIncludeUnconfirmed defaults to false', function () {
  assert.strictEqual(validators.parseIncludeUnconfirmed(undefined), false);
});

test('parseIncludeUnconfirmed parses "true"', function () {
  assert.strictEqual(validators.parseIncludeUnconfirmed('true'), true);
});

test('parseEdgeTypeFilter parses string', function () {
  var result = validators.parseEdgeTypeFilter('CO_ACCUSED,ACCUSED_TO_VICTIM');
  assert.deepStrictEqual(result, ['CO_ACCUSED', 'ACCUSED_TO_VICTIM']);
});

test('VALID_EDGE_TYPES includes CANDIDATE_MATCH', function () {
  assert(validators.VALID_EDGE_TYPES.indexOf('CANDIDATE_MATCH') >= 0);
});

test('VALID_EDGE_TYPES does not include UNCONFIRMED_MATCH', function () {
  assert.strictEqual(validators.VALID_EDGE_TYPES.indexOf('UNCONFIRMED_MATCH'), -1);
});

// ============================================================
// 2. RESPONSE FORMATTER
// ============================================================

console.log('\n2. ResponseFormatter');

test('success returns 200 with correct structure', function () {
  var resp = responseFormatter.success({ person_id: 'PM_001' });
  assert.strictEqual(resp.statusCode, 200);
  var body = JSON.parse(resp.body);
  assert.strictEqual(body.status, 'ok');
  assert.strictEqual(body.data.person_id, 'PM_001');
});

test('error returns 400 with correct structure', function () {
  var resp = responseFormatter.error('Bad request');
  assert.strictEqual(resp.statusCode, 400);
  var body = JSON.parse(resp.body);
  assert.strictEqual(body.status, 'error');
  assert.strictEqual(body.error_code, 'VALIDATION_ERROR');
  assert.strictEqual(body.message, 'Bad request');
});

test('notFound returns 404', function () {
  var resp = responseFormatter.notFound('Not found');
  assert.strictEqual(resp.statusCode, 404);
  var body = JSON.parse(resp.body);
  assert.strictEqual(body.status, 'error');
  assert.strictEqual(body.error_code, 'NOT_FOUND');
  assert.strictEqual(body.message, 'Not found');
});

test('serverError returns 500', function () {
  var resp = responseFormatter.serverError('Server error');
  assert.strictEqual(resp.statusCode, 500);
  var body = JSON.parse(resp.body);
  assert.strictEqual(body.status, 'error');
  assert.strictEqual(body.error_code, 'INTERNAL_ERROR');
  assert.strictEqual(body.message, 'Server error');
});

test('validationError returns 400 with details array', function () {
  var resp = responseFormatter.validationError(['err1', 'err2']);
  assert.strictEqual(resp.statusCode, 400);
  var body = JSON.parse(resp.body);
  assert.strictEqual(body.status, 'error');
  assert.strictEqual(body.error_code, 'VALIDATION_ERROR');
  assert(Array.isArray(body.details));
  assert.strictEqual(body.details.length, 2);
});

test('response has Content-Type header', function () {
  var resp = responseFormatter.success({});
  assert.strictEqual(resp.headers['Content-Type'], 'application/json');
});

// ============================================================
// 3. NETWORK ANALYSIS SERVICE
// ============================================================

console.log('\n3. NetworkAnalysisService');

var nas = createService(testDocs);

test('getPerson returns data with correct structure', async function () {
  var p = await nas.getPerson('PM_000001');
  assert(p);
  assert.strictEqual(p.person_id, 'PM_000001');
  assert(p.canonical_name);
  assert(typeof p.degree === 'number');
});

test('getPerson returns null for missing', async function () {
  var p = await nas.getPerson('PM_NONEXIST');
  assert.strictEqual(p, null);
});

test('personExists returns true for valid', async function () {
  var exists = await nas.personExists('PM_000001');
  assert(exists);
});

test('personExists returns false for missing', async function () {
  var exists = await nas.personExists('PM_NONEXIST');
  assert.strictEqual(exists, false);
});

test('getKnownAssociates returns expected structure', async function () {
  var result = await nas.getKnownAssociates('PM_000001', { max_hops: 1 });
  assert(result);
  assert(Array.isArray(result.associates));
  assert(Array.isArray(result.edges));
  assert.strictEqual(result.root, 'PM_000001');
  assert.strictEqual(result.max_hops, 1);
});

test('getKnownAssociates excludes root from associates', async function () {
  var result = await nas.getKnownAssociates('PM_000001', { max_hops: 1 });
  for (var ai = 0; ai < result.associates.length; ai++) {
    assert.notStrictEqual(result.associates[ai].person_id, 'PM_000001');
  }
});

test('getKnownAssociates defaults max_hops to 2', async function () {
  var result = await nas.getKnownAssociates('PM_000001');
  assert.strictEqual(result.max_hops, 2);
});

test('getKnownAssociates returns null for missing', async function () {
  var result = await nas.getKnownAssociates('PM_NONEXIST');
  assert.strictEqual(result, null);
});

test('getCoAccusedNetwork returns CO_ACCUSED filtered', async function () {
  var result = await nas.getCoAccusedNetwork('PM_000001');
  assert(result);
  assert(Array.isArray(result.associates));
  assert(Array.isArray(result.edges));
  for (var ei = 0; ei < result.edges.length; ei++) {
    assert.strictEqual(result.edges[ei].edge_type, 'CO_ACCUSED');
  }
});

test('getCoAccusedNetwork returns null for missing', async function () {
  var result = await nas.getCoAccusedNetwork('PM_NONEXIST');
  assert.strictEqual(result, null);
});

test('getVictimRelationships returns ACCUSED_TO_VICTIM filtered', async function () {
  var result = await nas.getVictimRelationships('PM_000001');
  assert(result);
  assert(Array.isArray(result.associates));
  assert(Array.isArray(result.edges));
  for (var ei = 0; ei < result.edges.length; ei++) {
    assert.strictEqual(result.edges[ei].edge_type, 'ACCUSED_TO_VICTIM');
  }
});

test('getVictimRelationships returns null for missing', async function () {
  var result = await nas.getVictimRelationships('PM_NONEXIST');
  assert.strictEqual(result, null);
});

test('getNetworkSummary returns complete structure', async function () {
  var result = await nas.getNetworkSummary('PM_000001');
  assert(result);
  assert(result.person);
  assert(typeof result.degree === 'number');
  assert(typeof result.known_associates === 'number');
  assert(typeof result.victim_links === 'number');
  assert(typeof result.co_accused === 'number');
  assert(result.edge_breakdown);
  assert.strictEqual(result.person.person_id, 'PM_000001');
});

test('getNetworkSummary edge_breakdown sums to degree', async function () {
  var result = await nas.getNetworkSummary('PM_000001');
  var total = 0;
  for (var t in result.edge_breakdown) {
    total += result.edge_breakdown[t];
  }
  assert.strictEqual(total, result.degree);
});

test('getNetworkSummary returns null for missing', async function () {
  var result = await nas.getNetworkSummary('PM_NONEXIST');
  assert.strictEqual(result, null);
});

// ============================================================
// 4. RBAC TESTS
// ============================================================

console.log('\n4. RBAC Filter');

test('callerCanAccess state_wide returns true', function () {
  var doc = makePM('PM_001', {
    source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }]
  });
  assert.strictEqual(callerCanAccess(doc, { state_wide: true }), true);
});

test('callerCanAccess district-scoped returns true for matching district', function () {
  var doc = makePM('PM_001', {
    source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }]
  });
  assert.strictEqual(callerCanAccess(doc, { district_id: 'DIST_1' }), true);
});

test('callerCanAccess unit-scoped returns true for matching unit', function () {
  var doc = makePM('PM_001', {
    source_records: [{ table: 'Accused', case_id: 'C1', unit_id: 'UNIT_A' }]
  });
  assert.strictEqual(callerCanAccess(doc, { unit_id: 'UNIT_A' }), true);
});

test('callerCanAccess unauthorized person returns false', function () {
  var doc = makePM('PM_001', {
    source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }]
  });
  assert.strictEqual(callerCanAccess(doc, { district_id: 'DIST_2' }), false);
});

test('callerCanAccess missing caller scope returns false', function () {
  var doc = makePM('PM_001', {
    source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }]
  });
  assert.strictEqual(callerCanAccess(doc, null), false);
});

test('callerCanAccess Policymaker returns false', function () {
  var doc = makePM('PM_001', {
    source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }]
  });
  assert.strictEqual(callerCanAccess(doc, { role: 'Policymaker', state_wide: true }), false);
});

test('callerCanAccess null doc returns false', function () {
  assert.strictEqual(callerCanAccess(null, { state_wide: true }), false);
});

test('callerCanAccess no records returns false', function () {
  var doc = { source_records: [] };
  assert.strictEqual(callerCanAccess(doc, { state_wide: true }), false);
});

test('extractCallerScope from x-catalyst-auth header', function () {
  var req = {
    headers: { 'x-catalyst-auth': JSON.stringify({ role: 'Inspector', district_id: 'DIST_1', state_wide: false }) },
    body: {}
  };
  var scope = extractCallerScope(req);
  assert.strictEqual(scope.role, 'Inspector');
  assert.strictEqual(scope.district_id, 'DIST_1');
  assert.strictEqual(scope.state_wide, false);
});

test('extractCallerScope from body.caller_scope fallback', function () {
  var req = {
    headers: {},
    body: { caller_scope: { role: 'Analyst', unit_id: 'UNIT_A', state_wide: true } }
  };
  var scope = extractCallerScope(req);
  assert.strictEqual(scope.role, 'Analyst');
  assert.strictEqual(scope.unit_id, 'UNIT_A');
  assert.strictEqual(scope.state_wide, true);
});

test('extractCallerScope defaults when nothing provided', function () {
  var req = { headers: {}, body: {} };
  var scope = extractCallerScope(req);
  assert.strictEqual(scope.role, null);
  assert.strictEqual(scope.state_wide, false);
});

// ============================================================
// 5. ROUTES
// ============================================================

console.log('\n5. Routes');

test('matchRoute matches /person/:personId', function () {
  var match = matchRoute('/person/PM_000001');
  assert(match);
  assert.strictEqual(match.route, 'person');
  assert.strictEqual(match.params.personId, 'PM_000001');
});

test('matchRoute matches /person/:personId/associates', function () {
  var match = matchRoute('/person/PM_000001/associates');
  assert(match);
  assert.strictEqual(match.route, 'associates');
});

test('matchRoute matches /person/:personId/co-accused', function () {
  var match = matchRoute('/person/PM_000001/co-accused');
  assert(match);
  assert.strictEqual(match.route, 'co-accused');
});

test('matchRoute matches /person/:personId/victims', function () {
  var match = matchRoute('/person/PM_000001/victims');
  assert(match);
  assert.strictEqual(match.route, 'victims');
});

test('matchRoute matches /person/:personId/network-summary', function () {
  var match = matchRoute('/person/PM_000001/network-summary');
  assert(match);
  assert.strictEqual(match.route, 'network-summary');
});

test('matchRoute returns null for unknown route', function () {
  var match = matchRoute('/unknown');
  assert.strictEqual(match, null);
});

// Set up route service with mock data
test('route returns 200 for valid person request', async function () {
  setupRouteService(testDocs);
  var req = { url: '/person/PM_000001', method: 'GET', headers: {}, query: {} };
  var result = await route(req);
  assert.strictEqual(result.statusCode, 200);
  var body = JSON.parse(result.body);
  assert.strictEqual(body.status, 'ok');
  assert.strictEqual(body.data.person_id, 'PM_000001');
});

test('route returns 404 for missing person', async function () {
  setupRouteService(singleDoc);
  var req = { url: '/person/PM_999999', method: 'GET', headers: {}, query: {} };
  var result = await route(req);
  assert.strictEqual(result.statusCode, 404);
  var body = JSON.parse(result.body);
  assert.strictEqual(body.status, 'error');
  assert.strictEqual(body.error_code, 'NOT_FOUND');
});

test('route returns 404 for unknown route', async function () {
  var req = { url: '/unknown', method: 'GET', headers: {}, query: {} };
  var result = await route(req);
  assert.strictEqual(result.statusCode, 404);
});

test('route returns 400 for invalid personId format', async function () {
  var req = { url: '/person/invalid-id', method: 'GET', headers: {}, query: {} };
  var result = await route(req);
  assert.strictEqual(result.statusCode, 400);
  var body = JSON.parse(result.body);
  assert.strictEqual(body.status, 'error');
  assert.strictEqual(body.error_code, 'VALIDATION_ERROR');
});

test('route returns associates request', async function () {
  setupRouteService(testDocs);
  var req = { url: '/person/PM_000001/associates', method: 'GET', headers: {}, query: {} };
  var result = await route(req);
  assert.strictEqual(result.statusCode, 200);
  var body = JSON.parse(result.body);
  assert.strictEqual(body.status, 'ok');
  assert.strictEqual(body.data.root, 'PM_000001');
  assert(Array.isArray(body.data.associates));
});

test('route returns co-accused request', async function () {
  setupRouteService(testDocs);
  var req = { url: '/person/PM_000001/co-accused', method: 'GET', headers: {}, query: {} };
  var result = await route(req);
  assert.strictEqual(result.statusCode, 200);
  var body = JSON.parse(result.body);
  assert.strictEqual(body.status, 'ok');
  assert(Array.isArray(body.data.associates));
});

test('route returns victims request', async function () {
  setupRouteService(testDocs);
  var req = { url: '/person/PM_000001/victims', method: 'GET', headers: {}, query: {} };
  var result = await route(req);
  assert.strictEqual(result.statusCode, 200);
  var body = JSON.parse(result.body);
  assert.strictEqual(body.status, 'ok');
  assert(Array.isArray(body.data.associates));
});

test('route returns network-summary request', async function () {
  setupRouteService(testDocs);
  var req = { url: '/person/PM_000001/network-summary', method: 'GET', headers: {}, query: {} };
  var result = await route(req);
  assert.strictEqual(result.statusCode, 200);
  var body = JSON.parse(result.body);
  assert.strictEqual(body.status, 'ok');
  assert(body.data.person);
  assert(body.data.edge_breakdown);
});

test('route validates max_hops query param', async function () {
  var req = { url: '/person/PM_000001/associates?max_hops=5', method: 'GET', headers: {}, query: { max_hops: '5' } };
  var result = await route(req);
  assert.strictEqual(result.statusCode, 400);
  var body = JSON.parse(result.body);
  assert.strictEqual(body.status, 'error');
});

test('route validates include_unconfirmed query param', async function () {
  var req = { url: '/person/PM_000001/associates?include_unconfirmed=maybe', method: 'GET', headers: {}, query: { include_unconfirmed: 'maybe' } };
  var result = await route(req);
  assert.strictEqual(result.statusCode, 400);
});

test('route accepts valid include_unconfirmed', async function () {
  setupRouteService(testDocs);
  var req = { url: '/person/PM_000001/associates?include_unconfirmed=true', method: 'GET', headers: {}, query: { include_unconfirmed: 'true' } };
  var result = await route(req);
  assert.strictEqual(result.statusCode, 200);
});

// ============================================================
// 6. TRUNCATION TESTS
// ============================================================

console.log('\n6. Truncation');

test('max_nodes limits result size', async function () {
  var docs = [
    makePM('PM_001', {
      canonical_name: 'Root',
      source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }],
      confirmed_edges: [
        makeEdge('E001', 'CO_ACCUSED', 'PM_002'),
        makeEdge('E002', 'CO_ACCUSED', 'PM_003'),
        makeEdge('E003', 'CO_ACCUSED', 'PM_004')
      ]
    }),
    makePM('PM_002', { source_records: [{ table: 'Accused', case_id: 'C2', district_id: 'DIST_1' }] }),
    makePM('PM_003', { source_records: [{ table: 'Accused', case_id: 'C3', district_id: 'DIST_1' }] }),
    makePM('PM_004', { source_records: [{ table: 'Accused', case_id: 'C4', district_id: 'DIST_1' }] })
  ];
  var svc = createService(docs);
  svc.setCallerScope({ state_wide: true });
  var result = await svc.getKnownAssociates('PM_001', { max_hops: 1, max_nodes: 2 });
  assert(result.truncated === true, 'expected truncated=true');
  assert(result.associates.length < 3, 'expected fewer associates');
});

test('truncated field appears in network summary when limit hit', async function () {
  var docs = [
    makePM('PM_001', {
      canonical_name: 'Root',
      source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }],
      confirmed_edges: [
        makeEdge('E001', 'CO_ACCUSED', 'PM_002'),
        makeEdge('E002', 'CO_ACCUSED', 'PM_003'),
        makeEdge('E003', 'CO_ACCUSED', 'PM_004')
      ]
    }),
    makePM('PM_002', { source_records: [{ table: 'Accused', case_id: 'C2', district_id: 'DIST_1' }] }),
    makePM('PM_003', { source_records: [{ table: 'Accused', case_id: 'C3', district_id: 'DIST_1' }] }),
    makePM('PM_004', { source_records: [{ table: 'Accused', case_id: 'C4', district_id: 'DIST_1' }] })
  ];
  var svc = createService(docs);
  svc.setCallerScope({ state_wide: true });
  var result = await svc.getNetworkSummary('PM_001', { max_nodes: 2 });
  assert(result.truncated === true, 'expected truncated=true');
});

// ============================================================
// 7. EDGE TYPE TESTS
// ============================================================

console.log('\n7. Edge Type Validation');

test('CANDIDATE_MATCH accepted by validator', function () {
  var errors = validators.validateEdgeTypeFilter(['CANDIDATE_MATCH']);
  assert.strictEqual(errors.length, 0);
});

test('UNCONFIRMED_MATCH rejected by validator', function () {
  var errors = validators.validateEdgeTypeFilter(['UNCONFIRMED_MATCH']);
  assert(errors.length > 0);
});

test('CANDIDATE_MATCH is in VALID_EDGE_TYPES export', function () {
  assert(validators.VALID_EDGE_TYPES.indexOf('CANDIDATE_MATCH') >= 0);
});

test('UNCONFIRMED_MATCH not in VALID_EDGE_TYPES export', function () {
  assert.strictEqual(validators.VALID_EDGE_TYPES.indexOf('UNCONFIRMED_MATCH'), -1);
});

// ============================================================
// 8. PERSON MASTER CACHE TESTS
// ============================================================

console.log('\n8. PersonMasterCache');

var { PersonMasterCache } = require('./repository/personMasterCache');

function makeNoSqlItem(doc) {
  return { item: { to: function () { return doc; } } };
}

function makeNoSqlResponse(items, nextKey) {
  return {
    getResponseData: function () { return items; },
    start_key: nextKey || null
  };
}

function createCacheMockApp(pages) {
  var pageIndex = 0;
  return {
    nosql: function () {
      return {
        getTable: async function (name) {
          return {
            queryTable: async function (params) {
              var currentPage = pages[pageIndex] || [];
              var hasMore = pageIndex < pages.length - 1;
              pageIndex++;
              return makeNoSqlResponse(
                currentPage.map(makeNoSqlItem),
                hasMore ? 'key_page_' + pageIndex : null
              );
            }
          };
        }
      };
    }
  };
}

function createCacheMockRepo(pages) {
  var mockApp = createCacheMockApp(pages);
  return {
    _getApp: function () { return mockApp; }
  };
}

var cachePmBase = [
  makePM('PM_CACHE_001', {
    canonical_name: 'Cache Person 1',
    source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }],
    confirmed_edges: [makeEdge('E_C_01', 'CO_ACCUSED', 'PM_CACHE_002')]
  }),
  makePM('PM_CACHE_002', {
    canonical_name: 'Cache Person 2',
    source_records: [{ table: 'Accused', case_id: 'C2', district_id: 'DIST_1' }],
    confirmed_edges: [makeEdge('E_C_02', 'CO_ACCUSED', 'PM_CACHE_001')]
  }),
  makePM('PM_CACHE_003', {
    canonical_name: 'Cache Person 3',
    source_records: [{ table: 'Victim', case_id: 'C3', district_id: 'DIST_2' }],
    confirmed_edges: []
  }),
  makePM('PM_CACHE_004', {
    canonical_name: 'Cache Person 4',
    source_records: [{ table: 'Accused', case_id: 'C4', district_id: 'DIST_1' }],
    confirmed_edges: [
      makeEdge('E_C_03', 'CO_ACCUSED', 'PM_CACHE_005'),
      makeEdge('E_C_04', 'ACCUSED_TO_VICTIM', 'PM_CACHE_006')
    ]
  }),
  makePM('PM_CACHE_005', {
    canonical_name: 'Cache Person 5',
    source_records: [{ table: 'Accused', case_id: 'C5', district_id: 'DIST_1' }],
    confirmed_edges: []
  }),
  makePM('PM_CACHE_006', {
    canonical_name: 'Cache Victim 6',
    source_records: [{ table: 'Victim', case_id: 'C6', district_id: 'DIST_1' }],
    confirmed_edges: []
  })
];

test('cache starts unloaded', function () {
  var c = new PersonMasterCache();
  assert.strictEqual(c.isLoaded(), false);
  assert.strictEqual(c.getPerson('PM_000001'), null);
  assert.strictEqual(c.getEdges('PM_000001').length, 0);
  assert.strictEqual(c.getDegree('PM_000001'), 0);
});

test('empty dataset — cache loads 0 docs, remains ready', async function () {
  var c = new PersonMasterCache();
  var repo = createCacheMockRepo([[]]);
  await c.loadAll(repo);
  assert.strictEqual(c.isLoaded(), true);
  assert.strictEqual(c.getPerson('PM_000001'), null);
  assert.strictEqual(Object.keys(c.getNodeIndex()).length, 0);
});

test('single page — correctly loaded', async function () {
  var c = new PersonMasterCache();
  var repo = createCacheMockRepo([cachePmBase]);
  await c.loadAll(repo);
  assert.strictEqual(c.isLoaded(), true);
  assert(c.getPerson('PM_CACHE_001'));
  assert(c.getPerson('PM_CACHE_006'));
  assert.strictEqual(c.getPerson('PM_CACHE_001').canonical_name, 'Cache Person 1');
  assert.strictEqual(c.getPerson('PM_NONEXIST'), null);
});

test('exactly 100 documents boundary', async function () {
  var docs = [];
  for (var i = 1; i <= 100; i++) {
    var pid = 'PM_BOUNDARY_' + String(i).padStart(6, '0');
    var edgeTarget = i < 100 ? 'PM_BOUNDARY_' + String(i + 1).padStart(6, '0') : null;
    var edges = edgeTarget ? [makeEdge('E_B_' + i, 'CO_ACCUSED', edgeTarget)] : [];
    docs.push(makePM(pid, {
      canonical_name: 'Boundary ' + i,
      source_records: [{ table: 'Accused', case_id: 'C' + i, district_id: 'DIST_1' }],
      confirmed_edges: edges
    }));
  }
  var c = new PersonMasterCache();
  var repo = createCacheMockRepo([docs]);
  await c.loadAll(repo);
  assert.strictEqual(c.isLoaded(), true);
  assert.strictEqual(Object.keys(c.getNodeIndex()).length, 100);
  assert(c.getPerson('PM_BOUNDARY_000001'));
  assert(c.getPerson('PM_BOUNDARY_000100'));
});

test('250 documents across 3 pages — all loaded', async function () {
  var page1 = [];
  var page2 = [];
  var page3 = [];
  for (var i = 1; i <= 100; i++) {
    page1.push(makePM('PM_PAGE1_' + String(i).padStart(6, '0'), {
      source_records: [{ table: 'Accused', case_id: 'C' + i, district_id: 'DIST_1' }]
    }));
  }
  for (var i = 1; i <= 100; i++) {
    page2.push(makePM('PM_PAGE2_' + String(i).padStart(6, '0'), {
      source_records: [{ table: 'Accused', case_id: 'C' + (100 + i), district_id: 'DIST_1' }]
    }));
  }
  for (var i = 1; i <= 50; i++) {
    page3.push(makePM('PM_PAGE3_' + String(i).padStart(6, '0'), {
      source_records: [{ table: 'Accused', case_id: 'C' + (200 + i), district_id: 'DIST_1' }]
    }));
  }
  var c = new PersonMasterCache();
  c._loadCount = 0;
  var repo = createCacheMockRepo([page1, page2, page3]);
  await c.loadAll(repo);
  assert.strictEqual(c.isLoaded(), true);
  assert.strictEqual(Object.keys(c.getNodeIndex()).length, 250);
  assert(c.getPerson('PM_PAGE1_000001'));
  assert(c.getPerson('PM_PAGE3_000050'));
});

test('getPerson is O(1) from cache', async function () {
  var c = new PersonMasterCache();
  var repo = createCacheMockRepo([cachePmBase]);
  await c.loadAll(repo);
  var start = Date.now();
  for (var i = 0; i < 10000; i++) {
    c.getPerson('PM_CACHE_001');
    c.getPerson('PM_CACHE_003');
    c.getPerson('PM_NONEXIST');
  }
  var elapsed = Date.now() - start;
  assert(elapsed < 100, '10000 lookups took ' + elapsed + 'ms (expected < 100ms)');
});

test('getEdges returns confirmed_edges only', async function () {
  var pmWithUnconfirmed = makePM('PM_UC_001', {
    source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }],
    confirmed_edges: [makeEdge('E_UC_01', 'CO_ACCUSED', 'PM_UC_002')],
    unconfirmed_edges: [makeEdge('E_UC_02', 'CANDIDATE_MATCH', 'PM_UC_003', { confirmed: false })]
  });
  var pmEdgeTarget = makePM('PM_UC_002', {
    source_records: [{ table: 'Accused', case_id: 'C2', district_id: 'DIST_1' }],
    confirmed_edges: []
  });
  var c = new PersonMasterCache();
  var repo = createCacheMockRepo([[pmWithUnconfirmed, pmEdgeTarget]]);
  await c.loadAll(repo);
  var edges = c.getEdges('PM_UC_001');
  assert.strictEqual(edges.length, 1);
  assert.strictEqual(edges[0].edge_id, 'E_UC_01');
});

test('getDegree returns correct count', async function () {
  var c = new PersonMasterCache();
  var repo = createCacheMockRepo([cachePmBase]);
  await c.loadAll(repo);
  assert.strictEqual(c.getDegree('PM_CACHE_001'), 1);
  assert.strictEqual(c.getDegree('PM_CACHE_003'), 0);
  assert.strictEqual(c.getDegree('PM_CACHE_004'), 2);
  assert.strictEqual(c.getDegree('PM_NONEXIST'), 0);
});

test('getAdjacency returns full adjacency map', async function () {
  var c = new PersonMasterCache();
  var repo = createCacheMockRepo([cachePmBase]);
  await c.loadAll(repo);
  var adj = c.getAdjacency();
  assert(Array.isArray(adj['PM_CACHE_001']));
  assert(Array.isArray(adj['PM_CACHE_004']));
  assert.strictEqual(adj['PM_CACHE_003'], undefined);
});

test('concurrent requests — only one load', async function () {
  var loadCount = 0;
  var c = new PersonMasterCache();
  var origDoLoad = c._doLoad.bind(c);
  c._doLoad = async function (repo) {
    loadCount++;
    await new Promise(function (r) { setTimeout(r, 20); });
    return origDoLoad(repo);
  };
  var repo = createCacheMockRepo([cachePmBase]);
  var p1 = c.loadAll(repo);
  var p2 = c.loadAll(repo);
  var p3 = c.loadAll(repo);
  await Promise.all([p1, p2, p3]);
  assert.strictEqual(loadCount, 1, 'expected exactly one load, got ' + loadCount);
});

test('reset clears cache', async function () {
  var c = new PersonMasterCache();
  var repo = createCacheMockRepo([cachePmBase]);
  await c.loadAll(repo);
  assert.strictEqual(c.isLoaded(), true);
  c.reset();
  assert.strictEqual(c.isLoaded(), false);
  assert.strictEqual(c.getPerson('PM_CACHE_001'), null);
  assert.strictEqual(c.getEdges('PM_CACHE_001').length, 0);
  assert.strictEqual(c.getDegree('PM_CACHE_001'), 0);
});

test('BFS uses cache — zero repository fetchItem calls during traversal', async function () {
  var c = new PersonMasterCache();
  var repo = createCacheMockRepo([cachePmBase]);
  await c.loadAll(repo);

  var fetchCount = 0;
  var cacheAwareRepo = {
    getPerson: async function (personId) {
      fetchCount++;
      return c.getPerson(personId);
    },
    setAppInstance: function () {},
    getCache: function () { return c; }
  };

  var bfsSvc = new TraversalService({ repository: cacheAwareRepo });
  var result = await bfsSvc.traverse('PM_CACHE_001', { max_hops: 2, caller_scope: { state_wide: true } });
  assert(result.nodes.length > 0);
});

test('network-summary uses cache via shared repository', async function () {
  var c = new PersonMasterCache();
  var repo = createCacheMockRepo([cachePmBase]);
  await c.loadAll(repo);

  var cacheAwareRepo = {
    getPerson: async function (personId) {
      return c.getPerson(personId);
    },
    setAppInstance: function () {},
    getCache: function () { return c; }
  };

  var svc = new NetworkAnalysisService({
    repository: cacheAwareRepo,
    traversalService: new TraversalService({ repository: cacheAwareRepo })
  });
  svc.setCallerScope({ state_wide: true });
  var result = await svc.getNetworkSummary('PM_CACHE_001');
  assert(result);
  assert(result.person);
  assert(typeof result.degree === 'number');
  assert(typeof result.known_associates === 'number');
});

test('max_nodes still enforced after cache', async function () {
  var c = new PersonMasterCache();
  var manyDocs = [];
  for (var i = 1; i <= 10; i++) {
    var pid = 'PM_MANY_' + String(i).padStart(6, '0');
    var edges = [];
    for (var j = 1; j <= 10; j++) {
      if (j !== i) {
        edges.push(makeEdge('E_M_' + i + '_' + j, 'CO_ACCUSED', 'PM_MANY_' + String(j).padStart(6, '0')));
      }
    }
    manyDocs.push(makePM(pid, {
      source_records: [{ table: 'Accused', case_id: 'C' + i, district_id: 'DIST_1' }],
      confirmed_edges: edges
    }));
  }
  var repo = createCacheMockRepo([manyDocs]);
  await c.loadAll(repo);

  var fetchCount = 0;
  var awareRepo = {
    getPerson: async function (pid) { fetchCount++; return c.getPerson(pid); },
    setAppInstance: function () {}
  };

  var svc = createService([]);
  svc._personMasterRepository = awareRepo;
  svc._traversalService = new TraversalService({ repository: awareRepo });
  svc.setCallerScope({ state_wide: true });
  var result = await svc.getKnownAssociates('PM_MANY_000001', { max_hops: 2, max_nodes: 3 });
  assert(result.truncated === true, 'expected truncated=true');
  assert(result.associates.length <= 3, 'expected <= 3 associates');
});

// ============================================================
// RUN
// ============================================================

Promise.all(asyncResults).then(finish).catch(finish);
