'use strict';

var assert = require('assert');

var { bfs, isDirected, isUndirected, isValidEdgeType, buildNodeEntry, buildEdgeEntry, MAX_ALLOWED_HOPS, DEFAULT_MAX_NODES, ABSOLUTE_MAX_NODES } = require('./bfs');
var { callerCanAccess, extractCallerScope } = require('./rbacFilter');
var { TraversalService } = require('./traversalService');

var passed = 0;
var failed = 0;
var failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS: ' + name);
  } catch (e) {
    failed++;
    failures.push(name + ': ' + e.message);
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

function makeNodeMap(docs) {
  var map = {};
  for (var di = 0; di < docs.length; di++) {
    map[docs[di].person_id] = docs[di];
  }
  return map;
}

function createLoadNode(docs) {
  var map = makeNodeMap(docs);
  return async function (personId) {
    return map[personId] || null;
  };
}

function alwaysAllow(doc, scope) { return true; }

function alwaysDeny(doc, scope) { return false; }

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

async function runBfs(rootPersonId, docs, options, accessFn, callerScope) {
  return await bfs(rootPersonId, options || {}, {
    loadNode: createLoadNode(docs),
    canAccess: accessFn || alwaysAllow,
    callerScope: callerScope || {}
  });
}

// ============================================================
// CONSTANT TESTS
// ============================================================

console.log('\n=== Phase 4.4.2 Traversal Tests ===\n');

console.log('0. Constants and Helpers');

test('MAX_ALLOWED_HOPS is 3', function () {
  assert.strictEqual(MAX_ALLOWED_HOPS, 3);
});

test('DEFAULT_MAX_NODES is 50', function () {
  assert.strictEqual(DEFAULT_MAX_NODES, 50);
});

test('ABSOLUTE_MAX_NODES is 100', function () {
  assert.strictEqual(ABSOLUTE_MAX_NODES, 100);
});

test('isValidEdgeType accepts all canonical types', function () {
  assert.ok(isValidEdgeType('CO_ACCUSED'));
  assert.ok(isValidEdgeType('ACCUSED_TO_VICTIM'));
  assert.ok(isValidEdgeType('SHARED_LOCATION'));
  assert.ok(isValidEdgeType('CANDIDATE_MATCH'));
  assert.ok(!isValidEdgeType('INVALID'));
  assert.ok(!isValidEdgeType(''));
  assert.ok(!isValidEdgeType(null));
});

test('isUndirected correct for all types', function () {
  assert.ok(isUndirected('CO_ACCUSED'));
  assert.ok(isUndirected('SHARED_LOCATION'));
  assert.ok(isUndirected('CANDIDATE_MATCH'));
  assert.ok(!isUndirected('ACCUSED_TO_VICTIM'));
});

test('isDirected correct for all types', function () {
  assert.ok(isDirected('ACCUSED_TO_VICTIM'));
  assert.ok(!isDirected('CO_ACCUSED'));
  assert.ok(!isDirected('SHARED_LOCATION'));
  assert.ok(!isDirected('CANDIDATE_MATCH'));
});

test('buildNodeEntry extracts correct fields', function () {
  var doc = makePM('PM_001', {
    canonical_name: 'John Doe',
    name_normalised: 'john doe',
    roles_summary: { accused_count: 2, victim_count: 1, complainant_count: 0 }
  });
  var entry = buildNodeEntry(doc);
  assert.strictEqual(entry.person_id, 'PM_001');
  assert.strictEqual(entry.canonical_name, 'John Doe');
  assert.strictEqual(entry.name_normalised, 'john doe');
  assert.strictEqual(entry.roles_summary.accused_count, 2);
  assert.strictEqual(entry.source_records.length, 1);
  assert.strictEqual(entry.source_records[0].table, 'Accused');
});

test('buildEdgeEntry builds correct edge object', function () {
  var edge = makeEdge('E001', 'CO_ACCUSED', 'PM_002', { confidence: 0.85, evidence: ['E1'], case_ids: ['C1'] });
  var entry = buildEdgeEntry(edge, 'PM_001');
  assert.strictEqual(entry.edge_id, 'E001');
  assert.strictEqual(entry.edge_type, 'CO_ACCUSED');
  assert.strictEqual(entry.from, 'PM_001');
  assert.strictEqual(entry.to, 'PM_002');
  assert.strictEqual(entry.confidence, 0.85);
  assert.deepStrictEqual(entry.evidence, ['E1']);
  assert.deepStrictEqual(entry.case_ids, ['C1']);
  assert.strictEqual(entry.confirmed, true);
});

test('buildEdgeEntry handles with_person_id fallback', function () {
  var edge = { edge_id: 'E002', edge_type: 'CO_ACCUSED', with_person_id: 'PM_003' };
  var entry = buildEdgeEntry(edge, 'PM_001');
  assert.strictEqual(entry.to, 'PM_003');
});

// ============================================================
// BFS TESTS
// ============================================================

// --- 1. Depth 0 — Root Only ---
(function () {
  console.log('\n1. Depth 0 — Root Only');

  test('depth 0 returns only root node', async function () {
    var docs = [makePM('PM_001')];
    var result = await runBfs('PM_001', docs, { max_hops: 0 });
    assert.strictEqual(result.nodes.length, 1);
    assert.strictEqual(result.nodes[0].person_id, 'PM_001');
    assert.strictEqual(result.edges.length, 0);
    assert.strictEqual(result.unconfirmed_edges.length, 0);
  });

  test('depth 0 root has edges but no traversal', async function () {
    var docs = [
      makePM('PM_001', { confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')] }),
      makePM('PM_002')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 0 });
    assert.strictEqual(result.nodes.length, 1);
    assert.strictEqual(result.nodes[0].person_id, 'PM_001');
    assert.strictEqual(result.edges.length, 0);
  });
})();

// --- 2. Depth 1 ---
(function () {
  console.log('\n2. Depth 1');

  test('depth 1 returns root + direct neighbours', async function () {
    var docs = [
      makePM('PM_001', { confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')] }),
      makePM('PM_002')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1 });
    assert.strictEqual(result.nodes.length, 2);
    assert.strictEqual(result.edges.length, 1);
  });

  test('depth 1 two neighbours', async function () {
    var docs = [
      makePM('PM_001', {
        confirmed_edges: [
          makeEdge('E001', 'CO_ACCUSED', 'PM_002'),
          makeEdge('E002', 'CO_ACCUSED', 'PM_003')
        ]
      }),
      makePM('PM_002'),
      makePM('PM_003')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1 });
    assert.strictEqual(result.nodes.length, 3);
    assert.strictEqual(result.edges.length, 2);
  });
})();

// --- 3. Depth 2 ---
(function () {
  console.log('\n3. Depth 2');

  test('depth 2 reaches second hop', async function () {
    var docs = [
      makePM('PM_001', { confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')] }),
      makePM('PM_002', { confirmed_edges: [makeEdge('E002', 'CO_ACCUSED', 'PM_003')] }),
      makePM('PM_003')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 2 });
    assert.strictEqual(result.nodes.length, 3);
    assert.strictEqual(result.edges.length, 2);
  });

  test('depth 2 does not reach third hop', async function () {
    var docs = [
      makePM('PM_001', { confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')] }),
      makePM('PM_002', { confirmed_edges: [makeEdge('E002', 'CO_ACCUSED', 'PM_003')] }),
      makePM('PM_003', { confirmed_edges: [makeEdge('E003', 'CO_ACCUSED', 'PM_004')] }),
      makePM('PM_004')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 2 });
    assert.strictEqual(result.nodes.length, 3);
    assert.strictEqual(result.edges.length, 2);
  });
})();

// --- 4. Depth 3 ---
(function () {
  console.log('\n4. Depth 3');

  test('depth 3 reaches third hop', async function () {
    var docs = [
      makePM('PM_001', { confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')] }),
      makePM('PM_002', { confirmed_edges: [makeEdge('E002', 'CO_ACCUSED', 'PM_003')] }),
      makePM('PM_003', { confirmed_edges: [makeEdge('E003', 'CO_ACCUSED', 'PM_004')] }),
      makePM('PM_004')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 3 });
    assert.strictEqual(result.nodes.length, 4);
    assert.strictEqual(result.edges.length, 3);
  });
})();

// --- 5. Depth > 3 clamped ---
(function () {
  console.log('\n5. Depth Clamping');

  test('depth > 3 is clamped to 3', async function () {
    var docs = [
      makePM('PM_001', { confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')] }),
      makePM('PM_002', { confirmed_edges: [makeEdge('E002', 'CO_ACCUSED', 'PM_003')] }),
      makePM('PM_003', { confirmed_edges: [makeEdge('E003', 'CO_ACCUSED', 'PM_004')] }),
      makePM('PM_004', { confirmed_edges: [makeEdge('E004', 'CO_ACCUSED', 'PM_005')] }),
      makePM('PM_005')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 10 });
    assert.strictEqual(result.nodes.length, 4);
    assert.strictEqual(result.edges.length, 3);
    assert.strictEqual(result.hops_requested, 3);
  });
})();

// --- 6. Cycle A-B-C-A ---
(function () {
  console.log('\n6. Cycle Handling');

  test('cycle A-B-C-A terminates correctly', async function () {
    var docs = [
      makePM('PM_001', { confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')] }),
      makePM('PM_002', { confirmed_edges: [makeEdge('E002', 'CO_ACCUSED', 'PM_003')] }),
      makePM('PM_003', { confirmed_edges: [makeEdge('E003', 'CO_ACCUSED', 'PM_001')] })
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 3 });
    assert.strictEqual(result.nodes.length, 3);
    assert.strictEqual(result.edges.length, 3);
    assert.strictEqual(result.nodes[0].person_id, 'PM_001');
    assert.strictEqual(result.nodes[1].person_id, 'PM_002');
    assert.strictEqual(result.nodes[2].person_id, 'PM_003');
  });
})();

// --- 7. Duplicate Edge ---
(function () {
  console.log('\n7. Duplicate Edge');

  test('duplicate edge_id not added twice', async function () {
    var docs = [
      makePM('PM_001', {
        confirmed_edges: [
          makeEdge('E001', 'CO_ACCUSED', 'PM_002'),
          makeEdge('E001', 'CO_ACCUSED', 'PM_002')
        ]
      }),
      makePM('PM_002')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1 });
    assert.strictEqual(result.edges.length, 1);
  });

  test('duplicate edge across different nodes', async function () {
    var edge1 = makeEdge('E001', 'CO_ACCUSED', 'PM_002');
    var edge2 = makeEdge('E001', 'CO_ACCUSED', 'PM_001');
    edge2.target_person_id = 'PM_001';
    var docs = [
      makePM('PM_001', { confirmed_edges: [edge1] }),
      makePM('PM_002', { confirmed_edges: [edge2] })
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1 });
    assert.strictEqual(result.edges.length, 1);
  });
})();

// --- 8. Duplicate Node ---
(function () {
  console.log('\n8. Duplicate Node Prevention');

  test('same node not added twice', async function () {
    var docs = [
      makePM('PM_001', {
        confirmed_edges: [
          makeEdge('E001', 'CO_ACCUSED', 'PM_002'),
          makeEdge('E002', 'SHARED_LOCATION', 'PM_002')
        ]
      }),
      makePM('PM_002')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1 });
    assert.strictEqual(result.nodes.length, 2);
    assert.strictEqual(result.edges.length, 2);
  });
})();

// --- 9. Self-Loop ---
(function () {
  console.log('\n9. Self-Loop');

  test('self-loop edge does not expand', async function () {
    var docs = [
      makePM('PM_001', {
        confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_001')]
      })
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1 });
    assert.strictEqual(result.nodes.length, 1);
    assert.strictEqual(result.edges.length, 0);
  });
})();

// --- 10. Dangling Target ---
(function () {
  console.log('\n10. Dangling Target');

  test('edge to non-existent target skipped', async function () {
    var docs = [
      makePM('PM_001', {
        confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_NONEXIST')]
      })
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1 });
    assert.strictEqual(result.nodes.length, 1);
    assert.strictEqual(result.edges.length, 0);
  });
})();

// --- 11. CO_ACCUSED Both Directions ---
(function () {
  console.log('\n11. CO_ACCUSED Both Directions');

  test('CO_ACCUSED traversable from source', async function () {
    var docs = [
      makePM('PM_001', { confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')] }),
      makePM('PM_002')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1 });
    assert.strictEqual(result.nodes.length, 2);
    assert.strictEqual(result.edges.length, 1);
    assert.strictEqual(result.edges[0].from, 'PM_001');
    assert.strictEqual(result.edges[0].to, 'PM_002');
  });

  test('CO_ACCUSED traversable from target when edge stored on target', async function () {
    var docs = [
      makePM('PM_001'),
      makePM('PM_002', { confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_001')] })
    ];
    var result = await runBfs('PM_002', docs, { max_hops: 1 });
    assert.strictEqual(result.nodes.length, 2);
    assert.strictEqual(result.edges.length, 1);
    assert.strictEqual(result.edges[0].from, 'PM_002');
    assert.strictEqual(result.edges[0].to, 'PM_001');
  });
})();

// --- 12. SHARED_LOCATION Both Directions ---
(function () {
  console.log('\n12. SHARED_LOCATION Both Directions');

  test('SHARED_LOCATION traversable from source', async function () {
    var docs = [
      makePM('PM_001', { confirmed_edges: [makeEdge('E001', 'SHARED_LOCATION', 'PM_002')] }),
      makePM('PM_002')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1 });
    assert.strictEqual(result.nodes.length, 2);
    assert.strictEqual(result.edges.length, 1);
  });

  test('SHARED_LOCATION traversable from target', async function () {
    var docs = [
      makePM('PM_001'),
      makePM('PM_002', { confirmed_edges: [makeEdge('E001', 'SHARED_LOCATION', 'PM_001')] })
    ];
    var result = await runBfs('PM_002', docs, { max_hops: 1 });
    assert.strictEqual(result.nodes.length, 2);
    assert.strictEqual(result.edges.length, 1);
  });
})();

// --- 13. ACCUSED_TO_VICTIM Source → Target ---
(function () {
  console.log('\n13. ACCUSED_TO_VICTIM Source → Target');

  test('ACCUSED_TO_VICTIM traversable source to target', async function () {
    var docs = [
      makePM('PM_001', { confirmed_edges: [makeEdge('E001', 'ACCUSED_TO_VICTIM', 'PM_002')] }),
      makePM('PM_002')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1 });
    assert.strictEqual(result.nodes.length, 2);
    assert.strictEqual(result.edges.length, 1);
    assert.strictEqual(result.edges[0].from, 'PM_001');
    assert.strictEqual(result.edges[0].to, 'PM_002');
  });
})();

// --- 14. ACCUSED_TO_VICTIM Target → Source Prohibited ---
(function () {
  console.log('\n14. ACCUSED_TO_VICTIM Target → Source Prohibited');

  test('ACCUSED_TO_VICTIM target cannot traverse back to source', async function () {
    var docs = [
      makePM('PM_001', { confirmed_edges: [makeEdge('E001', 'ACCUSED_TO_VICTIM', 'PM_002')] }),
      makePM('PM_002')
    ];
    var result = await runBfs('PM_002', docs, { max_hops: 1 });
    assert.strictEqual(result.nodes.length, 1, 'target should only see itself');
    assert.strictEqual(result.edges.length, 0, 'no edges from target');
  });

  test('ACCUSED_TO_VICTIM from victim perspective with edge stored on victim', async function () {
    var docs = [
      makePM('PM_001'),
      makePM('PM_002', { confirmed_edges: [makeEdge('E001', 'ACCUSED_TO_VICTIM', 'PM_001')] })
    ];
    var result = await runBfs('PM_002', docs, { max_hops: 1 });
    assert.strictEqual(result.nodes.length, 1, 'PM_002 is not the source, so no traversal');
    assert.strictEqual(result.edges.length, 0, 'no edges from PM_002 as source_person_id differs');
  });
})();

// --- 15. Confirmed Edge ---
(function () {
  console.log('\n15. Confirmed Edge');

  test('confirmed edge included and marked confirmed', async function () {
    var docs = [
      makePM('PM_001', { confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')] }),
      makePM('PM_002')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1 });
    assert.strictEqual(result.edges.length, 1);
    assert.strictEqual(result.edges[0].confirmed, true);
    assert.strictEqual(result.unconfirmed_edges.length, 0);
  });
})();

// --- 16. Candidate Edge Excluded by Default ---
(function () {
  console.log('\n16. Candidate/Unconfirmed Edge Excluded by Default');

  test('unconfirmed edges not included when include_unconfirmed false', async function () {
    var docs = [
      makePM('PM_001', {
        unconfirmed_edges: [
          { edge_id: 'EU01', edge_type: 'CANDIDATE_MATCH', target_person_id: 'PM_002', confidence: 0.65, evidence: [], case_ids: [] }
        ]
      }),
      makePM('PM_002')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1, include_unconfirmed: false });
    assert.strictEqual(result.edges.length, 0);
    assert.strictEqual(result.unconfirmed_edges.length, 0);
  });
})();

// --- 17. Candidate Edge Included When Requested ---
(function () {
  console.log('\n17. Candidate/Unconfirmed Edge Included When Requested');

  test('unconfirmed edges included and traversed when include_unconfirmed true', async function () {
    var docs = [
      makePM('PM_001', {
        unconfirmed_edges: [
          { edge_id: 'EU01', edge_type: 'CANDIDATE_MATCH', target_person_id: 'PM_002', confidence: 0.65, evidence: [], case_ids: [] }
        ]
      }),
      makePM('PM_002')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1, include_unconfirmed: true });
    assert.strictEqual(result.edges.length, 1);
    assert.strictEqual(result.edges[0].confirmed, false);
    assert.strictEqual(result.edges[0].edge_type, 'CANDIDATE_MATCH');
    assert.strictEqual(result.nodes.length, 2);
  });
})();

// --- 18. Edge Type Filter ---
(function () {
  console.log('\n18. Edge Type Filter');

  test('edge_type_filter only includes matching types', async function () {
    var docs = [
      makePM('PM_001', {
        confirmed_edges: [
          makeEdge('E001', 'CO_ACCUSED', 'PM_002'),
          makeEdge('E002', 'SHARED_LOCATION', 'PM_003')
        ]
      }),
      makePM('PM_002'),
      makePM('PM_003')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1, edge_type_filter: ['CO_ACCUSED'] });
    assert.strictEqual(result.edges.length, 1);
    assert.strictEqual(result.edges[0].edge_type, 'CO_ACCUSED');
    assert.strictEqual(result.nodes.length, 2);
  });

  test('edge_type_filter with empty array returns no edges', async function () {
    var docs = [
      makePM('PM_001', {
        confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')]
      }),
      makePM('PM_002')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1, edge_type_filter: [] });
    assert.strictEqual(result.edges.length, 0);
    assert.strictEqual(result.nodes.length, 1);
  });
})();

// --- 19. Confidence Filter ---
(function () {
  console.log('\n19. Confidence Filter');

  test('min_confidence filters edges below threshold', async function () {
    var docs = [
      makePM('PM_001', {
        confirmed_edges: [
          makeEdge('E001', 'CO_ACCUSED', 'PM_002', { confidence: 0.5 }),
          makeEdge('E002', 'CO_ACCUSED', 'PM_003', { confidence: 0.9 })
        ]
      }),
      makePM('PM_002'),
      makePM('PM_003')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1, min_confidence: 0.8 });
    assert.strictEqual(result.edges.length, 1);
    assert.strictEqual(result.edges[0].edge_id, 'E002');
  });
})();

// --- 20. Missing Root ---
(function () {
  console.log('\n20. Missing Root');

  test('missing root returns empty graph', async function () {
    var docs = [makePM('PM_001')];
    var result = await runBfs('PM_MISSING', docs, {});
    assert.strictEqual(result.nodes.length, 0);
    assert.strictEqual(result.edges.length, 0);
    assert.strictEqual(result.root_person_id, 'PM_MISSING');
  });
})();

// --- 21. Invalid Depth ---
(function () {
  console.log('\n21. Invalid Depth');

  test('negative depth defaults to 2', async function () {
    var docs = [
      makePM('PM_001', { confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')] }),
      makePM('PM_002', { confirmed_edges: [makeEdge('E002', 'CO_ACCUSED', 'PM_003')] }),
      makePM('PM_003')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: -1 });
    assert.strictEqual(result.nodes.length, 3);
    assert.strictEqual(result.hops_requested, 2);
  });
})();

// --- 22. Max Nodes Truncation ---
(function () {
  console.log('\n22. Max Nodes Truncation');

  test('max_nodes truncates result', async function () {
    var docs = [
      makePM('PM_001', {
        confirmed_edges: [
          makeEdge('E001', 'CO_ACCUSED', 'PM_002'),
          makeEdge('E002', 'CO_ACCUSED', 'PM_003'),
          makeEdge('E003', 'CO_ACCUSED', 'PM_004')
        ]
      }),
      makePM('PM_002'),
      makePM('PM_003'),
      makePM('PM_004')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1, max_nodes: 2 });
    assert.strictEqual(result.nodes.length, 2);
    assert.strictEqual(result.truncated, true);
  });
})();

// --- 23. RBAC Root Allowed ---
(function () {
  console.log('\n23. RBAC Root Allowed');

  test('root node accessible with matching district scope', async function () {
    var docs = [
      makePM('PM_001', { source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }] })
    ];
    var scope = makeScope({ district_id: 'DIST_1' });
    var result = await runBfs('PM_001', docs, {}, function (doc, s) {
      return callerCanAccess(doc, scope);
    }, scope);
    assert.strictEqual(result.nodes.length, 1);
  });
})();

// --- 24. RBAC Root Denied ---
(function () {
  console.log('\n24. RBAC Root Denied');

  test('root node denied with non-matching district scope', async function () {
    var docs = [
      makePM('PM_001', { source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }] })
    ];
    var scope = makeScope({ district_id: 'DIST_2' });
    var result = await runBfs('PM_001', docs, {}, function (doc, s) {
      return callerCanAccess(doc, scope);
    }, scope);
    assert.strictEqual(result.nodes.length, 0);
  });
})();

// --- 25. RBAC Neighbour Allowed ---
(function () {
  console.log('\n25. RBAC Neighbour Allowed');

  test('neighbour accessible within same district', async function () {
    var docs = [
      makePM('PM_001', {
        source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }],
        confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')]
      }),
      makePM('PM_002', { source_records: [{ table: 'Accused', case_id: 'C2', district_id: 'DIST_1' }] })
    ];
    var scope = makeScope({ district_id: 'DIST_1' });
    var result = await runBfs('PM_001', docs, { max_hops: 1 }, function (doc, s) {
      return callerCanAccess(doc, scope);
    }, scope);
    assert.strictEqual(result.nodes.length, 2);
    assert.strictEqual(result.edges.length, 1);
  });
})();

// --- 26. RBAC Neighbour Denied ---
(function () {
  console.log('\n26. RBAC Neighbour Denied');

  test('neighbour in different district excluded', async function () {
    var docs = [
      makePM('PM_001', {
        source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }],
        confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')]
      }),
      makePM('PM_002', { source_records: [{ table: 'Accused', case_id: 'C2', district_id: 'DIST_2' }] })
    ];
    var scope = makeScope({ district_id: 'DIST_1' });
    var result = await runBfs('PM_001', docs, { max_hops: 1 }, function (doc, s) {
      return callerCanAccess(doc, scope);
    }, scope);
    assert.strictEqual(result.nodes.length, 1);
    assert.strictEqual(result.edges.length, 0, 'edge to unauthorized node must not leak');
  });
})();

// --- 27. Unauthorized Neighbour Edge Not Leaked ---
(function () {
  console.log('\n27. Unauthorized Neighbour Edge Not Leaked');

  test('edge to unauthorized node not in result', async function () {
    var docs = [
      makePM('PM_001', {
        source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }],
        confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')]
      }),
      makePM('PM_002', { source_records: [{ table: 'Accused', case_id: 'C2', district_id: 'DIST_2' }] })
    ];
    var scope = makeScope({ district_id: 'DIST_1' });
    var calledForNeighbor = false;
    var result = await runBfs('PM_001', docs, { max_hops: 1 }, function (doc, s) {
      if (doc.person_id === 'PM_002') calledForNeighbor = true;
      return callerCanAccess(doc, scope);
    }, scope);
    assert.strictEqual(result.edges.length, 0, 'edge must not leak');
  });
})();

// --- 28. Unit Scope ---
(function () {
  console.log('\n28. Unit Scope');

  test('unit scope grants access to matching records', async function () {
    var docs = [
      makePM('PM_001', { source_records: [{ table: 'Accused', case_id: 'C1', unit_id: 'UNIT_A' }] })
    ];
    var scope = makeScope({ unit_id: 'UNIT_A' });
    var result = await runBfs('PM_001', docs, {}, function (doc, s) {
      return callerCanAccess(doc, scope);
    }, scope);
    assert.strictEqual(result.nodes.length, 1);
  });

  test('unit scope denies non-matching records', async function () {
    var docs = [
      makePM('PM_001', { source_records: [{ table: 'Accused', case_id: 'C1', unit_id: 'UNIT_A' }] })
    ];
    var scope = makeScope({ unit_id: 'UNIT_B' });
    var result = await runBfs('PM_001', docs, {}, function (doc, s) {
      return callerCanAccess(doc, scope);
    }, scope);
    assert.strictEqual(result.nodes.length, 0);
  });
})();

// --- 29. District Scope ---
(function () {
  console.log('\n29. District Scope');

  test('district scope grants access to matching records', async function () {
    var docs = [
      makePM('PM_001', { source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }] })
    ];
    var scope = makeScope({ district_id: 'DIST_1' });
    var result = await runBfs('PM_001', docs, {}, function (doc, s) {
      return callerCanAccess(doc, scope);
    }, scope);
    assert.strictEqual(result.nodes.length, 1);
  });
})();

// --- 30. State-Wide Scope ---
(function () {
  console.log('\n30. State-Wide Scope');

  test('state_wide true grants access to any district', async function () {
    var docs = [
      makePM('PM_001', { source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }] }),
      makePM('PM_002', { source_records: [{ table: 'Victim', case_id: 'C2', district_id: 'DIST_2' }] })
    ];
    var scope = makeScope({ state_wide: true });
    var result = await runBfs('PM_001', docs, { max_hops: 1 }, function (doc, s) {
      return callerCanAccess(doc, scope);
    }, scope);
    assert.strictEqual(result.nodes.length, 1);
  });

  test('state_wide true with CO_ACCUSED across districts', async function () {
    var docs = [
      makePM('PM_001', {
        source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }],
        confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')]
      }),
      makePM('PM_002', { source_records: [{ table: 'Accused', case_id: 'C2', district_id: 'DIST_2' }] })
    ];
    var scope = makeScope({ state_wide: true });
    var result = await runBfs('PM_001', docs, { max_hops: 1 }, function (doc, s) {
      return callerCanAccess(doc, scope);
    }, scope);
    assert.strictEqual(result.nodes.length, 2);
    assert.strictEqual(result.edges.length, 1);
  });
})();

// --- 31. No Scope Denial ---
(function () {
  console.log('\n31. No-Scope Denial');

  test('state_wide false with no district/unit denies access', async function () {
    var docs = [
      makePM('PM_001', { source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }] })
    ];
    var scope = makeScope({ state_wide: false });
    var result = await runBfs('PM_001', docs, {}, function (doc, s) {
      return callerCanAccess(doc, scope);
    }, scope);
    assert.strictEqual(result.nodes.length, 0);
  });
})();

// --- 32. Empty Graph ---
(function () {
  console.log('\n32. Empty Graph');

  test('empty graph returns empty result', async function () {
    var result = await runBfs('PM_001', [], {});
    assert.strictEqual(result.nodes.length, 0);
    assert.strictEqual(result.edges.length, 0);
    assert.strictEqual(result.root_person_id, 'PM_001');
  });
})();

// --- 33. Result Edge Deduplication ---
(function () {
  console.log('\n33. Result Edge Deduplication');

  test('same edge_id not duplicated across nodes', async function () {
    var edgeFrom1 = makeEdge('E001', 'CO_ACCUSED', 'PM_002');
    var edgeFrom2 = makeEdge('E001', 'CO_ACCUSED', 'PM_001');
    edgeFrom2.target_person_id = 'PM_001';
    var docs = [
      makePM('PM_001', { confirmed_edges: [edgeFrom1] }),
      makePM('PM_002', { confirmed_edges: [edgeFrom2] })
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1 });
    assert.strictEqual(result.edges.length, 1);
  });
})();

// --- 34. Result Node Deduplication ---
(function () {
  console.log('\n34. Result Node Deduplication');

  test('node appears only once', async function () {
    var docs = [
      makePM('PM_001', {
        confirmed_edges: [
          makeEdge('E001', 'CO_ACCUSED', 'PM_002'),
          makeEdge('E002', 'SHARED_LOCATION', 'PM_002')
        ]
      }),
      makePM('PM_002')
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1 });
    assert.strictEqual(result.nodes.length, 2);
    var pm002Count = 0;
    for (var ni = 0; ni < result.nodes.length; ni++) {
      if (result.nodes[ni].person_id === 'PM_002') pm002Count++;
    }
    assert.strictEqual(pm002Count, 1);
  });
})();

// --- 35. Repository Missing Item ---
(function () {
  console.log('\n35. Repository Missing Item');

  test('loadNode returning null for some ids gracefully handled', async function () {
    var docs = [
      makePM('PM_001', { confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')] })
    ];
    var result = await runBfs('PM_001', docs, { max_hops: 1 });
    assert.strictEqual(result.nodes.length, 1);
    assert.strictEqual(result.edges.length, 0, 'dangling target edge not added');
  });
})();

// --- 36. Repository Error Propagation ---
(function () {
  console.log('\n36. Repository Error Propagation');

  test('loadNode throwing error skips that node', async function () {
    var docs = [
      makePM('PM_001', { confirmed_edges: [makeEdge('E001', 'CO_ACCUSED', 'PM_002')] }),
      makePM('PM_002')
    ];
    var map = makeNodeMap(docs);
    var loadNode = async function (personId) {
      if (personId === 'PM_002') throw new Error('DB error');
      return map[personId] || null;
    };
    var result = await bfs('PM_001', { max_hops: 1 }, {
      loadNode: loadNode,
      canAccess: alwaysAllow,
      callerScope: {}
    });
    assert.strictEqual(result.nodes.length, 1);
    assert.strictEqual(result.edges.length, 0);
  });
})();

// ============================================================
// TRAVERSALSERVICE TESTS
// ============================================================

console.log('\n37. TraversalService');

test('TraversalService constructor with mock repository', function () {
  var mockRepo = { getPerson: async function () { return null; } };
  var ts = new TraversalService({ repository: mockRepo });
  assert.ok(ts instanceof TraversalService);
  assert.ok(typeof ts.traverse === 'function');
  assert.ok(typeof ts.traverseCoAccused === 'function');
  assert.ok(typeof ts.traverseAccusedVictim === 'function');
});

test('traverseCoAccused only returns CO_ACCUSED edges', async function () {
  var docs = [
    makePM('PM_001', {
      confirmed_edges: [
        makeEdge('E001', 'CO_ACCUSED', 'PM_002'),
        makeEdge('E002', 'SHARED_LOCATION', 'PM_003')
      ]
    }),
    makePM('PM_002'),
    makePM('PM_003')
  ];
  var mockRepo = {
    getPerson: async function (personId) {
      var map = makeNodeMap(docs);
      return map[personId] || null;
    }
  };
  var ts = new TraversalService({ repository: mockRepo });
  var result = await ts.traverseCoAccused('PM_001', 1);
  assert.strictEqual(result.edges.length, 1);
  assert.strictEqual(result.edges[0].edge_type, 'CO_ACCUSED');
});

test('traverseAccusedVictim only returns ACCUSED_TO_VICTIM edges', async function () {
  var docs = [
    makePM('PM_001', {
      confirmed_edges: [
        makeEdge('E001', 'ACCUSED_TO_VICTIM', 'PM_002'),
        makeEdge('E002', 'CO_ACCUSED', 'PM_003')
      ]
    }),
    makePM('PM_002'),
    makePM('PM_003')
  ];
  var mockRepo = {
    getPerson: async function (personId) {
      var map = makeNodeMap(docs);
      return map[personId] || null;
    }
  };
  var ts = new TraversalService({ repository: mockRepo });
  var result = await ts.traverseAccusedVictim('PM_001', 1);
  assert.strictEqual(result.edges.length, 1);
  assert.strictEqual(result.edges[0].edge_type, 'ACCUSED_TO_VICTIM');
});

test('TraversalService traverse normalizes options', async function () {
  var mockRepo = {
    getPerson: async function (personId) {
      if (personId === 'PM_001') return makePM('PM_001');
      return null;
    }
  };
  var ts = new TraversalService({ repository: mockRepo });
  var result = await ts.traverse('PM_001', { max_hops: 0 });
  assert.strictEqual(result.nodes.length, 1);
  assert.strictEqual(result.hops_requested, 0);
});

test('TraversalService scope_applied reflects caller scope', async function () {
  var mockRepo = {
    getPerson: async function () { return makePM('PM_001'); }
  };
  var ts = new TraversalService({ repository: mockRepo });
  var result = await ts.traverse('PM_001', {
    max_hops: 0,
    caller_scope: { state_wide: true }
  });
  assert.strictEqual(result.scope_applied, 'state');
});

// ============================================================
// RBACFILTER TESTS
// ============================================================

console.log('\n38. RBAC Filter');

test('callerCanAccess null doc returns false', function () {
  assert.strictEqual(callerCanAccess(null, { state_wide: true }), false);
});

test('callerCanAccess null scope returns false', function () {
  assert.strictEqual(callerCanAccess({}, null), false);
});

test('callerCanAccess with no records returns false', function () {
  var doc = { source_records: [] };
  assert.strictEqual(callerCanAccess(doc, { state_wide: true }), false);
});

test('callerCanAccess state_wide true grants access', function () {
  var doc = { source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }] };
  assert.strictEqual(callerCanAccess(doc, { state_wide: true }), true);
});

test('callerCanAccess district_id match grants access', function () {
  var doc = { source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }] };
  assert.strictEqual(callerCanAccess(doc, { district_id: 'DIST_1' }), true);
});

test('callerCanAccess district_id mismatch denies access', function () {
  var doc = { source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }] };
  assert.strictEqual(callerCanAccess(doc, { district_id: 'DIST_2' }), false);
});

test('callerCanAccess unit_id match grants access', function () {
  var doc = { source_records: [{ table: 'Accused', case_id: 'C1', unit_id: 'UNIT_A' }] };
  assert.strictEqual(callerCanAccess(doc, { unit_id: 'UNIT_A' }), true);
});

test('callerCanAccess state_wide false with no unit/district denies', function () {
  var doc = { source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }] };
  assert.strictEqual(callerCanAccess(doc, { state_wide: false }), false);
});

test('callerCanAccess Policymaker role denied', function () {
  var doc = { source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }] };
  assert.strictEqual(callerCanAccess(doc, { role: 'Policymaker', state_wide: true }), false);
});

test('callerCanAccess Inspector with state_wide true allowed', function () {
  var doc = { source_records: [{ table: 'Accused', case_id: 'C1', district_id: 'DIST_1' }] };
  assert.strictEqual(callerCanAccess(doc, { role: 'Inspector', state_wide: true }), true);
});

// ============================================================
// EXTRACT CALLER SCOPE TESTS
// ============================================================

console.log('\n39. extractCallerScope');

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
// SUMMARY
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed' + (failed > 0 ? ' ***' : ''));
console.log('='.repeat(60));

if (failed > 0) {
  console.log('\n  Failures:');
  for (var fi = 0; fi < failures.length; fi++) {
    console.log('    ' + failures[fi]);
  }
  console.log('');
}

process.exit(failed > 0 ? 1 : 0);
