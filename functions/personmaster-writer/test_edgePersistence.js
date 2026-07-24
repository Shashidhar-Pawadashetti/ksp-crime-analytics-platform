'use strict';

/*
 * Local test for edgePersistence.js — Phase 4.2.2 Milestone 4.
 *
 * Mocks the Catalyst NoSQL SDK and resolution-audit-log.
 * Tests merge logic, deduplication, batch processing, and error handling.
 *
 * Run: node test_edgePersistence.js
 */

var path = require('path');

var passed = 0;
var failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  \u2713 ' + message);
  } else {
    failed++;
    console.log('  \u2717 ' + message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
    console.log('  \u2713 ' + message);
  } else {
    failed++;
    console.log('  \u2717 ' + message + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
  }
}

/* ========================================================== */
/*  Setup: In-memory document store + mock Catalyst SDK        */
/* ========================================================== */

var docStore = {};

function resetStore() {
  docStore = {};
}

function addDoc(doc) {
  docStore[doc.person_id] = JSON.parse(JSON.stringify(doc));
}

function getDoc(personId) {
  return docStore[personId] ? JSON.parse(JSON.stringify(docStore[personId])) : null;
}

/* -- Mock NoSQLItem: stores raw attributes -- */
function MockNoSQLItem(obj) {
  this._attrs = obj || {};
}
MockNoSQLItem.from = function (obj) {
  return new MockNoSQLItem(obj);
};
MockNoSQLItem.prototype.toJSON = function () {
  return this._attrs;
};

/* -- Mock NoSQLMarshall: passes through -- */
var MockNoSQLMarshall = {
  make: function (value) {
    return value;
  }
};

/* -- Mock NoSQLEnum -- */
var MockNoSQLEnum = {
  NoSQLUpdateOperationType: { PUT: 'PUT', DELETE: 'DELETE' },
  NoSQLOperator: {}
};

/* -- Mock table handle -- */
var mockTable = {
  getItems: async function (params) {
    var keys = params.keys;
    var personId = keys._attrs ? keys._attrs.person_id : null;

    if (!personId) return { data: [] };

    var doc = docStore[personId];
    if (doc) {
      return { data: [JSON.parse(JSON.stringify(doc))] };
    }
    return { data: [] };
  },
  updateItems: async function (params) {
    var keys = params.keys;
    var personId = keys._attrs ? keys._attrs.person_id : null;
    if (!personId) throw new Error('updateItems: missing person_id in keys');

    if (!docStore[personId]) {
      throw new Error('updateItems: document ' + personId + ' not found');
    }

    var attr = params.update_attributes[0];
    var edgeField = attr.attribute_path[0];
    var mergedEdges = attr.update_value;

    docStore[personId][edgeField] = JSON.parse(JSON.stringify(mergedEdges));
    return { success: true };
  }
};

/* -- Mock nosql factory -- */
var mockNoSql = {
  getTable: async function (tableName) {
    if (tableName !== 'PersonMaster') {
      throw new Error('Unexpected table: ' + tableName);
    }
    return mockTable;
  }
};

/* -- Mock appInstance -- */
var mockAppInstance = {
  nosql: function () {
    return mockNoSql;
  }
};

/* -- Mock resolution-audit-log -- */
var mockAuditLog = {
  createAuditRecord: async function (appInstance, record) {
    /* Silently succeed */
  }
};

/* ========================================================== */
/*  Inject mocks into require.cache BEFORE loading module      */
/* ========================================================== */

var baseDir = path.resolve(__dirname);
var noSqlMockPath = path.join(baseDir, 'node_modules', 'zcatalyst-sdk-node', 'lib', 'no-sql', 'index.js');

require.cache[noSqlMockPath] = {
  id: noSqlMockPath,
  filename: noSqlMockPath,
  loaded: true,
  exports: {
    NoSQLItem: MockNoSQLItem,
    NoSQLMarshall: MockNoSQLMarshall,
    NoSQLEnum: MockNoSQLEnum
  }
};

/* -- Also mock the audit-log reference used by edgePersistence -- */
var auditLogPath = path.resolve(baseDir, '..', 'resolution-audit-log.js');

require.cache[auditLogPath] = {
  id: auditLogPath,
  filename: auditLogPath,
  loaded: true,
  exports: mockAuditLog
};

/* -- Now import the module under test -- */
var edgePersistence = require('./edgePersistence');
var {
  persistEdges,
  mergeEdgesIntoDocument,
  loadPersonDocument,
  updateDocumentEdges
} = edgePersistence;

/* ========================================================== */
/*  Sequential test runner — collect all tests, run one by one */
/* ========================================================== */

var testQueue = [];

function addTest(name, fn) {
  testQueue.push({ name: name, fn: fn });
}

/* -- Test 1: mergeEdgesIntoDocument adds new edges -- */
addTest('mergeEdgesIntoDocument adds new edges', function () {
  var doc = {
    person_id: 'PM_001',
    confirmed_edges: [],
    unconfirmed_edges: []
  };

  var newEdges = [
    { edge_id: 'EDGE_001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002' },
    { edge_id: 'EDGE_002', edge_type: 'CO_ACCUSED', target_person_id: 'PM_003' }
  ];

  var result = mergeEdgesIntoDocument(doc, newEdges, 'confirmed_edges');

  assertEqual(result.added, 2, 'adds 2 new edges');
  assertEqual(result.skipped, 0, 'skips 0 duplicates');
  assertEqual(result.merged.length, 2, 'merged array has 2 items');
  assertEqual(result.merged[0].edge_id, 'EDGE_001', 'first edge is EDGE_001');
});

/* -- Test 2: mergeEdgesIntoDocument skips duplicates -- */
addTest('mergeEdgesIntoDocument skips duplicates', function () {
  var doc = {
    person_id: 'PM_001',
    confirmed_edges: [
      { edge_id: 'EDGE_001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002' }
    ],
    unconfirmed_edges: []
  };

  var newEdges = [
    { edge_id: 'EDGE_001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002' },
    { edge_id: 'EDGE_002', edge_type: 'CO_ACCUSED', target_person_id: 'PM_003' }
  ];

  var result = mergeEdgesIntoDocument(doc, newEdges, 'confirmed_edges');

  assertEqual(result.added, 1, 'adds 1 new edge');
  assertEqual(result.skipped, 1, 'skips 1 duplicate');
  assertEqual(result.merged.length, 2, 'merged array has 2 items (1 existing + 1 new)');
  assertEqual(result.merged[0].edge_id, 'EDGE_001', 'existing edge preserved');
  assertEqual(result.merged[1].edge_id, 'EDGE_002', 'new edge appended');
});

/* -- Test 3: mergeEdgesIntoDocument with no new edges -- */
addTest('mergeEdgesIntoDocument with no new edges', function () {
  var doc = {
    person_id: 'PM_001',
    confirmed_edges: [
      { edge_id: 'EDGE_001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002' }
    ],
    unconfirmed_edges: []
  };

  var result = mergeEdgesIntoDocument(doc, [], 'confirmed_edges');

  assertEqual(result.added, 0, 'adds 0 edges');
  assertEqual(result.skipped, 0, 'skips 0');
  assertEqual(result.merged.length, 1, 'merged array unchanged');
});

/* -- Test 4: mergeEdgesIntoDocument with null/undefined edges -- */
addTest('mergeEdgesIntoDocument with null/undefined edges', function () {
  var doc = {
    person_id: 'PM_001',
    confirmed_edges: [
      { edge_id: 'EDGE_001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002' }
    ],
    unconfirmed_edges: []
  };

  var r1 = mergeEdgesIntoDocument(doc, null, 'confirmed_edges');
  assertEqual(r1.added, 0, 'no add for null edges');

  var r2 = mergeEdgesIntoDocument(doc, undefined, 'confirmed_edges');
  assertEqual(r2.added, 0, 'no add for undefined edges');
});

/* -- Test 5: mergeEdgesIntoDocument skips edges without edge_id -- */
addTest('mergeEdgesIntoDocument skips edges without edge_id', function () {
  var doc = {
    person_id: 'PM_001',
    confirmed_edges: [],
    unconfirmed_edges: []
  };

  var newEdges = [
    { edge_type: 'CO_ACCUSED', target_person_id: 'PM_002' },
    { edge_id: 'EDGE_002', edge_type: 'CO_ACCUSED', target_person_id: 'PM_003' }
  ];

  var result = mergeEdgesIntoDocument(doc, newEdges, 'confirmed_edges');

  assertEqual(result.added, 1, 'adds 1 valid edge');
  assertEqual(result.skipped, 1, 'skips 1 edge with missing edge_id');
  assertEqual(result.merged.length, 1, 'merged array has 1 item');
});

/* -- Test 6: mergeEdgesIntoDocument with unconfirmed_edges field -- */
addTest('mergeEdgesIntoDocument with unconfirmed_edges field', function () {
  var doc = {
    person_id: 'PM_001',
    confirmed_edges: [],
    unconfirmed_edges: [
      { edge_id: 'EDGE_U01', edge_type: 'CANDIDATE_MATCH', target_person_id: 'PM_003' }
    ]
  };

  var newEdges = [
    { edge_id: 'EDGE_U01', edge_type: 'CANDIDATE_MATCH', target_person_id: 'PM_003' },
    { edge_id: 'EDGE_U02', edge_type: 'CANDIDATE_MATCH', target_person_id: 'PM_004' }
  ];

  var result = mergeEdgesIntoDocument(doc, newEdges, 'unconfirmed_edges');

  assertEqual(result.added, 1, 'adds 1 new unconfirmed edge');
  assertEqual(result.skipped, 1, 'skips 1 duplicate');
});

/* ========================================================== */
/*  Async integration tests                                   */
/* ========================================================== */

/* -- Test 7: persistEdges writes new confirmed_edges -- */
addTest('persistEdges writes new confirmed_edges', async function () {
  resetStore();
  addDoc({
    person_id: 'PM_001',
    type: 'PM',
    confirmed_edges: [],
    unconfirmed_edges: []
  });

  var edgesByPerson = {
    PM_001: [
      { edge_id: 'EDGE_001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 1.0 }
    ]
  };

  var result = await persistEdges(mockAppInstance, edgesByPerson, {
    edgeField: 'confirmed_edges',
    runId: 'TEST-001'
  });

  assertEqual(result.documents_updated, 1, '1 document updated');
  assertEqual(result.edges_written, 1, '1 edge written');
  assertEqual(result.edges_skipped_duplicate, 0, '0 duplicates');

  var stored = getDoc('PM_001');
  assert(stored !== null, 'document exists in store');
  assertEqual(stored.confirmed_edges.length, 1, 'confirmed_edges has 1 entry');
  assertEqual(stored.confirmed_edges[0].edge_id, 'EDGE_001', 'edge EDGE_001 stored');
});

/* -- Test 8: persistEdges deduplicates on second write -- */
addTest('persistEdges deduplicates on second write', async function () {
  resetStore();
  addDoc({
    person_id: 'PM_001',
    type: 'PM',
    confirmed_edges: [],
    unconfirmed_edges: []
  });

  /* First write: add edge 001 */
  await persistEdges(mockAppInstance, {
    PM_001: [
      { edge_id: 'EDGE_001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 1.0 }
    ]
  }, { edgeField: 'confirmed_edges', runId: 'TEST-002a' });

  /* Second write: add edge 002, edge 001 is a duplicate */
  var result = await persistEdges(mockAppInstance, {
    PM_001: [
      { edge_id: 'EDGE_001', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 1.0 },
      { edge_id: 'EDGE_002', edge_type: 'CO_ACCUSED', target_person_id: 'PM_003', confidence: 1.0 }
    ]
  }, { edgeField: 'confirmed_edges', runId: 'TEST-002b' });

  assertEqual(result.documents_updated, 1, '1 document updated on second write');
  assertEqual(result.edges_written, 1, '1 new edge written');
  assertEqual(result.edges_skipped_duplicate, 1, '1 duplicate skipped');

  var stored = getDoc('PM_001');
  assertEqual(stored.confirmed_edges.length, 2, 'total 2 edges in document');
  assertEqual(stored.confirmed_edges[0].edge_id, 'EDGE_001', 'first edge preserved');
  assertEqual(stored.confirmed_edges[1].edge_id, 'EDGE_002', 'second edge appended');
});

/* -- Test 9: persistEdges handles multiple persons -- */
addTest('persistEdges handles multiple persons', async function () {
  resetStore();
  addDoc({ person_id: 'PM_001', type: 'PM', confirmed_edges: [], unconfirmed_edges: [] });
  addDoc({ person_id: 'PM_002', type: 'PM', confirmed_edges: [], unconfirmed_edges: [] });
  addDoc({ person_id: 'PM_003', type: 'PM', confirmed_edges: [], unconfirmed_edges: [] });

  var edgesByPerson = {
    PM_001: [
      { edge_id: 'EDGE_A', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 1.0 }
    ],
    PM_002: [
      { edge_id: 'EDGE_B', edge_type: 'CO_ACCUSED', target_person_id: 'PM_001', confidence: 1.0 },
      { edge_id: 'EDGE_C', edge_type: 'ACCUSED_TO_VICTIM', target_person_id: 'PM_003', confidence: 1.0 }
    ],
    PM_003: []
  };

  var result = await persistEdges(mockAppInstance, edgesByPerson, {
    edgeField: 'confirmed_edges',
    runId: 'TEST-003'
  });

  assertEqual(result.documents_updated, 2, '2 documents updated (PM_003 has no edges)');
  assertEqual(result.edges_written, 3, '3 edges written total');

  var doc1 = getDoc('PM_001');
  var doc2 = getDoc('PM_002');
  var doc3 = getDoc('PM_003');

  assertEqual(doc1.confirmed_edges.length, 1, 'PM_001 has 1 edge');
  assertEqual(doc2.confirmed_edges.length, 2, 'PM_002 has 2 edges');
  assertEqual(doc3.confirmed_edges.length, 0, 'PM_003 has 0 edges');
});

/* -- Test 10: persistEdges with unconfirmed_edges -- */
addTest('persistEdges with unconfirmed_edges field', async function () {
  resetStore();
  addDoc({ person_id: 'PM_001', type: 'PM', confirmed_edges: [], unconfirmed_edges: [] });
  addDoc({ person_id: 'PM_004', type: 'PM', confirmed_edges: [], unconfirmed_edges: [] });

  var edgesByPerson = {
    PM_001: [
      { edge_id: 'EDGE_U01', edge_type: 'CANDIDATE_MATCH', target_person_id: 'PM_004', confidence: 0.75 }
    ],
    PM_004: [
      { edge_id: 'EDGE_U01', edge_type: 'CANDIDATE_MATCH', target_person_id: 'PM_001', confidence: 0.75 }
    ]
  };

  var result = await persistEdges(mockAppInstance, edgesByPerson, {
    edgeField: 'unconfirmed_edges',
    runId: 'TEST-004'
  });

  assertEqual(result.documents_updated, 2, '2 documents updated');
  assertEqual(result.edges_written, 2, '2 edges written');
  assertEqual(result.edges_skipped_duplicate, 0, '0 duplicates');

  var doc1 = getDoc('PM_001');
  var doc4 = getDoc('PM_004');

  assertEqual(doc1.unconfirmed_edges.length, 1, 'PM_001 has 1 unconfirmed edge');
  assertEqual(doc4.unconfirmed_edges.length, 1, 'PM_004 has 1 unconfirmed edge');
  assertEqual(doc1.unconfirmed_edges[0].target_person_id, 'PM_004', 'PM_001 edge targets PM_004');
});

/* -- Test 11: persistEdges with empty edgesByPerson -- */
addTest('persistEdges with empty edgesByPerson', async function () {
  resetStore();
  var result = await persistEdges(mockAppInstance, {}, { edgeField: 'confirmed_edges' });
  assertEqual(result.documents_updated, 0, '0 documents updated');
  assertEqual(result.edges_written, 0, '0 edges written');
  assertEqual(result.edges_skipped_duplicate, 0, '0 duplicates');
});

/* -- Test 12: persistEdges skips nonexistent documents gracefully -- */
addTest('persistEdges skips nonexistent documents gracefully', async function () {
  resetStore();
  addDoc({ person_id: 'PM_001', type: 'PM', confirmed_edges: [], unconfirmed_edges: [] });

  var edgesByPerson = {
    PM_001: [
      { edge_id: 'EDGE_X01', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 1.0 }
    ],
    PM_NONEXISTENT: [
      { edge_id: 'EDGE_X02', edge_type: 'CO_ACCUSED', target_person_id: 'PM_001', confidence: 1.0 }
    ]
  };

  var result = await persistEdges(mockAppInstance, edgesByPerson, {
    edgeField: 'confirmed_edges',
    runId: 'TEST-005'
  });

  assertEqual(result.documents_updated, 1, '1 document updated (PM_NONEXISTENT skipped)');
  assertEqual(result.edges_written, 1, '1 edge written');
});

/* -- Test 13: All edges already exist (all duplicates) -- */
addTest('All edges already exist (all duplicates)', async function () {
  resetStore();
  addDoc({
    person_id: 'PM_001',
    type: 'PM',
    confirmed_edges: [
      { edge_id: 'EDGE_D01', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 1.0 }
    ],
    unconfirmed_edges: []
  });

  var result = await persistEdges(mockAppInstance, {
    PM_001: [
      { edge_id: 'EDGE_D01', edge_type: 'CO_ACCUSED', target_person_id: 'PM_002', confidence: 1.0 }
    ]
  }, { edgeField: 'confirmed_edges', runId: 'TEST-006' });

  assertEqual(result.documents_updated, 0, '0 documents updated (nothing new)');
  assertEqual(result.edges_written, 0, '0 edges written');
  assertEqual(result.edges_skipped_duplicate, 1, '1 duplicate skipped');
});

/* -- Test 14: Batch processing with 3 persons and batchSize=2 -- */
addTest('Batch processing with batchSize=2', async function () {
  resetStore();
  addDoc({ person_id: 'PM_A', type: 'PM', confirmed_edges: [], unconfirmed_edges: [] });
  addDoc({ person_id: 'PM_B', type: 'PM', confirmed_edges: [], unconfirmed_edges: [] });
  addDoc({ person_id: 'PM_C', type: 'PM', confirmed_edges: [], unconfirmed_edges: [] });

  var edgesByPerson = {
    PM_A: [{ edge_id: 'EDGE_A1', edge_type: 'CO_ACCUSED', target_person_id: 'PM_B', confidence: 1.0 }],
    PM_B: [{ edge_id: 'EDGE_B1', edge_type: 'CO_ACCUSED', target_person_id: 'PM_A', confidence: 1.0 }],
    PM_C: [{ edge_id: 'EDGE_C1', edge_type: 'CO_ACCUSED', target_person_id: 'PM_A', confidence: 1.0 }]
  };

  var result = await persistEdges(mockAppInstance, edgesByPerson, {
    edgeField: 'confirmed_edges',
    batchSize: 2,
    runId: 'TEST-007'
  });

  assertEqual(result.documents_updated, 3, '3 documents updated across 2 batches');
  assertEqual(result.edges_written, 3, '3 edges written');
  assertEqual(result.edges_skipped_duplicate, 0, '0 duplicates');
});

/* -- Test 15: Integration — confirmed then unconfirmed on same doc -- */
addTest('Confirmed and unconfirmed edges on the same document (separate calls)', async function () {
  resetStore();
  addDoc({ person_id: 'PM_100', type: 'PM', confirmed_edges: [], unconfirmed_edges: [] });

  /* Write confirmed */
  await persistEdges(mockAppInstance, {
    PM_100: [{ edge_id: 'EDGE_C100', edge_type: 'CO_ACCUSED', target_person_id: 'PM_200', confidence: 1.0 }]
  }, { edgeField: 'confirmed_edges', runId: 'TEST-008a' });

  /* Write unconfirmed */
  await persistEdges(mockAppInstance, {
    PM_100: [{ edge_id: 'EDGE_U100', edge_type: 'CANDIDATE_MATCH', target_person_id: 'PM_300', confidence: 0.65 }]
  }, { edgeField: 'unconfirmed_edges', runId: 'TEST-008b' });

  var doc = getDoc('PM_100');
  assertEqual(doc.confirmed_edges.length, 1, 'confirmed_edges has 1 entry');
  assertEqual(doc.unconfirmed_edges.length, 1, 'unconfirmed_edges has 1 entry');
  assertEqual(doc.confirmed_edges[0].edge_id, 'EDGE_C100', 'confirmed edge stored');
  assertEqual(doc.unconfirmed_edges[0].edge_id, 'EDGE_U100', 'unconfirmed edge stored');
  assertEqual(doc.confirmed_edges.length + doc.unconfirmed_edges.length, 2, 'total edge count is 2');
});

/* ========================================================== */
/*  Run all tests sequentially                                 */
/* ========================================================== */

async function runAll() {
  for (var ti = 0; ti < testQueue.length; ti++) {
    var t = testQueue[ti];
    console.log('\n' + (ti + 1) + '. ' + t.name);
    try {
      var maybePromise = t.fn();
      if (maybePromise && typeof maybePromise.then === 'function') {
        await maybePromise;
      }
    } catch (err) {
      failed++;
      console.log('  \u2717 ' + t.name + ' THREW: ' + err.message);
      console.error(err.stack);
    }
  }

  console.log('\n=== Results ===');
  console.log('Passed: ' + passed);
  console.log('Failed: ' + failed);
  if (failed > 0) {
    process.exit(1);
  }
}

runAll();
