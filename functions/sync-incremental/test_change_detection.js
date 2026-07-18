'use strict';

/*
 * Unit / integration tests for sync-incremental — Change Detection.
 *
 * Mocks the Catalyst SDK ZCQL interface to simulate PersonMaster
 * documents and current Data Store records, then verifies the
 * change detection logic.
 */

var assert = require('assert');

/* ------------------------------------------------------------------ */
/*  Mock Catalyst SDK                                                  */
/* ------------------------------------------------------------------ */

/**
 * Build a mock Catalyst SDK that returns controlled data from
 * executeZCQLQuery based on SQL content.
 */
function createMockCatalyst(personMasterRows, accusedRows, victimRows, compRows) {
  return {
    initializeApp: function () {
      return {
        zcql: function () {
          return {
            executeZCQLQuery: async function (sql) {
              /* PersonMaster query */
              if (sql.indexOf('FROM PersonMaster') !== -1) {
                return personMasterRows;
              }
              /* Accused query */
              if (sql.indexOf('FROM Accused') !== -1) {
                return accusedRows;
              }
              /* Victim query */
              if (sql.indexOf('FROM Victim') !== -1) {
                return victimRows;
              }
              /* ComplainantDetails query */
              if (sql.indexOf('FROM ComplainantDetails') !== -1) {
                return compRows;
              }
              return [];
            }
          };
        }
      };
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Load the module (must be after mock is defined)                   */
/* ------------------------------------------------------------------ */

/*
 * The module is exported as a function (Express handler), but also has
 * utility functions attached as properties. We do NOT require the real
 * catalyst; we pass a mock app instance directly to the functions.
 */

var syncInc;
try {
  /* In test mode, we avoid initializing the real catalyst SDK */
  syncInc = require('./index.js');
} catch (e) {
  console.error('Failed to load module:', e.message);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Test helpers                                                      */
/* ------------------------------------------------------------------ */

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch (e) {
    console.log('  ✗ ' + name + ': ' + e.message);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch (e) {
    console.log('  ✗ ' + name + ': ' + e.message);
    failed++;
  }
}

/* ------------------------------------------------------------------ */
/*  Test data                                                         */
/* ------------------------------------------------------------------ */

/* ---- Mock PersonMaster documents (as ZCQL raw rows) ---- */

function makePMRawRow(personId, sourceRecords) {
  var row = {};
  row['PersonMaster'] = {
    person_id: personId,
    type: 'PM',
    source_records: JSON.stringify(sourceRecords)
  };
  return row;
}

var pmDocsRaw = [
  makePMRawRow('PM_0001', [
    { table: 'Accused', row_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'John Doe', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' },
    { table: 'Victim', row_id: 'V-1', case_id: 'CASE-001', name_as_recorded: 'John Doe', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
  ]),
  makePMRawRow('PM_0002', [
    { table: 'Accused', row_id: 'A-2', case_id: 'CASE-002', name_as_recorded: 'Jane Smith', age_as_recorded: 25, date_of_offence: '2024-02-20', unit_id: 'UNIT-2', district_id: 'DIST-2' }
  ]),
  makePMRawRow('PM_0003', [
    { table: 'Victim', row_id: 'V-3', case_id: 'CASE-003', name_as_recorded: 'Bob Wilson', age_as_recorded: 40, date_of_offence: '2024-03-10', unit_id: 'UNIT-3', district_id: 'DIST-3' }
  ])
];

/* ---- Mock current source records (as ZCQL raw rows) ---- */

function makeSourcerRawRow(table, idCol, idVal, caseId, name, age, genderId, date, unitId, distId) {
  var alias = (table === 'Accused') ? 'a' : 'a';  // all use 'a' alias in template
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

/* Accused rows: A-1 (same), A-2 (changed name+age), A-3 (new) */
var accusedRawRows = [
  makeSourcerRawRow('Accused', 'AccusedMasterID', 1, 'CASE-001', 'John Doe', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1'),
  makeSourcerRawRow('Accused', 'AccusedMasterID', 2, 'CASE-002', 'Jane Changed', 26, 2, '2024-02-20', 'UNIT-2', 'DIST-2'),
  makeSourcerRawRow('Accused', 'AccusedMasterID', 3, 'CASE-004', 'New Person', 35, 1, '2024-04-05', 'UNIT-4', 'DIST-4')
];

/* Victim rows: V-1 (same; V-3 missing — orphan) */
var victimRawRows = [
  makeSourcerRawRow('Victim', 'VictimMasterID', 1, 'CASE-001', 'John Doe', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
];

/* No complainant records */
var compRawRows = [];

/* ---- PersonMaster documents with pre-parsed (array) source_records ---- */

function makePMFlatRow(personId, sourceRecords) {
  return {
    person_id: personId,
    type: 'PM',
    source_records: sourceRecords
  };
}

var pmFlatDocs = [
  makePMFlatRow('PM_0101', [
    { table: 'Accused', row_id: 'A-101', case_id: 'CASE-101', name_as_recorded: 'Alice', age_as_recorded: 28, date_of_offence: '2024-05-01', unit_id: 'UNIT-5', district_id: 'DIST-5' }
  ])
];

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

console.log('\n=== recordChecksum ===');

test('consistent checksum for identical records', function () {
  var a = syncInc.recordChecksum({ name: 'John Doe', age: 30, case_id: 'CASE-001', unit_id: 'UNIT-1', district_id: 'DIST-1' });
  var b = syncInc.recordChecksum({ name: 'John Doe', age: 30, case_id: 'CASE-001', unit_id: 'UNIT-1', district_id: 'DIST-1' });
  assert.strictEqual(a, b);
});

test('different checksum for different name', function () {
  var a = syncInc.recordChecksum({ name: 'John Doe', age: 30, case_id: 'CASE-001', unit_id: 'UNIT-1', district_id: 'DIST-1' });
  var b = syncInc.recordChecksum({ name: 'Jane Doe', age: 30, case_id: 'CASE-001', unit_id: 'UNIT-1', district_id: 'DIST-1' });
  assert.notStrictEqual(a, b);
});

test('different checksum for different age', function () {
  var a = syncInc.recordChecksum({ name: 'John Doe', age: 30, case_id: 'CASE-001', unit_id: 'UNIT-1', district_id: 'DIST-1' });
  var b = syncInc.recordChecksum({ name: 'John Doe', age: 31, case_id: 'CASE-001', unit_id: 'UNIT-1', district_id: 'DIST-1' });
  assert.notStrictEqual(a, b);
});

test('different checksum for different case_id', function () {
  var a = syncInc.recordChecksum({ name: 'John Doe', age: 30, case_id: 'CASE-001', unit_id: 'UNIT-1', district_id: 'DIST-1' });
  var b = syncInc.recordChecksum({ name: 'John Doe', age: 30, case_id: 'CASE-002', unit_id: 'UNIT-1', district_id: 'DIST-1' });
  assert.notStrictEqual(a, b);
});

test('handles name_as_recorded vs name field', function () {
  var a = syncInc.recordChecksum({ name_as_recorded: 'John Doe', age_as_recorded: 30, case_id: 'CASE-001', unit_id: 'UNIT-1', district_id: 'DIST-1' });
  var b = syncInc.recordChecksum({ name: 'John Doe', age: 30, case_id: 'CASE-001', unit_id: 'UNIT-1', district_id: 'DIST-1' });
  assert.strictEqual(a, b);
});

test('handles null age correctly', function () {
  var a = syncInc.recordChecksum({ name: 'No Age', age: null, case_id: 'CASE-001', unit_id: 'UNIT-1', district_id: 'DIST-1' });
  var b = syncInc.recordChecksum({ name: 'No Age', age: null, case_id: 'CASE-001', unit_id: 'UNIT-1', district_id: 'DIST-1' });
  assert.strictEqual(a, b);
});

test('returns hex string', function () {
  var cs = syncInc.recordChecksum({ name: 'Test', age: 20, case_id: 'C-1', unit_id: 'U-1', district_id: 'D-1' });
  assert.ok(typeof cs === 'string');
  assert.ok(cs.length > 0);
  assert.ok(/^[0-9a-f]+$/.test(cs));
});

console.log('\n=== parseSourceRecords ===');

test('parses JSON string source_records', function () {
  var row = { source_records: '[{"table":"Accused","row_id":"A-1"}]' };
  var result = syncInc.parseSourceRecords(row);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].table, 'Accused');
});

test('returns array as-is when source_records is already an array', function () {
  var row = { source_records: [{ table: 'Accused', row_id: 'A-1' }] };
  var result = syncInc.parseSourceRecords(row);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 1);
});

test('returns empty array when source_records is null', function () {
  var result = syncInc.parseSourceRecords({ source_records: null });
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 0);
});

test('returns empty array when source_records is undefined', function () {
  var result = syncInc.parseSourceRecords({});
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 0);
});

test('returns empty array on invalid JSON', function () {
  var row = { source_records: '{invalid json}' };
  var result = syncInc.parseSourceRecords(row);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 0);
});

console.log('\n=== buildSourceToPersonIndex ===');

test('maps source keys to person_ids', function () {
  var docs = [
    { person_id: 'PM_0001', source_records: '[{"table":"Accused","row_id":"A-1"},{"table":"Victim","row_id":"V-1"}]' },
    { person_id: 'PM_0002', source_records: '[{"table":"Accused","row_id":"A-2"}]' }
  ];
  var idx = syncInc.buildSourceToPersonIndex(docs);
  assert.strictEqual(idx['Accused:A-1'], 'PM_0001');
  assert.strictEqual(idx['Victim:V-1'], 'PM_0001');
  assert.strictEqual(idx['Accused:A-2'], 'PM_0002');
  assert.strictEqual(idx['Accused:A-3'], undefined);
});

test('skips empty keys', function () {
  var docs = [
    { person_id: 'PM_0001', source_records: '[{"table":"","row_id":""}]' }
  ];
  var idx = syncInc.buildSourceToPersonIndex(docs);
  assert.strictEqual(Object.keys(idx).length, 0);
});

test('handles empty docs array', function () {
  var idx = syncInc.buildSourceToPersonIndex([]);
  assert.strictEqual(Object.keys(idx).length, 0);
});

console.log('\n=== buildCurrentRecordsIndex ===');

test('indexes current records by source_table:source_id', function () {
  var records = [
    { source_table: 'Accused', source_id: 'A-1', name: 'John' },
    { source_table: 'Victim', source_id: 'V-1', name: 'Jane' }
  ];
  var idx = syncInc.buildCurrentRecordsIndex(records);
  assert.strictEqual(idx['Accused:A-1'].name, 'John');
  assert.strictEqual(idx['Victim:V-1'].name, 'Jane');
  assert.strictEqual(idx['Accused:A-99'], undefined);
});

test('handles empty records array', function () {
  var idx = syncInc.buildCurrentRecordsIndex([]);
  assert.strictEqual(Object.keys(idx).length, 0);
});

console.log('\n=== detectChanges — Integration Tests ===');

testAsync('detects changed, unchanged, new, and orphaned records', async function () {
  var mockCat = createMockCatalyst(pmDocsRaw, accusedRawRows, victimRawRows, compRawRows);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  /* Check overall structure */
  assert.ok(result.run_id, 'run_id is present');
  assert.ok(result.run_id.indexOf('CHG-') === 0, 'run_id starts with CHG-');
  assert.ok(result.timestamp, 'timestamp is present');
  assert.ok(result.stats, 'stats object is present');
  assert.ok(Array.isArray(result.changed_person_ids), 'changed_person_ids is array');
  assert.ok(Array.isArray(result.unchanged_person_ids), 'unchanged_person_ids is array');
  assert.ok(Array.isArray(result.new_records), 'new_records is array');
  assert.ok(Array.isArray(result.orphaned_records), 'orphaned_records is array');

  /* ---- Stats ---- */
  assert.strictEqual(result.stats.existing_documents, 3, '3 existing documents');
  assert.strictEqual(result.stats.current_source_records, 4, '4 current source records (3 Accused + 1 Victim)');
  assert.strictEqual(result.stats.changed_documents, 2, '2 changed documents (PM_0002, PM_0003)');
  assert.strictEqual(result.stats.unchanged_documents, 1, '1 unchanged document (PM_0001)');
  assert.strictEqual(result.stats.new_records, 1, '1 new record (A-3)');
  assert.strictEqual(result.stats.orphaned_records, 1, '1 orphaned record (V-3 in PM_0003)');

  /* ---- Changed ---- */
  assert.ok(result.changed_person_ids.indexOf('PM_0002') !== -1, 'PM_0002 is changed (name mismatch)');
  assert.ok(result.changed_person_ids.indexOf('PM_0003') !== -1, 'PM_0003 is changed (orphaned)');

  /* ---- Unchanged ---- */
  assert.ok(result.unchanged_person_ids.indexOf('PM_0001') !== -1, 'PM_0001 is unchanged');

  /* ---- New records ---- */
  var newA3 = result.new_records.filter(function (r) { return r.source_id === 'A-3'; });
  assert.strictEqual(newA3.length, 1, 'A-3 is a new record');
  assert.strictEqual(newA3[0].name, 'New Person');
  assert.strictEqual(newA3[0].source_table, 'Accused');
  assert.strictEqual(newA3[0].age, 35);

  /* ---- Orphaned records ---- */
  var orphanV3 = result.orphaned_records.filter(function (r) { return r.source_id === 'V-3'; });
  assert.strictEqual(orphanV3.length, 1, 'V-3 is orphaned');
  assert.strictEqual(orphanV3[0].person_id, 'PM_0003');
  assert.strictEqual(orphanV3[0].name, 'Bob Wilson');
});

testAsync('empty PersonMaster — all records shown as new', async function () {
  var mockCat = createMockCatalyst([], accusedRawRows, victimRawRows, compRawRows);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.existing_documents, 0);
  assert.strictEqual(result.stats.current_source_records, 4);
  assert.strictEqual(result.stats.changed_documents, 0);
  assert.strictEqual(result.stats.unchanged_documents, 0);
  assert.strictEqual(result.stats.new_records, 4);
  assert.strictEqual(result.stats.orphaned_records, 0);
  assert.strictEqual(result.changed_person_ids.length, 0);
  assert.strictEqual(result.unchanged_person_ids.length, 0);
  assert.strictEqual(result.new_records.length, 4);
});

testAsync('empty source records — all existing docs shown as orphaned', async function () {
  var mockCat = createMockCatalyst(pmDocsRaw, [], [], []);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.existing_documents, 3);
  assert.strictEqual(result.stats.current_source_records, 0);
  assert.strictEqual(result.stats.changed_documents, 3);  // all three have orphans
  assert.strictEqual(result.stats.unchanged_documents, 0);
  assert.strictEqual(result.stats.new_records, 0);
  /* Each doc has its source_records, all are orphaned (no current records) */
  assert.strictEqual(result.orphaned_records.length, 4);  // PM_0001 has 2, PM_0002 has 1, PM_0003 has 1
  assert.strictEqual(result.changed_person_ids.length, 3);
});

testAsync('all unchanged — everything matches', async function () {
  /* Build current records that exactly match PM_0001's source records */
  var matchAccusedRaw = [
    makeSourcerRawRow('Accused', 'AccusedMasterID', 1, 'CASE-001', 'John Doe', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];
  var matchVictimRaw = [
    makeSourcerRawRow('Victim', 'VictimMasterID', 1, 'CASE-001', 'John Doe', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var singlePMDoc = [
    makePMRawRow('PM_0001', [
      { table: 'Accused', row_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'John Doe', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' },
      { table: 'Victim', row_id: 'V-1', case_id: 'CASE-001', name_as_recorded: 'John Doe', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ])
  ];

  var mockCat = createMockCatalyst(singlePMDoc, matchAccusedRaw, matchVictimRaw, []);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.existing_documents, 1);
  assert.strictEqual(result.stats.current_source_records, 2);
  assert.strictEqual(result.stats.changed_documents, 0);
  assert.strictEqual(result.stats.unchanged_documents, 1);
  assert.strictEqual(result.stats.new_records, 0);
  assert.strictEqual(result.stats.orphaned_records, 0);
  assert.strictEqual(result.changed_person_ids.length, 0);
  assert.strictEqual(result.unchanged_person_ids[0], 'PM_0001');
});

testAsync('handles pre-parsed source_records (array, not JSON string)', async function () {
  /*
   * Simulate the case where ZCQL returns source_records as an already-parsed array.
   * We won't go through the full Catalyst mock for this; we directly test the
   * detectChanges pipeline using a modified raw ZCQL format.
   */
  var flatDocRow = {};
  flatDocRow['PersonMaster'] = {
    person_id: 'PM_0101',
    type: 'PM',
    source_records: [
      { table: 'Accused', row_id: 'A-101', case_id: 'CASE-101', name_as_recorded: 'Alice', age_as_recorded: 28, date_of_offence: '2024-05-01', unit_id: 'UNIT-5', district_id: 'DIST-5' }
    ]
  };

  var matchAccusedRaw = [
    makeSourcerRawRow('Accused', 'AccusedMasterID', 101, 'CASE-101', 'Alice', 28, 2, '2024-05-01', 'UNIT-5', 'DIST-5')
  ];

  var mockCat = createMockCatalyst([flatDocRow], matchAccusedRaw, [], []);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.existing_documents, 1);
  assert.strictEqual(result.stats.current_source_records, 1);
  assert.strictEqual(result.stats.changed_documents, 0);
  assert.strictEqual(result.stats.unchanged_documents, 1);
});

testAsync('handles mixed case with some docs having no source_records', async function () {
  var emptySrRow = {};
  emptySrRow['PersonMaster'] = {
    person_id: 'PM_EMPTY',
    type: 'PM',
    source_records: null
  };

  var docsWithEmpty = pmDocsRaw.concat([emptySrRow]);

  var mockCat = createMockCatalyst(docsWithEmpty, accusedRawRows, victimRawRows, compRawRows);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  /* Document with no source_records is treated as unchanged */
  assert.strictEqual(result.stats.existing_documents, 4);
  assert.strictEqual(result.stats.unchanged_documents, 2); // PM_0001 + PM_EMPTY
  assert.strictEqual(result.stats.changed_documents, 2);  // PM_0002 + PM_0003
});

/* ------------------------------------------------------------------ */
/*  Summary                                                           */
/* ------------------------------------------------------------------ */

console.log('\n=== Summary ===');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);

if (failed > 0) {
  console.log('\nSome tests FAILED.');
  process.exit(1);
} else {
  console.log('\nAll tests PASSED.');
}
