'use strict';

var { computePairwiseMetrics, computeClusterPurity, extractAccusedId, parseCSV, loadAllDocuments, validateAgainstGroundTruth } = require('./groundTruthValidator');

var testsRun = 0;
var testsPassed = 0;
var testsFailed = 0;

function assertEqual(actual, expected, label) {
  testsRun++;
  var ok = actual === expected;
  if (ok) {
    testsPassed++;
    console.log('  PASS: ' + label);
  } else {
    testsFailed++;
    console.log('  FAIL: ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

function assertApprox(actual, expected, tolerance, label) {
  tolerance = tolerance || 0.001;
  testsRun++;
  var ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    testsPassed++;
    console.log('  PASS: ' + label + ' (' + actual + ')');
  } else {
    testsFailed++;
    console.log('  FAIL: ' + label + ' — expected ~' + expected + ', got ' + actual);
  }
}

function assertDeepEqual(actual, expected, label) {
  testsRun++;
  var ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    testsPassed++;
    console.log('  PASS: ' + label);
  } else {
    testsFailed++;
    console.log('  FAIL: ' + label + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

console.log('=== Test: extractAccusedId ===');
assertEqual(extractAccusedId('A-1'), 1, 'A-1 -> 1');
assertEqual(extractAccusedId('A-9'), 9, 'A-9 -> 9');
assertEqual(extractAccusedId('A-21'), 21, 'A-21 -> 21');
assertEqual(extractAccusedId('A-997'), 997, 'A-997 -> 997');
assertEqual(extractAccusedId('A1'), 1, 'A1 without dash -> 1');
assertEqual(extractAccusedId(null), null, 'null -> null');
assertEqual(extractAccusedId(''), null, 'empty string -> null');
assertEqual(extractAccusedId('V-1'), null, 'V-1 -> null (not Accused)');
assertEqual(extractAccusedId('C-42'), null, 'C-42 -> null (not Accused)');
assertEqual(extractAccusedId('PM_001'), null, 'person_id -> null');

console.log('');
console.log('=== Test: computePairwiseMetrics — TP/FN scenario ===');
/*
  Accused 1 -> GT 124, PM_001
  Accused 2 -> GT 124, PM_001  (same GT, same PM -> TP)
  Accused 3 -> GT 92,  PM_002
  Accused 4 -> GT 92,  PM_003  (same GT, diff PM -> FN)

  Pairs:
  (1,2): TP  (124==124, PM_001==PM_001)
  (1,3): TN  (124!=92,  PM_001!=PM_002)
  (1,4): TN  (124!=92,  PM_001!=PM_003)
  (2,3): TN  (124!=92,  PM_001!=PM_002)
  (2,4): TN  (124!=92,  PM_001!=PM_003)
  (3,4): FN  (92==92,   PM_002!=PM_003)

  TP=1, FP=0, FN=1, TN=4
  precision=1.0, recall=0.5, F1=0.6667
*/
var gt1 = { 1: 124, 2: 124, 3: 92, 4: 92 };
var pm1 = { 1: 'PM_001', 2: 'PM_001', 3: 'PM_002', 4: 'PM_003' };
var ids1 = [1, 2, 3, 4];
var result1 = computePairwiseMetrics(gt1, pm1, ids1);
assertEqual(result1.tp, 1, 'TP = 1');
assertEqual(result1.fp, 0, 'FP = 0');
assertEqual(result1.fn, 1, 'FN = 1');
assertEqual(result1.tn, 4, 'TN = 4');

console.log('');
console.log('=== Test: computePairwiseMetrics — FP scenario ===');
/*
  Accused 1 -> GT 124, PM_001
  Accused 2 -> GT 92,  PM_001  (diff GT, same PM -> FP)
  Accused 3 -> GT 92,  PM_002
  Accused 4 -> GT 124, PM_002  (diff GT, same PM -> FP)

  (1,2): FP (124!=92,   PM_001==PM_001)
  (1,3): TN (124!=92,   PM_001!=PM_002)
  (1,4): TP (124==124,  PM_001!=PM_002) -- wait, NO

  Actually let me re-think:
  (1,2): 124!=92, PM_001==PM_001 -> FP
  (1,3): 124!=92, PM_001!=PM_002 -> TN
  (1,4): 124==124, PM_001!=PM_002 -> FN
  (2,3): 92==92, PM_001!=PM_002 -> FN
  (2,4): 92!=124, PM_001!=PM_002 -> TN
  (3,4): 92!=124, PM_002==PM_002 -> FP

  TP=0, FP=2, FN=2, TN=2
*/
var gt2 = { 1: 124, 2: 92, 3: 92, 4: 124 };
var pm2 = { 1: 'PM_001', 2: 'PM_001', 3: 'PM_002', 4: 'PM_002' };
var ids2 = [1, 2, 3, 4];
var result2 = computePairwiseMetrics(gt2, pm2, ids2);
assertEqual(result2.tp, 0, 'TP = 0');
assertEqual(result2.fp, 2, 'FP = 2');
assertEqual(result2.fn, 2, 'FN = 2');
assertEqual(result2.tn, 2, 'TN = 2');

console.log('');
console.log('=== Test: computePairwiseMetrics — perfect resolution ===');
/*
  Accused 1 -> GT 124, PM_001
  Accused 2 -> GT 124, PM_001
  Accused 3 -> GT 92,  PM_002
  Accused 4 -> GT 92,  PM_002  (all correct)
*/
var gt3 = { 1: 124, 2: 124, 3: 92, 4: 92 };
var pm3 = { 1: 'PM_001', 2: 'PM_001', 3: 'PM_002', 4: 'PM_002' };
var ids3 = [1, 2, 3, 4];
var result3 = computePairwiseMetrics(gt3, pm3, ids3);
assertEqual(result3.tp, 2, 'TP = 2 (pairs (1,2) and (3,4))');
assertEqual(result3.fp, 0, 'FP = 0');
assertEqual(result3.fn, 0, 'FN = 0');
assertEqual(result3.tn, 4, 'TN = 4 (cross-profile pairs)');

var p = result3.tp / (result3.tp + result3.fp);
var r = result3.tp / (result3.tp + result3.fn);
var f = 2 * p * r / (p + r);
assertEqual(p, 1.0, 'precision = 1.0');
assertEqual(r, 1.0, 'recall = 1.0');
assertEqual(f, 1.0, 'F1 = 1.0');

console.log('');
console.log('=== Test: computeClusterPurity ===');
/*
  PM_001: [1(124), 2(124)] -> majority=2/2=1.0
  PM_002: [3(92)]          -> majority=1/1=1.0
  PM_003: [4(92)]          -> majority=1/1=1.0
  Avg = 1.0
*/
var purity1 = computeClusterPurity(gt1, pm1, ids1);
assertEqual(purity1.cluster_purities.length, 3, '3 clusters');
assertEqual(purity1.average_purity, 1.0, 'avg purity = 1.0 (all pure despite FN split)');

console.log('');
console.log('=== Test: computeClusterPurity — impure cluster ===');
/*
  PM_001: [1(124), 2(92)]  -> max(124)=1, max(92)=1 -> majority=1/2=0.5
  PM_002: [3(92)]          -> 1.0
  PM_003: [4(124)]         -> 1.0
  Avg = (0.5 + 1.0 + 1.0) / 3 = 0.8333
*/
var gt4 = { 1: 124, 2: 92, 3: 92, 4: 124 };
var pm4 = { 1: 'PM_001', 2: 'PM_001', 3: 'PM_002', 4: 'PM_003' };
var ids4 = [1, 2, 3, 4];
var purity2 = computeClusterPurity(gt4, pm4, ids4);
assertEqual(purity2.cluster_purities.length, 3, '3 clusters');
assertApprox(purity2.average_purity, 0.8333, 0.001, 'avg purity ~ 0.8333');

console.log('');
console.log('=== Test: parseCSV ===');
var csvText = 'AccusedMasterID,CaseMasterID,BaseProfileID,GeneratedName,AgeYear\n1,1,124,Saul Goldner,40\n9,4,92,Bruce Parisian,34\n21,10,5,Cassie Wintheiser,34';
var parsed = parseCSV(csvText);
assertEqual(parsed.headers.length, 5, '5 headers');
assertEqual(parsed.rows.length, 3, '3 data rows');
assertEqual(parsed.rows[0].AccusedMasterID, '1', 'row 0 AccusedMasterID');
assertEqual(parsed.rows[0].BaseProfileID, '124', 'row 0 BaseProfileID');
assertEqual(parsed.rows[0].GeneratedName, 'Saul Goldner', 'row 0 GeneratedName');
assertEqual(parsed.rows[2].AccusedMasterID, '21', 'row 2 AccusedMasterID');

console.log('');
console.log('=== Test: NoSQL query contract — attribute ===');
(async function () {
  var capturedQueryBody = null;

  var captureTable = {
    queryTable: async function (queryBody) {
      capturedQueryBody = JSON.parse(JSON.stringify(queryBody));
      return {
        getResponseData: function () { return []; },
        start_key: null
      };
    }
  };

  var captureMock = {
    initializeApp: function () {
      return {
        zcql: function () { return { executeZCQLQuery: async function () { return []; } }; },
        nosql: function () { return { getTable: async function () { return captureTable; } }; },
        datastore: function () { return { table: function () { return { insertRow: async function () { return { ROWID: 'mock' }; } }; } }; }
      };
    }
  };

  var docs = await loadAllDocuments(captureMock.initializeApp());
  assertEqual(typeof capturedQueryBody.key_condition.attribute, 'string', 'attribute is a string, not array');
  assertEqual(capturedQueryBody.key_condition.attribute, 'type', 'attribute is "type"');
  assertDeepEqual(Array.isArray(capturedQueryBody.key_condition.attribute) === false, true, 'attribute is NOT an array');
})();

console.log('');
console.log('=== Test: NoSQL query contract — operator ===');
(async function () {
  var capturedQueryBody = null;

  var captureTable = {
    queryTable: async function (queryBody) {
      capturedQueryBody = JSON.parse(JSON.stringify(queryBody));
      return {
        getResponseData: function () { return []; },
        start_key: null
      };
    }
  };

  var captureMock = {
    initializeApp: function () {
      return {
        zcql: function () { return { executeZCQLQuery: async function () { return []; } }; },
        nosql: function () { return { getTable: async function () { return captureTable; } }; },
        datastore: function () { return { table: function () { return { insertRow: async function () { return { ROWID: 'mock' }; } }; } }; }
      };
    }
  };

  var docs = await loadAllDocuments(captureMock.initializeApp());
  assertEqual(capturedQueryBody.key_condition.operator, 'equals', 'operator resolves to "equals"');
})();

console.log('');
console.log('=== Test: NoSQL query contract — marshalled value ===');
(async function () {
  var capturedQueryBody = null;

  var captureTable = {
    queryTable: async function (queryBody) {
      capturedQueryBody = JSON.parse(JSON.stringify(queryBody));
      return {
        getResponseData: function () { return []; },
        start_key: null
      };
    }
  };

  var captureMock = {
    initializeApp: function () {
      return {
        zcql: function () { return { executeZCQLQuery: async function () { return []; } }; },
        nosql: function () { return { getTable: async function () { return captureTable; } }; },
        datastore: function () { return { table: function () { return { insertRow: async function () { return { ROWID: 'mock' }; } }; } }; }
      };
    }
  };

  var docs = await loadAllDocuments(captureMock.initializeApp());
  assertDeepEqual(capturedQueryBody.key_condition.value, { S: 'PM' }, 'marshalled value is { S: "PM" }');
})();

console.log('');
console.log('=== Test: NoSQL query contract — consistent_read ===');
(async function () {
  var capturedQueryBody = null;

  var captureTable = {
    queryTable: async function (queryBody) {
      capturedQueryBody = JSON.parse(JSON.stringify(queryBody));
      return {
        getResponseData: function () { return []; },
        start_key: null
      };
    }
  };

  var captureMock = {
    initializeApp: function () {
      return {
        zcql: function () { return { executeZCQLQuery: async function () { return []; } }; },
        nosql: function () { return { getTable: async function () { return captureTable; } }; },
        datastore: function () { return { table: function () { return { insertRow: async function () { return { ROWID: 'mock' }; } }; } }; }
      };
    }
  };

  var docs = await loadAllDocuments(captureMock.initializeApp());
  assertEqual(capturedQueryBody.consistent_read, true, 'consistent_read is true');
})();

console.log('');
console.log('=== Test: NoSQL query contract — limit ===');
(async function () {
  var capturedQueryBody = null;

  var captureTable = {
    queryTable: async function (queryBody) {
      capturedQueryBody = JSON.parse(JSON.stringify(queryBody));
      return {
        getResponseData: function () { return []; },
        start_key: null
      };
    }
  };

  var captureMock = {
    initializeApp: function () {
      return {
        zcql: function () { return { executeZCQLQuery: async function () { return []; } }; },
        nosql: function () { return { getTable: async function () { return captureTable; } }; },
        datastore: function () { return { table: function () { return { insertRow: async function () { return { ROWID: 'mock' }; } }; } }; }
      };
    }
  };

  var docs = await loadAllDocuments(captureMock.initializeApp());
  assertEqual(capturedQueryBody.limit, 100, 'limit is 100');
})();

console.log('');
console.log('=== Test: NoSQL pagination — multiple pages accumulated correctly ===');
(async function () {
  var pageCallCount = 0;
  var pageSize = 40;
  var totalPages = 3;
  var totalDocs = pageSize * totalPages;

  function makeDoc(index) {
    return {
      person_id: 'PM_PAGINATED_' + String(index).padStart(5, '0'),
      type: 'PM',
      source_records: []
    };
  }

  var allTestDocs = [];
  for (var pi = 0; pi < totalDocs; pi++) {
    allTestDocs.push(makeDoc(pi));
  }

  var paginatedTable = {
    queryTable: async function (queryBody) {
      pageCallCount++;
      var startIdx = (pageCallCount - 1) * pageSize;
      var pageItems = allTestDocs.slice(startIdx, startIdx + pageSize).map(function (doc) {
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
    initializeApp: function () {
      return {
        zcql: function () { return { executeZCQLQuery: async function () { return []; } }; },
        nosql: function () { return { getTable: async function () { return paginatedTable; } }; },
        datastore: function () { return { table: function () { return { insertRow: async function () { return { ROWID: 'mock' }; } }; } }; }
      };
    }
  };

  var docs = await loadAllDocuments(paginatedMock.initializeApp());
  assertEqual(docs.length, totalDocs, 'should load all ' + totalDocs + ' docs across pages');
  assertEqual(pageCallCount, totalPages, 'should make ' + totalPages + ' queryTable calls');
})();

console.log('');
console.log('=== Test: NoSQL query error propagates ===');
(async function () {
  var errorTable = {
    queryTable: async function () {
      throw new Error('Simulated NoSQL queryTable failure');
    }
  };

  var errorMock = {
    initializeApp: function () {
      return {
        zcql: function () { return { executeZCQLQuery: async function () { return []; } }; },
        nosql: function () { return { getTable: async function () { return errorTable; } }; },
        datastore: function () { return { table: function () { return { insertRow: async function () { return { ROWID: 'mock' }; } }; } }; }
      };
    }
  };

  var threw = false;
  try {
    await loadAllDocuments(errorMock.initializeApp());
  } catch (err) {
    threw = true;
    assertEqual(err.message.indexOf('Simulated NoSQL queryTable failure') !== -1, true, 'error message is preserved');
  }
  assertEqual(threw, true, 'loadAllDocuments throws on queryTable error');
})();

console.log('');
console.log('=== Diagnostic Tests ===');

function createValidationMock(personMasterDocs) {
  var table = {
    queryTable: async function () {
      var items = (personMasterDocs || []).map(function (doc) {
        return { item: { to: function () { return doc; } } };
      });
      return { getResponseData: function () { return items; }, start_key: null };
    }
  };
  return {
    initializeApp: function () {
      return {
        zcql: function () { return { executeZCQLQuery: async function () { return []; } }; },
        nosql: function () { return { getTable: async function () { return table; } }; },
        datastore: function () { return { table: function () { return { insertRow: async function () { return { ROWID: 'mock' }; } }; } }; }
      };
    }
  };
}

var GT_CSV = 'AccusedMasterID,CaseMasterID,BaseProfileID,GeneratedName,AgeYear\n1,1,124,Saul Goldner,40\n9,4,92,Bruce Parisian,34';

console.log('');
console.log('=== Test: Diagnostics — zero PersonMaster documents ===');
(async function () {
  var mock = createValidationMock([]);
  var result = await validateAgainstGroundTruth(mock.initializeApp(), { ground_truth_csv: GT_CSV });
  assertEqual(result.personmaster_documents_loaded, 0, 'personmaster_documents_loaded = 0');
  assertEqual(result.accused_source_records_seen, 0, 'accused_source_records_seen = 0');
  assertEqual(result.accused_ids_extracted, 0, 'accused_ids_extracted = 0');
  assertEqual(result.accused_ids_failed_extraction, 0, 'accused_ids_failed_extraction = 0');
  assertEqual(result.duplicate_accused_ids, 0, 'duplicate_accused_ids = 0');
  assertEqual(result.mapped_records, 0, 'mapped_records = 0');
  assertEqual(result.predicted_cluster_count, 0, 'predicted_cluster_count = 0');
  assertEqual(result.coverage, 0, 'coverage = 0');
})();

console.log('');
console.log('=== Test: Diagnostics — valid A-1 row_id ===');
(async function () {
  var docs = [{
    person_id: 'PM_001',
    type: 'PM',
    source_records: [{ table: 'Accused', row_id: 'A-1', case_id: '1' }]
  }];
  var mock = createValidationMock(docs);
  var result = await validateAgainstGroundTruth(mock.initializeApp(), { ground_truth_csv: GT_CSV });
  assertEqual(result.personmaster_documents_loaded, 1, 'personmaster_documents_loaded = 1');
  assertEqual(result.accused_source_records_seen, 1, 'accused_source_records_seen = 1');
  assertEqual(result.accused_ids_extracted, 1, 'accused_ids_extracted = 1');
  assertEqual(result.accused_ids_failed_extraction, 0, 'accused_ids_failed_extraction = 0');
  assertEqual(result.duplicate_accused_ids, 0, 'duplicate_accused_ids = 0');
  assertEqual(result.mapped_records, 1, 'mapped_records = 1');
  assertEqual(result.predicted_cluster_count, 1, 'predicted_cluster_count = 1');
})();

console.log('');
console.log('=== Test: Diagnostics — invalid row_id (non-accused prefix) ===');
(async function () {
  var docs = [{
    person_id: 'PM_001',
    type: 'PM',
    source_records: [{ table: 'Accused', row_id: 'V-1', case_id: '1' }]
  }];
  var mock = createValidationMock(docs);
  var result = await validateAgainstGroundTruth(mock.initializeApp(), { ground_truth_csv: GT_CSV });
  assertEqual(result.personmaster_documents_loaded, 1, 'personmaster_documents_loaded = 1');
  assertEqual(result.accused_source_records_seen, 1, 'accused_source_records_seen = 1');
  assertEqual(result.accused_ids_extracted, 0, 'accused_ids_extracted = 0');
  assertEqual(result.accused_ids_failed_extraction, 1, 'accused_ids_failed_extraction = 1');
  assertEqual(result.duplicate_accused_ids, 0, 'duplicate_accused_ids = 0');
  assertEqual(result.mapped_records, 0, 'mapped_records = 0');
})();

console.log('');
console.log('=== Test: Diagnostics — non-Accused table record ignored ===');
(async function () {
  var docs = [{
    person_id: 'PM_001',
    type: 'PM',
    source_records: [{ table: 'Victim', row_id: 'V-1', case_id: '1' }]
  }];
  var mock = createValidationMock(docs);
  var result = await validateAgainstGroundTruth(mock.initializeApp(), { ground_truth_csv: GT_CSV });
  assertEqual(result.personmaster_documents_loaded, 1, 'personmaster_documents_loaded = 1');
  assertEqual(result.accused_source_records_seen, 0, 'accused_source_records_seen = 0 (Victim record ignored)');
  assertEqual(result.accused_ids_extracted, 0, 'accused_ids_extracted = 0');
  assertEqual(result.accused_ids_failed_extraction, 0, 'accused_ids_failed_extraction = 0');
  assertEqual(result.mapped_records, 0, 'mapped_records = 0');
})();

console.log('');
console.log('=== Test: Diagnostics — multiple accused records mapped ===');
(async function () {
  var docs = [{
    person_id: 'PM_001',
    type: 'PM',
    source_records: [
      { table: 'Accused', row_id: 'A-1', case_id: '1' },
      { table: 'Victim', row_id: 'V-1', case_id: '1' }
    ]
  }, {
    person_id: 'PM_002',
    type: 'PM',
    source_records: [{ table: 'Accused', row_id: 'A-9', case_id: '4' }]
  }];
  var mock = createValidationMock(docs);
  var result = await validateAgainstGroundTruth(mock.initializeApp(), { ground_truth_csv: GT_CSV });
  assertEqual(result.personmaster_documents_loaded, 2, 'personmaster_documents_loaded = 2');
  assertEqual(result.accused_source_records_seen, 2, 'accused_source_records_seen = 2');
  assertEqual(result.accused_ids_extracted, 2, 'accused_ids_extracted = 2');
  assertEqual(result.accused_ids_failed_extraction, 0, 'accused_ids_failed_extraction = 0');
  assertEqual(result.duplicate_accused_ids, 0, 'duplicate_accused_ids = 0');
  assertEqual(result.mapped_records, 2, 'mapped_records = 2');
  assertEqual(result.predicted_cluster_count, 2, 'predicted_cluster_count = 2');
})();

console.log('');
console.log('=== Test: Diagnostics — duplicate accused IDs ===');
(async function () {
  var docs = [{
    person_id: 'PM_001',
    type: 'PM',
    source_records: [{ table: 'Accused', row_id: 'A-1', case_id: '1' }]
  }, {
    person_id: 'PM_002',
    type: 'PM',
    source_records: [{ table: 'Accused', row_id: 'A-1', case_id: '1' }]
  }];
  var mock = createValidationMock(docs);
  var result = await validateAgainstGroundTruth(mock.initializeApp(), { ground_truth_csv: GT_CSV });
  assertEqual(result.personmaster_documents_loaded, 2, 'personmaster_documents_loaded = 2');
  assertEqual(result.accused_source_records_seen, 2, 'accused_source_records_seen = 2');
  assertEqual(result.accused_ids_extracted, 2, 'accused_ids_extracted = 2');
  assertEqual(result.duplicate_accused_ids, 1, 'duplicate_accused_ids = 1 (same A-1 in both docs)');
  assertEqual(result.mapped_records, 1, 'mapped_records = 1 (only 1 unique A-1)');
})();

console.log('');
console.log('=== Test: Diagnostics — precision/recall/F1 unchanged by diagnostics ===');
(async function() {
  var PAIR_CSV = 'AccusedMasterID,CaseMasterID,BaseProfileID,GeneratedName,AgeYear\n1,1,124,Saul Goldner,40\n2,1,124,Saul Goldner,40\n3,2,92,Bruce Parisian,34\n4,2,92,Bruce Parisian,34';
  var docs = [{
    person_id: 'PM_001',
    type: 'PM',
    source_records: [
      { table: 'Accused', source_id: 'A-1', case_id: '1' },
      { table: 'Accused', source_id: 'A-2', case_id: '1' }
    ]
  }, {
    person_id: 'PM_002',
    type: 'PM',
    source_records: [{ table: 'Accused', source_id: 'A-3', case_id: '2' }]
  }, {
    person_id: 'PM_003',
    type: 'PM',
    source_records: [{ table: 'Accused', source_id: 'A-4', case_id: '2' }]
  }];
  var mock = createValidationMock(docs);
  var result = await validateAgainstGroundTruth(mock.initializeApp(), { ground_truth_csv: PAIR_CSV });
  assertEqual(result.personmaster_documents_loaded, 3, 'personmaster_documents_loaded = 3');
  assertEqual(result.mapped_records, 4, 'mapped_records = 4');
  assertEqual(result.precision, 1, 'precision = 1 (no FP)');
  assertEqual(Math.round(result.recall * 100), 50, 'recall = 0.5 (2/4 correct pairs)');
  assertEqual(Math.round(result.f1_score * 100), 67, 'f1 = 0.6667');
})();

console.log('');
console.log('=== Test: source_id — A-1 maps to AccusedMasterID 1 ===');
(async function () {
  var docs = [{
    person_id: 'PM_001',
    type: 'PM',
    source_records: [{ table: 'Accused', source_id: 'A-1', case_id: '1' }]
  }];
  var mock = createValidationMock(docs);
  var result = await validateAgainstGroundTruth(mock.initializeApp(), { ground_truth_csv: GT_CSV });
  assertEqual(result.personmaster_documents_loaded, 1, 'personmaster_documents_loaded = 1');
  assertEqual(result.accused_source_records_seen, 1, 'accused_source_records_seen = 1');
  assertEqual(result.accused_ids_extracted, 1, 'source_id A-1 -> 1 extracted');
  assertEqual(result.accused_ids_failed_extraction, 0, 'accused_ids_failed_extraction = 0');
  assertEqual(result.mapped_records, 1, 'mapped_records = 1');
})();

console.log('');
console.log('=== Test: source_id — A-136 maps to AccusedMasterID 136 ===');
(async function () {
  var csv = 'AccusedMasterID,CaseMasterID,BaseProfileID,GeneratedName,AgeYear\n136,10,5,Cassie Wintheiser,34';
  var docs = [{
    person_id: 'PM_001',
    type: 'PM',
    source_records: [{ table: 'Accused', source_id: 'A-136', case_id: '10' }]
  }];
  var mock = createValidationMock(docs);
  var result = await validateAgainstGroundTruth(mock.initializeApp(), { ground_truth_csv: csv });
  assertEqual(result.accused_ids_extracted, 1, 'source_id A-136 -> 136 extracted');
  assertEqual(result.mapped_records, 1, 'mapped_records = 1');
  assertEqual(result.mapped_accused_ids[0], 136, 'mapped accused ID = 136');
})();

console.log('');
console.log('=== Test: source_id takes precedence over row_id ===');
(async function () {
  var docs = [{
    person_id: 'PM_001',
    type: 'PM',
    source_records: [{ table: 'Accused', source_id: 'A-136', row_id: 'A-1', case_id: '10' }]
  }];
  var csv = 'AccusedMasterID,CaseMasterID,BaseProfileID,GeneratedName,AgeYear\n136,10,5,Cassie Wintheiser,34';
  var mock = createValidationMock(docs);
  var result = await validateAgainstGroundTruth(mock.initializeApp(), { ground_truth_csv: csv });
  assertEqual(result.accused_ids_extracted, 1, 'source_id A-136 takes precedence over row_id A-1');
  assertEqual(result.mapped_records, 1, 'mapped_records = 1');
  assertEqual(result.mapped_accused_ids[0], 136, 'mapped accused ID = 136 (from source_id)');
})();

console.log('');
console.log('=== Test: row_id fallback when source_id absent ===');
(async function () {
  var docs = [{
    person_id: 'PM_001',
    type: 'PM',
    source_records: [{ table: 'Accused', row_id: 'A-1', case_id: '1' }]
  }];
  var mock = createValidationMock(docs);
  var result = await validateAgainstGroundTruth(mock.initializeApp(), { ground_truth_csv: GT_CSV });
  assertEqual(result.accused_ids_extracted, 1, 'row_id A-1 fallback extraction');
  assertEqual(result.mapped_records, 1, 'mapped_records = 1');
})();

console.log('');
console.log('=== Test: invalid source_id increments failed extraction diagnostics ===');
(async function () {
  var docs = [{
    person_id: 'PM_001',
    type: 'PM',
    source_records: [{ table: 'Accused', source_id: 'V-99', case_id: '1' }]
  }];
  var mock = createValidationMock(docs);
  var result = await validateAgainstGroundTruth(mock.initializeApp(), { ground_truth_csv: GT_CSV });
  assertEqual(result.accused_source_records_seen, 1, 'accused_source_records_seen = 1');
  assertEqual(result.accused_ids_extracted, 0, 'accused_ids_extracted = 0');
  assertEqual(result.accused_ids_failed_extraction, 1, 'accused_ids_failed_extraction = 1');
  assertEqual(result.failed_source_id_sample[0], 'V-99', 'failed_source_id_sample contains V-99');
})();

console.log('');
console.log('=== Summary ===');
console.log('Tests run: ' + testsRun);
console.log('Passed:    ' + testsPassed);
console.log('Failed:    ' + testsFailed);

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
