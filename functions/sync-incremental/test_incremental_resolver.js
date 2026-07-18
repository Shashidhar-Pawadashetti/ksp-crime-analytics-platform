'use strict';

/*
 * Unit / integration tests for sync-incremental — Incremental Resolution.
 */

var assert = require('assert');

/* ------------------------------------------------------------------ */
/*  Mock helpers                                                      */
/* ------------------------------------------------------------------ */

function createMockTable() {
  var store = {};
  return {
    _store: store,
    getItems: async function (opts) {
      var keys = opts.keys || {};
      var pid = keys && keys.person_id;
      if (pid && store[pid]) return { data: [store[pid]] };
      return { data: [] };
    },
    insertItems: async function (opts) {
      var item = opts.item || {};
      if (item.person_id) store[item.person_id] = item;
    },
    updateItems: async function (opts) {
      var keys = opts.keys || {};
      var pid = keys && keys.person_id;
      if (pid) {
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
    }
  };
}

function createMockCatalyst(personMasterRows, accusedRows, victimRows, compRows) {
  var table = createMockTable();
  return {
    _table: table,
    initializeApp: function () {
      var self = this;
      return {
        zcql: function () {
          return {
            executeZCQLQuery: async function (sql) {
              if (sql.indexOf('FROM PersonMaster') !== -1) return personMasterRows;
              if (sql.indexOf('FROM Accused') !== -1) return accusedRows;
              if (sql.indexOf('FROM Victim') !== -1) return victimRows;
              if (sql.indexOf('FROM ComplainantDetails') !== -1) return compRows;
              return [];
            }
          };
        },
        nosql: function () {
          return {
            getTable: async function () { return self._table; }
          };
        }
      };
    }
  };
}

function createMockCatalystNoPersist(personMasterRows, accusedRows, victimRows, compRows) {
  return {
    initializeApp: function () {
      return {
        zcql: function () {
          return {
            executeZCQLQuery: async function (sql) {
              if (sql.indexOf('FROM PersonMaster') !== -1) return personMasterRows;
              if (sql.indexOf('FROM Accused') !== -1) return accusedRows;
              if (sql.indexOf('FROM Victim') !== -1) return victimRows;
              if (sql.indexOf('FROM ComplainantDetails') !== -1) return compRows;
              return [];
            }
          };
        },
        nosql: function () {
          return {
            getTable: async function () {
              return {
                insertItems: async function () {},
                updateItems: async function () {},
                getItems: async function () { return { data: [] }; }
              };
            }
          };
        }
      };
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Load the resolver                                                  */
/* ------------------------------------------------------------------ */

var resolver;
try {
  resolver = require('./incrementalResolver');
} catch (e) {
  console.error('Failed to load incrementalResolver:', e.message);
  process.exit(1);
}

var incrementalResolve = resolver.incrementalResolve;
var deterministicPersonId = resolver.deterministicPersonId;

/* ------------------------------------------------------------------ */
/*  Test helpers                                                      */
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
/*  Test data helpers                                                 */
/* ------------------------------------------------------------------ */

function makePMRawRow(personId, sourceRecords) {
  var row = {};
  row['PersonMaster'] = {
    person_id: personId,
    type: 'PM',
    source_records: JSON.stringify(sourceRecords)
  };
  return row;
}

function makeSourcerRawRow(table, idCol, idVal, caseId, name, age, genderId, date, unitId, distId) {
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

/* ------------------------------------------------------------------ */
/*  Helper: compute deterministic person_id from record objects       */
/* ------------------------------------------------------------------ */

function pidFor(records) {
  return deterministicPersonId(records);
}

/* ------------------------------------------------------------------ */
/*  Runner                                                            */
/* ------------------------------------------------------------------ */

async function runAll() {

/* ================================================================ */
/*  Test 1: Mixed changes (changed + new + orphan)                  */
/* ================================================================ */

console.log('\n=== Scenario: Mixed changes (changed + new + orphan) ===');

await testAsync('resolves mixed change result correctly', async function () {
  var pid1 = pidFor([{ source_table: 'Accused', source_id: 'A-1' }]);
  var pid2 = pidFor([{ source_table: 'Accused', source_id: 'A-2' }]);
  var pid3 = pidFor([{ source_table: 'Victim', source_id: 'V-3' }]);

  var pmDocs = [
    makePMRawRow(pid1, [
      { table: 'Accused', row_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'John Doe', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ]),
    makePMRawRow(pid2, [
      { table: 'Accused', row_id: 'A-2', case_id: 'CASE-002', name_as_recorded: 'Jane Smith', age_as_recorded: 25, date_of_offence: '2024-02-20', unit_id: 'UNIT-2', district_id: 'DIST-2' }
    ]),
    makePMRawRow(pid3, [
      { table: 'Victim', row_id: 'V-3', case_id: 'CASE-003', name_as_recorded: 'Bob Wilson', age_as_recorded: 40, date_of_offence: '2024-03-10', unit_id: 'UNIT-3', district_id: 'DIST-3' }
    ])
  ];

  var accusedRows = [
    /* A-1 unchanged */
    makeSourcerRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'John Doe', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    /* A-2 changed (name changed from "Jane Smith" to "Jane Changed", age 26) */
    makeSourcerRawRow('Accused', 'AccusedMasterID', '2', 'CASE-002', 'Jane Changed', 26, 2, '2024-02-20', 'UNIT-2', 'DIST-2'),
    /* A-3 new record */
    makeSourcerRawRow('Accused', 'AccusedMasterID', '3', 'CASE-004', 'New Person', 35, 1, '2024-04-05', 'UNIT-4', 'DIST-4')
  ];

  var victimRows = [
    makeSourcerRawRow('Victim', 'VictimMasterID', '1', 'CASE-001', 'John Doe', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var compRows = [];

  var mockCat = createMockCatalyst(pmDocs, accusedRows, victimRows, compRows);
  var appInst = mockCat.initializeApp();

  var changeResult = {
    run_id: 'CHG-TEST',
    timestamp: new Date().toISOString(),
    stats: { existing_documents: 3, current_source_records: 4, changed_documents: 2, unchanged_documents: 1, new_records: 1, orphaned_records: 1 },
    changed_person_ids: [pid2, pid3],
    unchanged_person_ids: [pid1],
    new_records: [
      { source_table: 'Accused', source_id: 'A-3', name: 'New Person', age: 35, case_id: 'CASE-004', unit_id: 'UNIT-4', district_id: 'DIST-4', gender: 'M', date_of_offence: '2024-04-05' }
    ],
    orphaned_records: [
      { person_id: pid3, source_table: 'Victim', source_id: 'V-3', name: 'Bob Wilson', age: 40, case_id: 'CASE-003', unit_id: 'UNIT-3', district_id: 'DIST-3' }
    ],
    load_errors: []
  };

  var result = await incrementalResolve(appInst, changeResult, { runId: 'REC-TEST-001' });

  assert.ok(result.run_id, 'run_id present');
  assert.strictEqual(result.status, 'SUCCESS');

  /* PM_0003 (pid3) had its only record V-3 orphaned → deleted */
  /* A-3 (new) → created as new doc */
  /* A-2 (changed name) → rebuilt */

  /* new_documents: A-3 is new (CASE-004 singleton), and A-2's changed cluster may differ */
  /* But A-2 still forms a singleton cluster (just itself) so same person_id; it's rebuilt */
  /* A-1 unchanged, but appears in edge generation */

  console.log('  [info] Mixed result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 2: Empty change result                                     */
/* ================================================================ */

console.log('\n=== Scenario: Empty change result (nothing changed) ===');

await testAsync('resolves empty change result with no-op', async function () {
  var pid1 = pidFor([{ source_table: 'Accused', source_id: 'A-1' }]);

  var pmDocs = [
    makePMRawRow(pid1, [
      { table: 'Accused', row_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'John Doe', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ])
  ];

  var accusedRows = [
    makeSourcerRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'John Doe', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var mockCat = createMockCatalystNoPersist(pmDocs, accusedRows, [], []);
  var appInst = mockCat.initializeApp();

  var changeResult = {
    run_id: 'CHG-EMPTY',
    timestamp: new Date().toISOString(),
    stats: { existing_documents: 1, current_source_records: 1, changed_documents: 0, unchanged_documents: 1, new_records: 0, orphaned_records: 0 },
    changed_person_ids: [],
    unchanged_person_ids: [pid1],
    new_records: [],
    orphaned_records: [],
    load_errors: []
  };

  var result = await incrementalResolve(appInst, changeResult, { runId: 'REC-EMPTY' });

  assert.strictEqual(result.status, 'SUCCESS');
  assert.strictEqual(result.documents_rebuilt, 0);
  assert.strictEqual(result.documents_deleted, 0);
  assert.strictEqual(result.new_documents, 0);
  console.log('  [info] Empty result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 3: Only new records                                        */
/* ================================================================ */

console.log('\n=== Scenario: Only new records ===');

await testAsync('resolves when only new records exist', async function () {
  var pid1 = pidFor([{ source_table: 'Accused', source_id: 'A-1' }]);

  var pmDocs = [
    makePMRawRow(pid1, [
      { table: 'Accused', row_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'John Doe', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ])
  ];

  var accusedRows = [
    makeSourcerRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'John Doe', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    makeSourcerRawRow('Accused', 'AccusedMasterID', '99', 'CASE-099', 'Alice New', 28, 2, '2024-05-05', 'UNIT-5', 'DIST-5')
  ];

  var mockCat = createMockCatalyst(pmDocs, accusedRows, [], []);
  var appInst = mockCat.initializeApp();

  var changeResult = {
    run_id: 'CHG-NEW',
    timestamp: new Date().toISOString(),
    stats: { existing_documents: 1, current_source_records: 2, changed_documents: 0, unchanged_documents: 1, new_records: 1, orphaned_records: 0 },
    changed_person_ids: [],
    unchanged_person_ids: [pid1],
    new_records: [
      { source_table: 'Accused', source_id: 'A-99', name: 'Alice New', age: 28, case_id: 'CASE-099', unit_id: 'UNIT-5', district_id: 'DIST-5', gender: 'F', date_of_offence: '2024-05-05' }
    ],
    orphaned_records: [],
    load_errors: []
  };

  var result = await incrementalResolve(appInst, changeResult, { runId: 'REC-NEW' });

  assert.strictEqual(result.status, 'SUCCESS');
  assert.ok(result.new_documents > 0, 'should create at least 1 new document');
  assert.strictEqual(result.documents_deleted, 0);
  console.log('  [info] New-only result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 4: Only orphaned records (non-empty remaining)             */
/* ================================================================ */

console.log('\n=== Scenario: Only orphaned records ===');

await testAsync('resolves when only orphaned records exist', async function () {
  /* PM_0002 has V-2 and A-22 — V-2 is orphaned but A-22 remains */
  var pid1 = pidFor([{ source_table: 'Accused', source_id: 'A-1' }]);
  var pid2 = pidFor([
    { source_table: 'Victim', source_id: 'V-2' },
    { source_table: 'Accused', source_id: 'A-22' }
  ]);

  var pmDocs = [
    makePMRawRow(pid1, [
      { table: 'Accused', row_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'John Doe', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ]),
    makePMRawRow(pid2, [
      { table: 'Victim', row_id: 'V-2', case_id: 'CASE-002', name_as_recorded: 'Jane Victim', age_as_recorded: 25, date_of_offence: '2024-02-20', unit_id: 'UNIT-2', district_id: 'DIST-2' },
      { table: 'Accused', row_id: 'A-22', case_id: 'CASE-002', name_as_recorded: 'Jane Victim', age_as_recorded: 25, date_of_offence: '2024-02-20', unit_id: 'UNIT-2', district_id: 'DIST-2' }
    ])
  ];

  var accusedRows = [
    makeSourcerRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'John Doe', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
    makeSourcerRawRow('Accused', 'AccusedMasterID', '22', 'CASE-002', 'Jane Victim', 25, 2, '2024-02-20', 'UNIT-2', 'DIST-2')
  ];

  var victimRows = [];

  var mockCat = createMockCatalyst(pmDocs, accusedRows, victimRows, []);
  var appInst = mockCat.initializeApp();

  var changeResult = {
    run_id: 'CHG-ORPHAN',
    timestamp: new Date().toISOString(),
    stats: { existing_documents: 2, current_source_records: 2, changed_documents: 1, unchanged_documents: 1, new_records: 0, orphaned_records: 1 },
    changed_person_ids: [pid2],
    unchanged_person_ids: [pid1],
    new_records: [],
    orphaned_records: [
      { person_id: pid2, source_table: 'Victim', source_id: 'V-2', name: 'Jane Victim', age: 25, case_id: 'CASE-002', unit_id: 'UNIT-2', district_id: 'DIST-2' }
    ],
    load_errors: []
  };

  var result = await incrementalResolve(appInst, changeResult, { runId: 'REC-ORPHAN' });

  assert.strictEqual(result.status, 'SUCCESS');
  /* PM_0002 has orphaned V-2 but A-22 remains — should have been rebuilt after orphan handling */
  console.log('  [info] Orphan result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Test 5: Orphan causes empty doc                                 */
/* ================================================================ */

console.log('\n=== Scenario: Orphan causes empty doc ===');

await testAsync('marks doc for deletion when last record is orphaned', async function () {
  var pid1 = pidFor([{ source_table: 'Victim', source_id: 'V-1' }]);

  var pmDocs = [
    makePMRawRow(pid1, [
      { table: 'Victim', row_id: 'V-1', case_id: 'CASE-001', name_as_recorded: 'Lone Victim', age_as_recorded: 35, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ])
  ];

  var accusedRows = [
    makeSourcerRawRow('Accused', 'AccusedMasterID', '1', 'CASE-001', 'Some Accused', 40, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var victimRows = [];

  var mockCat = createMockCatalyst(pmDocs, accusedRows, victimRows, []);
  var appInst = mockCat.initializeApp();

  var changeResult = {
    run_id: 'CHG-DEL',
    timestamp: new Date().toISOString(),
    stats: { existing_documents: 1, current_source_records: 1, changed_documents: 1, unchanged_documents: 0, new_records: 0, orphaned_records: 1 },
    changed_person_ids: [pid1],
    unchanged_person_ids: [],
    new_records: [],
    orphaned_records: [
      { person_id: pid1, source_table: 'Victim', source_id: 'V-1', name: 'Lone Victim', age: 35, case_id: 'CASE-001', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ],
    load_errors: []
  };

  var result = await incrementalResolve(appInst, changeResult, { runId: 'REC-DEL' });

  assert.strictEqual(result.status, 'SUCCESS');
  assert.strictEqual(result.documents_deleted, 1, 'PM_0001 should be deleted');
  console.log('  [info] Delete result: ' + JSON.stringify(result));
});

/* ================================================================ */
/*  Summary                                                         */
/* ================================================================ */

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
