'use strict';

var assert = require('assert');

var styleHints = require('./styleHints');
var { formatNodes, formatEdges, toCytoscape } = require('./cytoscapeFormatter');
var { GraphExportService } = require('./graphExportService');
var { route, matchRoute, parsePath } = require('./routes');
var validators = require('./validators');

var passed = 0;
var failed = 0;
var asyncPromises = [];

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

function asyncTest(name, fn) {
  var p = fn().then(function () {
    passed++;
    console.log('  PASS: ' + name);
  }).catch(function (e) {
    failed++;
    console.log('  FAIL: ' + name);
    console.log('        ' + e.message);
  });
  asyncPromises.push(p);
}

// --- Mock repository for testing GraphExportService ---
function createMockRepository() {
  var mockData = {
    'PM_000001': {
      person_id: 'PM_000001',
      canonical_name: 'Arjun Mehta',
      name_normalised: 'arjun mehta',
      roles_summary: { accused_count: 3, victim_count: 0, complainant_count: 0 },
      source_records: [
        { table: 'Accused', case_id: 'CM_001', unit_id: 'U001', district_id: 'D001' },
        { table: 'Accused', case_id: 'CM_002', unit_id: 'U001', district_id: 'D001' }
      ],
      confirmed_edges: [
        {
          edge_id: 'E001',
          edge_type: 'CO_ACCUSED',
          target_person_id: 'PM_000002',
          confidence: 0.9,
          case_ids: ['CM_001'],
          evidence: []
        },
        {
          edge_id: 'E002',
          edge_type: 'ACCUSED_TO_VICTIM',
          target_person_id: 'PM_000003',
          confidence: 0.95,
          case_ids: ['CM_001'],
          evidence: []
        },
        {
          edge_id: 'E004',
          edge_type: 'SHARED_LOCATION',
          target_person_id: 'PM_000004',
          confidence: 0.7,
          case_ids: ['CM_001'],
          evidence: []
        },
        {
          edge_id: 'E005',
          edge_type: 'CANDIDATE_MATCH',
          target_person_id: 'PM_000005',
          confidence: 0.4,
          case_ids: [],
          evidence: []
        }
      ],
      unconfirmed_edges: [
        {
          edge_id: 'E003',
          edge_type: 'CO_ACCUSED',
          with_person_id: 'PM_000006',
          confidence: 0.3,
          case_ids: [],
          evidence: []
        }
      ]
    },
    'PM_000002': {
      person_id: 'PM_000002',
      canonical_name: 'Vikram Singh',
      name_normalised: 'vikram singh',
      roles_summary: { accused_count: 2, victim_count: 0, complainant_count: 0 },
      source_records: [
        { table: 'Accused', case_id: 'CM_001', unit_id: 'U001', district_id: 'D001' },
        { table: 'Accused', case_id: 'CM_003', unit_id: 'U002', district_id: 'D002' }
      ],
      confirmed_edges: [],
      unconfirmed_edges: []
    },
    'PM_000003': {
      person_id: 'PM_000003',
      canonical_name: 'Priya Sharma',
      name_normalised: 'priya sharma',
      roles_summary: { accused_count: 0, victim_count: 2, complainant_count: 1 },
      source_records: [
        { table: 'Victim', case_id: 'CM_001', unit_id: 'U001', district_id: 'D001' }
      ],
      confirmed_edges: [],
      unconfirmed_edges: [
        {
          edge_id: 'E006',
          edge_type: 'CO_ACCUSED',
          with_person_id: 'PM_000007',
          confidence: 0.2,
          case_ids: [],
          evidence: []
        }
      ]
    },
    'PM_000004': {
      person_id: 'PM_000004',
      canonical_name: 'Ravi Kumar',
      name_normalised: 'ravi kumar',
      roles_summary: { accused_count: 0, victim_count: 0, complainant_count: 1 },
      source_records: [
        { table: 'Complainant', case_id: 'CM_001', unit_id: 'U001', district_id: 'D001' }
      ],
      confirmed_edges: [],
      unconfirmed_edges: []
    },
    'PM_000005': {
      person_id: 'PM_000005',
      canonical_name: 'Unknown Person',
      name_normalised: '',
      roles_summary: { accused_count: 0, victim_count: 0, complainant_count: 0 },
      source_records: [
        { table: 'Accused', case_id: 'CM_004', unit_id: 'U003', district_id: 'D003' }
      ],
      confirmed_edges: [],
      unconfirmed_edges: []
    }
  };

  var mockRepository = {
    getPerson: async function (personId) {
      return mockData[personId] || null;
    }
  };

  return { mockData: mockData, mockRepository: mockRepository };
}

function createMockAppInstance() {
  return {
    nosql: function () {
      return {
        getTable: async function () {
          return {};
        }
      };
    }
  };
}

function createGraphService(mockRepo) {
  var { TraversalService } = require('./__vendored/traversal/traversalService');
  var ts = new TraversalService({ repository: mockRepo });
  var gs = new GraphExportService(createMockAppInstance());
  gs._traversal = ts;
  gs.personExists = async function (personId) {
    var doc = await mockRepo.getPerson(personId);
    return !!doc;
  };
  gs.resolveSourceRecord = async function () {
    return null;
  };
  return gs;
}

console.log('\n=== Graph Visualization Tests ===\n');

// ===============================================
// 1. StyleHints
// ===============================================
(function () {
  console.log('1. StyleHints');

  test('getPrimaryRole returns Accused when accused_count is highest', function () {
    var role = styleHints.getPrimaryRole({ accused_count: 10, victim_count: 2, complainant_count: 1 });
    assert.strictEqual(role, 'Accused');
  });

  test('getPrimaryRole returns Victim when victim_count is highest', function () {
    var role = styleHints.getPrimaryRole({ accused_count: 1, victim_count: 10, complainant_count: 2 });
    assert.strictEqual(role, 'Victim');
  });

  test('getPrimaryRole returns Complainant when appropriate', function () {
    var role = styleHints.getPrimaryRole({ accused_count: 1, victim_count: 2, complainant_count: 10 });
    assert.strictEqual(role, 'Complainant');
  });

  test('getPrimaryRole returns Mixed when multiple roles exist', function () {
    var role = styleHints.getPrimaryRole({ accused_count: 5, victim_count: 3, complainant_count: 4 });
    assert(role.startsWith('Mixed'));
  });

  test('getPrimaryRole returns Unknown for empty roles', function () {
    var role = styleHints.getPrimaryRole({ accused_count: 0, victim_count: 0, complainant_count: 0 });
    assert.strictEqual(role, 'Unknown');
  });

  test('getPrimaryRole returns Unknown for null', function () {
    assert.strictEqual(styleHints.getPrimaryRole(null), 'Unknown');
  });

  test('getNodeStyle returns accused style for pure accused', function () {
    var style = styleHints.getNodeStyle({ accused_count: 10, victim_count: 0, complainant_count: 0 });
    assert.strictEqual(style.color, '#E53935');
  });

  test('getNodeStyle returns victim style for pure victim', function () {
    var style = styleHints.getNodeStyle({ accused_count: 0, victim_count: 10, complainant_count: 0 });
    assert.strictEqual(style.color, '#FF9800');
  });

  test('getNodeStyle returns mixed style for multi-role', function () {
    var style = styleHints.getNodeStyle({ accused_count: 5, victim_count: 5, complainant_count: 0 });
    assert.strictEqual(style.color, '#7B1FA2');
  });

  test('getNodeStyle returns default for null', function () {
    var style = styleHints.getNodeStyle(null);
    assert.strictEqual(style.color, '#757575');
  });

  test('getEdgeStyle returns CO_ACCUSED style', function () {
    var style = styleHints.getEdgeStyle('CO_ACCUSED');
    assert.strictEqual(style.color, '#E53935');
    assert.strictEqual(style.style, 'solid');
  });

  test('getEdgeStyle returns CANDIDATE_MATCH dashed', function () {
    var style = styleHints.getEdgeStyle('CANDIDATE_MATCH');
    assert.strictEqual(style.style, 'dashed');
  });

  test('getEdgeStyle returns SHARED_LOCATION dotted', function () {
    var style = styleHints.getEdgeStyle('SHARED_LOCATION');
    assert.strictEqual(style.style, 'dotted');
  });

  test('getEdgeStyle returns default for unknown type', function () {
    var style = styleHints.getEdgeStyle('UNKNOWN_TYPE');
    assert.strictEqual(style.color, '#757575');
  });
})();

// ===============================================
// 2. CytoscapeFormatter — Edge Contract
// ===============================================
(function () {
  console.log('\n2. CytoscapeFormatter \u2014 Edge Contract');

  test('formatNodes produces correct structure', function () {
    var nodes = formatNodes([
      { person_id: 'PM_001', canonical_name: 'Test', roles_summary: { accused_count: 1, victim_count: 0, complainant_count: 0 }, hop_distance: 0 }
    ], { 'PM_001': 5 });
    assert.strictEqual(nodes.length, 1);
    assert.strictEqual(nodes[0].data.id, 'PM_001');
    assert.strictEqual(nodes[0].data.label, 'Test');
    assert.strictEqual(nodes[0].data.degree, 5);
    assert.strictEqual(nodes[0].data.hop_distance, 0);
    assert(nodes[0].data.node_style);
    assert(nodes[0].data.node_style.color);
  });

  test('formatEdges maps BFS from/to to Cytoscape source/target', function () {
    var edges = formatEdges([
      { edge_id: 'E001', from: 'PM_001', to: 'PM_002', edge_type: 'CO_ACCUSED', weight: 2 }
    ]);
    assert.strictEqual(edges.length, 1);
    assert.strictEqual(edges[0].data.id, 'E001');
    assert.strictEqual(edges[0].data.source, 'PM_001');
    assert.strictEqual(edges[0].data.target, 'PM_002');
    assert.strictEqual(edges[0].data.edge_type, 'CO_ACCUSED');
  });

  test('formatEdges sets directed=false for undirected edge types', function () {
    var types = ['CO_ACCUSED', 'SHARED_LOCATION', 'CANDIDATE_MATCH'];
    types.forEach(function (t) {
      var edges = formatEdges([
        { edge_id: 'E_' + t, from: 'PM_001', to: 'PM_002', edge_type: t }
      ]);
      assert.strictEqual(edges[0].data.directed, false, t + ' should be undirected');
    });
  });

  test('formatEdges sets directed=true for ACCUSED_TO_VICTIM', function () {
    var edges = formatEdges([
      { edge_id: 'E002', from: 'PM_001', to: 'PM_003', edge_type: 'ACCUSED_TO_VICTIM' }
    ]);
    assert.strictEqual(edges[0].data.directed, true);
  });

  test('toCytoscape returns valid Cytoscape JSON with from/to edges', function () {
    var result = toCytoscape({
      nodes: [{ person_id: 'PM_001', canonical_name: 'Alice', roles_summary: { accused_count: 1, victim_count: 0, complainant_count: 0 }, hop_distance: 0 }],
      edges: [{ edge_id: 'E001', from: 'PM_001', to: 'PM_002', edge_type: 'CO_ACCUSED', weight: 1 }],
      statistics: { nodes_visited: 1, edges_traversed: 0, elapsed_ms: 1 }
    });

    assert(result.elements);
    assert(Array.isArray(result.elements.nodes));
    assert(Array.isArray(result.elements.edges));
    assert.strictEqual(result.elements.edges[0].data.source, 'PM_001');
    assert.strictEqual(result.elements.edges[0].data.target, 'PM_002');
  });

  test('toCytoscape returns input when error present', function () {
    var result = toCytoscape({ error: ['Something went wrong'] });
    assert(result.error);
  });

  test('toCytoscape preserves node degree, hop_distance, role style', function () {
    var result = toCytoscape({
      nodes: [{ person_id: 'PM_001', canonical_name: 'A', roles_summary: { accused_count: 1, victim_count: 0, complainant_count: 0 }, hop_distance: 0 }],
      edges: [{ edge_id: 'E001', from: 'PM_001', to: 'PM_002', edge_type: 'CO_ACCUSED', weight: 1 }],
      statistics: {}
    });
    assert.strictEqual(result.elements.nodes[0].data.hop_distance, 0);
    assert(result.elements.nodes[0].data.node_style);
    assert(result.style);
    assert(Array.isArray(result.style));
  });
})();

// ===============================================
// 3. Validators — Edge types
// ===============================================
(function () {
  console.log('\n3. Validators \u2014 Edge Type Contract');

  test('validators.VALID_EDGE_TYPES includes CANDIDATE_MATCH', function () {
    assert(validators.VALID_EDGE_TYPES.indexOf('CANDIDATE_MATCH') >= 0);
    assert.strictEqual(validators.VALID_EDGE_TYPES.indexOf('UNCONFIRMED_MATCH'), -1);
  });

  test('validators reject UNCONFIRMED_MATCH in filter', function () {
    var errors = validators.validateEdgeTypeFilter('UNCONFIRMED_MATCH');
    assert(errors.length > 0);
    assert(errors[0].indexOf('UNCONFIRMED_MATCH') >= 0);
  });

  test('validators accept CANDIDATE_MATCH in filter', function () {
    var errors = validators.validateEdgeTypeFilter('CANDIDATE_MATCH');
    assert.strictEqual(errors.length, 0);
  });

  test('validators accept all 4 canonical edge types', function () {
    var all = validators.VALID_EDGE_TYPES;
    assert.strictEqual(all.length, 4);
    assert(all.indexOf('CO_ACCUSED') >= 0);
    assert(all.indexOf('ACCUSED_TO_VICTIM') >= 0);
    assert(all.indexOf('SHARED_LOCATION') >= 0);
    assert(all.indexOf('CANDIDATE_MATCH') >= 0);
  });
})();

// ===============================================
// 4. GraphExportService — Integration
// ===============================================
(function () {
  console.log('\n4. GraphExportService');

  var mock = createMockRepository();
  var graphService = createGraphService(mock.mockRepository);

  asyncTest('toCytoscape returns valid result for valid person', async function () {
    var result = await graphService.toCytoscape('PM_000001', { hops: 1 });
    assert(result);
    assert(!result.error);
    assert(result.elements);
    assert(Array.isArray(result.elements.nodes));
    assert(Array.isArray(result.elements.edges));
    assert(result.elements.nodes.length >= 1);
  });

  asyncTest('root node has hop_distance 0', async function () {
    var result = await graphService.toCytoscape('PM_000001', { hops: 1 });
    var root = null;
    for (var ni = 0; ni < result.elements.nodes.length; ni++) {
      if (result.elements.nodes[ni].data.id === 'PM_000001') {
        root = result.elements.nodes[ni];
        break;
      }
    }
    assert(root, 'root node not found');
    assert.strictEqual(root.data.hop_distance, 0);
    assert(root.data.label);
  });

  asyncTest('edges map from/to \u2192 source/target correctly', async function () {
    var result = await graphService.toCytoscape('PM_000001', { hops: 1 });
    for (var ei = 0; ei < result.elements.edges.length; ei++) {
      var e = result.elements.edges[ei].data;
      assert(e.source);
      assert(e.target);
      assert(typeof e.source === 'string');
      assert(typeof e.target === 'string');
    }
  });

  asyncTest('edge degrees computed correctly', async function () {
    var result = await graphService.toCytoscape('PM_000001', { hops: 1 });
    var rootNode = result.elements.nodes.filter(function (n) { return n.data.id === 'PM_000001'; })[0];
    assert(rootNode);
    assert(typeof rootNode.data.degree === 'number');
    assert(rootNode.data.degree >= 3);
  });

  asyncTest('CO_ACCUSED filter returns only those edges', async function () {
    var result = await graphService.toCytoscape('PM_000001', { hops: 2, edge_type_filter: ['CO_ACCUSED'] });
    for (var ei = 0; ei < result.elements.edges.length; ei++) {
      assert.strictEqual(result.elements.edges[ei].data.edge_type, 'CO_ACCUSED');
    }
  });

  asyncTest('returns error for nonexistent person', async function () {
    var result = await graphService.toCytoscape('PM_NONEXIST', { hops: 1 });
    assert(result.error);
  });

  asyncTest('returns error for null personId', async function () {
    var result = await graphService.toCytoscape(null, { hops: 1 });
    assert(result.error);
  });

  asyncTest('toCompact returns compact format with s/t', async function () {
    var result = await graphService.toCompact('PM_000001', { hops: 1 });
    assert(result);
    assert(!result.error);
    assert(result.root);
    assert(Array.isArray(result.nodes));
    assert(Array.isArray(result.edges));
    if (result.edges.length > 0) {
      assert(result.edges[0].s !== undefined, 'compact edge has s');
      assert(result.edges[0].t !== undefined, 'compact edge has t');
      assert(result.edges[0].type);
    }
    assert(result.stats);
  });

  asyncTest('toDebug returns detailed debug info', async function () {
    var result = await graphService.toDebug('PM_000001', { hops: 1 });
    assert(result);
    assert(!result.error);
    assert(result.root);
    assert.strictEqual(result.source, 'GraphExportService.toDebug');
    assert(result.timestamp);
    assert(result.graph);
    assert(result.graph.nodeCount > 0);
    assert(result.validation);
    assert(typeof result.validation.allEdgesReferenceValidNodes === 'boolean');
    assert(result.hopDistribution);
    assert(result.typeDistribution);
    assert(result.degreeDistribution);
  });

  asyncTest('toDebug validation passes for valid traversal', async function () {
    var result = await graphService.toDebug('PM_000001', { hops: 2 });
    assert(result.validation.allEdgesReferenceValidNodes);
    assert.strictEqual(result.validation.missingSourceEdges.length, 0);
    assert.strictEqual(result.validation.missingTargetEdges.length, 0);
  });
})();

// ===============================================
// 5. RBAC — Access Control
// ===============================================
(function () {
  console.log('\n5. RBAC \u2014 Access Control');

  var mock = createMockRepository();
  var graphService = createGraphService(mock.mockRepository);

  asyncTest('state_wide scope sees all nodes', async function () {
    var result = await graphService.toCytoscape('PM_000001', {
      hops: 1,
      caller_scope: { role: 'Inspector', state_wide: true }
    });
    assert(result && !result.error);
    assert(result.elements.nodes.length >= 3);
  });

  asyncTest('district scope filters to matching district', async function () {
    var result = await graphService.toCytoscape('PM_000001', {
      hops: 1,
      caller_scope: { role: 'Inspector', district_id: 'D001' }
    });
    assert(result && !result.error);
    assert(result.elements.nodes.length >= 1);
  });

  asyncTest('unit scope filters to matching unit', async function () {
    var result = await graphService.toCytoscape('PM_000001', {
      hops: 1,
      caller_scope: { role: 'Inspector', unit_id: 'U001' }
    });
    assert(result && !result.error);
    assert(result.elements.nodes.length >= 1);
  });

  asyncTest('no-scope defaults to open access', async function () {
    var result = await graphService.toCytoscape('PM_000001', {
      hops: 1,
      caller_scope: { role: 'Inspector' }
    });
    assert(result && !result.error);
    assert(result.elements.nodes.length >= 1);
  });

  asyncTest('Policymaker role is denied', async function () {
    var result = await graphService.toCytoscape('PM_000001', {
      hops: 1,
      caller_scope: { role: 'Policymaker', state_wide: true }
    });
    assert(result && !result.error);
    assert.strictEqual(result.elements.nodes.length, 0);
  });
})();

// ===============================================
// 6. max_nodes / Truncation
// ===============================================
(function () {
  console.log('\n6. max_nodes / Truncation');

  var mock = createMockRepository();
  var graphService = createGraphService(mock.mockRepository);

  asyncTest('toCytoscape surfaces truncated field', async function () {
    var result = await graphService.toCytoscape('PM_000001', { hops: 1, max_nodes: 1 });
    assert(result);
    assert(typeof result.truncated === 'boolean');
  });

  asyncTest('toCompact surfaces truncated and node/edge counts', async function () {
    var result = await graphService.toCompact('PM_000001', { hops: 1 });
    assert(result);
    assert(typeof result.truncated === 'boolean');
    assert(typeof result.node_count === 'number');
    assert(typeof result.edge_count === 'number');
  });

  asyncTest('toDebug surfaces truncated in graph stats', async function () {
    var result = await graphService.toDebug('PM_000001', { hops: 1 });
    assert(result);
    assert(typeof result.graph.truncated === 'boolean');
  });
})();

// ===============================================
// 7. Canonical Edge Types
// ===============================================
(function () {
  console.log('\n7. Canonical Edge Types');

  test('CO_ACCUSED is valid', function () {
    assert.strictEqual(validators.validateEdgeTypeFilter('CO_ACCUSED').length, 0);
  });

  test('ACCUSED_TO_VICTIM is valid', function () {
    assert.strictEqual(validators.validateEdgeTypeFilter('ACCUSED_TO_VICTIM').length, 0);
  });

  test('SHARED_LOCATION is valid', function () {
    assert.strictEqual(validators.validateEdgeTypeFilter('SHARED_LOCATION').length, 0);
  });

  test('CANDIDATE_MATCH is valid', function () {
    assert.strictEqual(validators.validateEdgeTypeFilter('CANDIDATE_MATCH').length, 0);
  });

  test('UNCONFIRMED_MATCH is rejected', function () {
    assert(validators.validateEdgeTypeFilter('UNCONFIRMED_MATCH').length > 0);
  });
})();

// ===============================================
// 8. Response Envelopes (sync route tests)
// ===============================================
(function () {
  console.log('\n8. Response Envelopes');

  test('parsePath correctly parses query params', function () {
    var parsed = parsePath('/person/PM_000001/graph?format=compact&max_hops=3');
    assert.strictEqual(parsed.pathname, '/person/PM_000001/graph');
    assert.strictEqual(parsed.query.format, 'compact');
    assert.strictEqual(parsed.query.max_hops, '3');
  });

  test('matchRoute matches graph endpoint', function () {
    var match = matchRoute('/person/PM_000001/graph');
    assert(match);
    assert.strictEqual(match.route, 'graph');
    assert.strictEqual(match.params.personId, 'PM_000001');
  });

  test('matchRoute matches root path', function () {
    var match = matchRoute('/');
    assert(match);
    assert.strictEqual(match.route, 'home');
  });

  test('matchRoute returns null for unknown route', function () {
    var match = matchRoute('/unknown');
    assert.strictEqual(match, null);
  });
})();

// ===============================================
// 9. Async route tests
// ===============================================
(function () {
  console.log('\n9. Async Route Tests');

  asyncTest('route returns 200 for home', async function () {
    var req = { url: '/', method: 'GET' };
    var result = await route(req, null);
    assert.strictEqual(result.statusCode, 200);
    var body = JSON.parse(result.body);
    assert.strictEqual(body.status, 'ok');
  });

  asyncTest('route returns 400 for invalid personId format', async function () {
    var req = { url: '/person/bad-id/graph' };
    var result = await route(req, null);
    assert.strictEqual(result.statusCode, 400);
  });

  asyncTest('route returns 400 for invalid format param', async function () {
    var req = { url: '/person/PM_000001/graph?format=invalid' };
    var result = await route(req, null);
    assert.strictEqual(result.statusCode, 400);
  });

  asyncTest('route returns 400 for max_hops > 3', async function () {
    var req = { url: '/person/PM_000001/graph?max_hops=5' };
    var result = await route(req, null);
    assert.strictEqual(result.statusCode, 400);
  });

  asyncTest('route returns 404 for unknown route', async function () {
    var req = { url: '/unknown' };
    var result = await route(req, null);
    assert.strictEqual(result.statusCode, 404);
  });

  asyncTest('route returns 404 for nonexistent person', async function () {
    var mock = createMockRepository();
    var graphService = createGraphService(mock.mockRepository);
    var req = { url: '/person/PM_999999/graph' };
    var result = await route(req, graphService);
    assert.strictEqual(result.statusCode, 404);
  });

  asyncTest('route returns 200 for valid graph request with graphService', async function () {
    var mock = createMockRepository();
    var graphService = createGraphService(mock.mockRepository);
    var req = { url: '/person/PM_000001/graph' };
    var result = await route(req, graphService);
    assert.strictEqual(result.statusCode, 200);
    var body = JSON.parse(result.body);
    assert.strictEqual(body.status, 'ok');
    assert(body.data.elements);
    assert(body.data.elements.nodes.length >= 1);
  });
})();

// ===============================================
// 10. POST /visualize (synchronous)
// ===============================================
(function () {
  console.log('\n10. POST /visualize');

  test('toCytoscape handles direct call with from/to edges', function () {
    var result = toCytoscape({
      nodes: [{ person_id: 'PM_001', canonical_name: 'A', roles_summary: { accused_count: 1, victim_count: 0, complainant_count: 0 }, hop_distance: 0 }],
      edges: [{ edge_id: 'E001', from: 'PM_001', to: 'PM_002', edge_type: 'CO_ACCUSED', weight: 1 }],
      statistics: {}
    });
    assert(result.elements);
    assert.strictEqual(result.elements.nodes.length, 1);
    assert.strictEqual(result.elements.edges.length, 1);
    assert.strictEqual(result.elements.edges[0].data.source, 'PM_001');
    assert.strictEqual(result.elements.edges[0].data.target, 'PM_002');
  });

  test('toCytoscape returns null for null input', function () {
    var result = toCytoscape(null);
    assert.strictEqual(result, null);
  });
})();

// ===============================================
// 11. BFS → Cytoscape contract verification
// ===============================================
(function () {
  console.log('\n11. BFS \u2192 Cytoscape Contract');

  var mock = createMockRepository();
  var graphService = createGraphService(mock.mockRepository);

  asyncTest('BFS result edges have from/to fields', async function () {
    var result = await graphService.getGraph('PM_000001', { hops: 1 });
    for (var ei = 0; ei < result.edges.length; ei++) {
      assert(result.edges[ei].from !== undefined, 'edge has from');
      assert(result.edges[ei].to !== undefined, 'edge has to');
    }
  });

  asyncTest('Cytoscape output uses source/target (not from/to)', async function () {
    var result = await graphService.toCytoscape('PM_000001', { hops: 1 });
    for (var ei = 0; ei < result.elements.edges.length; ei++) {
      var ed = result.elements.edges[ei].data;
      assert(ed.source !== undefined, 'cy edge has source');
      assert(ed.target !== undefined, 'cy edge has target');
    }
  });
})();

// All async tests collected — run them now
Promise.all(asyncPromises).then(function () {
  console.log('\n=== Summary ===');
  console.log(passed + ' passed, ' + failed + ' failed' + (failed > 0 ? ' ***' : ''));
  process.exit(failed > 0 ? 1 : 0);
}).catch(function (err) {
  console.log('\n=== Summary ===');
  console.log('Unhandled error: ' + err.message);
  process.exit(1);
});
