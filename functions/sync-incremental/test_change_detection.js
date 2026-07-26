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
 * Build a mock Catalyst SDK that returns controlled data.
 * PersonMaster uses NoSQL; Accused/Victim/ComplainantDetails use ZCQL.
 */
function createMockCatalyst(personMasterRows, accusedRows, victimRows, compRows, failTables) {
  failTables = failTables || [];
  /* Convert ZCQL PersonMaster rows (PersonMaster alias) to NoSQL documents */
  var pmDocs = (personMasterRows || []).map(function (row) {
    var pmData = row['PersonMaster'] || row;
    var doc = {};
    Object.keys(pmData).forEach(function (k) {
      var val = pmData[k];
      if (k === 'source_records' && typeof val === 'string') {
        try { doc[k] = JSON.parse(val); } catch (e) { doc[k] = val; }
      } else {
        doc[k] = val;
      }
    });
    return doc;
  });

  return {
    initializeApp: function () {
      return {
        nosql: function () {
          return {
            getTable: function (tableName) {
              return Promise.resolve({
                queryTable: async function () {
                  var items = pmDocs.map(function (doc) {
                    return {
                      item: {
                        to: function () { return JSON.parse(JSON.stringify(doc)); }
                      }
                    };
                  });
                  return {
                    getResponseData: function () { return items; },
                    start_key: null
                  };
                }
              });
            }
          };
        },
        zcql: function () {
          return {
            executeZCQLQuery: async function (sql) {
              if (sql.indexOf('FROM Accused') !== -1) {
                if (failTables.indexOf('Accused') !== -1) throw new Error('Simulated failure: Accused');
                return accusedRows;
              }
              if (sql.indexOf('FROM Victim') !== -1) {
                if (failTables.indexOf('Victim') !== -1) throw new Error('Simulated failure: Victim');
                return victimRows;
              }
              if (sql.indexOf('FROM ComplainantDetails') !== -1) {
                if (failTables.indexOf('ComplainantDetails') !== -1) throw new Error('Simulated failure: ComplainantDetails');
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

/* ---- Comprehensive parseSourceRecords edge cases ---- */

test('native object array — returned as-is (Case A)', function () {
  var row = { source_records: [{ table: 'Accused', row_id: 'A-1' }, { table: 'Victim', row_id: 'V-1' }] };
  var result = syncInc.parseSourceRecords(row);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].table, 'Accused');
  assert.strictEqual(result[1].table, 'Victim');
});

test('whole field stringified JSON array (Case B)', function () {
  var row = { source_records: '[{"table":"Accused","row_id":"A-1"},{"table":"Victim","row_id":"V-1"}]' };
  var result = syncInc.parseSourceRecords(row);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].table, 'Accused');
  assert.strictEqual(result[1].table, 'Victim');
});

test('stringified elements within array (Case C)', function () {
  var row = { source_records: ['{"table":"Accused","row_id":"A-1"}', '{"table":"Victim","row_id":"V-1"}'] };
  var result = syncInc.parseSourceRecords(row);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].table, 'Accused');
  assert.strictEqual(result[1].table, 'Victim');
});

test('mixed object and string elements (Case D)', function () {
  var row = { source_records: [
    { table: 'Accused', row_id: 'A-1' },
    '{"table":"Victim","row_id":"V-1"}'
  ] };
  var result = syncInc.parseSourceRecords(row);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].table, 'Accused');
  assert.strictEqual(result[1].table, 'Victim');
});

test('malformed JSON element is silently dropped', function () {
  var row = { source_records: [
    { table: 'Accused', row_id: 'A-1' },
    'not valid json'
  ] };
  var result = syncInc.parseSourceRecords(row);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].table, 'Accused');
});

test('null element is silently dropped', function () {
  var row = { source_records: [
    { table: 'Accused', row_id: 'A-1' },
    null,
    { table: 'Victim', row_id: 'V-1' }
  ] };
  var result = syncInc.parseSourceRecords(row);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 2);
});

test('primitive element (number) is silently dropped', function () {
  var row = { source_records: [
    { table: 'Accused', row_id: 'A-1' },
    42,
    true
  ] };
  var result = syncInc.parseSourceRecords(row);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].table, 'Accused');
});

test('valid elements preserved when one malformed string in middle', function () {
  var row = { source_records: [
    '{"table":"Accused","row_id":"A-1"}',
    '{garbage}',
    '{"table":"Victim","row_id":"V-1"}'
  ] };
  var result = syncInc.parseSourceRecords(row);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].table, 'Accused');
  assert.strictEqual(result[1].table, 'Victim');
});

test('parsed Accused produces Accused:A-1 key via buildSourceRecordKey', function () {
  var row = { source_records: ['{"table":"Accused","source_id":"A-1","case_id":"CASE-001"}'] };
  var records = syncInc.parseSourceRecords(row);
  var key = syncInc.buildSourceRecordKey(records[0]);
  assert.strictEqual(key, 'Accused:A-1');
});

test('parsed Victim produces Victim:V-1 key via buildSourceRecordKey', function () {
  var row = { source_records: ['{"table":"Victim","source_id":"V-1","case_id":"CASE-001"}'] };
  var records = syncInc.parseSourceRecords(row);
  var key = syncInc.buildSourceRecordKey(records[0]);
  assert.strictEqual(key, 'Victim:V-1');
});

test('parsed ComplainantDetails produces ComplainantDetails:C-1 key via buildSourceRecordKey', function () {
  var row = { source_records: ['{"table":"ComplainantDetails","source_id":"C-1","case_id":"CASE-001"}'] };
  var records = syncInc.parseSourceRecords(row);
  var key = syncInc.buildSourceRecordKey(records[0]);
  assert.strictEqual(key, 'ComplainantDetails:C-1');
});

test('no regression for PM_000001 shape (native array of objects)', function () {
  var row = {
    source_records: [
      { table: 'Accused', row_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'John', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ]
  };
  var result = syncInc.parseSourceRecords(row);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].table, 'Accused');
  assert.strictEqual(result[0].name_as_recorded, 'John');
  assert.strictEqual(result[0].age_as_recorded, 30);
});

test('parseSourceRecords returns empty array for non-array JSON (object)', function () {
  var row = { source_records: '{"table":"Accused"}' };
  var result = syncInc.parseSourceRecords(row);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 0);
});

test('parseSourceRecords returns empty array for empty array', function () {
  var row = { source_records: [] };
  var result = syncInc.parseSourceRecords(row);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 0);
});

test('parseSourceRecords returns empty array for stringified empty array', function () {
  var row = { source_records: '[]' };
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
  var buildResult = syncInc.buildSourceToPersonIndex(docs);
  var idx = buildResult.index;
  assert.strictEqual(idx['Accused:A-1'], 'PM_0001');
  assert.strictEqual(idx['Victim:V-1'], 'PM_0001');
  assert.strictEqual(idx['Accused:A-2'], 'PM_0002');
  assert.strictEqual(idx['Accused:A-3'], undefined);
});

test('skips empty keys', function () {
  var docs = [
    { person_id: 'PM_0001', source_records: '[{"table":"","row_id":""}]' }
  ];
  var buildResult = syncInc.buildSourceToPersonIndex(docs);
  var idx = buildResult.index;
  assert.strictEqual(Object.keys(idx).length, 0);
});

test('handles empty docs array', function () {
  var buildResult = syncInc.buildSourceToPersonIndex([]);
  var idx = buildResult.index;
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

testAsync('empty source records — detection aborts with EMPTY_SOURCE_DATASET', async function () {
  var mockCat = createMockCatalyst(pmDocsRaw, [], [], []);
  var appInst = mockCat.initializeApp();

  try {
    await syncInc.detectChanges(appInst);
    assert.fail('should have thrown EMPTY_SOURCE_DATASET');
  } catch (e) {
    assert.ok(e.message.indexOf('EMPTY_SOURCE_DATASET') !== -1, 'must throw EMPTY_SOURCE_DATASET');
  }
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

console.log('\n=== Source Column Name Verification ===');

test('Accused SQL uses AccusedMasterID and AccusedName', function () {
  var sql = syncInc.buildSourceSQL({ table: 'Accused', idCol: 'AccusedMasterID', nameCol: 'AccusedName', prefix: 'A-' });
  assert.ok(sql.indexOf('AccusedMasterID') !== -1, 'SQL must contain AccusedMasterID');
  assert.ok(sql.indexOf('AccusedName') !== -1, 'SQL must contain AccusedName');
});

test('Victim SQL uses VictimMasterID and VictimName', function () {
  var sql = syncInc.buildSourceSQL({ table: 'Victim', idCol: 'VictimMasterID', nameCol: 'VictimName', prefix: 'V-' });
  assert.ok(sql.indexOf('VictimMasterID') !== -1, 'SQL must contain VictimMasterID');
  assert.ok(sql.indexOf('VictimName') !== -1, 'SQL must contain VictimName');
  assert.ok(sql.indexOf('AccusedMasterID') === -1, 'Victim SQL must NOT contain AccusedMasterID');
});

test('ComplainantDetails SQL uses ComplainantID and ComplainantName', function () {
  var sql = syncInc.buildSourceSQL({ table: 'ComplainantDetails', idCol: 'ComplainantID', nameCol: 'ComplainantName', prefix: 'C-' });
  assert.ok(sql.indexOf('ComplainantID') !== -1, 'SQL must contain ComplainantID');
  assert.ok(sql.indexOf('ComplainantName') !== -1, 'SQL must contain ComplainantName');
  assert.ok(sql.indexOf('AccusedMasterID') === -1, 'ComplainantDetails SQL must NOT contain AccusedMasterID');
  assert.ok(sql.indexOf('VictimMasterID') === -1, 'ComplainantDetails SQL must NOT contain VictimMasterID');
});

test('SOURCE_TABLES config has correct table definitions', function () {
  assert.strictEqual(syncInc.SOURCE_TABLES.length, 3, 'must have 3 source tables');
  var accused = syncInc.SOURCE_TABLES[0];
  assert.strictEqual(accused.table, 'Accused');
  assert.strictEqual(accused.idCol, 'AccusedMasterID');
  assert.strictEqual(accused.nameCol, 'AccusedName');
  assert.strictEqual(accused.prefix, 'A-');
  var victim = syncInc.SOURCE_TABLES[1];
  assert.strictEqual(victim.table, 'Victim');
  assert.strictEqual(victim.idCol, 'VictimMasterID');
  assert.strictEqual(victim.nameCol, 'VictimName');
  assert.strictEqual(victim.prefix, 'V-');
  var comp = syncInc.SOURCE_TABLES[2];
  assert.strictEqual(comp.table, 'ComplainantDetails');
  assert.strictEqual(comp.idCol, 'ComplainantID');
  assert.strictEqual(comp.nameCol, 'ComplainantName');
  assert.strictEqual(comp.prefix, 'C-');
});

console.log('\n=== Source Load Failure Safety Guards ===');

testAsync('Accused query failure throws SOURCE_LOAD_FAILED', async function () {
  var mockCat = createMockCatalyst([], [], [], [], ['Accused']);
  var appInst = mockCat.initializeApp();
  try {
    await syncInc.loadSourceRecords(appInst);
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e.message.indexOf('SOURCE_LOAD_FAILED') !== -1, 'error must contain SOURCE_LOAD_FAILED');
    assert.ok(e.message.indexOf('Accused') !== -1, 'error must mention Accused');
  }
});

testAsync('Victim query failure throws SOURCE_LOAD_FAILED', async function () {
  var mockCat = createMockCatalyst([], accusedRawRows, [], [], ['Victim']);
  var appInst = mockCat.initializeApp();
  try {
    await syncInc.loadSourceRecords(appInst);
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e.message.indexOf('SOURCE_LOAD_FAILED') !== -1, 'error must contain SOURCE_LOAD_FAILED');
    assert.ok(e.message.indexOf('Victim') !== -1, 'error must mention Victim');
  }
});

testAsync('ComplainantDetails query failure throws SOURCE_LOAD_FAILED', async function () {
  var mockCat = createMockCatalyst([], accusedRawRows, victimRawRows, [], ['ComplainantDetails']);
  var appInst = mockCat.initializeApp();
  try {
    await syncInc.loadSourceRecords(appInst);
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e.message.indexOf('SOURCE_LOAD_FAILED') !== -1, 'error must contain SOURCE_LOAD_FAILED');
    assert.ok(e.message.indexOf('ComplainantDetails') !== -1, 'error must mention ComplainantDetails');
  }
});

testAsync('All tables fail throws SOURCE_LOAD_FAILED with all three listed', async function () {
  var mockCat = createMockCatalyst([], [], [], [], ['Accused', 'Victim', 'ComplainantDetails']);
  var appInst = mockCat.initializeApp();
  try {
    await syncInc.loadSourceRecords(appInst);
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e.message.indexOf('SOURCE_LOAD_FAILED') !== -1);
    assert.ok(e.message.indexOf('Accused') !== -1);
    assert.ok(e.message.indexOf('Victim') !== -1);
    assert.ok(e.message.indexOf('ComplainantDetails') !== -1);
  }
});

testAsync('One success + two failures aborts with partial failure list', async function () {
  var mockCat = createMockCatalyst([], accusedRawRows, [], [], ['Victim', 'ComplainantDetails']);
  var appInst = mockCat.initializeApp();
  try {
    await syncInc.loadSourceRecords(appInst);
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e.message.indexOf('SOURCE_LOAD_FAILED') !== -1);
    assert.ok(e.message.indexOf('Victim') !== -1);
    assert.ok(e.message.indexOf('ComplainantDetails') !== -1);
  }
});

testAsync('All succeed but 0 records throws EMPTY_SOURCE_DATASET', async function () {
  var mockCat = createMockCatalyst([], [], [], []);
  var appInst = mockCat.initializeApp();
  try {
    await syncInc.loadSourceRecords(appInst);
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e.message.indexOf('EMPTY_SOURCE_DATASET') !== -1, 'error must contain EMPTY_SOURCE_DATASET');
  }
});

testAsync('detectChanges propagates SOURCE_LOAD_FAILED on Accused failure', async function () {
  var mockCat = createMockCatalyst(pmDocsRaw, [], victimRawRows, compRawRows, ['Accused']);
  var appInst = mockCat.initializeApp();
  try {
    await syncInc.detectChanges(appInst);
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e.message.indexOf('SOURCE_LOAD_FAILED') !== -1);
  }
});

testAsync('detectChanges propagates SOURCE_LOAD_FAILED on Victim failure', async function () {
  var mockCat = createMockCatalyst(pmDocsRaw, accusedRawRows, [], compRawRows, ['Victim']);
  var appInst = mockCat.initializeApp();
  try {
    await syncInc.detectChanges(appInst);
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e.message.indexOf('SOURCE_LOAD_FAILED') !== -1);
  }
});

testAsync('detectChanges propagates SOURCE_LOAD_FAILED on ComplainantDetails failure', async function () {
  var mockCat = createMockCatalyst(pmDocsRaw, accusedRawRows, victimRawRows, [], ['ComplainantDetails']);
  var appInst = mockCat.initializeApp();
  try {
    await syncInc.detectChanges(appInst);
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e.message.indexOf('SOURCE_LOAD_FAILED') !== -1);
  }
});

testAsync('detectChanges propagates EMPTY_SOURCE_DATASET when all tables return 0 records', async function () {
  var mockCat = createMockCatalyst(pmDocsRaw, [], [], []);
  var appInst = mockCat.initializeApp();
  try {
    await syncInc.detectChanges(appInst);
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e.message.indexOf('EMPTY_SOURCE_DATASET') !== -1);
  }
});

console.log('\n=== Source Record Identity Helpers ===');

test('getSourceRecordId — v0 record with only source_id', function () {
  var sr = { table: 'Accused', source_id: 'A-1' };
  assert.strictEqual(syncInc.getSourceRecordId(sr), 'A-1');
});

test('getSourceRecordId — newer record with only row_id', function () {
  var sr = { table: 'Accused', row_id: '4234901234' };
  assert.strictEqual(syncInc.getSourceRecordId(sr), '4234901234');
});

test('getSourceRecordId — record with both source_id and row_id, source_id wins', function () {
  var sr = { table: 'Accused', source_id: 'A-1', row_id: '47995000000331526' };
  assert.strictEqual(syncInc.getSourceRecordId(sr), 'A-1');
});

test('getSourceRecordId — missing both returns null', function () {
  var sr = { table: 'Accused' };
  assert.strictEqual(syncInc.getSourceRecordId(sr), null);
});

test('getSourceRecordId — empty strings treated as falsy, falls through', function () {
  var sr = { table: 'Accused', row_id: '', source_id: '' };
  assert.strictEqual(syncInc.getSourceRecordId(sr), null);
});

test('buildSourceRecordKey — Accused v0 record produces "Accused:A-1"', function () {
  var sr = { table: 'Accused', source_id: 'A-1', case_id: 'CASE-001' };
  assert.strictEqual(syncInc.buildSourceRecordKey(sr), 'Accused:A-1');
});

test('buildSourceRecordKey — Victim v0 record produces "Victim:V-1"', function () {
  var sr = { table: 'Victim', source_id: 'V-1', case_id: 'CASE-001' };
  assert.strictEqual(syncInc.buildSourceRecordKey(sr), 'Victim:V-1');
});

test('buildSourceRecordKey — ComplainantDetails v0 record produces "ComplainantDetails:C-1"', function () {
  var sr = { table: 'ComplainantDetails', source_id: 'C-1', case_id: 'CASE-001' };
  assert.strictEqual(syncInc.buildSourceRecordKey(sr), 'ComplainantDetails:C-1');
});

test('buildSourceRecordKey — malformed record (no table) returns null', function () {
  var sr = { source_id: 'A-1' };
  assert.strictEqual(syncInc.buildSourceRecordKey(sr), null);
});

test('buildSourceRecordKey — malformed record (no id) returns null', function () {
  var sr = { table: 'Accused' };
  assert.strictEqual(syncInc.buildSourceRecordKey(sr), null);
});

test('buildSourceRecordKey — record with source_table field works', function () {
  var sr = { source_table: 'Accused', source_id: 'A-1' };
  assert.strictEqual(syncInc.buildSourceRecordKey(sr), 'Accused:A-1');
});

test('buildSourceRecordKey — table wins over source_table when both present', function () {
  var sr = { table: 'Victim', source_table: 'Accused', source_id: 'V-1' };
  assert.strictEqual(syncInc.buildSourceRecordKey(sr), 'Victim:V-1');
});

console.log('\n=== buildSourceToPersonIndex — v0 Compatibility ===');

test('buildSourceToPersonIndex — indexes v0 records (source_id, no row_id)', function () {
  var docs = [
    { person_id: 'PM_V0_001', source_records: [{ table: 'Accused', source_id: 'A-1', case_id: 'CASE-001' }] },
    { person_id: 'PM_V0_002', source_records: [{ table: 'Victim', source_id: 'V-1', case_id: 'CASE-001' }] }
  ];
  var buildResult = syncInc.buildSourceToPersonIndex(docs);
  var idx = buildResult.index;
  assert.strictEqual(idx['Accused:A-1'], 'PM_V0_001');
  assert.strictEqual(idx['Victim:V-1'], 'PM_V0_002');
});

test('buildSourceToPersonIndex — indexes new records (row_id, no source_id)', function () {
  var docs = [
    { person_id: 'PM_NEW_001', source_records: [{ table: 'Accused', row_id: 'ROWID-1', case_id: 'CASE-001' }] }
  ];
  var buildResult = syncInc.buildSourceToPersonIndex(docs);
  var idx = buildResult.index;
  assert.strictEqual(idx['Accused:ROWID-1'], 'PM_NEW_001');
});

test('buildSourceToPersonIndex — skips malformed records (no table, no id)', function () {
  var docs = [
    { person_id: 'PM_BAD', source_records: [{ table: '', row_id: '' }, { table: 'Accused', row_id: 'A-1' }] }
  ];
  var buildResult = syncInc.buildSourceToPersonIndex(docs);
  var idx = buildResult.index;
  assert.strictEqual(Object.keys(idx).length, 1);
  assert.strictEqual(idx['Accused:A-1'], 'PM_BAD');
});

test('buildSourceToPersonIndex — mixed v0 and new records', function () {
  var docs = [
    { person_id: 'PM_V0', source_records: [{ table: 'Accused', source_id: 'A-1' }] },
    { person_id: 'PM_NEW', source_records: [{ table: 'Victim', row_id: 'V-1' }] },
    { person_id: 'PM_BOTH', source_records: [{ table: 'ComplainantDetails', row_id: 'R-C1', source_id: 'C-1' }] }
  ];
  var buildResult = syncInc.buildSourceToPersonIndex(docs);
  var idx = buildResult.index;
  assert.strictEqual(idx['Accused:A-1'], 'PM_V0');
  assert.strictEqual(idx['Victim:V-1'], 'PM_NEW');
  assert.strictEqual(idx['ComplainantDetails:C-1'], 'PM_BOTH');
});

console.log('\n=== detectChanges — v0 Compatibility Integration ===');

testAsync('detectChanges with v0 PersonMaster records (source_id, no row_id)', async function () {
  /*
   * Simulate v0 PersonMaster documents that have source_id but NOT row_id.
   * Current records from Data Store have source_id = prefix + ROWID.
   * The key must match: "Accused:A-1" === "Accused:A-1"
   */
  var v0pmDocs = [
    makePMRawRow('PM_V0_001', [
      { table: 'Accused', source_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'John Doe', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ])
  ];

  var matchAccused = [
    makeSourcerRawRow('Accused', 'AccusedMasterID', 1, 'CASE-001', 'John Doe', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var mockCat = createMockCatalyst(v0pmDocs, matchAccused, [], []);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.existing_documents, 1);
  assert.strictEqual(result.stats.current_source_records, 1);
  assert.strictEqual(result.stats.changed_documents, 0, 'v0 record should match current record');
  assert.strictEqual(result.stats.unchanged_documents, 1);
  assert.strictEqual(result.stats.new_records, 0);
  assert.strictEqual(result.stats.orphaned_records, 0);
});

testAsync('detectChanges with mixed v0/new PersonMaster records', async function () {
  var mixedPMDocs = [
    makePMRawRow('PM_V0', [
      { table: 'Accused', source_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'John Doe', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ]),
    makePMRawRow('PM_NEW', [
      { table: 'Victim', row_id: 'V-1', case_id: 'CASE-001', name_as_recorded: 'John Doe', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ])
  ];

  var matchAccused = [
    makeSourcerRawRow('Accused', 'AccusedMasterID', 1, 'CASE-001', 'John Doe', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];
  var matchVictim = [
    makeSourcerRawRow('Victim', 'VictimMasterID', 1, 'CASE-001', 'John Doe', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var mockCat = createMockCatalyst(mixedPMDocs, matchAccused, matchVictim, []);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.existing_documents, 2);
  assert.strictEqual(result.stats.current_source_records, 2);
  assert.strictEqual(result.stats.changed_documents, 0, 'both v0 and new records should match');
  assert.strictEqual(result.stats.unchanged_documents, 2);
  assert.strictEqual(result.stats.new_records, 0);
  assert.strictEqual(result.stats.orphaned_records, 0);
});

testAsync('detectChanges — v0 orphan detection works', async function () {
  /*
   * v0 PM doc has A-1 in source_records (source_id, no row_id).
   * Current source records don't have A-1 → should be orphaned.
   */
  var v0pmDocs = [
    makePMRawRow('PM_V0_ORPHAN', [
      { table: 'Accused', source_id: 'A-99', case_id: 'CASE-099', name_as_recorded: 'Orphan Person', age_as_recorded: 40, date_of_offence: '2024-09-01', unit_id: 'UNIT-9', district_id: 'DIST-9' }
    ])
  ];

  var matchAccused = [
    makeSourcerRawRow('Accused', 'AccusedMasterID', 1, 'CASE-001', 'John Doe', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var mockCat = createMockCatalyst(v0pmDocs, matchAccused, [], []);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.orphaned_records, 1);
  assert.strictEqual(result.orphaned_records[0].source_id, 'A-99');
  assert.strictEqual(result.orphaned_records[0].person_id, 'PM_V0_ORPHAN');
});

testAsync('detectChanges — v0 record data change detected', async function () {
  /*
   * v0 PM doc has A-1 with name 'John Doe', but current record has name 'John Changed'
   * → should be detected as changed.
   */
  var v0pmDocs = [
    makePMRawRow('PM_V0_CHANGED', [
      { table: 'Accused', source_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'John Doe', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ])
  ];

  var matchAccused = [
    makeSourcerRawRow('Accused', 'AccusedMasterID', 1, 'CASE-001', 'John Changed', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var mockCat = createMockCatalyst(v0pmDocs, matchAccused, [], []);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.changed_documents, 1);
  assert.strictEqual(result.changed_person_ids[0], 'PM_V0_CHANGED');
});

testAsync('existing tests still pass with the same test data', async function () {
  /*
   * Re-run the original integration test to ensure no regressions.
   */
  var mockCat = createMockCatalyst(pmDocsRaw, accusedRawRows, victimRawRows, compRawRows);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.existing_documents, 3);
  assert.strictEqual(result.stats.current_source_records, 4);
  assert.strictEqual(result.stats.changed_documents, 2);
  assert.strictEqual(result.stats.unchanged_documents, 1);
  assert.strictEqual(result.stats.new_records, 1);
  assert.strictEqual(result.stats.orphaned_records, 1);
  assert.ok(result.changed_person_ids.indexOf('PM_0002') !== -1);
  assert.ok(result.changed_person_ids.indexOf('PM_0003') !== -1);
  assert.ok(result.unchanged_person_ids.indexOf('PM_0001') !== -1);
});

testAsync('Source failure means zero orphan classification (detection aborts before orphan check)', async function () {
  var mockCat = createMockCatalyst(pmDocsRaw, [], [], [], ['Victim', 'ComplainantDetails']);
  var appInst = mockCat.initializeApp();
  try {
    await syncInc.detectChanges(appInst);
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e.message.indexOf('SOURCE_LOAD_FAILED') !== -1);
    /* Detection aborted — no orphan analysis should have occurred.
       We verify by checking that the error was thrown, meaning the
       function never reached the orphan-checking logic. */
  }
});

console.log('\n=== Identity Diagnostics ===');

test('detectChanges includes identity_diagnostics', function () {
  /* We can't easily call detectChanges synchronously, but we can verify
     the structure is added in the detectChanges result via an async test below */
  assert.ok(typeof syncInc.detectChanges === 'function');
});

testAsync('identity_diagnostics has expected keys', async function () {
  var mockCat = createMockCatalyst(pmDocsRaw, accusedRawRows, victimRawRows, compRawRows);
  var appInst = mockCat.initializeApp();
  var result = await syncInc.detectChanges(appInst);

  assert.ok(result.identity_diagnostics, 'identity_diagnostics must be present');
  var diag = result.identity_diagnostics;
  assert.ok(typeof diag.current_total === 'number', 'current_total must be number');
  assert.ok(typeof diag.current_with_source_id === 'number', 'current_with_source_id must be number');
  assert.ok(typeof diag.current_missing_source_id === 'number', 'current_missing_source_id must be number');
  assert.ok(typeof diag.existing_indexed_keys === 'number', 'existing_indexed_keys must be number');
  assert.ok(Array.isArray(diag.current_sample_keys), 'current_sample_keys must be array');
  assert.ok(Array.isArray(diag.existing_sample_keys), 'existing_sample_keys must be array');
  assert.strictEqual(diag.current_with_source_id, 4, 'all 4 records have source_id');
  assert.strictEqual(diag.current_missing_source_id, 0, 'none missing source_id');
  assert.strictEqual(diag.existing_indexed_keys, 4, '4 existing source-to-person mappings');
  /* ---- New fields ---- */
  assert.strictEqual(diag.current_with_logical_source_id, 4, 'current_with_logical_source_id');
  assert.strictEqual(diag.current_missing_logical_source_id, 0, 'current_missing_logical_source_id');
  assert.strictEqual(diag.existing_with_source_id, 4, 'existing_with_source_id = all 4 PM records have valid source_id');
  assert.strictEqual(diag.existing_missing_source_id, 0, 'existing_missing_source_id = 0 malformed');
  assert.strictEqual(typeof diag.source_record_elements_total, 'number', 'source_record_elements_total is number');
  assert.strictEqual(typeof diag.source_record_elements_objects, 'number', 'source_record_elements_objects is number');
  assert.strictEqual(typeof diag.source_record_elements_stringified, 'number', 'source_record_elements_stringified is number');
  assert.strictEqual(typeof diag.source_record_elements_parsed, 'number', 'source_record_elements_parsed is number');
  assert.strictEqual(typeof diag.source_record_elements_malformed, 'number', 'source_record_elements_malformed is number');
  assert.strictEqual(typeof diag.source_record_keys_indexed, 'number', 'source_record_keys_indexed is number');
  assert.strictEqual(typeof diag.source_record_keys_missing_identity, 'number', 'source_record_keys_missing_identity is number');
  assert.strictEqual(diag.source_record_keys_indexed, 4, '4 source record keys indexed');
  assert.strictEqual(diag.source_record_keys_missing_identity, 0, '0 source records missing identity');
  /* ---- New missing_identity diagnostics ---- */
  assert.ok(diag.missing_identity, 'missing_identity must be present');
  assert.strictEqual(typeof diag.missing_identity.total_failed, 'number', 'missing_identity.total_failed is number');
  assert.strictEqual(typeof diag.missing_identity.missing_table, 'number', 'missing_identity.missing_table is number');
  assert.strictEqual(typeof diag.missing_identity.missing_source_id, 'number', 'missing_identity.missing_source_id is number');
  assert.strictEqual(typeof diag.missing_identity.missing_both, 'number', 'missing_identity.missing_both is number');
  assert.strictEqual(typeof diag.missing_identity.has_role_no_table, 'number', 'missing_identity.has_role_no_table is number');
  assert.strictEqual(typeof diag.missing_identity.unknown_role, 'number', 'missing_identity.unknown_role is number');
  assert.ok(Array.isArray(diag.missing_identity.samples), 'missing_identity.samples is array');
  assert.strictEqual(diag.missing_identity.total_failed, 0, '0 missing identity failures');
  assert.strictEqual(typeof diag.existing_valid_identity_records, 'number', 'existing_valid_identity_records is number');
  assert.strictEqual(typeof diag.existing_unique_identity_keys, 'number', 'existing_unique_identity_keys is number');
  assert.strictEqual(typeof diag.existing_duplicate_identity_keys, 'number', 'existing_duplicate_identity_keys is number');
  assert.strictEqual(diag.existing_valid_identity_records, 4, '4 valid identity records');
  assert.strictEqual(diag.existing_unique_identity_keys, 4, '4 unique identity keys');
  assert.strictEqual(diag.existing_duplicate_identity_keys, 0, '0 duplicate identity keys');
});

console.log('\n=== v0 Victim Compatibility ===');

testAsync('v0 Victim record matches current Data Store record', async function () {
  var v0pmDocs = [
    makePMRawRow('PM_V0_VIC', [
      { table: 'Victim', source_id: 'V-1', case_id: 'CASE-001', name_as_recorded: 'Alice Victim', age_as_recorded: 28, date_of_offence: '2024-05-01', unit_id: 'UNIT-5', district_id: 'DIST-5' }
    ])
  ];

  var matchVictim = [
    makeSourcerRawRow('Victim', 'VictimMasterID', 1, 'CASE-001', 'Alice Victim', 28, 2, '2024-05-01', 'UNIT-5', 'DIST-5')
  ];

  var mockCat = createMockCatalyst(v0pmDocs, [], matchVictim, []);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.existing_documents, 1);
  assert.strictEqual(result.stats.current_source_records, 1);
  assert.strictEqual(result.stats.changed_documents, 0, 'v0 Victim should match');
  assert.strictEqual(result.stats.unchanged_documents, 1);
  assert.strictEqual(result.stats.new_records, 0);
  assert.strictEqual(result.stats.orphaned_records, 0);
});

testAsync('v0 Victim changed content detected', async function () {
  var v0pmDocs = [
    makePMRawRow('PM_V0_VIC_CHG', [
      { table: 'Victim', source_id: 'V-1', case_id: 'CASE-001', name_as_recorded: 'Old Name', age_as_recorded: 28, date_of_offence: '2024-05-01', unit_id: 'UNIT-5', district_id: 'DIST-5' }
    ])
  ];

  var matchVictim = [
    makeSourcerRawRow('Victim', 'VictimMasterID', 1, 'CASE-001', 'New Name', 28, 2, '2024-05-01', 'UNIT-5', 'DIST-5')
  ];

  var mockCat = createMockCatalyst(v0pmDocs, [], matchVictim, []);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.changed_documents, 1, 'changed Victim name must be detected');
});

testAsync('v0 Victim orphan detection', async function () {
  var v0pmDocs = [
    makePMRawRow('PM_V0_VIC_ORPH', [
      { table: 'Victim', source_id: 'V-99', case_id: 'CASE-099', name_as_recorded: 'Orphan Vic', age_as_recorded: 35, date_of_offence: '2024-09-01', unit_id: 'UNIT-9', district_id: 'DIST-9' }
    ])
  ];

  var matchVictim = [
    makeSourcerRawRow('Victim', 'VictimMasterID', 1, 'CASE-001', 'Alice Victim', 28, 2, '2024-05-01', 'UNIT-5', 'DIST-5')
  ];

  var mockCat = createMockCatalyst(v0pmDocs, [], matchVictim, []);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.orphaned_records, 1, 'v0 Victim orphan must be detected');
  assert.strictEqual(result.orphaned_records[0].source_id, 'V-99');
});

console.log('\n=== v0 ComplainantDetails Compatibility ===');

testAsync('v0 ComplainantDetails record matches current Data Store record', async function () {
  var v0pmDocs = [
    makePMRawRow('PM_V0_COMP', [
      { table: 'ComplainantDetails', source_id: 'C-1', case_id: 'CASE-001', name_as_recorded: 'Charlie Complainant', age_as_recorded: 45, date_of_offence: '2024-05-01', unit_id: 'UNIT-5', district_id: 'DIST-5' }
    ])
  ];

  var matchComp = [
    makeSourcerRawRow('ComplainantDetails', 'ComplainantID', 1, 'CASE-001', 'Charlie Complainant', 45, 1, '2024-05-01', 'UNIT-5', 'DIST-5')
  ];

  var mockCat = createMockCatalyst(v0pmDocs, [], [], matchComp);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.existing_documents, 1);
  assert.strictEqual(result.stats.current_source_records, 1);
  assert.strictEqual(result.stats.changed_documents, 0, 'v0 ComplainantDetails should match');
  assert.strictEqual(result.stats.unchanged_documents, 1);
  assert.strictEqual(result.stats.new_records, 0);
  assert.strictEqual(result.stats.orphaned_records, 0);
});

testAsync('v0 ComplainantDetails changed content detected', async function () {
  var v0pmDocs = [
    makePMRawRow('PM_V0_COMP_CHG', [
      { table: 'ComplainantDetails', source_id: 'C-1', case_id: 'CASE-001', name_as_recorded: 'Old Complainant', age_as_recorded: 45, date_of_offence: '2024-05-01', unit_id: 'UNIT-5', district_id: 'DIST-5' }
    ])
  ];

  var matchComp = [
    makeSourcerRawRow('ComplainantDetails', 'ComplainantID', 1, 'CASE-001', 'New Complainant', 45, 1, '2024-05-01', 'UNIT-5', 'DIST-5')
  ];

  var mockCat = createMockCatalyst(v0pmDocs, [], [], matchComp);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.changed_documents, 1, 'changed ComplainantDetails name must be detected');
});

testAsync('v0 ComplainantDetails orphan detection', async function () {
  var v0pmDocs = [
    makePMRawRow('PM_V0_COMP_ORPH', [
      { table: 'ComplainantDetails', source_id: 'C-99', case_id: 'CASE-099', name_as_recorded: 'Orphan Comp', age_as_recorded: 50, date_of_offence: '2024-09-01', unit_id: 'UNIT-9', district_id: 'DIST-9' }
    ])
  ];

  var matchComp = [
    makeSourcerRawRow('ComplainantDetails', 'ComplainantID', 1, 'CASE-001', 'Charlie Complainant', 45, 1, '2024-05-01', 'UNIT-5', 'DIST-5')
  ];

  var mockCat = createMockCatalyst(v0pmDocs, [], [], matchComp);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.orphaned_records, 1, 'v0 ComplainantDetails orphan must be detected');
  assert.strictEqual(result.orphaned_records[0].source_id, 'C-99');
});

console.log('\n=== All Three Tables v0 Simultaneous Match ===');

testAsync('all three tables v0 records match simultaneously', async function () {
  var multiVmPMDocs = [
    makePMRawRow('PM_V0_MULTI', [
      { table: 'Accused', source_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'John Doe', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' },
      { table: 'Victim', source_id: 'V-1', case_id: 'CASE-001', name_as_recorded: 'Jane Victim', age_as_recorded: 28, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' },
      { table: 'ComplainantDetails', source_id: 'C-1', case_id: 'CASE-001', name_as_recorded: 'Charlie Comp', age_as_recorded: 45, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ])
  ];

  var multiAccused = [
    makeSourcerRawRow('Accused', 'AccusedMasterID', 1, 'CASE-001', 'John Doe', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];
  var multiVictim = [
    makeSourcerRawRow('Victim', 'VictimMasterID', 1, 'CASE-001', 'Jane Victim', 28, 2, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];
  var multiComp = [
    makeSourcerRawRow('ComplainantDetails', 'ComplainantID', 1, 'CASE-001', 'Charlie Comp', 45, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var mockCat = createMockCatalyst(multiVmPMDocs, multiAccused, multiVictim, multiComp);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.existing_documents, 1);
  assert.strictEqual(result.stats.current_source_records, 3);
  assert.strictEqual(result.stats.changed_documents, 0, 'all three v0 records should match');
  assert.strictEqual(result.stats.unchanged_documents, 1);
  assert.strictEqual(result.stats.new_records, 0);
  assert.strictEqual(result.stats.orphaned_records, 0);
});

console.log('\n=== v0 source_id matching with ROWID in stored record ===');

testAsync('source_id wins when stored record has ROWID as row_id', async function () {
  /*
   * Simulate a PersonMaster record where row_id is a Catalyst ROWID
   * (e.g., "47995000000331526") and source_id is the logical ID ("A-1").
   * getSourceRecordId must prefer source_id so the key becomes "Accused:A-1"
   * matching the current record's key.
   */
  var rowidPmDocs = [
    makePMRawRow('PM_ROWID_MATCH', [
      { table: 'Accused', source_id: 'A-1', row_id: '47995000000331526', case_id: 'CASE-001', name_as_recorded: 'John Doe', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ])
  ];

  var matchAccused = [
    makeSourcerRawRow('Accused', 'AccusedMasterID', 1, 'CASE-001', 'John Doe', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')
  ];

  var mockCat = createMockCatalyst(rowidPmDocs, matchAccused, [], []);
  var appInst = mockCat.initializeApp();

  var result = await syncInc.detectChanges(appInst);

  assert.strictEqual(result.stats.changed_documents, 0, 'source_id must win over ROWID in stored record');
  assert.strictEqual(result.stats.unchanged_documents, 1);
  assert.strictEqual(result.stats.new_records, 0, 'ROWID record must not be classified as new');
  assert.strictEqual(result.stats.orphaned_records, 0);
});

console.log('\n=== Key Format Consistency ===');

test('buildSourceRecordKey and buildCurrentRecordsIndex produce same key format', function () {
  /* Existing-side key: buildSourceRecordKey({ table, source_id }) */
  var existingKey = syncInc.buildSourceRecordKey({ table: 'Accused', source_id: 'A-1' });
  assert.strictEqual(existingKey, 'Accused:A-1');

  /* Current-side key: source_table + ':' + source_id */
  var currentKey = 'Accused:' + 'A-1';
  assert.strictEqual(currentKey, 'Accused:A-1');

  /* Both match */
  assert.strictEqual(existingKey, currentKey);

  /* v0 Victim */
  var vicExistingKey = syncInc.buildSourceRecordKey({ table: 'Victim', source_id: 'V-1' });
  var vicCurrentKey = 'Victim:V-1';
  assert.strictEqual(vicExistingKey, vicCurrentKey);

  /* v0 ComplainantDetails */
  var compExistingKey = syncInc.buildSourceRecordKey({ table: 'ComplainantDetails', source_id: 'C-1' });
  var compCurrentKey = 'ComplainantDetails:C-1';
  assert.strictEqual(compExistingKey, compCurrentKey);
});

console.log('\n=== getSourceRecordTable ===');

test('returns table when present', function () {
  assert.strictEqual(syncInc.getSourceRecordTable({ table: 'Accused' }), 'Accused');
});

test('returns source_table when table absent', function () {
  assert.strictEqual(syncInc.getSourceRecordTable({ source_table: 'Victim' }), 'Victim');
});

test('maps role Accused to Accused', function () {
  assert.strictEqual(syncInc.getSourceRecordTable({ role: 'Accused' }), 'Accused');
});

test('maps role Victim to Victim', function () {
  assert.strictEqual(syncInc.getSourceRecordTable({ role: 'Victim' }), 'Victim');
});

test('maps role Complainant to ComplainantDetails', function () {
  assert.strictEqual(syncInc.getSourceRecordTable({ role: 'Complainant' }), 'ComplainantDetails');
});

test('returns null for unknown role', function () {
  assert.strictEqual(syncInc.getSourceRecordTable({ role: 'Unknown' }), null);
});

test('returns null when nothing present', function () {
  assert.strictEqual(syncInc.getSourceRecordTable({}), null);
});

test('table has priority over source_table', function () {
  assert.strictEqual(syncInc.getSourceRecordTable({ table: 'Accused', source_table: 'Victim' }), 'Accused');
});

test('source_table has priority over role', function () {
  assert.strictEqual(syncInc.getSourceRecordTable({ source_table: 'Victim', role: 'Accused' }), 'Victim');
});

console.log('\n=== buildSourceRecordKey with role fallback ===');

test('{role:"Accused", source_id:"A-1"} => "Accused:A-1"', function () {
  assert.strictEqual(syncInc.buildSourceRecordKey({ role: 'Accused', source_id: 'A-1' }), 'Accused:A-1');
});

test('{role:"Victim", source_id:"V-1"} => "Victim:V-1"', function () {
  assert.strictEqual(syncInc.buildSourceRecordKey({ role: 'Victim', source_id: 'V-1' }), 'Victim:V-1');
});

test('{role:"Complainant", source_id:"C-1"} => "ComplainantDetails:C-1"', function () {
  assert.strictEqual(syncInc.buildSourceRecordKey({ role: 'Complainant', source_id: 'C-1' }), 'ComplainantDetails:C-1');
});

test('{table:"Victim", source_id:"V-1"} => "Victim:V-1" (table wins)', function () {
  assert.strictEqual(syncInc.buildSourceRecordKey({ table: 'Victim', source_id: 'V-1' }), 'Victim:V-1');
});

test('{role:"Unknown", source_id:"X-1"} => null (unknown role)', function () {
  assert.strictEqual(syncInc.buildSourceRecordKey({ role: 'Unknown', source_id: 'X-1' }), null);
});

test('empty object => null', function () {
  assert.strictEqual(syncInc.buildSourceRecordKey({}), null);
});

console.log('\n=== buildSourceToPersonIndex diagnostics ===');

test('reports missing_table for record without table/source_table/role', function () {
  var docs = [
    { person_id: 'PM_1', source_records: [{ source_id: 'A-1' }] },
    { person_id: 'PM_2', source_records: [{ table: 'Accused', source_id: 'A-2' }] }
  ];
  var result = syncInc.buildSourceToPersonIndex(docs);
  assert.strictEqual(result.diagnostics.total_failed, 1);
  assert.strictEqual(result.diagnostics.missing_table, 1);
  assert.strictEqual(result.diagnostics.valid_records, 1);
});

test('reports has_role_no_table for record with role but no table', function () {
  var docs = [
    { person_id: 'PM_1', source_records: [{ role: 'Accused', source_id: 'A-1' }] }
  ];
  var result = syncInc.buildSourceToPersonIndex(docs);
  assert.strictEqual(result.diagnostics.total_failed, 0, 'role Accused maps to Accused table');
  assert.strictEqual(result.diagnostics.has_role_no_table, 0);
  assert.strictEqual(result.diagnostics.valid_records, 1);
  assert.strictEqual(Object.keys(result.index).length, 1);
  assert.strictEqual(result.index['Accused:A-1'], 'PM_1');
});

test('reports unknown_role for unmapped role string', function () {
  var docs = [
    { person_id: 'PM_1', source_records: [{ role: 'Witness', source_id: 'W-1' }] }
  ];
  var result = syncInc.buildSourceToPersonIndex(docs);
  assert.strictEqual(result.diagnostics.total_failed, 1);
  assert.strictEqual(result.diagnostics.unknown_role, 1);
  assert.strictEqual(result.diagnostics.has_role_no_table, 0);
  assert.strictEqual(result.diagnostics.valid_records, 0);
});

test('reports duplicate_keys when same key appears in multiple docs', function () {
  var docs = [
    { person_id: 'PM_1', source_records: [{ table: 'Accused', source_id: 'A-1' }] },
    { person_id: 'PM_2', source_records: [{ table: 'Accused', source_id: 'A-1' }] }
  ];
  var result = syncInc.buildSourceToPersonIndex(docs);
  assert.strictEqual(result.diagnostics.duplicate_keys, 1);
  assert.strictEqual(result.diagnostics.unique_keys, 1);
  assert.strictEqual(result.diagnostics.valid_records, 2);
  assert.strictEqual(result.index['Accused:A-1'], 'PM_1');
});

test('reports unique_keys correctly', function () {
  var docs = [
    { person_id: 'PM_1', source_records: [{ table: 'Accused', source_id: 'A-1' }, { table: 'Victim', source_id: 'V-1' }] },
    { person_id: 'PM_2', source_records: [{ table: 'Accused', source_id: 'A-2' }] }
  ];
  var result = syncInc.buildSourceToPersonIndex(docs);
  assert.strictEqual(result.diagnostics.unique_keys, 3);
  assert.strictEqual(result.diagnostics.duplicate_keys, 0);
});

test('reports valid_records correctly', function () {
  var docs = [
    { person_id: 'PM_1', source_records: [{ table: 'Accused', source_id: 'A-1' }, { table: 'Victim', source_id: 'V-1' }] }
  ];
  var result = syncInc.buildSourceToPersonIndex(docs);
  assert.strictEqual(result.diagnostics.valid_records, 2);
  assert.strictEqual(result.diagnostics.total_failed, 0);
});

test('missing_both counts records with no table and no source_id', function () {
  var docs = [
    { person_id: 'PM_1', source_records: [{ name_as_recorded: 'John' }] }
  ];
  var result = syncInc.buildSourceToPersonIndex(docs);
  assert.strictEqual(result.diagnostics.total_failed, 1);
  assert.strictEqual(result.diagnostics.missing_both, 1);
  assert.strictEqual(result.diagnostics.missing_table, 1);
  assert.strictEqual(result.diagnostics.missing_source_id, 1);
});

/* ------------------------------------------------------------------ */
/*  Duplicate Ownership Diagnostics                                    */
/* ------------------------------------------------------------------ */

console.log('\n=== Duplicate Ownership Diagnostics ===');

test('same-person duplicates — same key twice within one doc', function () {
  var docs = [
    { person_id: 'PM_1', source_records: [
      { table: 'Accused', source_id: 'A-1' },
      { table: 'Accused', source_id: 'A-1' }
    ]}
  ];
  var result = syncInc.buildSourceToPersonIndex(docs);
  var d = result.diagnostics;
  assert.strictEqual(d.valid_records, 2);
  assert.strictEqual(d.unique_keys, 1);
  assert.strictEqual(d.duplicate_keys, 1);
  assert.strictEqual(d.duplicate_references, 1);
  assert.strictEqual(d.same_person_duplicates, 1);
  assert.strictEqual(d.cross_person_keys, 0);
  assert.strictEqual(d.cross_person_duplicates, 0);
  assert.strictEqual(d.max_persons_per_key, 1);
  assert.strictEqual(d.dup_key_count, 1);
  assert.strictEqual(d.ownership_distribution.single_person_keys, 1);
  assert.strictEqual(d.ownership_distribution.two_person_keys, 0);
  assert.strictEqual(d.ownership_distribution.multi_person_keys, 0);
  assert.strictEqual(d.dup_samples.length, 1);
  assert.strictEqual(d.dup_samples[0].persons_per_key, 1);
});

test('cross-person duplicates — same key in two different docs', function () {
  var docs = [
    { person_id: 'PM_1', source_records: [{ table: 'Accused', source_id: 'A-1' }] },
    { person_id: 'PM_2', source_records: [{ table: 'Accused', source_id: 'A-1' }] }
  ];
  var result = syncInc.buildSourceToPersonIndex(docs);
  var d = result.diagnostics;
  assert.strictEqual(d.valid_records, 2);
  assert.strictEqual(d.unique_keys, 1);
  assert.strictEqual(d.duplicate_keys, 1);
  assert.strictEqual(d.same_person_duplicates, 0);
  assert.strictEqual(d.cross_person_keys, 1);
  assert.strictEqual(d.cross_person_duplicates, 2);
  assert.strictEqual(d.max_persons_per_key, 2);
  assert.strictEqual(d.dup_key_count, 1);
  assert.strictEqual(d.ownership_distribution.single_person_keys, 0);
  assert.strictEqual(d.ownership_distribution.two_person_keys, 1);
  assert.strictEqual(d.ownership_distribution.multi_person_keys, 0);
  assert.strictEqual(d.dup_samples.length, 1);
  assert.strictEqual(d.dup_samples[0].source_key, 'Accused:A-1');
  assert.deepStrictEqual(d.dup_samples[0].person_ids, ['PM_1', 'PM_2']);
});

test('mixed: same-person + cross-person duplicates', function () {
  var docs = [
    { person_id: 'PM_1', source_records: [
      { table: 'Accused', source_id: 'A-1' },
      { table: 'Accused', source_id: 'A-1' }
    ]},
    { person_id: 'PM_2', source_records: [{ table: 'Accused', source_id: 'A-1' }]}
  ];
  var result = syncInc.buildSourceToPersonIndex(docs);
  var d = result.diagnostics;
  assert.strictEqual(d.valid_records, 3);
  assert.strictEqual(d.unique_keys, 1);
  assert.strictEqual(d.duplicate_keys, 2);
  assert.strictEqual(d.duplicate_references, 2);
  assert.strictEqual(d.same_person_duplicates, 1);
  assert.strictEqual(d.cross_person_keys, 1);
  assert.strictEqual(d.cross_person_duplicates, 3);
  assert.strictEqual(d.max_persons_per_key, 2);
  assert.strictEqual(d.dup_key_count, 1);
});

test('ownership distribution with multiple keys', function () {
  var docs = [
    { person_id: 'PM_1', source_records: [{ table: 'Accused', source_id: 'A-1' }] },
    { person_id: 'PM_2', source_records: [{ table: 'Accused', source_id: 'A-1' }] },
    { person_id: 'PM_3', source_records: [{ table: 'Accused', source_id: 'A-1' }] },
    { person_id: 'PM_1', source_records: [{ table: 'Victim', source_id: 'V-1' }] },
    { person_id: 'PM_2', source_records: [{ table: 'Victim', source_id: 'V-1' }] },
    { person_id: 'PM_4', source_records: [{ table: 'Accused', source_id: 'A-2' }] }
  ];
  var result = syncInc.buildSourceToPersonIndex(docs);
  var d = result.diagnostics;
  assert.strictEqual(d.unique_keys, 3);
  assert.strictEqual(d.dup_key_count, 2);
  assert.strictEqual(d.max_persons_per_key, 3);
  assert.strictEqual(d.ownership_distribution.single_person_keys, 1);
  assert.strictEqual(d.ownership_distribution.two_person_keys, 1);
  assert.strictEqual(d.ownership_distribution.multi_person_keys, 1);
});

test('no duplicates — ownership fields reflect clean data', function () {
  var docs = [
    { person_id: 'PM_1', source_records: [{ table: 'Accused', source_id: 'A-1' }] },
    { person_id: 'PM_2', source_records: [{ table: 'Victim', source_id: 'V-1' }] }
  ];
  var result = syncInc.buildSourceToPersonIndex(docs);
  var d = result.diagnostics;
  assert.strictEqual(d.unique_keys, 2);
  assert.strictEqual(d.duplicate_keys, 0);
  assert.strictEqual(d.duplicate_references, 0);
  assert.strictEqual(d.same_person_duplicates, 0);
  assert.strictEqual(d.cross_person_keys, 0);
  assert.strictEqual(d.cross_person_duplicates, 0);
  assert.strictEqual(d.max_persons_per_key, 1);
  assert.strictEqual(d.dup_key_count, 0);
  assert.strictEqual(d.ownership_distribution.single_person_keys, 2);
  assert.strictEqual(d.dup_samples.length, 0);
});

test('samples limited to 10 entries', function () {
  var docs = [];
  for (var pi = 0; pi < 15; pi++) {
    docs.push({
      person_id: 'PM_' + String(pi + 1),
      source_records: [{ table: 'Accused', source_id: 'A-' + String(pi + 1) }]
    });
    docs.push({
      person_id: 'PM_OTHER_' + String(pi + 1),
      source_records: [{ table: 'Accused', source_id: 'A-' + String(pi + 1) }]
    });
  }
  var result = syncInc.buildSourceToPersonIndex(docs);
  assert.strictEqual(result.diagnostics.dup_samples.length, 10);
});

console.log('\n=== Identity Diagnostics — New Sections ===');

testAsync('identity_diagnostics has new duplicate_ownership, current_side, set_arithmetic', async function () {
  var mockCat = createMockCatalyst(pmDocsRaw, accusedRawRows, victimRawRows, compRawRows);
  var appInst = mockCat.initializeApp();
  var result = await syncInc.detectChanges(appInst);
  var diag = result.identity_diagnostics;

  /* duplicate_ownership */
  assert.ok(diag.duplicate_ownership, 'duplicate_ownership must be present');
  assert.strictEqual(typeof diag.duplicate_ownership.total_references, 'number');
  assert.strictEqual(typeof diag.duplicate_ownership.unique_keys, 'number');
  assert.strictEqual(typeof diag.duplicate_ownership.duplicate_keys, 'number');
  assert.strictEqual(typeof diag.duplicate_ownership.duplicate_references_extra, 'number');
  assert.strictEqual(typeof diag.duplicate_ownership.same_person_duplicates, 'number');
  assert.strictEqual(typeof diag.duplicate_ownership.cross_person_keys, 'number');
  assert.strictEqual(typeof diag.duplicate_ownership.max_persons_per_key, 'number');
  assert.ok(diag.duplicate_ownership.ownership_distribution, 'ownership_distribution must be present');
  assert.ok(Array.isArray(diag.duplicate_ownership.samples), 'samples must be array');

  /* current_side */
  assert.ok(diag.current_side, 'current_side must be present');
  assert.strictEqual(typeof diag.current_side.total_references, 'number');
  assert.strictEqual(typeof diag.current_side.unique_keys, 'number');
  assert.strictEqual(typeof diag.current_side.duplicate_references_extra, 'number');

  /* set_arithmetic */
  assert.ok(diag.set_arithmetic, 'set_arithmetic must be present');
  assert.strictEqual(typeof diag.set_arithmetic.historical_unique_keys, 'number');
  assert.strictEqual(typeof diag.set_arithmetic.current_unique_keys, 'number');
  assert.strictEqual(typeof diag.set_arithmetic.intersection, 'number');
  assert.strictEqual(typeof diag.set_arithmetic.historical_minus_current, 'number');
  assert.strictEqual(typeof diag.set_arithmetic.current_minus_historical, 'number');
});

testAsync('identity_diagnostics values in no-duplicate test scenario', async function () {
  /*
   * pmDocsRaw has 4 source records (A-1, V-1, A-2, V-3) = 4 unique keys.
   * records has 4 current records (A-1, A-2, A-3, V-1) = 4 unique keys.
   * No duplicates in either set.
   */
  var mockCat = createMockCatalyst(pmDocsRaw, accusedRawRows, victimRawRows, compRawRows);
  var appInst = mockCat.initializeApp();
  var result = await syncInc.detectChanges(appInst);
  var diag = result.identity_diagnostics;

  /* duplicate_ownership — no duplicates in test data */
  assert.strictEqual(diag.duplicate_ownership.total_references, 4);
  assert.strictEqual(diag.duplicate_ownership.unique_keys, 4);
  assert.strictEqual(diag.duplicate_ownership.duplicate_keys, 0);
  assert.strictEqual(diag.duplicate_ownership.duplicate_references_extra, 0);
  assert.strictEqual(diag.duplicate_ownership.same_person_duplicates, 0);
  assert.strictEqual(diag.duplicate_ownership.cross_person_keys, 0);
  assert.strictEqual(diag.duplicate_ownership.max_persons_per_key, 1);

  /* current_side — no duplicates */
  assert.strictEqual(diag.current_side.total_references, 4);
  assert.strictEqual(diag.current_side.unique_keys, 4);
  assert.strictEqual(diag.current_side.duplicate_references_extra, 0);

  /* set_arithmetic: H={A-1, V-1, A-2, V-3}, C={A-1, A-2, A-3, V-1} */
  assert.strictEqual(diag.set_arithmetic.historical_unique_keys, 4);
  assert.strictEqual(diag.set_arithmetic.current_unique_keys, 4);
  assert.strictEqual(diag.set_arithmetic.intersection, 3);
  assert.strictEqual(diag.set_arithmetic.historical_minus_current, 1);
  assert.strictEqual(diag.set_arithmetic.current_minus_historical, 1);
});

console.log('\n=== Identity Diagnostics — Duplicate Scenarios ===');

testAsync('detectChanges duplicate_ownership reflects same-person duplicates', async function () {
  /* PM doc with duplicate key within same doc */
  var dupPmDocs = [
    makePMRawRow('PM_DUP_1', [
      { table: 'Accused', source_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'John', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' },
      { table: 'Accused', source_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'John', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ])
  ];
  var matchAcc = [makeSourcerRawRow('Accused', 'AccusedMasterID', 1, 'CASE-001', 'John', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')];
  var mockCat = createMockCatalyst(dupPmDocs, matchAcc, [], []);
  var appInst = mockCat.initializeApp();
  var result = await syncInc.detectChanges(appInst);
  var d = result.identity_diagnostics.duplicate_ownership;

  assert.strictEqual(d.total_references, 2);
  assert.strictEqual(d.unique_keys, 1);
  assert.strictEqual(d.duplicate_keys, 1);
  assert.strictEqual(d.duplicate_references_extra, 1);
  assert.strictEqual(d.same_person_duplicates, 1);
  assert.strictEqual(d.cross_person_keys, 0);
  assert.strictEqual(d.max_persons_per_key, 1);
});

testAsync('detectChanges duplicate_ownership reflects cross-person duplicates', async function () {
  /* Two PM docs referencing same source record */
  var crossPmDocs = [
    makePMRawRow('PM_X_1', [
      { table: 'Accused', source_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'John', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ]),
    makePMRawRow('PM_X_2', [
      { table: 'Accused', source_id: 'A-1', case_id: 'CASE-001', name_as_recorded: 'John', age_as_recorded: 30, date_of_offence: '2024-01-15', unit_id: 'UNIT-1', district_id: 'DIST-1' }
    ])
  ];
  var matchAcc = [makeSourcerRawRow('Accused', 'AccusedMasterID', 1, 'CASE-001', 'John', 30, 1, '2024-01-15', 'UNIT-1', 'DIST-1')];
  var mockCat = createMockCatalyst(crossPmDocs, matchAcc, [], []);
  var appInst = mockCat.initializeApp();
  var result = await syncInc.detectChanges(appInst);
  var d = result.identity_diagnostics.duplicate_ownership;

  assert.strictEqual(d.total_references, 2);
  assert.strictEqual(d.unique_keys, 1);
  assert.strictEqual(d.duplicate_keys, 1);
  assert.strictEqual(d.duplicate_references_extra, 1);
  assert.strictEqual(d.same_person_duplicates, 0);
  assert.strictEqual(d.cross_person_keys, 1);
  assert.strictEqual(d.max_persons_per_key, 2);
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
