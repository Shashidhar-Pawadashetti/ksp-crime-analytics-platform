'use strict';

const assert = require('assert');
const { normaliseName } = require('./normaliser');
const { soundex, soundexToken, indianMetaphone, indianMetaphoneToken, generatePhoneticKey } = require('./phonetic');
const {
  jaroWinkler, tokenSortRatio, computeNameScore,
  computeAgeScore, computeGenderScore, computeLocationScore,
  computeCompositeScore, computeScore
} = require('./scorer');
const { THRESHOLD, CANDIDATE_MIN, CONFIRMED, UNCONFIRMED, DISCARD, classify } = require('./threshold');
const { match, matchCandidates } = require('./index');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

function assertApprox(actual, expected, epsilon = 0.01) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`Expected ${expected} ± ${epsilon}, got ${actual}`);
  }
}

console.log('\n=== NORMALISER TESTS ===\n');

test('strips salutation: "Sri Ramesh Kumar" → "ramesh kumar"', () => {
  assert.strictEqual(normaliseName('Sri Ramesh Kumar'), 'ramesh kumar');
});

test('strips salutation: "Mr Ramesh" → "ramesh"', () => {
  assert.strictEqual(normaliseName('Mr Ramesh'), 'ramesh');
});

test('strips salutation: "Dr Rajesh" → "rajesh"', () => {
  assert.strictEqual(normaliseName('Dr Rajesh'), 'rajesh');
});

test('strips salutation: "Smt Lakshmi" → "lakshmi"', () => {
  assert.strictEqual(normaliseName('Smt Lakshmi'), 'lakshmi');
});

test('strips salutation: "Late Shiva" → "shiva"', () => {
  assert.strictEqual(normaliseName('Late Shiva'), 'shiva');
});

test('handles Kannada: "ರಮೇಶ ಕುಮಾರ" → "ramesh kumar"', () => {
  const result = normaliseName('ರಮೇಶ ಕುಮಾರ');
  assert.strictEqual(result, 'ramesh kumar');
});

test('handles Kannada: "ಸುರೇಶ" → "suresh"', () => {
  assert.strictEqual(normaliseName('ಸುರೇಶ'), 'suresh');
});

test('lowercases input', () => {
  assert.strictEqual(normaliseName('RAMESH'), 'ramesh');
});

test('removes non-alpha characters', () => {
  assert.strictEqual(normaliseName('Ramesh-Kumar_123'), 'rameshkumar');
});

test('collapses multiple spaces', () => {
  assert.strictEqual(normaliseName('Ramesh   Kumar'), 'ramesh kumar');
});

test('trims whitespace', () => {
  assert.strictEqual(normaliseName('  Ramesh Kumar  '), 'ramesh kumar');
});

test('does not strip suffix when name would have < 2 tokens remaining', () => {
  assert.strictEqual(normaliseName('Kumar'), 'kumar');
});

test('empty input returns empty string', () => {
  assert.strictEqual(normaliseName(''), '');
});

test('handles Devanagari: "रमेश कुमार" → "ramesh kumar"', () => {
  const result = normaliseName('रमेश कुमार');
  assert.strictEqual(result, 'ramesh kumar');
});

console.log('\n=== PHONETIC KEY TESTS ===\n');

test('Soundex: Ramesh → R520', () => {
  assert.strictEqual(soundexToken('Ramesh'), 'R520');
});

test('Soundex: Ramash → R520 (same bucket)', () => {
  assert.strictEqual(soundexToken('Ramash'), 'R520');
});

test('Soundex: Rajesh → R200 (different from Ramesh R520)', () => {
  assert.strictEqual(soundexToken('Rajesh'), 'R200');
});

test('Soundex: Ramesh != Rajesh soundex', () => {
  assert.notStrictEqual(soundexToken('Ramesh'), soundexToken('Rajesh'));
});

test('Soundex: Kumar → K560', () => {
  assert.strictEqual(soundexToken('Kumar'), 'K560');
});

test('Soundex: multi-token name joined with space', () => {
  assert.strictEqual(soundex('Ramesh Kumar'), 'R520 K560');
});

test('IM: Ramesh → RMX', () => {
  assert.strictEqual(indianMetaphoneToken('Ramesh'), 'RMX');
});

test('IM: Ramash → RMX (same as Ramesh)', () => {
  assert.strictEqual(indianMetaphoneToken('Ramash'), 'RMX');
});

test('IM: Rajesh → RJX (different from Ramesh)', () => {
  assert.strictEqual(indianMetaphoneToken('Rajesh'), 'RJX');
});

test('IM: handles sh → X (Shiva → XF, not SF)', () => {
  assert.strictEqual(indianMetaphoneToken('Shiva'), 'XF');
});

test('IM: handles th → T (single token)', () => {
  assert.strictEqual(indianMetaphoneToken('Thakur'), 'TKR');
});

test('IM: th multi-token via indianMetaphone', () => {
  assert.strictEqual(indianMetaphone('Tanvi Thakur'), 'TNF TKR');
});

test('IM: handles v/w → F', () => {
  assert.strictEqual(indianMetaphoneToken('Vishal'), 'FXL');
  assert.strictEqual(indianMetaphoneToken('Waseem'), 'FSM');
});

test('IM: handles kh → K', () => {
  assert.strictEqual(indianMetaphoneToken('Khan'), 'KN');
});

test('IM: handles gh → K', () => {
  assert.strictEqual(indianMetaphoneToken('Ghanshyam'), 'KNXM');
});

test('IM: handles ch → X', () => {
  assert.strictEqual(indianMetaphoneToken('Chandra'), 'XNJR');
});

test('Block key: Ramesh/Ramash same bucket', () => {
  assert.strictEqual(generatePhoneticKey('Ramesh'), 'R520 RMX');
  assert.strictEqual(generatePhoneticKey('Ramash'), 'R520 RMX');
});

test('Block key: Ramesh/Rajesh different buckets', () => {
  const keyRamesh = generatePhoneticKey('Ramesh');
  const keyRajesh = generatePhoneticKey('Rajesh');
  assert.notStrictEqual(keyRamesh, keyRajesh);
});

console.log('\n=== SCORER TESTS ===\n');

test('Jaro-Winkler: identical strings → 1.0', () => {
  assert.strictEqual(jaroWinkler('ramesh', 'ramesh'), 1.0);
});

test('Jaro-Winkler: "ramesh" vs "ramash" > 0.8', () => {
  const score = jaroWinkler('ramesh', 'ramash');
  assert.ok(score > 0.8, `Expected > 0.8, got ${score}`);
});

test('Jaro-Winkler: "ramesh" vs "rajesh" > 0.7', () => {
  const score = jaroWinkler('ramesh', 'rajesh');
  assert.ok(score > 0.7, `Expected > 0.7, got ${score}`);
});

test('Jaro-Winkler: "ramesh" vs "priya" → lower score', () => {
  const score = jaroWinkler('ramesh', 'priya');
  assert.ok(score < 0.5, `Expected < 0.5, got ${score}`);
});

test('Token sort ratio: handles token order variation', () => {
  const tsr = tokenSortRatio('kumar ramesh', 'ramesh kumar');
  assert.ok(tsr >= 0.99, `Expected ~1.0, got ${tsr}`);
});

test('Name score: identical names → 1.0', () => {
  assert.strictEqual(computeNameScore('ramesh kumar', 'ramesh kumar'), 1.0);
});

test('Name score: same tokens different order → ~1.0', () => {
  const score = computeNameScore('kumar ramesh', 'ramesh kumar');
  assert.ok(score >= 0.99, `Expected ~1.0, got ${score}`);
});

test('Age score: delta=0 → 1.0', () => {
  assert.strictEqual(computeAgeScore(30, 30), 1.0);
});

test('Age score: delta=2 → 0.9', () => {
  assert.strictEqual(computeAgeScore(30, 32), 0.9);
});

test('Age score: delta=5 → 0.7', () => {
  assert.strictEqual(computeAgeScore(30, 35), 0.7);
});

test('Age score: delta=10 → 0.4', () => {
  assert.strictEqual(computeAgeScore(30, 40), 0.4);
});

test('Age score: delta=15 → 0.0', () => {
  assert.strictEqual(computeAgeScore(30, 45), 0.0);
});

test('Age score: null age → 0.5', () => {
  assert.strictEqual(computeAgeScore(null, 30), 0.5);
});

test('Gender score: same gender → 1.0', () => {
  assert.strictEqual(computeGenderScore('M', 'M'), 1.0);
});

test('Gender score: different gender → 0.0', () => {
  assert.strictEqual(computeGenderScore('M', 'F'), 0.0);
});

test('Gender score: null gender → 0.5', () => {
  assert.strictEqual(computeGenderScore(null, 'M'), 0.5);
});

test('Location score: same unit_id → 1.0', () => {
  const locA = { unit_id: 'PS-042', district_id: 'D-07' };
  const locB = { unit_id: 'PS-042', district_id: 'D-07' };
  assert.strictEqual(computeLocationScore(locA, locB), 1.0);
});

test('Location score: same district_id, different unit → 0.6', () => {
  const locA = { unit_id: 'PS-042', district_id: 'D-07' };
  const locB = { unit_id: 'PS-099', district_id: 'D-07' };
  assert.strictEqual(computeLocationScore(locA, locB), 0.6);
});

test('Location score: different district, no coordinates → 0.0', () => {
  const locA = { unit_id: 'PS-042', district_id: 'D-07' };
  const locB = { unit_id: 'PS-099', district_id: 'D-08' };
  assert.strictEqual(computeLocationScore(locA, locB), 0.0);
});

test('Location score: close coordinates → 0.8', () => {
  const locA = { lat: 12.9716, lon: 77.5946 };
  const locB = { lat: 12.9350, lon: 77.6100 };
  assert.strictEqual(computeLocationScore(locA, locB), 0.8);
});

test('Location score: mid-range coordinates → 0.4', () => {
  const locA = { lat: 12.9716, lon: 77.5946 };
  const locB = { lat: 13.0500, lon: 77.5000 };
  assert.strictEqual(computeLocationScore(locA, locB), 0.4);
});

test('Composite score: perfect match', () => {
  const scores = { name_score: 1.0, age_score: 1.0, gender_score: 1.0, location_score: 1.0 };
  const composite = computeCompositeScore(scores);
  assertApprox(composite, 1.0);
});

test('Composite score: correct weights applied', () => {
  const scores = { name_score: 1.0, age_score: 1.0, gender_score: 1.0, location_score: 1.0 };
  assertApprox(computeCompositeScore(scores), 1.0);

  const halfScores = { name_score: 0.5, age_score: 0.5, gender_score: 0.5, location_score: 0.5 };
  assertApprox(computeCompositeScore(halfScores), 0.5);
});

console.log('\n=== THRESHOLD TESTS ===\n');

test('THRESHOLD constant is 0.78', () => {
  assert.strictEqual(THRESHOLD, 0.78);
});

test('CANDIDATE_MIN constant is 0.55', () => {
  assert.strictEqual(CANDIDATE_MIN, 0.55);
});

test('classify: score=0.80 → CONFIRMED, matched=true', () => {
  const result = classify(0.80);
  assert.strictEqual(result.label, CONFIRMED);
  assert.strictEqual(result.matched, true);
});

test('classify: score=0.78 → CONFIRMED (at threshold)', () => {
  assert.strictEqual(classify(0.78).label, CONFIRMED);
});

test('classify: score=0.62 → UNCONFIRMED, matched=true', () => {
  const result = classify(0.62);
  assert.strictEqual(result.label, UNCONFIRMED);
  assert.strictEqual(result.matched, true);
});

test('classify: score=0.55 → UNCONFIRMED (at candidate min)', () => {
  assert.strictEqual(classify(0.55).label, UNCONFIRMED);
});

test('classify: score=0.40 → DISCARD, matched=false', () => {
  const result = classify(0.40);
  assert.strictEqual(result.label, DISCARD);
  assert.strictEqual(result.matched, false);
});

test('classify: NaN → DISCARD, matched=false', () => {
  const result = classify(NaN);
  assert.strictEqual(result.label, DISCARD);
  assert.strictEqual(result.matched, false);
});

console.log('\n=== INTEGRATION: SCORER + THRESHOLD ===\n');

test('identical person → score ≥ THRESHOLD', () => {
  const personA = { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' };
  const personB = { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' };
  const { confidence } = computeScore(personA, personB);
  assert.ok(confidence >= THRESHOLD, `Expected >= ${THRESHOLD}, got ${confidence}`);
});

test('same name, 15-year age gap, no shared location → score < THRESHOLD', () => {
  const personA = { name: 'Ramesh Kumar', age: 30, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' };
  const personB = { name: 'Ramesh Kumar', age: 45, gender: 'M', unit_id: 'PS-099', district_id: 'D-08' };
  const { confidence } = computeScore(personA, personB);
  assert.ok(confidence < THRESHOLD, `Expected < ${THRESHOLD}, got ${confidence}`);
});

test('same name, different gender, no shared location → score < THRESHOLD', () => {
  const personA = { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' };
  const personB = { name: 'Ramesh Kumar', age: 34, gender: 'F', unit_id: 'PS-099', district_id: 'D-08' };
  const { confidence } = computeScore(personA, personB);
  assert.ok(confidence < THRESHOLD, `Expected < ${THRESHOLD}, got ${confidence}`);
});

console.log('\n=== INTEGRATION: ORCHESTRATOR (index.js) ===\n');

test('match() returns structured result with all fields', () => {
  const personA = { name: 'Sri Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' };
  const personB = { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' };
  const result = match(personA, personB);

  assert.ok(result.person_a, 'missing person_a');
  assert.ok(result.person_b, 'missing person_b');
  assert.ok(result.score_breakdown, 'missing score_breakdown');
  assert.ok(result.confidence !== undefined, 'missing confidence');
  assert.ok(result.classification, 'missing classification');

  assert.ok(result.person_a.normalised_name, 'missing normalised_name');
  assert.ok(result.person_a.phonetic_key, 'missing phonetic_key');
  assert.strictEqual(result.person_a.original_name, 'Sri Ramesh Kumar');
  assert.strictEqual(result.person_a.normalised_name, 'ramesh kumar');

  assert.ok(typeof result.score_breakdown.name_score === 'number');
  assert.ok(typeof result.score_breakdown.age_score === 'number');
  assert.ok(typeof result.score_breakdown.gender_score === 'number');
  assert.ok(typeof result.score_breakdown.location_score === 'number');

  assert.ok(['CONFIRMED', 'UNCONFIRMED', 'DISCARD'].includes(result.classification));
});

test('match() normalises names before scoring', () => {
  const personA = {
    original_name: 'Ramesh K',
    name: 'Ramesh K',
    age: 34,
    gender: 'M',
    unit_id: 'PS-042',
    district_id: 'D-07'
  };
  const personB = {
    original_name: 'Ramash Kumar',
    name: 'Ramash Kumar',
    age: 36,
    gender: 'M',
    unit_id: 'PS-042',
    district_id: 'D-07'
  };
  const result = match(personA, personB);
  assert.strictEqual(result.classification, CONFIRMED,
    `Expected CONFIRMED for similar persons with same location, got ${result.classification} (confidence=${result.confidence})`);
});

test('match() returns DISCARD for very different persons', () => {
  const personA = { name: 'Ramesh Kumar', age: 30, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' };
  const personB = { name: 'Suresh Babu', age: 50, gender: 'F', unit_id: 'PS-099', district_id: 'D-08' };
  const result = match(personA, personB);
  assert.strictEqual(result.classification, DISCARD);
});

test('match() includes matched boolean (true for CONFIRMED)', () => {
  const personA = { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' };
  const personB = { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' };
  const result = match(personA, personB);
  assert.strictEqual(result.matched, true);
});

test('match() includes matched boolean (false for DISCARD)', () => {
  const personA = { name: 'Ramesh Kumar', age: 30, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' };
  const personB = { name: 'Suresh Babu', age: 50, gender: 'F', unit_id: 'PS-099', district_id: 'D-08' };
  const result = match(personA, personB);
  assert.strictEqual(result.matched, false);
});

console.log('\n=== MATCH CANDIDATES TESTS ===\n');

test('matchCandidates returns sorted results with person and score', () => {
  const target = { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' };
  const candidates = [
    { name: 'Suresh Babu', age: 28, gender: 'M', unit_id: 'PS-099', district_id: 'D-08' },
    { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' },
    { name: 'Ramash Kumar', age: 36, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' }
  ];
  const results = matchCandidates(target, candidates);

  assert.ok(Array.isArray(results), 'should return an array');
  assert.strictEqual(results.length, 3, 'should have 3 results');

  results.forEach(r => {
    assert.ok(r.person, 'missing person');
    assert.ok(typeof r.score === 'number', 'missing score');
  });

  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i - 1].score >= results[i].score, 'should be sorted descending by score');
  }

  assert.ok(results[0].score >= THRESHOLD, 'best match should have high confidence');
  assert.strictEqual(results[0].person, candidates[1], 'first result should be the identical candidate');
});

test('matchCandidates handles empty array', () => {
  const target = { name: 'Ramesh Kumar', age: 34, gender: 'M', unit_id: 'PS-042', district_id: 'D-07' };
  const results = matchCandidates(target, []);
  assert.ok(Array.isArray(results), 'should return an array');
  assert.strictEqual(results.length, 0, 'should be empty');
});

console.log('\n=== SUMMARY ===\n');
const total = passed + failed;
console.log(`  Total: ${total}  |  Passed: ${passed}  |  Failed: ${failed}\n`);

if (failed > 0) {
  process.exit(1);
}
