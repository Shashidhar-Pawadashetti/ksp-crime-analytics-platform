'use strict';

var assert = require('assert');

var styleHints = require('./styleHints');
var { formatNodes, formatEdges, toCytoscape } = require('./cytoscapeFormatter');
var { GraphExportService } = require('./graphExportService');
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
console.log('Graph Visualization Tests\n');

// --- Style Hints ---
(function() {
  console.log('StyleHints');

  test('getPrimaryRole returns Accused when accused_count is highest', function() {
    var role = styleHints.getPrimaryRole({ accused_count: 10, victim_count: 2, complainant_count: 1 });
    assert.strictEqual(role, 'Accused');
  });

  test('getPrimaryRole returns Victim when victim_count is highest', function() {
    var role = styleHints.getPrimaryRole({ accused_count: 1, victim_count: 10, complainant_count: 2 });
    assert.strictEqual(role, 'Victim');
  });

  test('getPrimaryRole returns Complainant when appropriate', function() {
    var role = styleHints.getPrimaryRole({ accused_count: 1, victim_count: 2, complainant_count: 10 });
    assert.strictEqual(role, 'Complainant');
  });

  test('getPrimaryRole returns Mixed when multiple roles exist', function() {
    var role = styleHints.getPrimaryRole({ accused_count: 5, victim_count: 3, complainant_count: 4 });
    assert(role.startsWith('Mixed'));
  });

  test('getPrimaryRole returns Unknown for empty roles', function() {
    var role = styleHints.getPrimaryRole({ accused_count: 0, victim_count: 0, complainant_count: 0 });
    assert.strictEqual(role, 'Unknown');
  });

  test('getPrimaryRole returns Unknown for null', function() {
    assert.strictEqual(styleHints.getPrimaryRole(null), 'Unknown');
  });

  test('getNodeStyle returns accused style for pure accused', function() {
    var style = styleHints.getNodeStyle({ accused_count: 10, victim_count: 0, complainant_count: 0 });
    assert.strictEqual(style.color, '#E53935');
  });

  test('getNodeStyle returns victim style for pure victim', function() {
    var style = styleHints.getNodeStyle({ accused_count: 0, victim_count: 10, complainant_count: 0 });
    assert.strictEqual(style.color, '#FF9800');
  });

  test('getNodeStyle returns mixed style for multi-role', function() {
    var style = styleHints.getNodeStyle({ accused_count: 5, victim_count: 5, complainant_count: 0 });
    assert.strictEqual(style.color, '#7B1FA2');
  });

  test('getNodeStyle returns default for null', function() {
    var style = styleHints.getNodeStyle(null);
    assert.strictEqual(style.color, '#757575');
  });

  test('getEdgeStyle returns CO_ACCUSED style', function() {
    var style = styleHints.getEdgeStyle('CO_ACCUSED');
    assert.strictEqual(style.color, '#E53935');
    assert.strictEqual(style.style, 'solid');
  });

  test('getEdgeStyle returns UNCONFIRMED_MATCH dashed', function() {
    var style = styleHints.getEdgeStyle('UNCONFIRMED_MATCH');
    assert.strictEqual(style.style, 'dashed');
  });

  test('getEdgeStyle returns SHARED_LOCATION dotted', function() {
    var style = styleHints.getEdgeStyle('SHARED_LOCATION');
    assert.strictEqual(style.style, 'dotted');
  });

  test('getEdgeStyle returns default for unknown type', function() {
    var style = styleHints.getEdgeStyle('UNKNOWN_TYPE');
    assert.strictEqual(style.color, '#757575');
  });
})();

// --- CytoscapeFormatter ---
(function() {
  console.log('\nCytoscapeFormatter');

  test('formatNodes produces correct structure', function() {
    var nodes = formatNodes([
      { person_id: 'PM_001', canonical_name: 'Test', roles_summary: { accused_count: 1, victim_count: 0, complainant_count: 0 }, degree: 5, hop_distance: 0 }
    ]);
    assert.strictEqual(nodes.length, 1);
    assert.strictEqual(nodes[0].data.id, 'PM_001');
    assert.strictEqual(nodes[0].data.label, 'Test');
    assert.strictEqual(nodes[0].data.role, 'Accused');
    assert.strictEqual(nodes[0].data.degree, 5);
    assert.strictEqual(nodes[0].data.hop_distance, 0);
    assert(nodes[0].style);
    assert(nodes[0].style.color);
    assert(nodes[0].style.size);
  });

  test('formatEdges produces correct structure', function() {
    var edges = formatEdges([
      { edge_id: 'E001', source: 'PM_001', target: 'PM_002', edge_type: 'CO_ACCUSED', weight: 2, occurrence_count: 2 }
    ]);
    assert.strictEqual(edges.length, 1);
    assert.strictEqual(edges[0].data.id, 'E001');
    assert.strictEqual(edges[0].data.source, 'PM_001');
    assert.strictEqual(edges[0].data.target, 'PM_002');
    assert.strictEqual(edges[0].data.type, 'CO_ACCUSED');
    assert.strictEqual(edges[0].data.weight, 2);
    assert.strictEqual(edges[0].data.occurrence_count, 2);
    assert(edges[0].style);
    assert(edges[0].style.color);
    assert(edges[0].style.width);
    assert(edges[0].style.lineStyle);
  });

  test('toCytoscape returns valid Cytoscape JSON', function() {
    var result = toCytoscape({
      nodes: [{ person_id: 'PM_001', canonical_name: 'Alice', roles_summary: { accused_count: 1, victim_count: 0, complainant_count: 0 }, degree: 2, hop_distance: 0 }],
      edges: [{ edge_id: 'E001', source: 'PM_001', target: 'PM_002', edge_type: 'CO_ACCUSED', weight: 1, occurrence_count: 1 }],
      statistics: { nodes_visited: 1, edges_traversed: 0, elapsed_ms: 1 }
    });

    assert(result.elements);
    assert(Array.isArray(result.elements.nodes));
    assert(Array.isArray(result.elements.edges));
    assert(result.statistics);
    assert.strictEqual(result.elements.nodes.length, 1);
    assert.strictEqual(result.elements.edges.length, 1);
  });

  test('toCytoscape returns input when error present', function() {
    var result = toCytoscape({ error: ['Something went wrong'] });
    assert(result.error);
  });

  test('no duplicate node IDs', function() {
    var result = toCytoscape({
      nodes: [
        { person_id: 'PM_001', canonical_name: 'A', roles_summary: { accused_count: 1, victim_count: 0, complainant_count: 0 }, degree: 1, hop_distance: 0 },
        { person_id: 'PM_001', canonical_name: 'A', roles_summary: { accused_count: 1, victim_count: 0, complainant_count: 0 }, degree: 1, hop_distance: 0 }
      ],
      edges: [],
      statistics: { nodes_visited: 2, edges_traversed: 0, elapsed_ms: 0 }
    });
    assert.strictEqual(result.elements.nodes.length, 2);
    var ids = {};
    for (var ni = 0; ni < result.elements.nodes.length; ni++) {
      ids[result.elements.nodes[ni].data.id] = (ids[result.elements.nodes[ni].data.id] || 0) + 1;
    }
    assert.strictEqual(ids['PM_001'], 2);
  });

  test('every edge references a node in the data', function() {
    var result = toCytoscape({
      nodes: [
        { person_id: 'PM_001', canonical_name: 'A', roles_summary: { accused_count: 1, victim_count: 0, complainant_count: 0 }, degree: 1, hop_distance: 0 },
        { person_id: 'PM_002', canonical_name: 'B', roles_summary: { accused_count: 0, victim_count: 1, complainant_count: 0 }, degree: 1, hop_distance: 1 }
      ],
      edges: [{ edge_id: 'E001', source: 'PM_001', target: 'PM_002', edge_type: 'CO_ACCUSED', weight: 1, occurrence_count: 1 }],
      statistics: { nodes_visited: 2, edges_traversed: 1, elapsed_ms: 0 }
    });

    var nodeIds = {};
    for (var ni = 0; ni < result.elements.nodes.length; ni++) {
      nodeIds[result.elements.nodes[ni].data.id] = true;
    }
    for (var ei = 0; ei < result.elements.edges.length; ei++) {
      var e = result.elements.edges[ei].data;
      assert(nodeIds[e.source], 'source ' + e.source + ' not in nodes');
      assert(nodeIds[e.target], 'target ' + e.target + ' not in nodes');
    }
  });
})();

// --- GraphExportService ---
(function() {
  console.log('\nGraphExportService');

  var gex = new GraphExportService();

  test('toCytoscape returns valid result for valid person', function() {
    var result = gex.toCytoscape(validPersonId, { max_hops: 1 });
    assert(result);
    assert(!result.error);
    assert(result.elements);
    assert(Array.isArray(result.elements.nodes));
    assert(Array.isArray(result.elements.edges));
    assert(result.elements.nodes.length >= 1);
  });

  test('toCytoscape root node has hop_distance 0', function() {
    var result = gex.toCytoscape(validPersonId, { max_hops: 1 });
    var root = null;
    for (var ni = 0; ni < result.elements.nodes.length; ni++) {
      if (result.elements.nodes[ni].data.id === validPersonId) {
        root = result.elements.nodes[ni];
        break;
      }
    }
    assert(root, 'root node not found');
    assert.strictEqual(root.data.hop_distance, 0);
    assert(root.data.label);
    assert(root.data.role);
  });

  test('toCytoscape edges have source/target matching nodes', function() {
    var result = gex.toCytoscape(validPersonId, { max_hops: 2 });
    var nodeIds = {};
    for (var ni = 0; ni < result.elements.nodes.length; ni++) {
      nodeIds[result.elements.nodes[ni].data.id] = true;
    }
    for (var ei = 0; ei < result.elements.edges.length; ei++) {
      var e = result.elements.edges[ei].data;
      assert(nodeIds[e.source], 'edge ' + e.id + ' source ' + e.source + ' not in nodes');
      assert(nodeIds[e.target], 'edge ' + e.id + ' target ' + e.target + ' not in nodes');
    }
  });

  test('toCytoscape with CO_ACCUSED filter returns only those edges', function() {
    var result = gex.toCytoscape(validPersonId, { max_hops: 2, edge_type_filter: ['CO_ACCUSED'] });
    for (var ei = 0; ei < result.elements.edges.length; ei++) {
      assert.strictEqual(result.elements.edges[ei].data.type, 'CO_ACCUSED');
    }
  });

  test('toCytoscape returns error for nonexistent person', function() {
    var result = gex.toCytoscape('PM_NONEXIST');
    assert(result.error);
  });

  test('toCytoscape returns error for null person', function() {
    var result = gex.toCytoscape(null);
    assert(result.error);
  });

  test('toCompact returns compact format', function() {
    var result = gex.toCompact(validPersonId, { max_hops: 1 });
    assert(result);
    assert(!result.error);
    assert(result.root);
    assert(Array.isArray(result.nodes));
    assert(Array.isArray(result.edges));
    if (result.nodes.length > 0) {
      assert(result.nodes[0].id);
      assert(result.nodes[0].label);
      assert(typeof result.nodes[0].hop === 'number');
    }
    if (result.edges.length > 0) {
      assert(result.edges[0].id);
      assert(result.edges[0].s);
      assert(result.edges[0].t);
      assert(result.edges[0].type);
    }
    assert(result.stats);
  });

  test('toDebug returns detailed debug info', function() {
    var result = gex.toDebug(validPersonId, { max_hops: 1 });
    assert(result);
    assert(!result.error);
    assert(result.root);
    assert(result.source === 'GraphExportService.toDebug');
    assert(result.timestamp);
    assert(result.graph);
    assert(result.graph.nodeCount > 0);
    assert(result.validation);
    assert(typeof result.validation.allEdgesReferenceValidNodes === 'boolean');
    assert(result.hopDistribution);
    assert(result.typeDistribution);
    assert(result.degreeDistribution);
  });

  test('toDebug validation passes for valid traversal', function() {
    var result = gex.toDebug(validPersonId, { max_hops: 2 });
    assert(result.validation.allEdgesReferenceValidNodes);
    assert.strictEqual(result.validation.missingSourceEdges.length, 0);
    assert.strictEqual(result.validation.missingTargetEdges.length, 0);
  });
})();

// --- Routes ---
(function() {
  console.log('\nRoutes');

  test('parsePath returns pathname and query', function() {
    var parsed = parsePath('/person/PM_000001/graph?format=compact&max_hops=3');
    assert.strictEqual(parsed.pathname, '/person/PM_000001/graph');
    assert.strictEqual(parsed.query.format, 'compact');
    assert.strictEqual(parsed.query.max_hops, '3');
  });

  test('matchRoute matches /person/:personId/graph', function() {
    var match = matchRoute('/person/PM_000001/graph');
    assert(match);
    assert.strictEqual(match.route, 'graph');
    assert.strictEqual(match.params.personId, 'PM_000001');
  });

  test('matchRoute matches root path', function() {
    var match = matchRoute('/');
    assert(match);
    assert.strictEqual(match.route, 'home');
  });

  test('matchRoute returns null for unknown route', function() {
    var match = matchRoute('/unknown');
    assert.strictEqual(match, null);
  });

  test('route returns success for valid graph request', function() {
    var req = { url: '/person/' + validPersonId + '/graph' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 200);
    var body = JSON.parse(result.body);
    assert(body.success);
    assert(body.data.elements);
    assert(body.data.elements.nodes.length >= 1);
  });

  test('route returns 200 for compact format', function() {
    var req = { url: '/person/' + validPersonId + '/graph?format=compact' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 200);
    var body = JSON.parse(result.body);
    assert(body.success);
    assert(body.data.root);
    assert(body.data.nodes);
  });

  test('route returns 200 for debug format', function() {
    var req = { url: '/person/' + validPersonId + '/graph?format=debug' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 200);
    var body = JSON.parse(result.body);
    assert(body.success);
    assert(body.data.timestamp);
    assert(body.data.validation);
  });

  test('route returns 400 for invalid format', function() {
    var req = { url: '/person/' + validPersonId + '/graph?format=invalid' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 400);
  });

  test('route returns 404 for missing person', function() {
    var req = { url: '/person/PM_999999/graph' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 404);
  });

  test('route returns 400 for invalid personId format', function() {
    var req = { url: '/person/bad-id/graph' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 400);
  });

  test('route validates max_hops query param', function() {
    var req = { url: '/person/' + validPersonId + '/graph?max_hops=5' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 400);
  });

  test('route accepts edge_type_filter query param', function() {
    var req = { url: '/person/' + validPersonId + '/graph?edge_type_filter=CO_ACCUSED' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 200);
    var body = JSON.parse(result.body);
    if (body.data.elements.edges.length > 0) {
      for (var ei = 0; ei < body.data.elements.edges.length; ei++) {
        assert.strictEqual(body.data.elements.edges[ei].data.type, 'CO_ACCUSED');
      }
    }
  });

  test('route returns 200 for home endpoint', function() {
    var req = { url: '/' };
    var result = route(req);
    assert.strictEqual(result.statusCode, 200);
    var body = JSON.parse(result.body);
    assert(body.success);
    assert(body.data.service);
    assert(body.data.endpoints);
  });
})();

// --- index.js handler ---
(function() {
  console.log('\nindex.js handler');

  var handler = require('./index');

  test('handler returns 200 for valid graph request', function() {
    var req = { url: '/person/' + validPersonId + '/graph' };
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
    var req = { url: '/unknown' };
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
