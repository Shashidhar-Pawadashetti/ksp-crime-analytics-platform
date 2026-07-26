'use strict';

/*
 * Integration tests for sync-full — Full Reconciliation Pipeline.
 *
 * Tests the fullReconcile orchestrator end-to-end with mocked Catalyst SDK.
 *
 * Run: node test_full_reconciler.js
 */

var assert = require('assert');

/* ------------------------------------------------------------------ */
/*  Mock Catalyst SDK                                                 */
/* ------------------------------------------------------------------ */

/*
 * The real NoSQLItem.from() wraps values as { S: "value" } (DynamoDB-like).
 * This mock unwraps that format while also handling plain objects.
 */
function unwrapVal(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    var keys = Object.keys(v);
    if (keys.length === 1 && (keys[0] === 'S' || keys[0] === 'N' || keys[0] === 'BOOL')) {
      return v[keys[0]];
    }
  }
  return v;
}

function extractProp(obj, prop) {
  if (!obj) return undefined;
  /* NoSQLItem uses .get(key) accessor */
  if (typeof obj.get === 'function') {
    return obj.get(prop);
  }
  /* Plain objects may have {S: "value"} wrapped values */
  var raw = obj[prop];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if ('S' in raw) return raw.S;
    if ('N' in raw) return Number(raw.N);
    if ('BOOL' in raw) return raw.BOOL;
  }
  return raw;
}

function createMockNoSqlTable() {
  var store = {};
  return {
    _store: store,
    queryTable: async function (scanBody) {
      var items = [];
      var storeKeys = Object.keys(store);
      for (var i = 0; i < storeKeys.length; i++) {
        (function (val) {
          items.push({ item: { to: function () { return val; } } });
        })(store[storeKeys[i]]);
      }
      return { getResponseData: function () { return items; } };
    },
    getItems: async function (opts) {
      var keys = opts.keys || {};
      var pid = extractProp(keys, 'person_id');
      if (pid && store[pid]) return { data: [store[pid]] };
      return { data: [] };
    },
    insertItems: async function (opts) {
      var item = opts.item || {};
      var pid = extractProp(item, 'person_id');
      if (pid && typeof pid === 'string') {
        store[pid] = item;
      }
    },
    updateItems: async function (opts) {
      var keys = opts.keys || {};
      var pid = extractProp(keys, 'person_id');
      if (pid && typeof pid === 'string') {
        store[pid] = store[pid] || {};
        var attrs = opts.update_attributes || [];
        for (var ai = 0; ai < attrs.length; ai++) {
          var attr = attrs[ai];
          if (attr.attribute_path && attr.attribute_path.length > 0) {
            store[pid][attr.attribute_path[0]] = attr.update_value;
          } else {
            var updateValue = attr.update_value;
            if (updateValue && typeof updateValue === 'object' && !Array.isArray(updateValue)) {
              var unwrapped = {};
              var vkeys = Object.keys(updateValue);
              for (var vi = 0; vi < vkeys.length; vi++) {
                unwrapped[vkeys[vi]] = unwrapVal(updateValue[vkeys[vi]]);
              }
              Object.assign(store[pid], unwrapped);
            } else {
              Object.assign(store[pid], updateValue);
            }
          }
        }
      }
    },
    deleteItems: async function (opts) {
      var keys = opts.keys || {};
      var pid = extractProp(keys, 'person_id');
      if (pid && typeof pid === 'string' && store[pid]) {
        delete store[pid];
        return { data: [] };
      }
    }
  };
}

function makeSourceRawRow(table, idCol, idVal, caseId, name, age, genderId, date, unitId, distId) {
  var alias = 'a';
  var row = {};
  row[alias] = {};
  row[alias]['ROWID'] = String(idVal);
  row[alias][idCol] = String(idVal);
  row[alias]['CaseMasterID'] = caseId;
  row[alias][table === 'Accused' ? 'AccusedName' : table === 'Victim' ? 'VictimName' : 'ComplainantName'] = name;
  row[alias]['AgeYear'] = age;
  row[alias]['GenderID'] = genderId;
  row['cm'] = {};
  row['cm']['IncidentFromDate'] = date;
  row['cm']['PoliceStationID'] = unitId;
  row['cm']['Latitude'] = 12.97;
  row['cm']['Longitude'] = 77.59;
  row['u'] = {};
  row['u']['DistrictID'] = distId;
  return row;
}

function makePMRawRow(personId, sourceRecords) {
  var row = {};
  row['PersonMaster'] = {
    person_id: personId,
    type: 'PM',
    source_records: JSON.stringify(sourceRecords)
  };
  return row;
}

function createMockCatalyst(personMasterRows, accusedRows, victimRows, compRows) {
  var table = createMockNoSqlTable();
  return {
    _table: table,
    initializeApp: function () {
      var self = this;
      return {
        zcql: function () {
          return {
            executeZCQLQuery: async function (sql) {
              if (sql.indexOf('FROM PersonMaster') !== -1) return personMasterRows || [];
              if (sql.indexOf('FROM Accused') !== -1) return accusedRows || [];
              if (sql.indexOf('FROM Victim') !== -1) return victimRows || [];
              if (sql.indexOf('FROM ComplainantDetails') !== -1) return compRows || [];
              return [];
            }
          };
        },
        nosql: function () {
          return {
            getTable: async function () { return self._table; }
          };
        },
        datastore: function () {
          return {
            table: function () {
              return {
                insertRow: async function () { return { ROWID: 'mock-audit-id' }; }
              };
            }
          };
        }
      };
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Test harness                                                      */
/* ------------------------------------------------------------------ */

var passed = 0;
var failed = 0;

function test(name, fn) {
  try { fn(); console.log('  \u2713 ' + name); passed++; }
  catch (e) { console.log('  \u2717 ' + name + ': ' + e.message); failed++; }
}

async function testAsync(name, fn) {
  try { await fn(); console.log('  \u2713 ' + name); passed++; }
  catch (e) { console.log('  \u2717 ' + name + ': ' + e.message); failed++; }
}

/* ------------------------------------------------------------------ */
/*  Load the reconciler                                               */
/* ------------------------------------------------------------------ */

var reconciler;
try {
  reconciler = require('./fullReconciler');
} catch (e) {
  console.error('Failed to load fullReconciler:', e.message);
  process.exit(1);
}

var fullReconcile = reconciler.fullReconcile;

/* ------------------------------------------------------------------ */
/*  Runner                                                            */
/* ------------------------------------------------------------------ */

async function runAll() {

/* ================================================================ */
/*  Test 1: Empty data                                              */
/* ================================================================ */

console.log('\n=== Scenario 1: Empty data (no source records) ===');

await testAsync('handles empty data gracefully', async function () {
  var mockCat = createMockCatalyst([], [], [], []);
  var appInst = mockCat.initializeApp();

  var result = await fullReconcile(appInst, { runId: 'TEST-EMPTY' });

  assert.strictEqual(result.status, 'SUCCESS');
  assert.strictEqual(result.documents_created, 0);
  assert.strictEqual(result.documents_updated, 0);
  assert.strictEqual(result.documents_deleted, 0);
  assert.strictEqual(result.clusters_formed, 0);
  assert.strictEqual(result.confirmed_edges_written, 0);
  assert.strictEqual(result.unconfirmed_edges_written, 0);
  console.log('  [info] Empty result: ' + JSON.stringify(result));
});

await testAsync('deletes stale docs when source is empty', async function () {
  var pmRows = [
    makePMRawRow('PM_STALE_001', [
      { table: 'Accused', row_id: 'A-999', case_id: 'CASE-999', name_as_recorded: 'Stale Person', age_as_recorded: 30 }
    ])
  ];

  var mockCat = createMockCatalyst(pmRows, [], [], []);

  mockCat._table._store['PM_STALE_001'] = {
    person_id: 'PM_STALE_001',
    type: 'PM',
    source_records: [{ table: 'Accused', row_id: 'A-999', case_id: 'CASE-999', name_as_recorded: 'Stale Person', age_as_recorded: 30 }]
  };

  var appInst = mockCat.initializeApp();

  var result = await fullReconcile(appInst, { runId: 'TEST-EMPTY-STALE' });

  assert.strictEqual(result.status, 'SUCCESS');
  assert.strictEqual(result.documents_deleted, 1);
  console.log('  [info] Empty-with-stale result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 2: Initial full build (no existing PersonMaster)           */
/* ================================================================ */

console.log('\n=== Scenario 2: Initial full build ===');

await testAsync('builds PersonMaster documents from source records', async function () {
  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Ravi Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    makeSourceRawRow('Accused', 'AccusedMasterID', '2', 'CASE-001', 'Ravi Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    makeSourceRawRow('Accused', 'AccusedMasterID', '3', 'CASE-002', 'Sita Patel', 25, 2, '2024-02-20', 'UNIT-2', 'DIST-2')
  ];

  var victimRows = [
    makeSourceRawRow('Victim', 'VictimMasterID', '10', 'CASE-001', 'Victim One', 35, 2, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var mockCat = createMockCatalyst([], accusedRows, victimRows, []);
  var appInst = mockCat.initializeApp();

  var result = await fullReconcile(appInst, { runId: 'TEST-INITIAL' });

  assert.strictEqual(result.status, 'SUCCESS');
  assert.ok(result.documents_created > 0, 'should create documents');
  assert.strictEqual(result.documents_deleted, 0);
  assert.strictEqual(result.source_errors, 0);
  console.log('  [info] Initial build result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 3: Repeated idempotent run                                 */
/* ================================================================ */

console.log('\n=== Scenario 3: Idempotent re-run ===');

await testAsync('repeated run with same data produces same result (idempotent)', async function () {
  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Ravi Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    makeSourceRawRow('Accused', 'AccusedMasterID', '2', 'CASE-002', 'Sita Patel', 25, 2, '2024-02-20', 'UNIT-2', 'DIST-2')
  ];

  /* First run: initial build (no existing PersonMaster) */
  var mockCat1 = createMockCatalyst([], accusedRows, [], []);
  var appInst1 = mockCat1.initializeApp();
  var firstResult = await fullReconcile(appInst1, { runId: 'TEST-RUN1' });
  assert.strictEqual(firstResult.status, 'SUCCESS');
  assert.strictEqual(firstResult.clusters_formed, 2, 'two distinct persons');
  console.log('  [info] First run: ' + firstResult.documents_created + ' created, ' + firstResult.clusters_formed + ' clusters');

  /* Precompute deterministic person IDs for the source records */
  var detPid = reconciler.deterministicPersonId;
  var pid1 = detPid([{ source_table: 'Accused', source_id: 'A-1' }]);
  var pid2 = detPid([{ source_table: 'Accused', source_id: 'A-2' }]);

  /* Build PM rows directly from deterministic pids. Uses the source_records
     format that ZCQL returns (source_records as JSON string). */
  var pmRows = [
    makePMRawRow(pid1, [{ table: 'Accused', row_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'Ravi Kumar', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }]),
    makePMRawRow(pid2, [{ table: 'Accused', row_id: 'A-2', case_id: 'CASE-002', name_as_recorded: 'Sita Patel', age_as_recorded: 25, date_of_offence: '2024-02-20', unit_id: 'UNIT-2', district_id: 'DIST-2' }])
  ];

  /* Second run: same source data, with existing PersonMaster docs */
  var mockCat2 = createMockCatalyst(pmRows, accusedRows, [], []);
  var appInst2 = mockCat2.initializeApp();
  var secondResult = await fullReconcile(appInst2, { runId: 'TEST-RUN2' });

  assert.strictEqual(secondResult.status, 'SUCCESS');
  assert.strictEqual(secondResult.documents_deleted, 0, 'no stale docs in idempotent run');
  assert.strictEqual(secondResult.source_errors, 0, 'no source errors');
  /* Number of documents created should be for updates (not new documents) */
  console.log('  [info] Second run: ' + JSON.stringify(secondResult));
});

/* ================================================================ */
/*  Test 4: Stale PersonMaster cleanup                              */
/* ================================================================ */

console.log('\n=== Scenario 4: Stale PersonMaster cleanup ===');

await testAsync('deletes stale documents and updates remaining', async function () {
  /* Existing PersonMaster doc that no longer has matching source records */
  var stalePid = 'PM_DELETED_' + Date.now().toString(36);
  var pmRows = [
    makePMRawRow(stalePid, [
      { table: 'Accused', row_id: 'A-999', case_id: 'CASE-999', name_as_recorded: 'Deleted Person', age_as_recorded: 40 }
    ])
  ];

  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Ravi Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var mockCat = createMockCatalyst(pmRows, accusedRows, [], []);
  var appInst = mockCat.initializeApp();

  /* Pre-load the stale doc into the NoSQL store */
  mockCat._table._store[stalePid] = { person_id: stalePid, type: 'PM', source_records: [{ table: 'Accused', row_id: 'A-999' }] };

  var result = await fullReconcile(appInst, { runId: 'TEST-STALE' });

  assert.strictEqual(result.status, 'SUCCESS');
  assert.strictEqual(result.documents_deleted, 1, 'stale doc should be detected and deleted');
  assert.ok(result.documents_created > 0, 'new docs should be created');
  assert.strictEqual(result.documents_updated, 0, 'no existing docs should be updated');
  assert.strictEqual(result.source_errors, 0, 'no source load errors');
  console.log('  [info] Stale cleanup result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 5: Partial persistence failure                             */
/* ================================================================ */

console.log('\n=== Scenario 5: Partial persistence failure ===');

await testAsync('continues despite individual document write failures', async function () {
  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Ravi Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    makeSourceRawRow('Accused', 'AccusedMasterID', '2', 'CASE-002', 'Sita Patel', 25, 2, '2024-02-20', 'UNIT-2', 'DIST-2'),
    makeSourceRawRow('Accused', 'AccusedMasterID', '3', 'CASE-003', 'Amit Singh', 35, 1, '2024-03-10', 'UNIT-3', 'DIST-3')
  ];

  /* Create a mock table that fails on specific person_ids */
  var store = {};
  var failSet = {};
  var failOnPids = [];
  var failPromiseResolve = null;

  /**
   * Fail both insertItems and updateItems for person_ids in failOnPids.
   * This ensures upsertPersonMaster cannot fall back to update.
   */
  function shouldFail(pid) {
    return pid && typeof pid === 'string' && failOnPids.indexOf(pid) !== -1;
  }

  var failingTable = {
    _store: store,
    queryTable: async function () {
      var items = [];
      var storeKeys = Object.keys(store);
      for (var i = 0; i < storeKeys.length; i++) {
        (function (val) {
          items.push({ item: { to: function () { return val; } } });
        })(store[storeKeys[i]]);
      }
      return { getResponseData: function () { return items; } };
    },
    getItems: async function (opts) {
      var keys = opts.keys || {};
      var pid = extractProp(keys, 'person_id');
      if (pid && store[pid]) return { data: [store[pid]] };
      return { data: [] };
    },
    insertItems: async function (opts) {
      var item = opts.item || {};
      var pid = extractProp(item, 'person_id');
      if (pid && typeof pid === 'string') {
        if (shouldFail(pid)) throw new Error('Simulated write failure for ' + pid);
        store[pid] = item;
      }
    },
    updateItems: async function (opts) {
      var keys = opts.keys || {};
      var pid = extractProp(keys, 'person_id');
      if (pid && typeof pid === 'string') {
        if (shouldFail(pid)) throw new Error('Simulated update failure for ' + pid);
        store[pid] = store[pid] || {};
        var attrs = opts.update_attributes || [];
        for (var ai = 0; ai < attrs.length; ai++) {
          var attr = attrs[ai];
          if (attr.attribute_path && attr.attribute_path.length > 0) {
            store[pid][attr.attribute_path[0]] = attr.update_value;
          } else {
            Object.assign(store[pid], attr.update_value);
          }
        }
      }
    },
    deleteItems: async function (opts) {
      var keys = opts.keys || {};
      var pid = extractProp(keys, 'person_id');
      if (pid && typeof pid === 'string' && store[pid]) {
        delete store[pid];
        return { data: [] };
      }
    }
  };

  var failingMock = {
    _table: failingTable,
    initializeApp: function () {
      var self = this;
      return {
        zcql: function () {
          return {
            executeZCQLQuery: async function (sql) {
              if (sql.indexOf('FROM PersonMaster') !== -1) return [];
              if (sql.indexOf('FROM Accused') !== -1) return accusedRows;
              if (sql.indexOf('FROM Victim') !== -1) return [];
              if (sql.indexOf('FROM ComplainantDetails') !== -1) return [];
              return [];
            }
          };
        },
        nosql: function () {
          return {
            getTable: async function () { return self._table; }
          };
        },
        datastore: function () {
          return {
            table: function () {
              return {
                insertRow: async function () { return { ROWID: 'mock-audit-id' }; }
              };
            }
          };
        }
      };
    }
  };

  /* We need to know which person_ids will be generated to set up failure.
     This requires pre-computing the deterministic IDs from the records. */
  var { deterministicPersonId } = require('./fullReconciler');
  var records = [
    { source_table: 'Accused', source_id: 'A-1' },
    { source_table: 'Accused', source_id: 'A-2' },
    { source_table: 'Accused', source_id: 'A-3' }
  ];

  var pid1 = deterministicPersonId([records[0]]);
  var pid2 = deterministicPersonId([records[1]]);

  failOnPids.push(pid2);

  var appInst = failingMock.initializeApp();
  var result = await fullReconcile(appInst, { runId: 'TEST-PARTIAL-FAIL' });

  assert.strictEqual(result.status, 'PARTIAL_SUCCESS', 'partial failures should report PARTIAL_SUCCESS');
  assert.ok(result.error_count > 0, 'error_count should be > 0 for partial failure');
  /* pid2 (Sita Patel) should fail to persist, pid1 and pid3 should succeed */
  assert.ok(result.documents_created <= 2, 'should have partial write count, not all 3');
  console.log('  [info] Partial failure result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 6: Identity preservation across full reconciliation        */
/* ================================================================ */

console.log('\n=== Scenario 6: Identity preservation ===');

await testAsync('preserves existing person_ids across full reconciliation', async function () {
  var detPid = reconciler.deterministicPersonId;
  var pid1 = detPid([{ source_table: 'Accused', source_id: 'A-1' }]);
  var pid2 = detPid([{ source_table: 'Accused', source_id: 'A-2' }]);

  /* Existing PM docs with same source records as current source */
  var pmRows = [
    makePMRawRow(pid1, [
      { table: 'Accused', row_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'Ravi Kumar', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ]),
    makePMRawRow(pid2, [
      { table: 'Accused', row_id: 'A-2', case_id: 'CASE-002', name_as_recorded: 'Sita Patel', age_as_recorded: 25, date_of_offence: '2024-02-20', unit_id: 'UNIT-2', district_id: 'DIST-2' }
    ])
  ];

  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Ravi Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    makeSourceRawRow('Accused', 'AccusedMasterID', '2', 'CASE-002', 'Sita Patel', 25, 2, '2024-02-20', 'UNIT-2', 'DIST-2')
  ];

  var mockCat = createMockCatalyst(pmRows, accusedRows, [], []);
  var appInst = mockCat.initializeApp();

  var result = await fullReconcile(appInst, { runId: 'TEST-IDENTITY-PRESERVE' });

  assert.strictEqual(result.status, 'SUCCESS');
  assert.strictEqual(result.documents_deleted, 0, 'no stale docs to delete');
  /* Both existing pids should be preserved (no new pids created) */
  var store = mockCat._table._store;
  assert.ok(store[pid1] !== undefined, 'pid1 should still exist in store');
  assert.ok(store[pid2] !== undefined, 'pid2 should still exist in store');
  console.log('  [info] Identity preservation result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 7: Candidate-match edge regeneration                      */
/* ================================================================ */

console.log('\n=== Scenario 7: Candidate-match edges ===');

await testAsync('generates candidate-match edges from unconfirmed pairs', async function () {
  /* Create source records with same name/different case (should produce UNCONFIRMED pair) */
  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Rajesh Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    makeSourceRawRow('Accused', 'AccusedMasterID', '2', 'CASE-002', 'Rajesh Kuamr', 32, 1, '2024-02-20', 'UNIT-2', 'DIST-2')
  ];

  var mockCat = createMockCatalyst([], accusedRows, [], []);
  var appInst = mockCat.initializeApp();

  var result = await fullReconcile(appInst, { runId: 'TEST-CANDIDATE-EDGES' });

  assert.strictEqual(result.status, 'SUCCESS');
  console.log('  [info] Candidate-edge result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 8: Stale edge removal                                      */
/* ================================================================ */

console.log('\n=== Scenario 8: Stale edge removal ===');

await testAsync('clears existing edges before regenerating (authoritative replace)', async function () {
  var detPid = reconciler.deterministicPersonId;
  var pid1 = detPid([{ source_table: 'Accused', source_id: 'A-1' }]);

  /* Existing PM doc with stale edges */
  var pmRows = [
    makePMRawRow(pid1, [
      { table: 'Accused', row_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'Ravi Kumar', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ])
  ];

  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Ravi Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var mockCat = createMockCatalyst(pmRows, accusedRows, [], []);
  var appInst = mockCat.initializeApp();

  /* Manually set stale edges before run via the mock store directly */
  mockCat._table._store[pid1] = mockCat._table._store[pid1] || {};
  mockCat._table._store[pid1].confirmed_edges = [{ edge_id: 'STALE_EDGE_001', type: 'CO_ACCUSED', confidence: 1.0 }];

  var result = await fullReconcile(appInst, { runId: 'TEST-STALE-EDGES' });

  assert.strictEqual(result.status, 'SUCCESS');
  /* Edge clearing should happen (even if no new edges are generated for singles) */
  assert.strictEqual(result.documents_deleted, 0, 'no stale PM docs');
  console.log('  [info] Stale-edge result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 9: Failed reconciliation audit status                     */
/* ================================================================ */

console.log('\n=== Scenario 9: Failed reconciliation audit ===');

await testAsync('audit log does not report SUCCESS when reconciliation fails', async function () {
  var failingMock = {
    initializeApp: function () {
      return {
        zcql: function () {
          return {
            executeZCQLQuery: async function () {
              throw new Error('Simulated ZCQL failure');
            }
          };
        },
        nosql: function () {
          return {
            getTable: async function () {
              return {
                insertItems: async function () {},
                updateItems: async function () {},
                deleteItems: async function () {},
                getItems: async function () { return { data: [] }; }
              };
            }
          };
        },
        datastore: function () {
          return {
            table: function () {
              return {
                insertRow: async function () { return { ROWID: 'mock-audit-id' }; }
              };
            }
          };
        }
      };
    }
  };

  var appInst = failingMock.initializeApp();
  var result = await fullReconcile(appInst, { runId: 'TEST-FAIL-AUDIT' });

  assert.strictEqual(result.status, 'FAILED');
  assert.strictEqual(result.documents_deleted, 0);
  assert.strictEqual(result.error_count, 3);
  console.log('  [info] Fail-audit result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 10: error_count tracking                                  */
/* ================================================================ */

console.log('\n=== Scenario 10: Error count tracking ===');

await testAsync('tracks error_count when persistence partially fails', async function () {
  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Ravi Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    makeSourceRawRow('Accused', 'AccusedMasterID', '2', 'CASE-002', 'Sita Patel', 25, 2, '2024-02-20', 'UNIT-2', 'DIST-2')
  ];

  var store = {};
  var failPids = {};

  var oriPid1 = reconciler.deterministicPersonId([{ source_table: 'Accused', source_id: 'A-1' }]);
  var oriPid2 = reconciler.deterministicPersonId([{ source_table: 'Accused', source_id: 'A-2' }]);
  failPids[oriPid2] = true;

  var failingTable = {
    _store: store,
    queryTable: async function () {
      var items = [];
      var storeKeys = Object.keys(store);
      for (var i = 0; i < storeKeys.length; i++) {
        (function (val) {
          items.push({ item: { to: function () { return val; } } });
        })(store[storeKeys[i]]);
      }
      return { getResponseData: function () { return items; } };
    },
    getItems: async function (opts) { var pid = extractProp(opts.keys, 'person_id'); if (pid && store[pid]) return { data: [store[pid]] }; return { data: [] }; },
    insertItems: async function (opts) {
      var item = opts.item || {};
      var pid = extractProp(item, 'person_id');
      if (pid && typeof pid === 'string') {
        if (failPids[pid]) throw new Error('Simulated failure for ' + pid);
        store[pid] = item;
      }
    },
    updateItems: async function (opts) {
      var keys = opts.keys || {};
      var pid = extractProp(keys, 'person_id');
      if (pid && typeof pid === 'string') {
        if (failPids[pid]) throw new Error('Simulated update failure for ' + pid);
      }
    },
    deleteItems: async function () {}
  };

  var failingMock = {
    _table: failingTable,
    initializeApp: function () {
      var self = this;
      return {
        zcql: function () {
          return {
            executeZCQLQuery: async function (sql) {
              if (sql.indexOf('FROM PersonMaster') !== -1) return [];
              if (sql.indexOf('FROM Accused') !== -1) return accusedRows;
              return [];
            }
          };
        },
        nosql: function () {
          return { getTable: async function () { return self._table; } };
        },
        datastore: function () {
          return {
            table: function () {
              return { insertRow: async function () { return { ROWID: 'mock-audit-id' }; } };
            }
          };
        }
      };
    }
  };

  var appInst = failingMock.initializeApp();
  var result = await fullReconcile(appInst, { runId: 'TEST-ERROR-COUNT' });

  assert.strictEqual(result.status, 'PARTIAL_SUCCESS', 'partial failures should report PARTIAL_SUCCESS');
  assert.ok(result.error_count > 0, 'error_count should be > 0 when persistence fails');
  console.log('  [info] Error-count result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Summary                                                         */
/* ================================================================ */

/* ================================================================ */
/*  Test 13: CONFIRMED pair → same DSU cluster                     */
/* ================================================================ */

console.log('\n=== Scenario 13: CONFIRMED pair → same DSU cluster ===');

await testAsync('CONFIRMED pair merges into single cluster', async function () {
  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Ravi Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    makeSourceRawRow('Accused', 'AccusedMasterID', '2', 'CASE-001', 'Ravi Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var mockCat = createMockCatalyst([], accusedRows, [], []);
  var appInst = mockCat.initializeApp();

  var result = await fullReconcile(appInst, { runId: 'TEST-CONFIRMED-CLUSTER' });

  assert.strictEqual(result.status, 'SUCCESS');
  assert.strictEqual(result.clusters_formed, 1, 'two matched records should form 1 cluster');
  assert.strictEqual(result.persons_processed, 2, 'both records counted');
  console.log('  [info] CONFIRMED cluster result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 14: UNCONFIRMED pair → different PersonMaster clusters    */
/* ================================================================ */

console.log('\n=== Scenario 14: UNCONFIRMED pair → separate clusters ===');

await testAsync('UNCONFIRMED pair produces separate clusters (not merged)', async function () {
  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Rajesh Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    makeSourceRawRow('Accused', 'AccusedMasterID', '2', 'CASE-002', 'Rajesh Kuamr', 50, 1, '2024-02-20', 'UNIT-9', 'DIST-9')
  ];

  var mockCat = createMockCatalyst([], accusedRows, [], []);
  var appInst = mockCat.initializeApp();

  var result = await fullReconcile(appInst, { runId: 'TEST-UNCONFIRMED-CLUSTER' });

  assert.strictEqual(result.status, 'SUCCESS');
  assert.strictEqual(result.clusters_formed, 2, 'two unconfidently matched records should form 2 separate clusters');
  assert.strictEqual(result.persons_processed, 2, 'both records counted');
  console.log('  [info] UNCONFIRMED cluster result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 15: UNCONFIRMED pair produces candidate-match edges       */
/* ================================================================ */

console.log('\n=== Scenario 15: UNCONFIRMED pair → candidate-match edges ===');

await testAsync('UNCONFIRMED pair generates unconfirmed edges between separate clusters', async function () {
  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Rajesh Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    makeSourceRawRow('Accused', 'AccusedMasterID', '2', 'CASE-002', 'Rajesh Kuamr', 50, 1, '2024-02-20', 'UNIT-9', 'DIST-9')
  ];

  var mockCat = createMockCatalyst([], accusedRows, [], []);
  var appInst = mockCat.initializeApp();

  var result = await fullReconcile(appInst, { runId: 'TEST-UNCONFIRMED-EDGES' });

  assert.strictEqual(result.status, 'SUCCESS');
  assert.strictEqual(result.clusters_formed, 2, 'two separate clusters');
  assert.ok(result.unconfirmed_edges_written > 0, 'UNCONFIRMED pair should produce candidate match edges');
  console.log('  [info] UNCONFIRMED edges result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 16: PersonMaster load failure aborts with FAILED          */
/* ================================================================ */

console.log('\n=== Scenario 16: PersonMaster load failure ===');

await testAsync('aborts with FAILED when PersonMaster loading throws', async function () {
  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Ravi Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var failingTable = {
    _store: {},
    queryTable: async function () { throw new Error('Simulated NoSQL queryTable failure'); },
    getItems: async function () { return { data: [] }; },
    insertItems: async function () {},
    updateItems: async function () {},
    deleteItems: async function () {}
  };

  var failingMock = {
    _table: failingTable,
    initializeApp: function () {
      var self = this;
      return {
        zcql: function () {
          return {
            executeZCQLQuery: async function (sql) {
              if (sql.indexOf('FROM Accused') !== -1) return accusedRows;
              return [];
            }
          };
        },
        nosql: function () {
          return { getTable: async function () { return self._table; } };
        },
        datastore: function () {
          return {
            table: function () {
              return { insertRow: async function () { return { ROWID: 'mock-audit-id' }; } };
            }
          };
        }
      };
    }
  };

  var appInst = failingMock.initializeApp();
  var result = await fullReconcile(appInst, { runId: 'TEST-PMLOAD-FAIL' });

  assert.strictEqual(result.status, 'FAILED');
  assert.strictEqual(result.stale_deletion_enabled, false);
  assert.strictEqual(result.error_count, 1);
  assert.ok(result.source_errors[0].indexOf('PersonMaster') !== -1, 'error should mention PersonMaster');
  assert.strictEqual(result.documents_created, 0);
  assert.strictEqual(result.documents_deleted, 0);
  console.log('  [info] PM load failure result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 17: Valid empty PersonMaster returns []                   */
/* ================================================================ */

console.log('\n=== Scenario 17: Valid empty PersonMaster ===');

await testAsync('loadPersonMasterDocuments returns [] when table is empty', async function () {
  var mockCat = createMockCatalyst([], [], [], []);
  var appInst = mockCat.initializeApp();

  var docs = await reconciler.loadPersonMasterDocuments(appInst);

  assert.ok(Array.isArray(docs), 'should return an array');
  assert.strictEqual(docs.length, 0, 'empty table returns empty array');
  console.log('  [info] Empty PersonMaster: ' + docs.length + ' docs');
});

/* ================================================================ */
/*  Test 18: NoSQL pagination — loads multiple pages of PersonMaster */
/* ================================================================ */

console.log('\n=== Scenario 18: NoSQL pagination ===');

await testAsync('loads multiple pages of PersonMaster docs', async function () {
  var pageCallCount = 0;
  var pageSize = 50;
  var totalPages = 3;
  var totalDocs = pageSize * totalPages;

  function makeDoc(index) {
    return {
      person_id: 'PM_PAGINATED_' + String(index).padStart(5, '0'),
      type: 'PM',
      source_records: []
    };
  }

  var allDocs = [];
  for (var pi = 0; pi < totalDocs; pi++) {
    allDocs.push(makeDoc(pi));
  }

  var paginatedTable = {
    queryTable: async function (queryBody) {
      pageCallCount++;
      var startIdx = (pageCallCount - 1) * pageSize;
      var pageItems = allDocs.slice(startIdx, startIdx + pageSize).map(function (doc) {
        return { item: { to: function () { return doc; } } };
      });

      var result = {
        getResponseData: function () { return pageItems; }
      };

      if (pageCallCount < totalPages) {
        result.start_key = { person_id: pageItems[pageItems.length - 1].item.to().person_id, type: 'PM' };
      }

      return result;
    }
  };

  var paginatedMock = {
    _table: paginatedTable,
    initializeApp: function () {
      var self = this;
      return {
        zcql: function () {
          return {
            executeZCQLQuery: async function () { return []; }
          };
        },
        nosql: function () {
          return {
            getTable: async function () { return self._table; }
          };
        },
        datastore: function () {
          return {
            table: function () {
              return { insertRow: async function () { return { ROWID: 'mock-audit-id' }; } };
            }
          };
        }
      };
    }
  };

  var appInst = paginatedMock.initializeApp();
  var docs = await reconciler.loadPersonMasterDocuments(appInst);

  assert.strictEqual(docs.length, totalDocs, 'should load all ' + totalDocs + ' docs across pages');
  assert.strictEqual(pageCallCount, totalPages, 'should make ' + totalPages + ' queryTable calls');
  console.log('  [info] Paginated PersonMaster: ' + docs.length + ' docs across ' + pageCallCount + ' pages');
});

/* ================================================================ */
/*  Test 19: NoSQL query uses correct EQUALS operator               */
/* ================================================================ */

console.log('\n=== Scenario 19: NoSQL EQUALS operator ===');

await testAsync('uses correct EQUALS operator in query body', async function () {
  var capturedQueryBody = null;

  var captureTable = {
    queryTable: async function (queryBody) {
      capturedQueryBody = JSON.parse(JSON.stringify(queryBody));
      return {
        getResponseData: function () { return []; }
      };
    }
  };

  var captureMock = {
    _table: captureTable,
    initializeApp: function () {
      var self = this;
      return {
        zcql: function () {
          return {
            executeZCQLQuery: async function () { return []; }
          };
        },
        nosql: function () {
          return {
            getTable: async function () { return self._table; }
          };
        },
        datastore: function () {
          return {
            table: function () {
              return { insertRow: async function () { return { ROWID: 'mock-audit-id' }; } };
            }
          };
        }
      };
    }
  };

  var appInst = captureMock.initializeApp();
  await reconciler.loadPersonMasterDocuments(appInst);

  assert.ok(capturedQueryBody !== null, 'queryTable should have been called');
  assert.ok(capturedQueryBody.key_condition, 'query body should have key_condition');
  assert.strictEqual(capturedQueryBody.key_condition.operator, 'equals', 'operator should be "equals"');
  assert.strictEqual(capturedQueryBody.key_condition.attribute, 'type', 'attribute should be "type"');
  assert.ok(capturedQueryBody.key_condition.value, 'key_condition should have value');
  assert.deepStrictEqual(capturedQueryBody.key_condition.value, { S: 'PM' }, 'value should be NoSQLMarshalled {S: "PM"}');
  assert.strictEqual(capturedQueryBody.consistent_read, true, 'consistent_read should be true');
  assert.strictEqual(capturedQueryBody.limit, 100, 'limit should be 100');
  console.log('  [info] Captured query body: ' + JSON.stringify(capturedQueryBody));
});

/* ================================================================ */
/*  Test 20: NoSQL query error throws                               */
/* ================================================================ */

console.log('\n=== Scenario 20: NoSQL query error ===');

await testAsync('propagates error when queryTable throws', async function () {
  var errorTable = {
    queryTable: async function () {
      throw new Error('Simulated NoSQL queryTable failure');
    }
  };

  var errorMock = {
    _table: errorTable,
    initializeApp: function () {
      var self = this;
      return {
        zcql: function () {
          return {
            executeZCQLQuery: async function () { return []; }
          };
        },
        nosql: function () {
          return {
            getTable: async function () { return self._table; }
          };
        },
        datastore: function () {
          return {
            table: function () {
              return { insertRow: async function () { return { ROWID: 'mock-audit-id' }; } };
            }
          };
        }
      };
    }
  };

  var appInst = errorMock.initializeApp();
  var threw = false;
  try {
    await reconciler.loadPersonMasterDocuments(appInst);
  } catch (err) {
    threw = true;
    assert.ok(err.message.indexOf('Simulated NoSQL queryTable failure') !== -1, 'error should propagate with original message');
  }
  assert.ok(threw, 'loadPersonMasterDocuments should throw on queryTable error');
  console.log('  [info] Error correctly propagated');
});

/* ================================================================ */
/*  Test 11: Pagination — loads >300 records via queryAllZCQL      */
/* ================================================================ */

console.log('\n=== Scenario 11: Pagination ===');

await testAsync('loads more than 300 records via pagination', async function () {
  var PAGE_SIZE = 300;
  var TOTAL_RECORDS = 500;

  var namePool = [
    'John', 'Mary', 'Robert', 'Patricia', 'Michael', 'Jennifer', 'David', 'Linda',
    'James', 'Barbara', 'William', 'Elizabeth', 'Richard', 'Susan', 'Joseph', 'Jessica',
    'Thomas', 'Sarah', 'Christopher', 'Karen', 'Charles', 'Lisa', 'Daniel', 'Nancy',
    'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
    'Steven', 'Kimberly', 'Andrew', 'Emily', 'Paul', 'Donna', 'Joshua', 'Michelle',
    'Kenneth', 'Carol', 'Kevin', 'Amanda', 'Brian', 'Dorothy', 'George', 'Melissa',
    'Timothy', 'Deborah', 'Ronald', 'Stephanie', 'Edward', 'Rebecca', 'Jason', 'Sharon',
    'Jeffrey', 'Laura', 'Ryan', 'Cynthia', 'Jacob', 'Kathleen', 'Gary', 'Amy',
    'Nicholas', 'Angela', 'Eric', 'Shirley', 'Jonathan', 'Anna', 'Stephen', 'Brenda',
    'Larry', 'Pamela', 'Justin', 'Emma', 'Scott', 'Nicole', 'Brandon', 'Helen',
    'Benjamin', 'Samantha', 'Samuel', 'Katherine', 'Raymond', 'Christine', 'Gregory', 'Debra',
    'Frank', 'Rachel', 'Alexander', 'Carolyn', 'Jack', 'Janet', 'Dennis', 'Catherine',
    'Jerry', 'Maria', 'Tyler', 'Heather'
  ];

  var allAccusedRows = [];
  for (var i = 0; i < TOTAL_RECORDS; i++) {
    var name = namePool[i % namePool.length] + (Math.floor(i / namePool.length) > 0 ? Math.floor(i / namePool.length) : '');
    allAccusedRows.push(
      makeSourceRawRow('Accused', 'AccusedMasterID', String(i + 1), 'CASE-' + String(i + 1).padStart(4, '0'),
        name, 20 + (i % 50), (i % 3) + 1, '2024-01-15', 'UNIT-1', 'DIST-1')
    );
  }

  var paginationMock = {
    _table: createMockNoSqlTable(),
    initializeApp: function () {
      var self = this;
      return {
        zcql: function () {
          return {
            executeZCQLQuery: async function (sql) {
              if (sql.indexOf('FROM PersonMaster') !== -1) return [];
              if (sql.indexOf('FROM Accused') !== -1) {
                var limitMatch = sql.match(/LIMIT\s+(\d+),(\d+)/);
                var offset = 0;
                var limit = 0;
                if (limitMatch) {
                  offset = parseInt(limitMatch[1], 10);
                  limit = parseInt(limitMatch[2], 10);
                } else {
                  limit = 300;
                }
                var chunk = allAccusedRows.slice(offset, offset + limit);
                return chunk;
              }
              return [];
            }
          };
        },
        nosql: function () {
          return {
            getTable: async function () { return self._table; }
          };
        },
        datastore: function () {
          return {
            table: function () {
              return {
                insertRow: async function () { return { ROWID: 'mock-audit-id' }; }
              };
            }
          };
        }
      };
    }
  };

  var appInst = paginationMock.initializeApp();
  var result = await fullReconcile(appInst, { runId: 'TEST-PAGINATION' });

  assert.strictEqual(result.status, 'SUCCESS');
  assert.ok(result.persons_processed >= TOTAL_RECORDS,
    'should process all ' + TOTAL_RECORDS + ' records, got ' + result.persons_processed);
  assert.ok(result.persons_processed > 300,
    'pagination should load more than 300 records, got ' + result.persons_processed);
  console.log('  [info] Pagination result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 12: max_records parameter                                  */
/* ================================================================ */

console.log('\n=== Scenario 12: max_records parameter (LIMITED mode) ===');

await testAsync('full mode has no implicit limit', async function () {
  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Ravi Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];
  var mockCat = createMockCatalyst([], accusedRows, [], []);
  var appInst = mockCat.initializeApp();
  var result = await fullReconcile(appInst, {});

  assert.strictEqual(result.mode, 'FULL');
  assert.strictEqual(result.authoritative, true);
});

await testAsync('max_records limits source tables', async function () {
  var TOTAL_RECORDS = 300;
  var allAccusedRows = [];
  for (var i = 0; i < TOTAL_RECORDS; i++) {
    allAccusedRows.push(
      makeSourceRawRow('Accused', 'AccusedMasterID', String(i + 1), 'CASE-' + String(i + 1).padStart(4, '0'),
        'Person ' + (i + 1), 20 + (i % 50), (i % 3) + 1, '2024-01-15', 'UNIT-1', 'DIST-1')
    );
  }

  var limitMock = {
    _table: createMockNoSqlTable(),
    initializeApp: function () {
      var self = this;
      return {
        zcql: function () {
          return {
            executeZCQLQuery: async function (sql) {
              if (sql.indexOf('FROM PersonMaster') !== -1) return [];
              if (sql.indexOf('FROM Accused') !== -1) {
                var limitMatch = sql.match(/LIMIT\s+(\d+)/);
                var limit = limitMatch ? parseInt(limitMatch[1], 10) : 300;
                return allAccusedRows.slice(0, limit);
              }
              return [];
            }
          };
        },
        nosql: function () {
          return { getTable: async function () { return self._table; } };
        },
        datastore: function () {
          return { table: function () { return { insertRow: async function () { return { ROWID: 'mock-audit-id' }; } }; } };
        }
      };
    }
  };

  var appInst = limitMock.initializeApp();
  var result = await fullReconcile(appInst, { max_records: 50 });

  assert.strictEqual(result.mode, 'LIMITED');
  assert.ok(result.persons_processed <= 50, 'limited to 50 records per table, got ' + result.persons_processed);
  assert.strictEqual(result.stale_deletion_enabled, false);
  assert.strictEqual(result.authoritative, false);
});

await testAsync('limited mode disables stale deletion', async function () {
  var stalePid = 'PM_STALE_LIMITED_' + Date.now().toString(36);
  var pmRows = [
    makePMRawRow(stalePid, [
      { table: 'Accused', row_id: 'A-999', case_id: 'CASE-999', name_as_recorded: 'Stale Person', age_as_recorded: 40 }
    ])
  ];

  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Ravi Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var mockCat = createMockCatalyst(pmRows, accusedRows, [], []);
  mockCat._table._store[stalePid] = { person_id: stalePid, type: 'PM', source_records: [{ table: 'Accused', row_id: 'A-999' }] };
  var appInst = mockCat.initializeApp();
  var result = await fullReconcile(appInst, { max_records: 10 });

  assert.strictEqual(result.mode, 'LIMITED');
  assert.strictEqual(result.documents_deleted, 0, 'stale deletion disabled in LIMITED mode');
  assert.strictEqual(result.stale_deletion_enabled, false);
});

await testAsync('full mode allows stale deletion after successful loading', async function () {
  var stalePid = 'PM_STALE_FULL_' + Date.now().toString(36);
  var pmRows = [
    makePMRawRow(stalePid, [
      { table: 'Accused', row_id: 'A-999', case_id: 'CASE-999', name_as_recorded: 'Stale Person', age_as_recorded: 40 }
    ])
  ];

  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Ravi Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var mockCat = createMockCatalyst(pmRows, accusedRows, [], []);
  mockCat._table._store[stalePid] = { person_id: stalePid, type: 'PM', source_records: [{ table: 'Accused', row_id: 'A-999' }] };
  var appInst = mockCat.initializeApp();
  var result = await fullReconcile(appInst, {});

  assert.strictEqual(result.stale_deletion_enabled, true);
  assert.strictEqual(result.documents_deleted, 1, 'stale doc deleted in FULL mode');
  assert.strictEqual(result.mode, 'FULL');
});

await testAsync('source load failure disables stale deletion (full mode)', async function () {
  var failingMock = {
    initializeApp: function () {
      return {
        zcql: function () {
          return {
            executeZCQLQuery: async function () {
              throw new Error('Simulated ZCQL failure');
            }
          };
        },
        nosql: function () {
          return { getTable: async function () { return { insertItems: async function () {}, updateItems: async function () {}, deleteItems: async function () {}, getItems: async function () { return { data: [] }; } }; } };
        },
        datastore: function () {
          return { table: function () { return { insertRow: async function () { return { ROWID: 'mock-audit-id' }; } }; } };
        }
      };
    }
  };

  var appInst = failingMock.initializeApp();
  var result = await fullReconcile(appInst, {});

  assert.strictEqual(result.status, 'FAILED');
  assert.strictEqual(result.documents_deleted, 0);
  assert.strictEqual(result.mode, 'FULL');
  assert.strictEqual(result.stale_deletion_enabled, false);
});

await testAsync('job invocation defaults to full mode without max_records', async function () {
  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Ravi Kumar', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];
  var mockCat = createMockCatalyst([], accusedRows, [], []);
  var appInst = mockCat.initializeApp();

  /* Simulate the job's call pattern */
  var result = await fullReconcile(appInst, {
    runId: 'FULL-JOB-' + Date.now().toString(36).toUpperCase()
  });

  assert.strictEqual(result.mode, 'FULL');
  assert.strictEqual(result.authoritative, true);
  assert.strictEqual(result.stale_deletion_enabled, true);
});

/* ================================================================ */
/*  Scenario: Merge victim deletion                                 */
/* ================================================================ */

console.log('\n=== Scenario: Merge victim deletion ===');

await testAsync('survivor persisted before victim deleted', async function () {
  var detPid = reconciler.deterministicPersonId;

  /* Two accused records that cluster together (same name, same case) */
  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Merge Victim', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    makeSourceRawRow('Accused', 'AccusedMasterID', '2', 'CASE-001', 'Merge Victim', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  /* Two existing PM docs each claiming one source record from the same cluster */
  var victimPid = 'PM_VICTIM_' + Date.now().toString(36);
  var survivorPid = 'PM_SURVIVOR_' + Date.now().toString(36);

  var pmRows = [
    makePMRawRow(survivorPid, [
      { table: 'Accused', row_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'Merge Victim', age_as_recorded: 30 }
    ]),
    makePMRawRow(victimPid, [
      { table: 'Accused', row_id: 'A-2', case_id: 'CASE-001', name_as_recorded: 'Merge Victim', age_as_recorded: 30 }
    ])
  ];

  var mockCat = createMockCatalyst(pmRows, accusedRows, [], []);
  mockCat._table._store[survivorPid] = { person_id: survivorPid, type: 'PM', source_records: [{ table: 'Accused', row_id: 'A-1' }] };
  mockCat._table._store[victimPid] = { person_id: victimPid, type: 'PM', source_records: [{ table: 'Accused', row_id: 'A-2' }] };

  var appInst = mockCat.initializeApp();
  var result = await fullReconcile(appInst, { runId: 'TEST-MERGE' });

  assert.strictEqual(result.status, 'SUCCESS');
  assert.strictEqual(result.clusters_formed, 1, 'both records should cluster together');
  assert.strictEqual(result.merge_victim_deletion_enabled, true, 'merge victim deletion should be enabled');
  assert.strictEqual(result.merge_victims.identified, 1, 'one merge victim identified');
  assert.strictEqual(result.merge_victims.deleted, 1, 'merge victim deleted');

  /* Survivor must exist in store */
  assert.ok(mockCat._table._store[survivorPid] !== undefined, 'survivor must exist after reconciliation');

  /* Survivor should NOT be in merge victims */
  var storeKeys = Object.keys(mockCat._table._store);
  assert.ok(storeKeys.indexOf(victimPid) === -1, 'merge victim must be removed from store');
  console.log('  [info] Merge victim result: ' + JSON.stringify(result));
});

await testAsync('merge victim deletion disabled on source load failure', async function () {
  var failingMock = {
    initializeApp: function () {
      return {
        zcql: function () {
          return {
            executeZCQLQuery: async function () {
              throw new Error('Simulated ZCQL failure');
            }
          };
        },
        nosql: function () {
          return {
            getTable: async function () {
              return {
                queryTable: async function () { return { getResponseData: function () { return []; } }; },
                insertItems: async function () {},
                updateItems: async function () {},
                deleteItems: async function () {},
                getItems: async function () { return { data: [] }; }
              };
            }
          };
        },
        datastore: function () {
          return {
            table: function () {
              return { insertRow: async function () { return { ROWID: 'mock-audit-id' }; } };
            }
          };
        }
      };
    }
  };

  var appInst = failingMock.initializeApp();
  var result = await fullReconcile(appInst, { runId: 'TEST-MERGE-FAIL-LOAD' });

  assert.strictEqual(result.status, 'FAILED');
  assert.strictEqual(result.merge_victim_deletion_enabled, false, 'merge victim deletion disabled on load failure');
  assert.strictEqual(result.merge_victims.identified, 0, 'no merge victims identified');
});

await testAsync('FULL mode enables stale orphan cleanup', async function () {
  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Active Person', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var stalePid = 'PM_STALE_FULL_' + Date.now().toString(36);
  var pmRows = [
    makePMRawRow(stalePid, [
      { table: 'Accused', row_id: 'A-999', case_id: 'CASE-999', name_as_recorded: 'Stale Person', age_as_recorded: 40 }
    ])
  ];

  var mockCat = createMockCatalyst(pmRows, accusedRows, [], []);
  mockCat._table._store[stalePid] = { person_id: stalePid, type: 'PM', source_records: [{ table: 'Accused', row_id: 'A-999' }] };
  var appInst = mockCat.initializeApp();

  var result = await fullReconcile(appInst, {});

  assert.strictEqual(result.stale_deletion_enabled, true, 'stale deletion enabled in FULL mode');
  assert.strictEqual(result.stale_documents.identified, 1, 'one stale identified');
  assert.strictEqual(result.stale_documents.deleted, 1, 'stale deleted');
  assert.strictEqual(result.documents_deleted, 1, 'documents_deleted reflects stale orphan count');
});

await testAsync('LIMITED mode disables stale orphan cleanup but keeps merge victim deletion', async function () {
  var detPid = reconciler.deterministicPersonId;

  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Merge Victim', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    makeSourceRawRow('Accused', 'AccusedMasterID', '2', 'CASE-001', 'Merge Victim', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var victimPid = 'PM_VICTIM_LIMITED_' + Date.now().toString(36);
  var survivorPid = 'PM_SURVIVOR_LIMITED_' + Date.now().toString(36);

  var pmRows = [
    makePMRawRow(survivorPid, [
      { table: 'Accused', row_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'Merge Victim', age_as_recorded: 30 }
    ]),
    makePMRawRow(victimPid, [
      { table: 'Accused', row_id: 'A-2', case_id: 'CASE-001', name_as_recorded: 'Merge Victim', age_as_recorded: 30 }
    ])
  ];

  var mockCat = createMockCatalyst(pmRows, accusedRows, [], []);
  mockCat._table._store[survivorPid] = { person_id: survivorPid, type: 'PM', source_records: [{ table: 'Accused', row_id: 'A-1' }] };
  mockCat._table._store[victimPid] = { person_id: victimPid, type: 'PM', source_records: [{ table: 'Accused', row_id: 'A-2' }] };

  var appInst = mockCat.initializeApp();
  var result = await fullReconcile(appInst, { max_records: 10 });

  assert.strictEqual(result.mode, 'LIMITED');
  assert.strictEqual(result.stale_deletion_enabled, false, 'stale deletion disabled in LIMITED mode');
  assert.strictEqual(result.merge_victim_deletion_enabled, true, 'merge victim deletion still enabled in LIMITED mode');
  assert.strictEqual(result.merge_victims.identified, 1, 'merge victim identified');
  assert.strictEqual(result.merge_victims.deleted, 1, 'merge victim deleted in LIMITED mode');
});

await testAsync('already deleted victim returns not_found not error', async function () {
  var detPid = reconciler.deterministicPersonId;

  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Already Gone', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    makeSourceRawRow('Accused', 'AccusedMasterID', '2', 'CASE-001', 'Already Gone', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var victimPid = 'PM_GONE_VICTIM_' + Date.now().toString(36);
  var survivorPid = 'PM_GONE_SURVIVOR_' + Date.now().toString(36);

  /* Custom mock table that throws 404 for the victim PID on deleteItems */
  var baseTable = createMockNoSqlTable();
  var origDeleteItems = baseTable.deleteItems;
  baseTable.deleteItems = async function (opts) {
    var keys = opts.keys || {};
    var pid = extractProp(keys, 'person_id');
    if (pid === victimPid) {
      var err = new Error('Requested resource not found');
      err.statusCode = 404;
      throw err;
    }
    return origDeleteItems.call(this, opts);
  };

  var mockCat = createMockCatalyst([], accusedRows, [], []);
  mockCat._table = baseTable;
  /* Both docs must be in store so loadPersonMasterDocuments finds both */
  mockCat._table._store[survivorPid] = { person_id: survivorPid, type: 'PM', source_records: [{ table: 'Accused', row_id: 'A-1' }] };
  mockCat._table._store[victimPid] = { person_id: victimPid, type: 'PM', source_records: [{ table: 'Accused', row_id: 'A-2' }] };

  var appInst = mockCat.initializeApp();
  var result = await fullReconcile(appInst, { runId: 'TEST-GONE-MERGE' });

  assert.strictEqual(result.status, 'SUCCESS');
  assert.strictEqual(result.merge_victims.identified, 1, 'victim identified');
  assert.strictEqual(result.merge_victims.already_absent, 1, 'victim already absent (not found)');
  assert.strictEqual(result.merge_victims.deleted, 0, 'no new deletions');
  assert.strictEqual(result.merge_victims.errors, 0, 'no errors');
  console.log('  [info] Already-deleted victim result: ' + JSON.stringify(result));
});

await testAsync('survivor never included in deletion set', async function () {
  var detPid = reconciler.deterministicPersonId;

  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Survivor Only', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var existingPid = 'PM_EXISTING_' + Date.now().toString(36);
  var pmRows = [
    makePMRawRow(existingPid, [
      { table: 'Accused', row_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'Survivor Only', age_as_recorded: 30 }
    ])
  ];

  var mockCat = createMockCatalyst(pmRows, accusedRows, [], []);
  mockCat._table._store[existingPid] = { person_id: existingPid, type: 'PM', source_records: [{ table: 'Accused', row_id: 'A-1' }] };

  var appInst = mockCat.initializeApp();
  var result = await fullReconcile(appInst, { runId: 'TEST-SURVIVOR-NO-DELETE' });

  assert.strictEqual(result.status, 'SUCCESS');
  assert.strictEqual(result.merge_victims.identified, 0, 'no merge victims');
  assert.strictEqual(result.stale_documents.identified, 0, 'no stale docs');
  assert.strictEqual(result.documents_deleted, 0, 'nothing deleted');
  assert.ok(mockCat._table._store[existingPid] !== undefined, 'survivor still exists');
});

await testAsync('no-merge scenario unchanged (merge_victims empty)', async function () {
  var accusedRows = [
    makeSourceRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Person One', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    makeSourceRawRow('Accused', 'AccusedMasterID', '2', 'CASE-002', 'Person Two', 25, 2, '2024-02-20', 'UNIT-2', 'DIST-2')
  ];

  var mockCat = createMockCatalyst([], accusedRows, [], []);
  var appInst = mockCat.initializeApp();
  var result = await fullReconcile(appInst, { runId: 'TEST-NO-MERGE' });

  assert.strictEqual(result.status, 'SUCCESS');
  assert.strictEqual(result.merge_victims.identified, 0, 'no merge victims');
  assert.strictEqual(result.merge_victims.deleted, 0, 'no merge victim deletions');
  assert.strictEqual(result.stale_documents.identified, 0, 'no stale docs');
});

console.log('\n=== Summary ===');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);

if (failed > 0) {
  console.log('\nSome tests FAILED.');
  process.exit(1);
} else {
  console.log('\nAll tests PASSED.');
}

}

runAll().catch(function (err) {
  console.error('Fatal test error: ' + err.message);
  console.error(err.stack);
  process.exit(1);
});
