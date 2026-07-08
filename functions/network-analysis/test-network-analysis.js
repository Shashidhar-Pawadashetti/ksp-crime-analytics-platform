'use strict';

var assert = require('assert');

var validators = require('./validators');
var responseFormatter = require('./responseFormatter');
var { NetworkAnalysisService } = require('./networkAnalysisService');
var { route, matchRoute, parsePath } = require('./routes');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS: ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL: ' + name);
    console.log('        ' + e.message);
  }
}

function findValidPersonId() {
  var { getInstance } = require('../graph-service/index');
  var gs = getInstance();
  var nodes = gs._cache.getNodes();
  if (nodes && nodes.length > 0) return nodes[0].person_id;
  return 'PM_000001';
}

var validPersonId = findValidPersonId();

console.log('\nUsing person_id: ' + validPersonId + '\n');
console.log('Network Analysis Tests\n');

// --- Validators ---
(function() {
  console.log('Validators');

  test('validatePersonId accepts valid ID', function() {
    var errors = validators.validatePersonId('PM_000001');
    assert.strictEqual(errors.length, 0);
  });

  test('validatePersonId rejects empty', function() {
    var errors = validators.validatePersonId('');
    assert(errors.length > 0);
  });

  test('validatePersonId rejects null', function() {
    var errors = validators.validatePersonId(null);
    assert(errors.length > 0);
  });

  test('validatePersonId rejects wrong format', function() {
    var errors = validators.validatePersonId('PM_001');
    assert(errors.length > 0);
  });

  test('validateMaxHops accepts valid', function() {
    var errors = validators.validateMaxHops(2);
    assert.strictEqual(errors.length, 0);
  });

  test('validateMaxHops rejects > 3', function() {
    var errors = validators.validateMaxHops(4);
    assert(errors.length > 0);
  });

  test('validateMaxHops rejects 0', function() {
    var errors = validators.validateMaxHops(0);
    assert(errors.length > 0);
  });

  test('validateMaxHops accepts undefined', function() {
    var errors = validators.validateMaxHops(undefined);
    assert.strictEqual(errors.length, 0);
  });

  test('validateMaxHops parses string number', function() {
    var errors = validators.validateMaxHops('3');
    assert.strictEqual(errors.length, 0);
  });

  test('validateEdgeTypeFilter accepts valid array', function() {
    var errors = validators.validateEdgeTypeFilter(['CO_ACCUSED']);
    assert.strictEqual(errors.length, 0);
  });

  test('validateEdgeTypeFilter accepts comma-separated string', function() {
    var errors = validators.validateEdgeTypeFilter('CO_ACCUSED,ACCUSED_TO_VICTIM');
    assert.strictEqual(errors.length, 0);
  });

  test('validateEdgeTypeFilter rejects invalid type', function() {
    var errors = validators.validateEdgeTypeFilter(['INVALID']);
    assert(errors.length > 0);
  });

  test('validateEdgeTypeFilter rejects empty array', function() {
    var errors = validators.validateEdgeTypeFilter([]);
    assert(errors.length > 0);
  });

  test('validateIncludeUnconfirmed accepts boolean', function() {
    var errors = validators.validateIncludeUnconfirmed(true);
    assert.strictEqual(errors.length, 0);
  });

  test('validateIncludeUnconfirmed accepts "true" string', function() {
    var errors = validators.validateIncludeUnconfirmed('true');
    assert.strictEqual(errors.length, 0);
  });

  test('validateIncludeUnconfirmed rejects non-boolean', function() {
    var errors = validators.validateIncludeUnconfirmed('yes');
    assert(errors.length > 0);
  });

  test('parseMaxHops defaults to 2', function() {
    assert.strictEqual(validators.parseMaxHops(undefined), 2);
  });

  test('parseMaxHops parses string', function() {
    assert.strictEqual(validators.parseMaxHops('3'), 3);
  });

  test('parseIncludeUnconfirmed defaults to false', function() {
    assert.strictEqual(validators.parseIncludeUnconfirmed(undefined), false);
  });

  test('parseIncludeUnconfirmed parses "true"', function() {
    assert.strictEqual(validators.parseIncludeUnconfirmed('true'), true);
  });

  test('parseEdgeTypeFilter parses string', function() {
    var result = validators.parseEdgeTypeFilter('CO_ACCUSED,ACCUSED_TO_VICTIM');
    assert.deepStrictEqual(result, ['CO_ACCUSED', 'ACCUSED_TO_VICTIM']);
  });
})();

// --- Response Formatter ---
(function() {
  console.log('\nResponseFormatter');

  test('success returns 200 with data', function() {
    var resp = responseFormatter.success({ person_id: 'PM_001' });
    assert.strictEqual(resp.statusCode, 200);
    var body = JSON.parse(resp.body);
    assert(body.success);
    assert.strictEqual(body.data.person_id, 'PM_001');
  });

  test('error returns 400 with message', function() {
    var resp = responseFormatter.error('Bad request');
    assert.strictEqual(resp.statusCode, 400);
    var body = JSON.parse(resp.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error, 'Bad request');
  });

  test('notFound returns 404', function() {
    var resp = responseFormatter.notFound();
    assert.strictEqual(resp.statusCode, 404);
  });

  test('serverError returns 500', function() {
    var resp = responseFormatter.serverError();
    assert.strictEqual(resp.statusCode, 500);
  });

  test('validationError returns 400 with details array', function() {
    var resp = responseFormatter.validationError(['err1', 'err2']);
    assert.strictEqual(resp.statusCode, 400);
    var body = JSON.parse(resp.body);
    assert(Array.isArray(body.details));
    assert.strictEqual(body.details.length, 2);
  });

  test('response has Content-Type header', function() {
    var resp = responseFormatter.success({});
    assert.strictEqual(resp.headers['Content-Type'], 'application/json');
  });
})();

// --- NetworkAnalysisService ---
(function() {
  console.log('\nNetworkAnalysisService');

  var nas = new NetworkAnalysisService();

  test('getPerson returns person data for valid ID', function() {
    var p = nas.getPerson(validPersonId);
    assert(p);
    assert.strictEqual(p.person_id, validPersonId);
    assert(p.canonical_name);
    assert(typeof p.degree === 'number');
  });

  test('getPerson returns null for missing ID', function() {
    var p = nas.getPerson('PM_NONEXIST');
    assert.strictEqual(p, null);
  });

  test('personExists returns true for valid', function() {
    assert(nas.personExists(validPersonId));
  });

  test('personExists returns false for missing', function() {
    assert.strictEqual(nas.personExists('PM_NONEXIST'), false);
  });

  test('getKnownAssociates returns associates for valid ID', function() {
    var result = nas.getKnownAssociates(validPersonId, { max_hops: 1 });
    assert(result);
    assert(Array.isArray(result.associates));
    assert(Array.isArray(result.edges));
    assert(result.statistics);
    assert.strictEqual(result.root, validPersonId);
    assert.strictEqual(result.max_hops, 1);
  });

  test('getKnownAssociates excludes root from associates', function() {
    var result = nas.getKnownAssociates(validPersonId, { max_hops: 1 });
    for (var ai = 0; ai < result.associates.length; ai++) {
      assert.notStrictEqual(result.associates[ai].person_id, validPersonId);
    }
  });

  test('getKnownAssociates defaults max_hops to 2', function() {
    var result = nas.getKnownAssociates(validPersonId);
    assert.strictEqual(result.max_hops, 2);
  });

  test('getKnownAssociates returns null for missing', function() {
    var result = nas.getKnownAssociates('PM_NONEXIST');
    assert.strictEqual(result, null);
  });

  test('getCoAccusedNetwork returns CO_ACCUSED filtered results', function() {
    var result = nas.getCoAccusedNetwork(validPersonId);
    assert(result);
    assert(Array.isArray(result.associates));
    assert(Array.isArray(result.edges));
    for (var ei = 0; ei < result.edges.length; ei++) {
      assert.strictEqual(result.edges[ei].edge_type, 'CO_ACCUSED');
    }
  });

  test('getCoAccusedNetwork returns null for missing', function() {
    var result = nas.getCoAccusedNetwork('PM_NONEXIST');
    assert.strictEqual(result, null);
  });

  test('getVictimRelationships returns ACCUSED_TO_VICTIM filtered results', function() {
    var result = nas.getVictimRelationships(validPersonId);
    assert(result);
    assert(Array.isArray(result.associates));
    assert(Array.isArray(result.edges));
    for (var ei = 0; ei < result.edges.length; ei++) {
      assert.strictEqual(result.edges[ei].edge_type, 'ACCUSED_TO_VICTIM');
    }
  });

  test('getVictimRelationships returns null for missing', function() {
    var result = nas.getVictimRelationships('PM_NONEXIST');
    assert.strictEqual(result, null);
  });

  test('getNetworkSummary returns complete summary', function() {
    var result = nas.getNetworkSummary(validPersonId);
    assert(result);
    assert(result.person);
    assert(typeof result.degree === 'number');
    assert(typeof result.known_associates === 'number');
    assert(typeof result.victim_links === 'number');
    assert(typeof result.co_accused === 'number');
    assert(result.edge_breakdown);
    assert.strictEqual(result.person.person_id, validPersonId);
  });

  test('getNetworkSummary edge_breakdown covers all types', function() {
    var result = nas.getNetworkSummary(validPersonId);
    var total = 0;
    for (var t in result.edge_breakdown) {
      total += result.edge_breakdown[t];
    }
    assert.strictEqual(total, result.degree);
  });

  test('getNetworkSummary returns null for missing', function() {
    var result = nas.getNetworkSummary('PM_NONEXIST');
    assert.strictEqual(result, null);
  });
})();

// --- Routes ---
(function() {
  console.log('\nRoutes');

  test('parsePath returns pathname and query', function() {
    var parsed = parsePath('/person/PM_000001/associates?max_hops=2');
    assert.strictEqual(parsed.pathname, '/person/PM_000001/associates');
    assert.strictEqual(parsed.query.max_hops, '2');
  });

  test('parsePath handles no query string', function() {
    var parsed = parsePath('/person/PM_000001');
    assert.strictEqual(parsed.pathname, '/person/PM_000001');
    assert.deepStrictEqual(parsed.query, {});
  });

  test('matchRoute matches /person/:personId', function() {
    var match = matchRoute('/person/PM_000001');
    assert(match);
    assert.strictEqual(match.route, 'person');
    assert.strictEqual(match.params.personId, 'PM_000001');
  });

  test('matchRoute matches /person/:personId/associates', function() {
    var match = matchRoute('/person/PM_000001/associates');
    assert(match);
    assert.strictEqual(match.route, 'associates');
  });

  test('matchRoute matches /person/:personId/co-accused', function() {
    var match = matchRoute('/person/PM_000001/co-accused');
    assert(match);
    assert.strictEqual(match.route, 'co-accused');
  });

  test('matchRoute matches /person/:personId/victims', function() {
    var match = matchRoute('/person/PM_000001/victims');
    assert(match);
    assert.strictEqual(match.route, 'victims');
  });

  test('matchRoute matches /person/:personId/network-summary', function() {
    var match = matchRoute('/person/PM_000001/network-summary');
    assert(match);
    assert.strictEqual(match.route, 'network-summary');
  });

  test('matchRoute returns null for unknown route', function() {
    var match = matchRoute('/unknown');
    assert.strictEqual(match, null);
  });

  test('route returns success for valid person request', function() {
    var req = { url: '/person/' + validPersonId, method: 'GET' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 200);
    var body = JSON.parse(result.body);
    assert(body.success);
    assert(body.data.person_id === validPersonId);
  });

  test('route returns 404 for missing person', function() {
    var req = { url: '/person/PM_999999', method: 'GET' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 404);
  });

  test('route returns 404 for unknown route', function() {
    var req = { url: '/unknown', method: 'GET' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 404);
  });

  test('route returns 400 for invalid personId format', function() {
    var req = { url: '/person/invalid-id', method: 'GET' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 400);
  });

  test('route returns associates request', function() {
    var req = { url: '/person/' + validPersonId + '/associates', method: 'GET' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 200);
    var body = JSON.parse(result.body);
    assert(body.success);
    assert(body.data.root === validPersonId);
    assert(Array.isArray(body.data.associates));
  });

  test('route returns co-accused request', function() {
    var req = { url: '/person/' + validPersonId + '/co-accused', method: 'GET' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 200);
    var body = JSON.parse(result.body);
    assert(body.success);
    assert(Array.isArray(body.data.associates));
  });

  test('route returns victims request', function() {
    var req = { url: '/person/' + validPersonId + '/victims', method: 'GET' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 200);
    var body = JSON.parse(result.body);
    assert(body.success);
    assert(Array.isArray(body.data.associates));
  });

  test('route returns network-summary request', function() {
    var req = { url: '/person/' + validPersonId + '/network-summary', method: 'GET' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 200);
    var body = JSON.parse(result.body);
    assert(body.success);
    assert(body.data.person);
    assert(body.data.edge_breakdown);
  });

  test('route validates max_hops query param', function() {
    var req = { url: '/person/' + validPersonId + '/associates?max_hops=5', method: 'GET' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 400);
  });

  test('route validates include_unconfirmed query param', function() {
    var req = { url: '/person/' + validPersonId + '/associates?include_unconfirmed=maybe', method: 'GET' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 400);
  });

  test('route accepts valid include_unconfirmed', function() {
    var req = { url: '/person/' + validPersonId + '/associates?include_unconfirmed=true', method: 'GET' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 200);
  });
})();

// --- Error handling via index.js ---
(function() {
  console.log('\nindex.js (Catalyst handler)');

  var handler = require('./index');

  test('handler returns 200 for valid person', function() {
    var req = { url: '/person/' + validPersonId, method: 'GET' };
    var res = { headers: null, body: null, statusCode: null };
    res.writeHead = function(code, headers) { res.statusCode = code; res.headers = headers; };
    res.write = function(b) { res.body = b; };
    res.end = function() {};

    handler(req, res);
    assert.strictEqual(res.statusCode, 200);
    var body = JSON.parse(res.body);
    assert(body.success);
  });

  test('handler returns 404 for unknown route', function() {
    var req = { url: '/unknown', method: 'GET' };
    var res = { headers: null, body: null, statusCode: null };
    res.writeHead = function(code, headers) { res.statusCode = code; res.headers = headers; };
    res.write = function(b) { res.body = b; };
    res.end = function() {};

    handler(req, res);
    assert.strictEqual(res.statusCode, 404);
  });

  test('handler returns 500 on exception gracefully', function() {
    var req = null;
    var res = { headers: null, body: null, statusCode: null };
    res.writeHead = function(code, headers) { res.statusCode = code; res.headers = headers; };
    res.write = function(b) { res.body = b; };
    res.end = function() {};

    handler(req, res);
    assert.strictEqual(res.statusCode, 500);
  });
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed' + (failed > 0 ? ' ***' : ''));
process.exit(failed > 0 ? 1 : 0);
