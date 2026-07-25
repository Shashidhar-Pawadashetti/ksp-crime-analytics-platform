'use strict';

var assert = require('assert');
var path = require('path');

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
// CATALYST NOSQL MOCK
// ============================================================

var NoSQLOperator = {
  EQUALS: 'EQUALS'
};

var NoSQLMarshall = {
  makeString: function (s) { return { S: s }; }
};

function createMockQueryTable(documents, throwOnCall) {
  var callCount = 0;
  var capturedQueryBodies = [];

  var mockFn = async function (queryBody) {
    callCount++;
    capturedQueryBodies.push(JSON.parse(JSON.stringify(queryBody)));

    if (throwOnCall && throwOnCall(callCount)) {
      throw new Error('Simulated NoSQL queryTable failure on call ' + callCount);
    }

    var pageSize = queryBody.limit || 100;
    var startKey = queryBody.start_key;
    var startIndex = 0;

    if (startKey) {
      for (var si = 0; si < documents.length; si++) {
        if (documents[si].person_id === startKey.person_id.S) {
          startIndex = si;
          break;
        }
      }
      if (startKey.person_id.S === documents[documents.length - 1].person_id) {
        return {
          getResponseData: function () { return []; },
          start_key: null
        };
      }
    }

    var page = documents.slice(startIndex, startIndex + pageSize);
    var responseItems = page.map(function (doc) {
      return {
        item: {
          to: function () { return JSON.parse(JSON.stringify(doc)); }
        }
      };
    });

    var nextKey = null;
    if (startIndex + pageSize < documents.length) {
      var nextDoc = documents[startIndex + pageSize];
      nextKey = {
        type: NoSQLMarshall.makeString('PM'),
        person_id: NoSQLMarshall.makeString(nextDoc.person_id)
      };
    }

    return {
      getResponseData: function () { return responseItems; },
      start_key: nextKey
    };
  };

  mockFn.getCallCount = function () { return callCount; };
  mockFn.getCapturedQueryBodies = function () { return capturedQueryBodies; };
  return mockFn;
}

function createMockNoSqlTable(mockQueryTable) {
  return {
    getTable: async function () {
      return {
        queryTable: mockQueryTable
      };
    }
  };
}

function createMockAppInstance(documents, throwOnCall) {
  var mockQueryTable = createMockQueryTable(documents, throwOnCall);
  return {
    nosql: function () {
      return createMockNoSqlTable(mockQueryTable);
    },
    getMockQueryTable: function () { return mockQueryTable; }
  };
}

function makePersonMasterDoc(personId, overrides) {
  var doc = {
    type: 'PM',
    person_id: personId,
    canonical_name: 'Person ' + personId,
    name_normalised: 'person ' + personId.toLowerCase(),
    age_estimate: 30,
    gender: 'M',
    source_records: [],
    roles_summary: { accused_count: 0, victim_count: 0, complainant_count: 0 },
    confirmed_edges: [],
    unconfirmed_edges: [],
    flags: {},
    demographics: {},
    confidence: {},
    meta: {}
  };
  if (overrides) {
    for (var k in overrides) {
      doc[k] = overrides[k];
    }
  }
  return doc;
}

// ============================================================
// IMPORT GRAPH MODULES
// ============================================================

var { GraphRepository } = require('./graphRepository');
var { GraphCache } = require('./cache');
var { GraphService } = require('./graphService');
var { computeStats } = require('./statistics');

// ============================================================
// TESTS
// ============================================================

console.log('\n=== Phase 4.4.1 Graph Service Tests ===\n');

// --- 1. Empty Collection ---
(function () {
  console.log('1. Empty PersonMaster Collection');

  test('empty collection produces empty graph', async function () {
    var mockApp = createMockAppInstance([]);
    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);
    assert.strictEqual(result.nodes.length, 0);
    assert.strictEqual(result.edges.length, 0);
    assert.strictEqual(result.diagnostics.documents_loaded, 0);
    assert.strictEqual(result.diagnostics.nodes_loaded, 0);
    assert.strictEqual(result.diagnostics.edges_loaded, 0);
  });
})();

// --- 2. One Node / No Edges ---
(function () {
  console.log('\n2. Single Node, No Edges');

  test('one node loaded with correct fields', async function () {
    var docs = [makePersonMasterDoc('PM_001')];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);
    assert.strictEqual(result.nodes.length, 1);
    assert.strictEqual(result.edges.length, 0);

    var node = result.nodes[0];
    assert.strictEqual(node.person_id, 'PM_001');
    assert.strictEqual(node.canonical_name, 'Person PM_001');
    assert.strictEqual(node.name_normalised, 'person pm_001');
    assert.strictEqual(node.age_estimate, 30);
    assert.strictEqual(node.gender, 'M');
    assert.ok(node.roles_summary);
    assert.ok(node.source_records);
    assert.ok(node.flags);
    assert.strictEqual(node.confirmed_edges, undefined);
    assert.strictEqual(node.unconfirmed_edges, undefined);
  });

  test('graph service returns person', async function () {
    var docs = [makePersonMasterDoc('PM_001')];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var GraphServiceLocal = require('./graphService').GraphService;
    var gs = new GraphServiceLocal();
    gs._cache = new GraphCache(function () {
      return repo.loadGraph(mockApp);
    });
    var person = await gs.getPerson('PM_001');
    assert.ok(person);
    assert.strictEqual(person.person_id, 'PM_001');
    assert.strictEqual(person.canonical_name, 'Person PM_001');
  });

  test('personExists returns true for existing', async function () {
    var docs = [makePersonMasterDoc('PM_001')];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });
    assert.strictEqual(await gs.personExists('PM_001'), true);
    assert.strictEqual(await gs.personExists('PM_999'), false);
  });

  test('hasNode alias works', async function () {
    var docs = [makePersonMasterDoc('PM_001')];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });
    assert.strictEqual(await gs.hasNode('PM_001'), true);
  });
})();

// --- 3. Multiple Nodes ---
(function () {
  console.log('\n3. Multiple Nodes');

  test('three nodes loaded', async function () {
    var docs = [
      makePersonMasterDoc('PM_001'),
      makePersonMasterDoc('PM_002'),
      makePersonMasterDoc('PM_003')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);
    assert.strictEqual(result.nodes.length, 3);
    assert.strictEqual(result.diagnostics.documents_loaded, 3);
    assert.strictEqual(result.diagnostics.nodes_loaded, 3);
  });
})();

// --- 4. Confirmed Edge Loading ---
(function () {
  console.log('\n4. Confirmed Edge Loading');

  test('confirmed edge is loaded with confirmed=true', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'EDGE_001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 0.95, evidence: ['CASE_001'], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);

    assert.strictEqual(result.edges.length, 1);
    var edge = result.edges[0];
    assert.strictEqual(edge.edge_id, 'EDGE_001');
    assert.strictEqual(edge.edge_type, 'CO_ACCUSED');
    assert.strictEqual(edge.source_person_id, 'PM_001');
    assert.strictEqual(edge.target_person_id, 'PM_002');
    assert.strictEqual(edge.confirmed, true);
    assert.strictEqual(edge.confidence, 0.95);
    assert.deepStrictEqual(edge.case_ids, ['CASE_001']);
    assert.strictEqual(edge.created_at, '2024-01-01');
    assert.strictEqual(edge.version, 1);
    assert.strictEqual(result.diagnostics.confirmed_edges_loaded, 1);
    assert.strictEqual(result.diagnostics.edges_loaded, 1);
  });
})();

// --- 5. Unconfirmed Edge Loading ---
(function () {
  console.log('\n5. Unconfirmed Edge Loading');

  test('unconfirmed edge is loaded with confirmed=false', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        unconfirmed_edges: [
          { edge_id: 'EDGE_U01', edge_type: 'CANDIDATE_MATCH', target_person_id: 'PM_002', confidence: 0.65, evidence: ['name_similarity'], case_ids: [], created_at: '2024-06-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);

    assert.strictEqual(result.edges.length, 1);
    var edge = result.edges[0];
    assert.strictEqual(edge.edge_id, 'EDGE_U01');
    assert.strictEqual(edge.edge_type, 'CANDIDATE_MATCH');
    assert.strictEqual(edge.confirmed, false);
    assert.strictEqual(result.diagnostics.unconfirmed_edges_loaded, 1);
  });
})();

// --- 6. CO_ACCUSED Navigable From Both Endpoints ---
(function () {
  console.log('\n6. CO_ACCUSED Navigable From Both Endpoints');

  test('CO_ACCUSED edge appears in both nodes adjacency', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'EDGE_001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 0.9, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });

    var edges001 = await gs.getEdges('PM_001');
    var edges002 = await gs.getEdges('PM_002');

    assert.strictEqual(edges001.length, 1);
    assert.strictEqual(edges002.length, 1);
    assert.strictEqual(edges001[0].edge_id, 'EDGE_001');
    assert.strictEqual(edges002[0].edge_id, 'EDGE_001');
  });

  test('CO_ACCUSED neighbours works from both sides', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'EDGE_001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 0.9, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002', { canonical_name: 'Person PM_002' })
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });

    var n001 = await gs.getNeighbours('PM_001');
    var n002 = await gs.getNeighbours('PM_002');

    assert.strictEqual(n001.length, 1);
    assert.strictEqual(n001[0].person_id, 'PM_002');
    assert.strictEqual(n002.length, 1);
    assert.strictEqual(n002[0].person_id, 'PM_001');
  });
})();

// --- 7. SHARED_LOCATION Navigable From Both Endpoints ---
(function () {
  console.log('\n7. SHARED_LOCATION Navigable From Both Endpoints');

  test('SHARED_LOCATION edge navigable from both ends', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'EDGE_SL1', edge_type: 'SHARED_LOCATION', target_person_id: 'PM_003', confidence: 0.8, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_003')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });

    var edges001 = await gs.getEdges('PM_001');
    var edges003 = await gs.getEdges('PM_003');
    assert.strictEqual(edges001.length, 1);
    assert.strictEqual(edges003.length, 1);
    assert.strictEqual(edges001[0].edge_id, 'EDGE_SL1');
    assert.strictEqual(edges003[0].edge_id, 'EDGE_SL1');
  });
})();

// --- 8. CANDIDATE_MATCH Navigable From Both Endpoints ---
(function () {
  console.log('\n8. CANDIDATE_MATCH Navigable From Both Endpoints');

  test('CANDIDATE_MATCH edge navigable from both ends', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        unconfirmed_edges: [
          { edge_id: 'EDGE_CM1', edge_type: 'CANDIDATE_MATCH', target_person_id: 'PM_004', confidence: 0.6, evidence: [], case_ids: [], created_at: '2024-06-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_004')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });

    var edges001 = await gs.getEdges('PM_001');
    var edges004 = await gs.getEdges('PM_004');
    assert.strictEqual(edges001.length, 1);
    assert.strictEqual(edges004.length, 1);
    assert.strictEqual(edges001[0].edge_id, 'EDGE_CM1');
    assert.strictEqual(edges004[0].edge_id, 'EDGE_CM1');
  });
})();

// --- 9. ACCUSED_TO_VICTIM Source Out-Adjacency ---
(function () {
  console.log('\n9. ACCUSED_TO_VICTIM Source Out-Adjacency');

  test('ACCUSED_TO_VICTIM edge accessible from source via getEdges', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'EDGE_A2V', edge_type: 'ACCUSED_TO_VICTIM', target_person_id: 'PM_005', confidence: 1.0, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_005')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });

    var edgesSource = await gs.getEdges('PM_001');
    var edgesTarget = await gs.getEdges('PM_005');

    assert.strictEqual(edgesSource.length, 1, 'source should have 1 edge');
    assert.strictEqual(edgesTarget.length, 1, 'target should have 1 edge (in-adjacency)');
  });
})();

// --- 10. ACCUSED_TO_VICTIM Target In-Adjacency ---
(function () {
  console.log('\n10. ACCUSED_TO_VICTIM Target In-Adjacency — Degree');

  test('ACCUSED_TO_VICTIM degree counts from both sides', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'EDGE_A2V', edge_type: 'ACCUSED_TO_VICTIM', target_person_id: 'PM_005', confidence: 1.0, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_005')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });

    var deg001 = await gs.getDegree('PM_001');
    var deg005 = await gs.getDegree('PM_005');
    assert.strictEqual(deg001, 1, 'source degree should be 1');
    assert.strictEqual(deg005, 1, 'target degree should be 1');
  });

  test('ACCUSED_TO_VICTIM neighbours accessible from both sides', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', { canonical_name: 'Accused' }),
      makePersonMasterDoc('PM_005', { canonical_name: 'Victim' })
    ];
    docs[0].confirmed_edges = [
      { edge_id: 'EDGE_A2V', edge_type: 'ACCUSED_TO_VICTIM', target_person_id: 'PM_005', confidence: 1.0, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });

    var neighboursSource = await gs.getNeighbours('PM_001');
    var neighboursTarget = await gs.getNeighbours('PM_005');
    assert.strictEqual(neighboursSource.length, 1, 'source should see target');
    assert.strictEqual(neighboursSource[0].person_id, 'PM_005');
    assert.strictEqual(neighboursTarget.length, 1, 'target should see source');
    assert.strictEqual(neighboursTarget[0].person_id, 'PM_001');
  });
})();

// --- 11. No Synthetic Reverse Directed Edge ---
(function () {
  console.log('\n11. No Synthetic Reverse Directed Edge');

  test('only one edge object exists for ACCUSED_TO_VICTIM', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'EDGE_D01', edge_type: 'ACCUSED_TO_VICTIM', target_person_id: 'PM_005', confidence: 1.0, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_005')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);
    assert.strictEqual(result.edges.length, 1, 'exactly 1 edge object');
    assert.strictEqual(result.edges[0].source_person_id, 'PM_001');
    assert.strictEqual(result.edges[0].target_person_id, 'PM_005');
  });
})();

// --- 12. Duplicate Edge ID ---
(function () {
  console.log('\n12. Duplicate Edge ID Deduplication');

  test('duplicate edge_id from same document skipped', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'EDGE_DUP', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 0.9, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 },
          { edge_id: 'EDGE_DUP', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 0.9, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);
    assert.strictEqual(result.edges.length, 1);
    assert.strictEqual(result.diagnostics.duplicate_edges_skipped, 1);
    assert.strictEqual(result.diagnostics.edges_loaded, 1);
  });

  test('duplicate edge_id across documents skipped', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'EDGE_X', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 0.9, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002', {
        confirmed_edges: [
          { edge_id: 'EDGE_X', edge_type: 'CO_ACCUSED', target_person_id: 'PM_001', confidence: 0.9, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
        ]
      })
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);
    assert.strictEqual(result.edges.length, 1, 'only first occurrence kept');
    assert.strictEqual(result.diagnostics.duplicate_edges_skipped, 1);
    assert.strictEqual(result.edges[0].source_person_id, 'PM_001');
  });
})();

// --- 13. Dangling Target ---
(function () {
  console.log('\n13. Dangling Target Handling');

  test('edge with dangling target is skipped', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'EDGE_DANGLE', edge_type: 'CO_ACCUSED', target_person_id: 'PM_NONEXIST', confidence: 0.9, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
        ]
      })
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);
    assert.strictEqual(result.edges.length, 0);
    assert.strictEqual(result.diagnostics.dangling_edges_skipped, 1);
  });
})();

// --- 14. Self-Loop ---
(function () {
  console.log('\n14. Self-Loop Handling');

  test('self-loop edge is skipped', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'EDGE_SELF', edge_type: 'CO_ACCUSED', target_person_id: 'PM_001', confidence: 0.9, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
        ]
      })
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);
    assert.strictEqual(result.edges.length, 0);
    assert.strictEqual(result.diagnostics.self_loops_skipped, 1);
  });
})();

// --- 15. Unknown Edge Type ---
(function () {
  console.log('\n15. Unknown Edge Type');

  test('unknown edge type is skipped', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'EDGE_UNK', edge_type: 'UNKNOWN_TYPE', target_person_id: 'PM_002', confidence: 0.9, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);
    assert.strictEqual(result.edges.length, 0);
    assert.strictEqual(result.diagnostics.unknown_edges_skipped, 1);
  });
})();

// --- 16. Malformed Edge ---
(function () {
  console.log('\n16. Malformed Edge');

  test('edge missing edge_id is skipped', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 0.9, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);
    assert.strictEqual(result.edges.length, 0);
    assert.strictEqual(result.diagnostics.malformed_edges_skipped, 1);
  });

  test('edge missing target_person_id is skipped', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'EDGE_NOTARG', edge_type: 'CO_ACCUSED', confidence: 0.9, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);
    assert.strictEqual(result.edges.length, 0);
    assert.strictEqual(result.diagnostics.malformed_edges_skipped, 1);
  });

  test('edge missing edge_type is skipped', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'EDGE_NT', target_person_id: 'PM_002', confidence: 0.9, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);
    assert.strictEqual(result.edges.length, 0);
    assert.strictEqual(result.diagnostics.malformed_edges_skipped, 1);
  });
})();

// --- 17. Multi-Page NoSQL Loading ---
(function () {
  console.log('\n17. Multi-Page NoSQL Loading');

  test('loads documents across multiple pages using start_key', async function () {
    var docs = [];
    for (var i = 1; i <= 25; i++) {
      docs.push(makePersonMasterDoc('PM_' + String(i).padStart(3, '0')));
    }
    docs[0].confirmed_edges = [
      { edge_id: 'EDGE_001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 0.9, evidence: [], case_ids: ['CASE_001'], created_at: '2024-01-01', version: 1 }
    ];

    var mockQueryTable = createMockQueryTable(docs);
    var mockApp = {
      nosql: function () {
        return {
          getTable: async function () {
            return { queryTable: mockQueryTable };
          }
        };
      },
      getMockQueryTable: function () { return mockQueryTable; }
    };

    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);

    assert.strictEqual(result.nodes.length, 25);
    var callCount = mockQueryTable.getCallCount();
    assert.ok(callCount >= 2, 'expected at least 2 queryTable calls, got ' + callCount);

    var capturedBodies = mockQueryTable.getCapturedQueryBodies();
    for (var bi = 0; bi < capturedBodies.length; bi++) {
      var body = capturedBodies[bi];
      assert.strictEqual(body.key_condition.attribute, 'type');
      assert.strictEqual(body.key_condition.operator, 'EQUALS');
      assert.deepStrictEqual(body.key_condition.value, { S: 'PM' });
      assert.strictEqual(body.limit, 100);
      assert.strictEqual(body.consistent_read, true);
      if (bi > 0) {
        assert.ok(body.start_key, 'page ' + (bi + 1) + ' should have start_key');
      }
    }
  });
})();

// --- 18. Correct NoSQL Query Contract ---
(function () {
  console.log('\n18. Correct NoSQL Query Contract');

  test('query contract uses correct attribute/operator/value format', async function () {
    var docs = [makePersonMasterDoc('PM_001')];
    var mockQueryTable = createMockQueryTable(docs);
    var mockApp = {
      nosql: function () {
        return {
          getTable: async function () {
            return { queryTable: mockQueryTable };
          }
        };
      },
      getMockQueryTable: function () { return mockQueryTable; }
    };

    var repo = new GraphRepository();
    await repo.loadGraph(mockApp);

    var bodies = mockQueryTable.getCapturedQueryBodies();
    assert.ok(bodies.length >= 1, 'at least one queryTable call');
    var q = bodies[0];

    assert.strictEqual(typeof q.key_condition.attribute, 'string', 'attribute must be string, not array');
    assert.strictEqual(q.key_condition.attribute, 'type');
    assert.strictEqual(q.key_condition.operator, NoSQLOperator.EQUALS);
    assert.ok(q.key_condition.value.S, 'value must be NoSQLMarshall string');
    assert.strictEqual(q.key_condition.value.S, 'PM');
    assert.strictEqual(q.consistent_read, true);
    assert.strictEqual(q.limit, 100);
    assert.strictEqual(q.start_key, undefined, 'first page has no start_key');
  });
})();

// --- 19. NoSQL Error Propagation ---
(function () {
  console.log('\n19. NoSQL Error Propagation');

  test('NoSQL queryTable failure propagates as error', async function () {
    var throwOnCall = function (callNum) { return callNum === 1; };
    var docs = [makePersonMasterDoc('PM_001')];
    var mockApp = createMockAppInstance(docs, throwOnCall);

    var repo = new GraphRepository();
    var threw = false;
    try {
      await repo.loadGraph(mockApp);
    } catch (err) {
      threw = true;
      assert.ok(err.message.indexOf('Simulated NoSQL') !== -1, 'error message preserved');
    }
    assert.ok(threw, 'loadGraph should throw');
  });
})();

// --- 20. Failed Initial Load Allows Retry ---
(function () {
  console.log('\n20. Failed Initial Load Allows Retry');

  test('cache retries after failed initial load', async function () {
    var loadAttempts = 0;

    var cache = new GraphCache(function () {
      loadAttempts++;
      if (loadAttempts === 1) {
        throw new Error('First load fails');
      }
      return {
        nodes: [{ person_id: 'PM_001', canonical_name: 'Retry', name_normalised: 'retry', age_estimate: 25, gender: 'F', source_records: [], roles_summary: { accused_count: 0, victim_count: 0, complainant_count: 0 }, flags: {} }],
        edges: [],
        diagnostics: { documents_loaded: 1, nodes_loaded: 1, edges_loaded: 0, confirmed_edges_loaded: 0, unconfirmed_edges_loaded: 0, duplicate_edges_skipped: 0, self_loops_skipped: 0, dangling_edges_skipped: 0, unknown_edges_skipped: 0, malformed_edges_skipped: 0 }
      };
    });

    var threw = false;
    try {
      await cache.load();
    } catch (err) {
      threw = true;
    }
    assert.ok(threw, 'first load should fail');
    assert.strictEqual(cache.isLoaded(), false, 'cache not loaded after failure');

    await cache.load();
    assert.ok(cache.isLoaded(), 'second load should succeed');
    var node = cache.getNode('PM_001');
    assert.ok(node, 'node should be accessible after retry');
    assert.strictEqual(cache.getVersion(), 1);
  });
})();

// --- 21. Failed Reload Preserves Healthy Cache ---
(function () {
  console.log('\n21. Failed Reload Preserves Healthy Cache');

  test('failed reload does not replace healthy cache', async function () {
    var loadCount = 0;

    var cache = new GraphCache(function () {
      loadCount++;
      if (loadCount === 1) {
        return {
          nodes: [{ person_id: 'PM_001', canonical_name: 'Original', name_normalised: 'original', age_estimate: 30, gender: 'M', source_records: [], roles_summary: { accused_count: 0, victim_count: 0, complainant_count: 0 }, flags: {} }],
          edges: [],
          diagnostics: { documents_loaded: 1, nodes_loaded: 1, edges_loaded: 0, confirmed_edges_loaded: 0, unconfirmed_edges_loaded: 0, duplicate_edges_skipped: 0, self_loops_skipped: 0, dangling_edges_skipped: 0, unknown_edges_skipped: 0, malformed_edges_skipped: 0 }
        };
      }
      throw new Error('Reload fails');
    });

    await cache.load();
    assert.ok(cache.isLoaded());
    var node = cache.getNode('PM_001');
    assert.strictEqual(node.canonical_name, 'Original');
    assert.strictEqual(cache.getVersion(), 1);
    assert.strictEqual(cache.getLoadErrors(), 0);

    var threw = false;
    try {
      await cache.reload();
    } catch (err) {
      threw = true;
    }
    assert.ok(threw, 'reload should throw');

    assert.ok(cache.isLoaded(), 'cache should still be loaded');
    var nodeAfter = cache.getNode('PM_001');
    assert.ok(nodeAfter, 'node should still exist');
    assert.strictEqual(nodeAfter.canonical_name, 'Original', 'original data preserved');
    assert.strictEqual(cache.getVersion(), 1, 'version unchanged');
    assert.strictEqual(cache.getLoadErrors(), 1, 'load error counter incremented');
  });
})();

// --- 22. Successful Reload Replaces Cache ---
(function () {
  console.log('\n22. Successful Reload Atomically Replaces Cache');

  test('successful reload replaces data and increments version', async function () {
    var loadCount = 0;

    var cache = new GraphCache(function () {
      loadCount++;
      if (loadCount === 1) {
        return {
          nodes: [{ person_id: 'PM_001', canonical_name: 'Original', name_normalised: 'original', age_estimate: 30, gender: 'M', source_records: [], roles_summary: { accused_count: 0, victim_count: 0, complainant_count: 0 }, flags: {} }],
          edges: [],
          diagnostics: { documents_loaded: 1, nodes_loaded: 1, edges_loaded: 0, confirmed_edges_loaded: 0, unconfirmed_edges_loaded: 0, duplicate_edges_skipped: 0, self_loops_skipped: 0, dangling_edges_skipped: 0, unknown_edges_skipped: 0, malformed_edges_skipped: 0 }
        };
      }
      return {
        nodes: [{ person_id: 'PM_002', canonical_name: 'Replaced', name_normalised: 'replaced', age_estimate: 35, gender: 'F', source_records: [], roles_summary: { accused_count: 1, victim_count: 0, complainant_count: 0 }, flags: {} }],
        edges: [],
        diagnostics: { documents_loaded: 1, nodes_loaded: 1, edges_loaded: 0, confirmed_edges_loaded: 0, unconfirmed_edges_loaded: 0, duplicate_edges_skipped: 0, self_loops_skipped: 0, dangling_edges_skipped: 0, unknown_edges_skipped: 0, malformed_edges_skipped: 0 }
      };
    });

    await cache.load();
    assert.strictEqual(cache.getVersion(), 1);
    assert.strictEqual(cache.getNode('PM_001').canonical_name, 'Original');

    await cache.reload();
    assert.strictEqual(cache.getVersion(), 2);
    assert.strictEqual(cache.getNode('PM_001'), null, 'PM_001 should be gone');
    assert.strictEqual(cache.getNode('PM_002').canonical_name, 'Replaced');
  });
})();

// --- 23. Cache Version Increments Only on Success ---
(function () {
  console.log('\n23. Cache Version Increments Only on Success');

  test('version does not increment on failed load', async function () {
    var cache = new GraphCache(function () {
      throw new Error('Always fails');
    });

    try { await cache.load(); } catch (e) {}
    assert.strictEqual(cache.getVersion(), 0, 'version should remain 0');
  });

  test('version increments on successful reload but not on failure', async function () {
    var loadCount = 0;
    var cache = new GraphCache(function () {
      loadCount++;
      if (loadCount === 1) {
        return {
          nodes: [{ person_id: 'PM_001', canonical_name: 'V1', name_normalised: 'v1', age_estimate: 30, gender: 'M', source_records: [], roles_summary: { accused_count: 0, victim_count: 0, complainant_count: 0 }, flags: {} }],
          edges: [],
          diagnostics: null
        };
      }
      if (loadCount === 2) throw new Error('Reload fails');
      return {
        nodes: [{ person_id: 'PM_002', canonical_name: 'V3', name_normalised: 'v3', age_estimate: 35, gender: 'F', source_records: [], roles_summary: { accused_count: 0, victim_count: 0, complainant_count: 0 }, flags: {} }],
        edges: [],
        diagnostics: null
      };
    });

    await cache.load();
    assert.strictEqual(cache.getVersion(), 1);

    try { await cache.reload(); } catch (e) {}
    assert.strictEqual(cache.getVersion(), 1, 'version unchanged after failed reload');
    assert.strictEqual(cache.getLoadErrors(), 1);

    await cache.reload();
    assert.strictEqual(cache.getVersion(), 2, 'version incremented after successful reload');
  });
})();

// --- 24. Statistics / Diagnostics ---
(function () {
  console.log('\n24. Statistics and Diagnostics');

  test('statistics computed correctly', function () {
    var nodes = [
      { person_id: 'PM_001' },
      { person_id: 'PM_002' },
      { person_id: 'PM_003' }
    ];
    var edges = [
      { edge_id: 'E1', edge_type: 'CO_ACCUSED', source_person_id: 'PM_001', target_person_id: 'PM_002' },
      { edge_id: 'E2', edge_type: 'CO_ACCUSED', source_person_id: 'PM_002', target_person_id: 'PM_003' }
    ];
    var stats = computeStats(nodes, edges);
    assert.strictEqual(stats.totalNodes, 3);
    assert.strictEqual(stats.totalEdges, 2);
    assert.strictEqual(stats.edgesByType.CO_ACCUSED, 2);
    assert.ok(stats.averageDegree > 0);
    assert.ok(stats.maxDegree > 0);
    assert.ok(stats.connectedComponents > 0);
    assert.ok(stats.largestComponent > 0);
    assert.ok(Array.isArray(stats.componentSizes));
  });

  test('diagnostics returned from loadGraph', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'E001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 0.9, evidence: [], case_ids: ['C001'], created_at: '2024-01-01', version: 1 }
        ],
        unconfirmed_edges: [
          { edge_id: 'EU01', edge_type: 'CANDIDATE_MATCH', target_person_id: 'PM_003', confidence: 0.6, evidence: [], case_ids: [], created_at: '2024-06-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002'),
      makePersonMasterDoc('PM_003')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);

    assert.strictEqual(result.diagnostics.documents_loaded, 3);
    assert.strictEqual(result.diagnostics.nodes_loaded, 3);
    assert.strictEqual(result.diagnostics.edges_loaded, 2);
    assert.strictEqual(result.diagnostics.confirmed_edges_loaded, 1);
    assert.strictEqual(result.diagnostics.unconfirmed_edges_loaded, 1);
  });

  test('getGraphStatistics includes diagnostics', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'E001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 0.9, evidence: [], case_ids: ['C001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });

    var stats = await gs.getGraphStatistics();
    assert.ok(stats.diagnostics);
    assert.strictEqual(stats.diagnostics.edges_loaded, 1);
    assert.ok(stats.cache_version !== undefined);
    assert.ok(stats.cache_loaded_at !== undefined);
  });

  test('getStats alias returns same as getGraphStatistics', async function () {
    var docs = [makePersonMasterDoc('PM_001')];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });

    var stats1 = await gs.getGraphStatistics();
    var stats2 = await gs.getStats();
    assert.strictEqual(stats1.totalNodes, stats2.totalNodes);
    assert.strictEqual(stats1.totalEdges, stats2.totalEdges);
  });

  test('getCacheInfo returns version and loadErrors', async function () {
    var docs = [makePersonMasterDoc('PM_001')];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });
    await gs._cache.load();

    var info = gs.getCacheInfo();
    assert.strictEqual(info.loaded, true);
    assert.ok(info.loadedAt > 0);
    assert.strictEqual(info.version, 1);
    assert.strictEqual(info.loadErrors, 0);
    assert.strictEqual(info.nodeCount, 1);
    assert.strictEqual(info.edgeCount, 0);
    assert.ok(info.diagnostics);
  });
})();

// --- 25. Existing GraphService Public Methods ---
(function () {
  console.log('\n25. Backward Compatibility — Existing Public Methods');

  test('getPerson returns deep copy', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', { canonical_name: 'Original' })
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });

    var p = await gs.getPerson('PM_001');
    p.canonical_name = 'MODIFIED';
    var p2 = await gs.getPerson('PM_001');
    assert.strictEqual(p2.canonical_name, 'Original');
  });

  test('getNeighbours returns array', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'E001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 0.9, evidence: [], case_ids: ['C001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002', { canonical_name: 'Neighbour' })
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });

    var neighbours = await gs.getNeighbours('PM_001');
    assert.ok(Array.isArray(neighbours));
    assert.strictEqual(neighbours.length, 1);
    assert.strictEqual(neighbours[0].person_id, 'PM_002');
  });

  test('getEdges returns edges for node', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'E001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 0.9, evidence: [], case_ids: ['C001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });

    var edges = await gs.getEdges('PM_001');
    assert.ok(Array.isArray(edges));
    assert.strictEqual(edges.length, 1);
    assert.strictEqual(edges[0].edge_id, 'E001');
    assert.strictEqual(edges[0].source_person_id, 'PM_001');
    assert.strictEqual(edges[0].target_person_id, 'PM_002');
  });

  test('getDegree returns number', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'E001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 0.9, evidence: [], case_ids: ['C001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });

    assert.strictEqual(typeof (await gs.getDegree('PM_001')), 'number');
    assert.strictEqual(await gs.getDegree('PM_001'), 1);
    assert.strictEqual(await gs.getDegree('PM_999'), 0);
  });

  test('getEdge returns edge by id', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'E001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 0.9, evidence: [], case_ids: ['C001'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002')
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });

    var edge = await gs.getEdge('E001');
    assert.ok(edge);
    assert.strictEqual(edge.edge_id, 'E001');
    assert.strictEqual(await gs.getEdge('E999'), null);
  });

  test('getPersonsByRole returns results', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', { roles_summary: { accused_count: 3, victim_count: 0, complainant_count: 1 } }),
      makePersonMasterDoc('PM_002', { roles_summary: { accused_count: 0, victim_count: 2, complainant_count: 0 } })
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var gs = new (require('./graphService').GraphService)();
    gs._cache = new GraphCache(function () { return repo.loadGraph(mockApp); });

    var accused = await gs.getPersonsByRole('accused');
    assert.strictEqual(accused.length, 1);
    assert.strictEqual(accused[0].person_id, 'PM_001');

    var victim = await gs.getPersonsByRole('victim');
    assert.strictEqual(victim.length, 1);
    assert.strictEqual(victim[0].person_id, 'PM_002');

    var complainant = await gs.getPersonsByRole('complainant');
    assert.strictEqual(complainant.length, 1);
    assert.strictEqual(complainant[0].person_id, 'PM_001');

    assert.strictEqual((await gs.getPersonsByRole('unknown')).length, 0);
  });

  test('reload and clearCache work', async function () {
    var callCount = 0;
    var cache = new GraphCache(function () {
      callCount++;
      return {
        nodes: [{ person_id: 'PM_001', canonical_name: 'Test', name_normalised: 'test', age_estimate: 30, gender: 'M', source_records: [], roles_summary: { accused_count: 0, victim_count: 0, complainant_count: 0 }, flags: {} }],
        edges: [],
        diagnostics: { documents_loaded: 1, nodes_loaded: 1, edges_loaded: 0, confirmed_edges_loaded: 0, unconfirmed_edges_loaded: 0, duplicate_edges_skipped: 0, self_loops_skipped: 0, dangling_edges_skipped: 0, unknown_edges_skipped: 0, malformed_edges_skipped: 0 }
      };
    });

    var gs = new (require('./graphService').GraphService)();
    gs._cache = cache;

    assert.strictEqual(callCount, 0);
    await gs.getPerson('PM_001');
    assert.strictEqual(callCount, 1);

    await gs.reload();
    assert.strictEqual(callCount, 2);

    gs.clearCache();
    assert.strictEqual(gs.getCacheInfo().loaded, false);
  });

  test('singleton getInstance returns GraphService', function () {
    var { getInstance, resetInstance } = require('./index');
    var a = getInstance();
    assert.ok(a.getPerson);
    assert.ok(a.getNeighbours);
    assert.ok(a.getEdges);
    assert.ok(a.getDegree);
    assert.ok(a.personExists);
    assert.ok(a.hasNode);
    assert.ok(a.getStats);
    assert.ok(a.getPersonsByRole);
    assert.ok(a.getEdge);
    assert.ok(a.getGraphStatistics);
    assert.ok(a.reload);
    assert.ok(a.clearCache);
    assert.ok(a.getCacheInfo);
    resetInstance();
  });
})();

// --- 26. Graph Cache Duplicate Edge & Degree Fix ---
(function () {
  console.log('\n26. Graph Cache — Duplicate Edge & Degree Fix');

  function buildCache(nodes, edges) {
    return new GraphCache(function () {
      return { nodes: nodes, edges: edges, diagnostics: {} };
    });
  }

  test('cross-doc same edge_id appears once per node in getEdges', async function () {
    var nodes = [
      { person_id: 'PM_A', canonical_name: 'A' },
      { person_id: 'PM_B', canonical_name: 'B' }
    ];
    var edges = [
      { edge_id: 'E001', edge_type: 'CO_ACCUSED', source_person_id: 'PM_A', target_person_id: 'PM_B', confirmed: true },
      { edge_id: 'E001', edge_type: 'CO_ACCUSED', source_person_id: 'PM_B', target_person_id: 'PM_A', confirmed: true }
    ];
    var cache = buildCache(nodes, edges);
    await cache.load();
    assert.strictEqual(cache.getEdgesForNode('PM_A').length, 1, 'PM_A sees edge once');
    assert.strictEqual(cache.getEdgesForNode('PM_B').length, 1, 'PM_B sees edge once');
    assert.strictEqual(cache.getEdgesForNode('PM_A')[0].edge_id, 'E001');
    assert.strictEqual(cache.getEdgesForNode('PM_B')[0].edge_id, 'E001');
  });

  test('cross-doc same edge_id degree counts unique relationships', async function () {
    var nodes = [
      { person_id: 'PM_A', canonical_name: 'A' },
      { person_id: 'PM_B', canonical_name: 'B' },
      { person_id: 'PM_C', canonical_name: 'C' }
    ];
    var edges = [
      { edge_id: 'E001', edge_type: 'CO_ACCUSED', source_person_id: 'PM_A', target_person_id: 'PM_B', confirmed: true },
      { edge_id: 'E001', edge_type: 'CO_ACCUSED', source_person_id: 'PM_B', target_person_id: 'PM_A', confirmed: true },
      { edge_id: 'E002', edge_type: 'SHARED_LOCATION', source_person_id: 'PM_A', target_person_id: 'PM_C', confirmed: true },
      { edge_id: 'E002', edge_type: 'SHARED_LOCATION', source_person_id: 'PM_C', target_person_id: 'PM_A', confirmed: true }
    ];
    var cache = buildCache(nodes, edges);
    await cache.load();
    assert.strictEqual(cache.getDegree('PM_A'), 2, 'PM_A degree = 2 (E001 + E002)');
    assert.strictEqual(cache.getDegree('PM_B'), 1, 'PM_B degree = 1 (E001)');
    assert.strictEqual(cache.getDegree('PM_C'), 1, 'PM_C degree = 1 (E002)');
  });

  test('same edge_id three times across docs counted once', async function () {
    var nodes = [
      { person_id: 'PM_X', canonical_name: 'X' },
      { person_id: 'PM_Y', canonical_name: 'Y' }
    ];
    var edges = [
      { edge_id: 'E_MULTI', edge_type: 'CO_ACCUSED', source_person_id: 'PM_X', target_person_id: 'PM_Y', confirmed: true },
      { edge_id: 'E_MULTI', edge_type: 'CO_ACCUSED', source_person_id: 'PM_Y', target_person_id: 'PM_X', confirmed: true },
      { edge_id: 'E_MULTI', edge_type: 'CO_ACCUSED', source_person_id: 'PM_X', target_person_id: 'PM_Y', confirmed: true }
    ];
    var cache = buildCache(nodes, edges);
    await cache.load();
    assert.strictEqual(cache.getEdgesForNode('PM_X').length, 1);
    assert.strictEqual(cache.getEdgesForNode('PM_Y').length, 1);
    assert.strictEqual(cache.getDegree('PM_X'), 1);
    assert.strictEqual(cache.getDegree('PM_Y'), 1);
  });

  test('two distinct edge_ids between same persons remain distinct', async function () {
    var nodes = [
      { person_id: 'PM_A', canonical_name: 'A' },
      { person_id: 'PM_B', canonical_name: 'B' }
    ];
    var edges = [
      { edge_id: 'E_ACCUSED', edge_type: 'CO_ACCUSED', source_person_id: 'PM_A', target_person_id: 'PM_B', confirmed: true },
      { edge_id: 'E_LOCATION', edge_type: 'SHARED_LOCATION', source_person_id: 'PM_A', target_person_id: 'PM_B', confirmed: true }
    ];
    var cache = buildCache(nodes, edges);
    await cache.load();
    assert.strictEqual(cache.getEdgesForNode('PM_A').length, 2, 'two distinct edges');
    assert.strictEqual(cache.getDegree('PM_A'), 2, 'degree = 2');
    assert.strictEqual(cache.getDegree('PM_B'), 2, 'degree = 2');
  });

  test('getEdges returns no duplicate edge_ids for any node', async function () {
    var nodes = [
      { person_id: 'PM_A', canonical_name: 'A' },
      { person_id: 'PM_B', canonical_name: 'B' },
      { person_id: 'PM_C', canonical_name: 'C' }
    ];
    var edges = [
      { edge_id: 'E001', edge_type: 'CO_ACCUSED', source_person_id: 'PM_A', target_person_id: 'PM_B', confirmed: true },
      { edge_id: 'E001', edge_type: 'CO_ACCUSED', source_person_id: 'PM_B', target_person_id: 'PM_A', confirmed: true },
      { edge_id: 'E002', edge_type: 'CO_ACCUSED', source_person_id: 'PM_B', target_person_id: 'PM_C', confirmed: true },
      { edge_id: 'E002', edge_type: 'CO_ACCUSED', source_person_id: 'PM_C', target_person_id: 'PM_B', confirmed: true },
      { edge_id: 'E003', edge_type: 'ACCUSED_TO_VICTIM', source_person_id: 'PM_A', target_person_id: 'PM_C', confirmed: true },
      { edge_id: 'E003', edge_type: 'ACCUSED_TO_VICTIM', source_person_id: 'PM_C', target_person_id: 'PM_A', confirmed: true }
    ];
    var cache = buildCache(nodes, edges);
    await cache.load();
    [ 'PM_A', 'PM_B', 'PM_C' ].forEach(function (pid) {
      var edges = cache.getEdgesForNode(pid);
      var edgeIds = edges.map(function (e) { return e.edge_id; });
      var uniqueIds = edgeIds.filter(function (id, idx, self) { return self.indexOf(id) === idx; });
      assert.strictEqual(edgeIds.length, uniqueIds.length, pid + ' has no duplicate edge_ids');
    });
    assert.strictEqual(cache.getDegree('PM_A'), 2);
    assert.strictEqual(cache.getDegree('PM_B'), 1);
    assert.strictEqual(cache.getDegree('PM_C'), 2);
  });

  test('directed ACCUSED_TO_VICTIM duplicate across docs deduped', async function () {
    var nodes = [
      { person_id: 'PM_A', canonical_name: 'Accused' },
      { person_id: 'PM_V', canonical_name: 'Victim' }
    ];
    var edges = [
      { edge_id: 'E_A2V', edge_type: 'ACCUSED_TO_VICTIM', source_person_id: 'PM_A', target_person_id: 'PM_V', confirmed: true },
      { edge_id: 'E_A2V', edge_type: 'ACCUSED_TO_VICTIM', source_person_id: 'PM_V', target_person_id: 'PM_A', confirmed: true }
    ];
    var cache = buildCache(nodes, edges);
    await cache.load();
    assert.strictEqual(cache.getEdgesForNode('PM_A').length, 1);
    assert.strictEqual(cache.getEdgesForNode('PM_V').length, 1);
    assert.strictEqual(cache.getDegree('PM_A'), 1);
    assert.strictEqual(cache.getDegree('PM_V'), 1);
  });

  test('CANDIDATE_MATCH duplicate across docs deduped', async function () {
    var nodes = [
      { person_id: 'PM_X', canonical_name: 'X' },
      { person_id: 'PM_Y', canonical_name: 'Y' }
    ];
    var edges = [
      { edge_id: 'E_CM', edge_type: 'CANDIDATE_MATCH', source_person_id: 'PM_X', target_person_id: 'PM_Y', confirmed: false },
      { edge_id: 'E_CM', edge_type: 'CANDIDATE_MATCH', source_person_id: 'PM_Y', target_person_id: 'PM_X', confirmed: false }
    ];
    var cache = buildCache(nodes, edges);
    await cache.load();
    assert.strictEqual(cache.getEdgesForNode('PM_X').length, 1);
    assert.strictEqual(cache.getEdgesForNode('PM_Y').length, 1);
    assert.strictEqual(cache.getDegree('PM_X'), 1);
    assert.strictEqual(cache.getDegree('PM_Y'), 1);
  });

  test('self-loop not counted in degree', async function () {
    var nodes = [
      { person_id: 'PM_SELF', canonical_name: 'Self' },
      { person_id: 'PM_OTHER', canonical_name: 'Other' }
    ];
    var edges = [
      { edge_id: 'E_SELF', edge_type: 'CO_ACCUSED', source_person_id: 'PM_SELF', target_person_id: 'PM_SELF', confirmed: true },
      { edge_id: 'E_NORM', edge_type: 'CO_ACCUSED', source_person_id: 'PM_SELF', target_person_id: 'PM_OTHER', confirmed: true }
    ];
    var cache = buildCache(nodes, edges);
    await cache.load();
    assert.strictEqual(cache.getDegree('PM_SELF'), 1, 'self-loop excluded from degree');
    assert.strictEqual(cache.getDegree('PM_OTHER'), 1);
    assert.strictEqual(cache.getEdgesForNode('PM_SELF').length, 1, 'self-loop excluded from edges');
  });

  test('dangling target excluded from adjacency and degree', async function () {
    var nodes = [
      { person_id: 'PM_EXIST', canonical_name: 'Exists' }
    ];
    var edges = [
      { edge_id: 'E_DANGLE', edge_type: 'CO_ACCUSED', source_person_id: 'PM_EXIST', target_person_id: 'PM_GHOST', confirmed: true }
    ];
    var cache = buildCache(nodes, edges);
    await cache.load();
    assert.strictEqual(cache.getEdgesForNode('PM_EXIST').length, 0, 'dangling edge excluded');
    assert.strictEqual(cache.getDegree('PM_EXIST'), 0);
    assert.strictEqual(cache.getEdgesForNode('PM_GHOST').length, 0);
    assert.strictEqual(cache.getDegree('PM_GHOST'), 0);
  });

  test('cache reload preserves degree uniqueness', async function () {
    var loadCount = 0;
    var cache = new GraphCache(function () {
      loadCount++;
      return {
        nodes: [
          { person_id: 'PM_A', canonical_name: 'A' },
          { person_id: 'PM_B', canonical_name: 'B' }
        ],
        edges: [
          { edge_id: 'E001', edge_type: 'CO_ACCUSED', source_person_id: 'PM_A', target_person_id: 'PM_B', confirmed: true },
          { edge_id: 'E001', edge_type: 'CO_ACCUSED', source_person_id: 'PM_B', target_person_id: 'PM_A', confirmed: true }
        ],
        diagnostics: {}
      };
    });
    await cache.load();
    assert.strictEqual(cache.getDegree('PM_A'), 1, 'first load degree');
    assert.strictEqual(cache.getEdgesForNode('PM_A').length, 1, 'first load edges');

    await cache.reload();
    assert.strictEqual(cache.getDegree('PM_A'), 1, 'reloaded degree');
    assert.strictEqual(cache.getEdgesForNode('PM_A').length, 1, 'reloaded edges');
    assert.strictEqual(loadCount, 2, 'loader called twice');
  });

  test('duplicate_edges_skipped counter accurate across docs', async function () {
    var docs = [
      makePersonMasterDoc('PM_001', {
        confirmed_edges: [
          { edge_id: 'EDGE_D1', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 0.9, evidence: [], case_ids: ['C1'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_002', {
        confirmed_edges: [
          { edge_id: 'EDGE_D1', edge_type: 'CO_ACCUSED', target_person_id: 'PM_001', confidence: 0.9, evidence: [], case_ids: ['C1'], created_at: '2024-01-01', version: 1 },
          { edge_id: 'EDGE_D2', edge_type: 'SHARED_LOCATION', target_person_id: 'PM_003', confidence: 0.8, evidence: [], case_ids: ['C2'], created_at: '2024-01-01', version: 1 }
        ]
      }),
      makePersonMasterDoc('PM_003', {
        confirmed_edges: [
          { edge_id: 'EDGE_D2', edge_type: 'SHARED_LOCATION', target_person_id: 'PM_002', confidence: 0.8, evidence: [], case_ids: ['C2'], created_at: '2024-01-01', version: 1 }
        ]
      })
    ];
    var mockApp = createMockAppInstance(docs);
    var repo = new GraphRepository();
    var result = await repo.loadGraph(mockApp);
    assert.strictEqual(result.diagnostics.edges_loaded, 2, 'exactly 2 unique edges');
    assert.strictEqual(result.diagnostics.duplicate_edges_skipped, 2, '2 cross-doc duplicates skipped');
  });

  test('statistics consistency totalEdges', async function () {
    var nodes = [
      { person_id: 'PM_001' },
      { person_id: 'PM_002' },
      { person_id: 'PM_003' }
    ];
    var edges = [
      { edge_id: 'E1', edge_type: 'CO_ACCUSED', source_person_id: 'PM_001', target_person_id: 'PM_002' },
      { edge_id: 'E2', edge_type: 'SHARED_LOCATION', source_person_id: 'PM_002', target_person_id: 'PM_003' }
    ];
    var stats = computeStats(nodes, edges);
    assert.strictEqual(stats.totalEdges, 2);
    assert.strictEqual(stats.edgesByType.CO_ACCUSED, 1);
    assert.strictEqual(stats.edgesByType.SHARED_LOCATION, 1);
  });
})();

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