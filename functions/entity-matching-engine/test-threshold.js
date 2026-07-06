'use strict';

const { match } = require('./index');
const { classify, THRESHOLD, CANDIDATE_MIN, CONFIRMED } = require('./threshold');

const DUMMY_PAIRS = [
  {
    a: { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    b: { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    same_person: true
  },
  {
    a: { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    b: { name: 'Ramash Kumar', age: 36, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    same_person: true
  },
  {
    a: { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    b: { name: 'Ramesh K', age: 30, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    same_person: true
  },
  {
    a: { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    b: { name: 'Ramesh Kumar', age: 45, gender: 'M', unit_id: 'PS-099', district_id: 'D-08' },
    same_person: true
  },
  {
    a: { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    b: { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-099', district_id: 'D-08' },
    same_person: true
  },
  {
    a: { name: 'Suresh Babu', age: 28, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    b: { name: 'Suresh Babu', age: 28, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    same_person: true
  },
  {
    a: { name: 'Lakshmi Devi', age: 40, gender: 'F', unit_id: 'PS-042', district_id: 'D-07' },
    b: { name: 'Lakshmi Devi', age: 42, gender: 'F', unit_id: 'PS-042', district_id: 'D-07' },
    same_person: true
  },
  {
    a: { name: 'Venkatesh Gowda', age: 50, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    b: { name: 'Venkatesh', age: 50, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    same_person: true
  },
  {
    a: { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    b: { name: 'Suresh Babu', age: 28, gender: 'M', unit_id: 'PS-099', district_id: 'D-08' },
    same_person: false
  },
  {
    a: { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    b: { name: 'Priya Sharma', age: 30, gender: 'F', unit_id: 'PS-099', district_id: 'D-08' },
    same_person: false
  },
  {
    a: { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    b: { name: 'Mohan Kumar', age: 45, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    same_person: false
  },
  {
    a: { name: 'Lakshmi Devi', age: 40, gender: 'F', unit_id: 'PS-042', district_id: 'D-07' },
    b: { name: 'Saraswati Devi', age: 40, gender: 'F', unit_id: 'PS-042', district_id: 'D-07' },
    same_person: false
  },
  {
    a: { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    b: { name: 'Ramesh Kumar', age: 20, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    same_person: false
  },
  {
    a: { name: 'Kumar', age: 30, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    b: { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    same_person: false
  },
  {
    a: { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    b: { name: 'Ramesh Kumar', age: 34, gender: 'F', unit_id: 'PS-042', district_id: 'D-07' },
    same_person: false
  }
];

function computeMetrics(pairs, threshold) {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (const pair of pairs) {
    const result = match(pair.a, pair.b);
    const predicted = result.confidence >= threshold;

    if (predicted && pair.same_person) tp++;
    else if (predicted && !pair.same_person) fp++;
    else if (!predicted && !pair.same_person) tn++;
    else fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

  return {
    tp, fp, tn, fn,
    precision: Math.round(precision * 10000) / 10000,
    recall: Math.round(recall * 10000) / 10000,
    f1: Math.round(f1 * 10000) / 10000
  };
}

console.log('Threshold Calibration Harness (WBS 4.3)');
console.log('========================================');
console.log('');
console.log(`Test pairs: ${DUMMY_PAIRS.length} (same: ${DUMMY_PAIRS.filter(p => p.same_person).length}, diff: ${DUMMY_PAIRS.filter(p => !p.same_person).length})`);
console.log('');
console.log('Threshold  Precision  Recall    F1        TP  FP  TN  FN');
console.log('---------  ---------  --------  --------  --  --  --  --');

let bestThreshold = null;
let bestF1 = -1;

const start = Math.round(CANDIDATE_MIN * 100);
const end = 90;

for (let raw = start; raw <= end; raw++) {
  const t = raw / 100;
  const metrics = computeMetrics(DUMMY_PAIRS, t);

  const precStr = metrics.precision.toFixed(4).padStart(9);
  const recStr = metrics.recall.toFixed(4).padStart(8);
  const f1Str = metrics.f1.toFixed(4).padStart(8);

  console.log(`${t.toFixed(2).padStart(9)}  ${precStr}  ${recStr}  ${f1Str}  ${String(metrics.tp).padStart(2)} ${String(metrics.fp).padStart(2)} ${String(metrics.tn).padStart(2)} ${String(metrics.fn).padStart(2)}`);

  if (metrics.f1 > bestF1) {
    bestF1 = metrics.f1;
    bestThreshold = t;
  }
}

console.log('');
console.log('========================================');
console.log(`Current hardcoded THRESHOLD: ${THRESHOLD}`);
console.log(`Current hardcoded CANDIDATE_MIN: ${CANDIDATE_MIN}`);
console.log(`Best F1 threshold (dummy data): ${bestThreshold} (F1=${bestF1})`);
console.log('========================================');
console.log('');
console.log('NOTE: Results are based on dummy data. For production calibration,');
console.log('replace DUMMY_PAIRS with ground_truth_identities.csv data and run');
console.log('the full matching pipeline against all records sharing a BaseProfileID.');
