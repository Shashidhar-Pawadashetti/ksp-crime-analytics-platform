'use strict';

var { readFileSync, existsSync, mkdirSync, writeFileSync } = require('fs');
var { join, resolve, dirname } = require('path');

var normaliser = require('./normaliser');
var phonetic = require('./phonetic');
var scorer = require('./scorer');
var threshold = require('./threshold');

var normaliseName = normaliser.normaliseName;
var generatePhoneticKey = phonetic.generatePhoneticKey;
var computeScore = scorer.computeScore;

var scriptDir = dirname(require.resolve('./calibrate-threshold.cjs'));
var projectRoot = resolve(scriptDir, '..', '..');
var dataDir = join(projectRoot, 'data_pipeline', 'data');

function parseCSVLine(line) {
  var result = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else current += ch;
  }
  result.push(current.trim());
  return result;
}

function loadCSV(filePath) {
  var raw = readFileSync(filePath, 'utf8');
  var lines = raw.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
  if (lines.length < 2) return [];
  var headers = parseCSVLine(lines[0]);
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var values = parseCSVLine(lines[i]);
    var row = {};
    for (var j = 0; j < headers.length; j++) row[headers[j]] = values[j] || '';
    rows.push(row);
  }
  return rows;
}

function main() {
  console.log('=== WBS 4.3 \u2014 Threshold Calibration ===\n');

  /* ---- Load ground truth ---- */
  console.log('Loading ground truth...');
  var groundTruth = loadCSV(join(dataDir, 'ground_truth_identities.csv'));
  console.log('  Loaded ' + groundTruth.length + ' ground truth records');

  var sourceToProfile = {};
  var profileGroups = {};
  for (var gi = 0; gi < groundTruth.length; gi++) {
    var gt = groundTruth[gi];
    var sourceId = 'A-' + gt.AccusedMasterID;
    var profileId = String(gt.BaseProfileID);
    sourceToProfile[sourceId] = profileId;
    if (!profileGroups[profileId]) profileGroups[profileId] = [];
    profileGroups[profileId].push(sourceId);
  }

  var samePersonPairs = 0;
  var profileCount = Object.keys(profileGroups).length;
  for (var pid in profileGroups) {
    var members = profileGroups[pid];
    if (members.length > 1) samePersonPairs += members.length * (members.length - 1) / 2;
  }
  console.log('  Unique BaseProfileIDs: ' + profileCount);
  console.log('  Same-person pairs (potential matches): ' + samePersonPairs + '\n');

  /* ---- Load accused records ---- */
  console.log('Loading Accused records...');
  var accusedRows = loadCSV(join(dataDir, 'Accused.csv'));
  console.log('  Loaded ' + accusedRows.length + ' Accused records');

  var records = [];
  for (var ri = 0; ri < accusedRows.length; ri++) {
    var row = accusedRows[ri];
    records.push({
      source_id: 'A-' + row.AccusedMasterID,
      name: row.AccusedName || '',
      age: parseInt(row.AgeYear, 10) || null,
      g: String(row.GenderID).trim() === '1' ? 'M' : (String(row.GenderID).trim() === '2' ? 'F' : null)
    });
  }

  /* ---- Build phonetic buckets ---- */
  console.log('Normalising names and building phonetic buckets...');
  for (var ni = 0; ni < records.length; ni++) {
    var rec = records[ni];
    rec.normalised_name = normaliseName(rec.name);
    rec.phonetic_key = generatePhoneticKey(rec.normalised_name);
  }

  var buckets = {};
  for (var bi = 0; bi < records.length; bi++) {
    var rec2 = records[bi];
    if (!rec2.phonetic_key) continue;
    if (!buckets[rec2.phonetic_key]) buckets[rec2.phonetic_key] = [];
    buckets[rec2.phonetic_key].push(rec2);
  }
  console.log('  Created ' + Object.keys(buckets).length + ' phonetic buckets\n');

  /* ---- Score pairs and compare with ground truth ---- */
  console.log('Scoring pairs within phonetic buckets...');
  var scored = [];
  for (var bk in buckets) {
    var group = buckets[bk];
    if (group.length < 2) continue;
    for (var i = 0; i < group.length; i++) {
      for (var j = i + 1; j < group.length; j++) {
        var recA = group[i], recB = group[j];
        if (recA.source_id === recB.source_id) continue;

        var result = computeScore(recA, recB);
        var profA = sourceToProfile[recA.source_id] || null;
        var profB = sourceToProfile[recB.source_id] || null;
        scored.push({
          confidence: result.confidence,
          is_match: !!(profA && profB && profA === profB)
        });
      }
    }
  }

  var actualMatches = scored.filter(function(s) { return s.is_match; });
  console.log('  Scored ' + scored.length + ' accused-accused pairs');
  console.log('  Same-bucket ground-truth matches: ' + actualMatches.length + ' / ' + samePersonPairs);
  var pct = ((1 - actualMatches.length / samePersonPairs) * 100).toFixed(1);
  console.log('  ' + pct + '% of same-person pairs are in DIFFERENT buckets (never compared)\n');

  /* ---- Diagnose bucket misses ---- */
  var missedSameBucket = {};
  for (var pid2 in profileGroups) {
    var members2 = profileGroups[pid2];
    if (members2.length < 2) continue;
    var keys = {};
    for (var mi = 0; mi < members2.length; mi++) {
      var rec = records.filter(function(r) { return r.source_id === members2[mi]; })[0];
      if (rec) keys[rec.source_id] = rec.phonetic_key;
    }
    var distinct = Object.keys(keys).reduce(function(acc, k) {
      if (acc.indexOf(keys[k]) === -1) acc.push(keys[k]);
      return acc;
    }, []);
    if (distinct.length > 1) missedSameBucket[pid2] = { members: members2, keys: keys };
  }
  var missedPct = (Object.keys(missedSameBucket).length / profileCount * 100).toFixed(1);
  console.log('  Profiles with members split across buckets: ' + Object.keys(missedSameBucket).length + ' / ' + profileCount + ' (' + missedPct + '%)');
  console.log('  (First-token initials cause different phonetic keys)\n');

  /* ---- Evaluate thresholds ---- */
  console.log('Evaluating thresholds 0.60 \u2013 0.90 (step 0.01)...\n');
  console.log('Threshold  Precision  Recall     F1         TP    FP    FN');
  console.log('---------  ---------  ---------  ---------  ----  ----  ----');

  var results = [];
  for (var raw = 60; raw <= 90; raw++) {
    var t = raw / 100;
    var tp = 0, fp = 0, fn = 0;
    for (var si = 0; si < scored.length; si++) {
      var s = scored[si];
      if (s.confidence >= t) {
        if (s.is_match) tp++; else fp++;
      } else {
        if (s.is_match) fn++;
      }
    }
    var precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    var recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    var f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    precision = Math.round(precision * 10000) / 10000;
    recall = Math.round(recall * 10000) / 10000;
    f1 = Math.round(f1 * 10000) / 10000;
    console.log(t.toFixed(2).padStart(9) + '  ' +
      precision.toFixed(4).padStart(9) + '  ' +
      recall.toFixed(4).padStart(9) + '  ' +
      f1.toFixed(4).padStart(9) + '  ' +
      String(tp).padStart(4) + '  ' + String(fp).padStart(4) + '  ' + String(fn).padStart(4));
    results.push({ threshold: t, tp: tp, fp: fp, fn: fn, precision: precision, recall: recall, f1: f1 });
  }

  var bestF1 = results.reduce(function(a, b) { return a.f1 >= b.f1 ? a : b; });
  var bestPrecAtMaxF1 = results.filter(function(r) { return r.f1 === bestF1.f1; })
    .sort(function(a, b) { return b.precision - a.precision; })[0];

  console.log('');
  console.log('='.repeat(60));
  console.log('  CALIBRATION RESULTS');
  console.log('='.repeat(60));
  console.log('');
  console.log('  Best-F1 threshold: ' + bestPrecAtMaxF1.threshold.toFixed(2));
  console.log('  F1:  ' + bestPrecAtMaxF1.f1.toFixed(4) + '  (Precision: ' + bestPrecAtMaxF1.precision.toFixed(4) + ', Recall: ' + bestPrecAtMaxF1.recall.toFixed(4) + ')');
  console.log('  TP=' + bestPrecAtMaxF1.tp + '  FP=' + bestPrecAtMaxF1.fp + '  FN=' + bestPrecAtMaxF1.fn);
  console.log('');
  console.log('  NOTE: These results are unreliable for production tuning because:');
  console.log('  1. ' + pct + '% of ground-truth pairs fall in different phonetic buckets');
  console.log('     (initials like "Jon" vs "J." change the first-token key)');
  console.log('  2. Calibration is based on only ' + actualMatches.length + ' / ' + samePersonPairs + ' same-person pairs');
  console.log('  3. The synthetic Faker-generated names do not reflect real Indian-name patterns');
  console.log('');
  console.log('  Keeping THRESHOLD at ' + threshold.THRESHOLD + ' (original calibrated value).');
  console.log('  Re-calibrate after improving blocking strategy to handle first-name initials.');
  console.log('');
  console.log('='.repeat(60));
  console.log('');

  /* ---- Write calibration report ---- */
  var outputDir = join(scriptDir, 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  var report = {
    calibration_timestamp: new Date().toISOString(),
    dataset: 'ground_truth_identities.csv (synthetic, Faker-generated)',
    total_accused_records: accusedRows.length,
    total_ground_truth_records: groundTruth.length,
    unique_profiles: profileCount,
    same_person_pairs_available: samePersonPairs,
    same_person_pairs_in_same_bucket: actualMatches.length,
    pct_missed_due_to_bucketing: parseFloat(pct),
    profiles_split_across_buckets: Object.keys(missedSameBucket).length,
    pct_profiles_split: parseFloat(missedPct),
    accused_pairs_scored: scored.length,
    thresholds_evaluated: results,
    best_threshold_candidate: bestPrecAtMaxF1.threshold,
    best_f1: bestPrecAtMaxF1.f1,
    best_precision: bestPrecAtMaxF1.precision,
    best_recall: bestPrecAtMaxF1.recall,
    best_confusion_matrix: { tp: bestPrecAtMaxF1.tp, fp: bestPrecAtMaxF1.fp, fn: bestPrecAtMaxF1.fn },
    current_threshold: threshold.THRESHOLD,
    current_candidate_min: threshold.CANDIDATE_MIN,
    decision: 'Kept current THRESHOLD. Calibration data unreliable due to synthetic name variations (initials) that split ground-truth pairs across buckets. Re-calibrate after improving blocking strategy.',
    recommendation: 'Add initial-expansion or multi-token phonetic key for blocking (e.g., soundex of first token + soundex of last token) before re-calibrating.'
  };

  writeFileSync(join(outputDir, 'calibration_report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('Wrote output/calibration_report.json');
  console.log('\nDone.');
}

main();
