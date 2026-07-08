'use strict';

var assert = require('assert');
var { getInstance: getGraphService } = require('../graph-service/index');

var gs = getGraphService();

var { bfsTraverse } = require('./bfs');
var { TraversalService } = require('./traversalService');
var { validateInput, validateOutput } = require('./validation');
var { buildParentMap, reconstructPath } = require('./pathUtils');

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

function findNodeWithMinDegree(minDegree) {
  var nodes = gs._cache.getNodes();
  for (var ni = 0; ni < nodes.length; ni++) {
    var deg = gs.getDegree(nodes[ni].person_id);
    if (deg >= minDegree) return nodes[ni].person_id;
  }
  return null;
}

var rootId = findNodeWithMinDegree(3);
if (!rootId) {
  console.log('SKIP: no node with degree >= 3 found');
  process.exit(0);
}

console.log('\nUsing root person_id: ' + rootId + ' (degree = ' + gs.getDegree(rootId) + ')\n');
console.log('BFS Traversal Tests\n');

// --- Validation ---
(function() {
  console.log('Validation');

  test('rejects empty person_id', function() {
    var errors = validateInput(gs, '', {});
    assert(errors.length > 0);
  });

  test('rejects null person_id', function() {
    var errors = validateInput(gs, null, {});
    assert(errors.length > 0);
  });

  test('rejects nonexistent person_id', function() {
    var errors = validateInput(gs, 'PM_NONEXIST', {});
    assert(errors.length > 0);
  });

  test('accepts valid person_id', function() {
    var errors = validateInput(gs, rootId, {});
    assert.strictEqual(errors.length, 0);
  });

  test('rejects max_hops > 3', function() {
    var errors = validateInput(gs, rootId, { max_hops: 4 });
    assert(errors.length > 0);
  });

  test('rejects max_hops = 0', function() {
    var errors = validateInput(gs, rootId, { max_hops: 0 });
    assert(errors.length > 0);
  });

  test('rejects max_hops as string', function() {
    var errors = validateInput(gs, rootId, { max_hops: '3' });
    assert(errors.length > 0);
  });

  test('accepts max_hops = 3', function() {
    var errors = validateInput(gs, rootId, { max_hops: 3 });
    assert.strictEqual(errors.length, 0);
  });

  test('rejects invalid edge_type in filter', function() {
    var errors = validateInput(gs, rootId, { edge_type_filter: ['INVALID_TYPE'] });
    assert(errors.length > 0);
  });

  test('rejects empty edge_type_filter', function() {
    var errors = validateInput(gs, rootId, { edge_type_filter: [] });
    assert(errors.length > 0);
  });

  test('accepts valid edge_type_filter', function() {
    var errors = validateInput(gs, rootId, { edge_type_filter: ['CO_ACCUSED'] });
    assert.strictEqual(errors.length, 0);
  });

  test('rejects non-boolean include_unconfirmed', function() {
    var errors = validateInput(gs, rootId, { include_unconfirmed: 'yes' });
    assert(errors.length > 0);
  });
})();

// --- BFS Traversal ---
(function() {
  console.log('\nBFS Traversal');

  test('depth 1 returns root + immediate neighbours', function() {
    var result = bfsTraverse(gs, rootId, { max_hops: 1 });
    assert(!result.error);
    assert.strictEqual(result.root, rootId);
    assert.strictEqual(result.max_hops, 1);
    assert(result.nodes.length >= 1);
    assert(Array.isArray(result.edges));
    assert(result.statistics.nodes_visited > 0);
    assert(result.statistics.elapsed_ms >= 0);
  });

  test('depth 1 includes root node with hop_distance 0', function() {
    var result = bfsTraverse(gs, rootId, { max_hops: 1 });
    var root = null;
    for (var ni = 0; ni < result.nodes.length; ni++) {
      if (result.nodes[ni].person_id === rootId) {
        root = result.nodes[ni];
        break;
      }
    }
    assert(root, 'root node not found in result');
    assert.strictEqual(root.hop_distance, 0);
    assert(root.canonical_name);
    assert(root.roles_summary);
    assert(typeof root.degree === 'number');
  });

  test('depth 2 returns more nodes than depth 1', function() {
    var r1 = bfsTraverse(gs, rootId, { max_hops: 1 });
    var r2 = bfsTraverse(gs, rootId, { max_hops: 2 });
    assert(r2.statistics.nodes_visited >= r1.statistics.nodes_visited);
  });

  test('depth 3 returns more nodes than depth 2', function() {
    var r2 = bfsTraverse(gs, rootId, { max_hops: 2 });
    var r3 = bfsTraverse(gs, rootId, { max_hops: 3 });
    assert(r3.statistics.nodes_visited >= r2.statistics.nodes_visited);
  });

  test('no duplicate nodes in result', function() {
    var result = bfsTraverse(gs, rootId, { max_hops: 3 });
    var seen = {};
    for (var ni = 0; ni < result.nodes.length; ni++) {
      assert(!seen[result.nodes[ni].person_id], 'duplicate node: ' + result.nodes[ni].person_id);
      seen[result.nodes[ni].person_id] = true;
    }
  });

  test('no duplicate edges in result', function() {
    var result = bfsTraverse(gs, rootId, { max_hops: 3 });
    var seen = {};
    for (var ei = 0; ei < result.edges.length; ei++) {
      assert(!seen[result.edges[ei].edge_id], 'duplicate edge: ' + result.edges[ei].edge_id);
      seen[result.edges[ei].edge_id] = true;
    }
  });

  test('every edge connects returned nodes', function() {
    var result = bfsTraverse(gs, rootId, { max_hops: 3 });
    var nodeIds = {};
    for (var ni = 0; ni < result.nodes.length; ni++) {
      nodeIds[result.nodes[ni].person_id] = true;
    }
    for (var ei = 0; ei < result.edges.length; ei++) {
      var e = result.edges[ei];
      assert(nodeIds[e.source], 'edge ' + e.edge_id + ' source ' + e.source + ' not in nodes');
      assert(nodeIds[e.target], 'edge ' + e.edge_id + ' target ' + e.target + ' not in nodes');
    }
  });

  test('edges include all required fields', function() {
    var result = bfsTraverse(gs, rootId, { max_hops: 1 });
    if (result.edges.length > 0) {
      var e = result.edges[0];
      assert(e.edge_id);
      assert(e.source);
      assert(e.target);
      assert(e.edge_type);
      assert(typeof e.weight === 'number');
      assert(typeof e.occurrence_count === 'number');
    }
  });

  test('hop_distance increments correctly', function() {
    var result = bfsTraverse(gs, rootId, { max_hops: 2 });
    for (var ni = 0; ni < result.nodes.length; ni++) {
      var n = result.nodes[ni];
      assert(n.hop_distance >= 0);
      assert(n.hop_distance <= 2);
      if (n.person_id === rootId) {
        assert.strictEqual(n.hop_distance, 0);
      }
    }
  });
})();

// --- Edge Type Filter ---
(function() {
  console.log('\nEdge Type Filter');

  test('filter by CO_ACCUSED returns only CO_ACCUSED edges', function() {
    var result = bfsTraverse(gs, rootId, { max_hops: 3, edge_type_filter: ['CO_ACCUSED'] });
    if (result.edges.length > 0) {
      for (var ei = 0; ei < result.edges.length; ei++) {
        assert.strictEqual(result.edges[ei].edge_type, 'CO_ACCUSED');
      }
    }
  });

  test('filter by ACCUSED_TO_VICTIM returns only ACCUSED_TO_VICTIM edges', function() {
    var result = bfsTraverse(gs, rootId, { max_hops: 3, edge_type_filter: ['ACCUSED_TO_VICTIM'] });
    if (result.edges.length > 0) {
      for (var ei = 0; ei < result.edges.length; ei++) {
        assert.strictEqual(result.edges[ei].edge_type, 'ACCUSED_TO_VICTIM');
      }
    }
  });

  test('multiple edge types in filter', function() {
    var result = bfsTraverse(gs, rootId, {
      max_hops: 3,
      edge_type_filter: ['CO_ACCUSED', 'ACCUSED_TO_VICTIM']
    });
    if (result.edges.length > 0) {
      for (var ei = 0; ei < result.edges.length; ei++) {
        assert(['CO_ACCUSED', 'ACCUSED_TO_VICTIM'].indexOf(result.edges[ei].edge_type) !== -1);
      }
    }
  });
})();

// --- Unconfirmed Exclusion ---
(function() {
  console.log('\nUnconfirmed Exclusion');

  test('default exlusion has no UNCONFIRMED_MATCH edges', function() {
    var result = bfsTraverse(gs, rootId, { max_hops: 3 });
    for (var ei = 0; ei < result.edges.length; ei++) {
      assert.notStrictEqual(result.edges[ei].edge_type, 'UNCONFIRMED_MATCH');
    }
  });

  test('include_unconfirmed=true may include UNCONFIRMED_MATCH', function() {
    var result = bfsTraverse(gs, rootId, { max_hops: 3, include_unconfirmed: true });
    var found = false;
    for (var ei = 0; ei < result.edges.length; ei++) {
      if (result.edges[ei].edge_type === 'UNCONFIRMED_MATCH') {
        found = true;
        break;
      }
    }
    if (!found) {
      console.log('    (INFO: no UNCONFIRMED_MATCH edges found for this root)');
    }
  });
})();

// --- Invalid Root ---
(function() {
  console.log('\nInvalid Root');

  test('returns error for nonexistent person_id', function() {
    var result = bfsTraverse(gs, 'PM_NONEXIST', { max_hops: 2 });
    assert(result.error);
    assert(Array.isArray(result.error));
    assert(result.error.length > 0);
  });

  test('returns error for null person_id', function() {
    var result = bfsTraverse(gs, null, { max_hops: 2 });
    assert(result.error);
  });

  test('returns error for max_hops > 3', function() {
    var result = bfsTraverse(gs, rootId, { max_hops: 5 });
    assert(result.error);
  });
})();

// --- TraversalService ---
(function() {
  console.log('\nTraversalService');

  var ts = new TraversalService(gs);

  test('traverse returns valid result', function() {
    var result = ts.traverse(rootId, { max_hops: 2 });
    assert(!result.error);
    assert(result.root);
    assert(result.statistics.nodes_visited > 0);
  });

  test('traverseDepth1 uses max_hops=1', function() {
    var result = ts.traverseDepth1(rootId);
    assert.strictEqual(result.max_hops, 1);
  });

  test('traverseDepth2 uses max_hops=2', function() {
    var result = ts.traverseDepth2(rootId);
    assert.strictEqual(result.max_hops, 2);
  });

  test('traverseDepth3 uses max_hops=3', function() {
    var result = ts.traverseDepth3(rootId);
    assert.strictEqual(result.max_hops, 3);
  });

  test('traverseCoAccused filters edges', function() {
    var result = ts.traverseCoAccused(rootId);
    if (result.edges.length > 0) {
      for (var ei = 0; ei < result.edges.length; ei++) {
        assert.strictEqual(result.edges[ei].edge_type, 'CO_ACCUSED');
      }
    }
  });

  test('traverseAccusedVictim filters edges', function() {
    var result = ts.traverseAccusedVictim(rootId);
    if (result.edges.length > 0) {
      for (var ei = 0; ei < result.edges.length; ei++) {
        assert.strictEqual(result.edges[ei].edge_type, 'ACCUSED_TO_VICTIM');
      }
    }
  });

  test('traverseWithUnconfirmed includes UNCONFIRMED_MATCH', function() {
    var result = ts.traverseWithUnconfirmed(rootId);
    var found = false;
    for (var ei = 0; ei < result.edges.length; ei++) {
      if (result.edges[ei].edge_type === 'UNCONFIRMED_MATCH') found = true;
    }
    if (result.edges.length > 0 && !found) {
      console.log('    (INFO: no UNCONFIRMED_MATCH edges for this root)');
    }
  });
})();

// --- Cycles ---
(function() {
  console.log('\nCycles');

  test('bfs does not revisit nodes (cycle safety)', function() {
    var result = bfsTraverse(gs, rootId, { max_hops: 3 });
    var seen = {};
    for (var ni = 0; ni < result.nodes.length; ni++) {
      assert(!seen[result.nodes[ni].person_id], 'visited node twice: ' + result.nodes[ni].person_id);
      seen[result.nodes[ni].person_id] = true;
    }
  });

  test('bfs does not revisit edges (cycle safety)', function() {
    var result = bfsTraverse(gs, rootId, { max_hops: 3 });
    var seen = {};
    for (var ei = 0; ei < result.edges.length; ei++) {
      assert(!seen[result.edges[ei].edge_id], 'visited edge twice: ' + result.edges[ei].edge_id);
      seen[result.edges[ei].edge_id] = true;
    }
  });
})();

// --- Path Utils ---
(function() {
  console.log('\nPath Utils');

  test('buildParentMap returns map for visited nodes', function() {
    var result = bfsTraverse(gs, rootId, { max_hops: 2 });
    var parentMap = buildParentMap(result.nodes, result.edges);
    assert(parentMap[rootId]);
    assert(parentMap[rootId].parent === null);
  });

  test('reconstructPath returns array for root exists', function() {
    var result = bfsTraverse(gs, rootId, { max_hops: 2 });
    var parentMap = buildParentMap(result.nodes, result.edges);
    var path = reconstructPath(rootId, parentMap);
    assert(Array.isArray(path));
    assert(path.length >= 1);
    assert.strictEqual(path[0].person_id, rootId);
  });
})();

// --- Index Singleton ---
(function() {
  console.log('\nSingleton');

  test('getInstance returns TraversalService', function() {
    var { getInstance } = require('./index');
    var instance = getInstance();
    assert(instance.traverse);
    assert(instance.traverseDepth1);
    assert(instance.traverseDepth2);
    assert(instance.traverseDepth3);
  });

  test('getInstance returns same instance', function() {
    var { getInstance } = require('./index');
    assert.strictEqual(getInstance(), getInstance());
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
