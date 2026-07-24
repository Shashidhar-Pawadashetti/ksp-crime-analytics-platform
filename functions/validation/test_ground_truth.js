'use strict';

var { computePairwiseMetrics, computeClusterPurity, extractAccusedId, parseCSV } = require('./groundTruthValidator');

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
console.log('=== Summary ===');
console.log('Tests run: ' + testsRun);
console.log('Passed:    ' + testsPassed);
console.log('Failed:    ' + testsFailed);

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
