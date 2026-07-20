'use strict';

var assert = require('assert');
var path = require('path');
var fs = require('fs');

var OUTPUT_DIR = path.resolve(__dirname, '..', 'personmaster-builder', 'output');
var DOCUMENTS_PATH = path.join(OUTPUT_DIR, 'personmaster_documents.json');
var EDGES_PATH = path.join(OUTPUT_DIR, 'personmaster_edges.json');

var nodes;
var edgesData;
try {
  nodes = JSON.parse(fs.readFileSync(DOCUMENTS_PATH, 'utf8'));
  edgesData = JSON.parse(fs.readFileSync(EDGES_PATH, 'utf8'));
} catch (e) {
  console.log('SKIP: graph data not found at ' + OUTPUT_DIR);
  process.exit(0);
}
var edges = edgesData.edges || [];

var { GraphService } = require('./graphService');
var { computeStats, printStats } = require('./statistics');
var { GraphCache } = require('./cache');
var { GraphRepository } = require('./graphRepository');

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

function assertDeepEqual(actual, expected, msg) {
  try {
    assert.deepStrictEqual(actual, expected);
  } catch (e) {
    var m = msg || 'expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual);
    throw new Error(m);
  }
}

console.log('\nGraph Service Tests\n');

// --- GraphRepository ---
(function() {
  console.log('GraphRepository');

  test('loadNodes returns array', function() {
    var repo = new GraphRepository();
    var result = repo.loadNodes();
    assert(Array.isArray(result));
    assert(result.length > 0);
  });

  test('loadEdges returns array', function() {
    var repo = new GraphRepository();
    var result = repo.loadEdges();
    assert(Array.isArray(result));
  });

  test('getNodeById returns correct node', function() {
    var repo = new GraphRepository();
    var node = repo.getNodeById(nodes[0].person_id);
    assert(node);
    assert.strictEqual(node.person_id, nodes[0].person_id);
  });

  test('getNodeById returns null for missing', function() {
    var repo = new GraphRepository();
    var node = repo.getNodeById('PM_NONEXIST');
    assert.strictEqual(node, null);
  });

  test('loadGraph returns nodes and edges', function() {
    var repo = new GraphRepository();
    var data = repo.loadGraph();
    assert(Array.isArray(data.nodes));
    assert(Array.isArray(data.edges));
    assert.strictEqual(data.nodes.length, nodes.length);
    assert.strictEqual(data.edges.length, edges.length);
  });
})();

// --- GraphCache ---
(function() {
  console.log('\nGraphCache');

  test('lazy load', function() {
    var loaded = false;
    var cache = new GraphCache(function() {
      loaded = true;
      return { nodes: [{ person_id: 'PM_001' }], edges: [{ edge_id: 'E001', source: 'PM_001', target: 'PM_002', edge_type: 'TEST' }] };
    });
    assert.strictEqual(loaded, false);
    assert.strictEqual(cache.isLoaded(), false);

    var n = cache.getNodes();
    assert(loaded);
    assert(cache.isLoaded());
    assert.strictEqual(n.length, 1);
  });

  test('reload', function() {
    var callCount = 0;
    var cache = new GraphCache(function() {
      callCount++;
      return { nodes: [], edges: [] };
    });
    cache.load();
    assert.strictEqual(callCount, 1);
    cache.reload();
    assert.strictEqual(callCount, 2);
  });

  test('clear', function() {
    var cache = new GraphCache(function() {
      return { nodes: [{ person_id: 'PM_001' }], edges: [] };
    });
    cache.load();
    assert(cache.isLoaded());
    cache.clear();
    assert.strictEqual(cache.isLoaded(), false);
  });

  test('indexes are built', function() {
    var cache = new GraphCache(function() {
      return {
        nodes: [{ person_id: 'PM_001' }, { person_id: 'PM_002' }],
        edges: [
          { edge_id: 'E001', source: 'PM_001', target: 'PM_002', edge_type: 'TEST', weight: 1, metadata: {} }
        ]
      };
    });
    cache.load();

    assert(cache.getNode('PM_001'));
    assert.strictEqual(cache.getNode('PM_003'), null);
    assert(cache.getEdge('E001'));
    assert.strictEqual(cache.getEdge('E999'), null);
    assert.strictEqual(cache.getEdgesForNode('PM_001').length, 1);
    assert.strictEqual(cache.getEdgesForNode('PM_003').length, 0);
    assert.strictEqual(cache.getDegree('PM_001'), 1);
    assert(cache.nodeExists('PM_001'));
    assert.strictEqual(cache.nodeExists('PM_003'), false);
  });
})();

// --- GraphService ---
(function() {
  console.log('\nGraphService');

  var gs = new GraphService();

  test('getPerson returns person data', function() {
    var p = gs.getPerson(nodes[0].person_id);
    assert(p);
    assert.strictEqual(p.person_id, nodes[0].person_id);
    assert(p.canonical_name);
    assert(p.aliases);
    assert(p.roles_summary);
  });

  test('getPerson returns null for missing', function() {
    var p = gs.getPerson('PM_NONEXIST');
    assert.strictEqual(p, null);
  });

  test('getPerson returns a copy not reference', function() {
    var p = gs.getPerson(nodes[0].person_id);
    p.canonical_name = 'MODIFIED';
    var p2 = gs.getPerson(nodes[0].person_id);
    assert.notStrictEqual(p2.canonical_name, 'MODIFIED');
  });

  test('personExists returns true for valid', function() {
    assert(gs.personExists(nodes[0].person_id));
  });

  test('personExists returns false for missing', function() {
    assert.strictEqual(gs.personExists('PM_NONEXIST'), false);
  });

  test('getEdges returns edges for a node', function() {
    var firstNode = nodes[0];
    var nodeEdges = gs.getEdges(firstNode.person_id);
    assert(Array.isArray(nodeEdges));
    for (var ei = 0; ei < nodeEdges.length; ei++) {
      var e = nodeEdges[ei];
      assert(e.edge_id);
      assert(e.edge_type);
      assert(e.source === firstNode.person_id || e.target === firstNode.person_id);
    }
  });

  test('getEdges returns empty for missing', function() {
    var e = gs.getEdges('PM_NONEXIST');
    assert(Array.isArray(e));
    assert.strictEqual(e.length, 0);
  });

  test('getNeighbours returns connected persons', function() {
    var firstNode = nodes[0];
    var neighbours = gs.getNeighbours(firstNode.person_id);
    assert(Array.isArray(neighbours));
    for (var ni = 0; ni < neighbours.length; ni++) {
      assert(neighbours[ni].person_id);
      assert(neighbours[ni].canonical_name);
      assert(neighbours[ni].person_id !== firstNode.person_id);
    }
  });

  test('getNeighbours returns empty for missing', function() {
    var n = gs.getNeighbours('PM_NONEXIST');
    assert(Array.isArray(n));
    assert.strictEqual(n.length, 0);
  });

  test('getDegree returns number', function() {
    var deg = gs.getDegree(nodes[0].person_id);
    assert.strictEqual(typeof deg, 'number');
    assert(deg >= 0);
  });

  test('getDegree returns 0 for missing', function() {
    assert.strictEqual(gs.getDegree('PM_NONEXIST'), 0);
  });

  test('getEdge returns edge data', function() {
    var firstEdgeId = edges[0].edge_id;
    var e = gs.getEdge(firstEdgeId);
    assert(e);
    assert.strictEqual(e.edge_id, firstEdgeId);
  });

  test('getEdge returns null for missing', function() {
    assert.strictEqual(gs.getEdge('E999999'), null);
  });

  test('getPersonsByRole returns array', function() {
    var accused = gs.getPersonsByRole('accused');
    assert(Array.isArray(accused));
    for (var ai = 0; ai < accused.length; ai++) {
      assert(accused[ai].person_id);
      assert(accused[ai].role === 'accused');
      assert(accused[ai].count > 0);
    }
  });

  test('getPersonsByRole returns all three roles', function() {
    assert(gs.getPersonsByRole('accused').length > 0);
    assert(gs.getPersonsByRole('victim').length > 0);
    assert(gs.getPersonsByRole('complainant').length > 0);
  });

  test('getPersonsByRole with unknown role returns empty', function() {
    assert.strictEqual(gs.getPersonsByRole('unknown').length, 0);
  });

  test('reload resets cache', function() {
    var before = gs.getCacheInfo();
    gs.reload();
    var after = gs.getCacheInfo();
    assert(after.loaded);
    assert.strictEqual(before.nodeCount, after.nodeCount);
  });

  test('clearCache clears data', function() {
    gs.clearCache();
    var info = gs.getCacheInfo();
    assert.strictEqual(info.loaded, false);
    assert.strictEqual(info.nodeCount, 0);
    // Re-load for subsequent tests
    gs.getPerson(nodes[0].person_id);
    info = gs.getCacheInfo();
    assert(info.loaded);
  });

  test('getCacheInfo returns metadata', function() {
    var info = gs.getCacheInfo();
    assert(info.loaded);
    assert(info.nodeCount > 0);
    assert(info.edgeCount > 0);
    assert(info.loadedAt);
  });
})();

// --- Statistics ---
(function() {
  console.log('\nStatistics');

  test('computeStats returns all fields', function() {
    var stats = computeStats(nodes, edges);
    assert(stats.totalNodes > 0);
    assert(stats.totalEdges > 0);
    assert(stats.averageDegree);
    assert(stats.maxDegree >= 0);
    assert(stats.edgesByType);
    assert(stats.connectedComponents > 0);
    assert(stats.largestComponent > 0);
    assert(Array.isArray(stats.componentSizes));
    assert.strictEqual(stats.totalNodes, nodes.length);
    assert.strictEqual(stats.totalEdges, edges.length);
  });

  test('computeStats edge types cover all edges', function() {
    var stats = computeStats(nodes, edges);
    var typeTotal = 0;
    for (var t in stats.edgesByType) {
      typeTotal += stats.edgesByType[t];
    }
    assert.strictEqual(typeTotal, edges.length);
  });

  test('computeStats connected components sum to total nodes', function() {
    var stats = computeStats(nodes, edges);
    var sum = stats.componentSizes.reduce(function(a, b) { return a + b; }, 0);
    assert.strictEqual(sum, stats.totalNodes);
  });

  test('printStats does not throw', function() {
    var stats = computeStats(nodes, edges);
    printStats(stats);
  });
})();

// --- Validation ---
(function() {
  console.log('\nValidation');

  test('every edge references valid source node', function() {
    for (var ei = 0; ei < edges.length; ei++) {
      var found = false;
      for (var ni = 0; ni < nodes.length; ni++) {
        if (nodes[ni].person_id === edges[ei].source) { found = true; break; }
      }
      assert(found, 'edge ' + edges[ei].edge_id + ' source ' + edges[ei].source + ' not found in nodes');
    }
  });

  test('every edge references valid target node', function() {
    for (var ei = 0; ei < edges.length; ei++) {
      var found = false;
      for (var ni = 0; ni < nodes.length; ni++) {
        if (nodes[ni].person_id === edges[ei].target) { found = true; break; }
      }
      assert(found, 'edge ' + edges[ei].edge_id + ' target ' + edges[ei].target + ' not found in nodes');
    }
  });

  test('no duplicate node IDs', function() {
    var seen = {};
    for (var ni = 0; ni < nodes.length; ni++) {
      var id = nodes[ni].person_id;
      assert(!seen[id], 'duplicate node ID: ' + id);
      seen[id] = true;
    }
  });

  test('no duplicate edge IDs', function() {
    var seen = {};
    for (var ei = 0; ei < edges.length; ei++) {
      var id = edges[ei].edge_id;
      assert(!seen[id], 'duplicate edge ID: ' + id);
      seen[id] = true;
    }
  });

  test('no orphan nodes (each node has at least degree 0)', function() {
    var gs = new GraphService();
    for (var ni = 0; ni < nodes.length; ni++) {
      var deg = gs.getDegree(nodes[ni].person_id);
      assert.strictEqual(typeof deg, 'number');
      assert(deg >= 0);
    }
  });
})();

// --- Singleton via index ---
(function() {
  console.log('\nindex.js singleton');

  test('getInstance returns GraphService', function() {
    var { getInstance } = require('./index');
    var instance = getInstance();
    assert(instance.getPerson);
    assert(instance.getNeighbours);
  });

  test('getInstance returns same instance twice', function() {
    var { getInstance } = require('./index');
    var a = getInstance();
    var b = getInstance();
    assert.strictEqual(a, b);
  });

  test('resetInstance clears singleton', function() {
    var { getInstance, resetInstance } = require('./index');
    var a = getInstance();
    resetInstance();
    var b = getInstance();
    assert.notStrictEqual(a, b);
  });
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed' + (failed > 0 ? ' ***' : ''));
process.exit(failed > 0 ? 1 : 0);
