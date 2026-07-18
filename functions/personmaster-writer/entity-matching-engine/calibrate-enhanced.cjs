'use strict';

var { readFileSync, existsSync, mkdirSync, writeFileSync } = require('fs');
var { join, resolve, dirname } = require('path');

var normaliser = require('./normaliser');
var scorer = require('./scorer');
var threshold = require('./threshold');
var blocking = require('./blocking');

var normaliseName = normaliser.normaliseName;
var computeScore = scorer.computeScore;
var STRATEGIES = blocking.STRATEGIES;

var scriptDir = dirname(require.resolve('./calibrate-enhanced.cjs'));
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

function runCalibration(records, groundTruthMap, label, strategies) {
  var sourceToProfile = groundTruthMap.sourceToProfile;
  var samePersonPairs = groundTruthMap.samePersonPairs;
  var strats = strategies || STRATEGIES;

  var stratNames = strats.map(function(s) { return s.name; }).join(' + ');

  console.log('\n' + '='.repeat(60));
  console.log('  ' + label);
  console.log('='.repeat(60));

  console.log('  Generating unique candidate pairs via blocking...');
  var t0 = Date.now();
  var pairs = blocking.generateUniquePairsWithStrategy(records, strats);
  var t1 = Date.now();
  console.log('  Strategies: ' + stratNames);
  console.log('  Unique pairs: ' + pairs.length + '  (generated in ' + ((t1 - t0) / 1000).toFixed(1) + 's)');

  var pairsByStrategy = {};
  for (var si = 0; si < strats.length; si++) {
    var strat = strats[si];
    var stratPairs = blocking.generateUniquePairsWithStrategy(records, [strat]);
    pairsByStrategy[strat.name] = stratPairs.length;
  }
  console.log('  Pairs per strategy:');
  for (var sn in pairsByStrategy) {
    console.log('    ' + sn + ': ' + pairsByStrategy[sn]);
  }

  console.log('\n  Scoring ' + pairs.length + ' candidate pairs...');
  var t2 = Date.now();
  var scored = [];
  var matchedCount = 0;
  for (var pi = 0; pi < pairs.length; pi++) {
    var pair = pairs[pi];
    var result = computeScore(pair.a, pair.b);

    var profA = sourceToProfile[pair.a.source_id] || null;
    var profB = sourceToProfile[pair.b.source_id] || null;
    var isMatch = !!(profA && profB && profA === profB);
    if (isMatch) matchedCount++;

    scored.push({ confidence: result.confidence, is_match: isMatch });
  }
  var t3 = Date.now();
  console.log('  Scored in ' + ((t3 - t2) / 1000).toFixed(1) + 's');
  console.log('  Ground-truth matches found: ' + matchedCount + ' / ' + samePersonPairs);
  var pctFound = (matchedCount / samePersonPairs * 100).toFixed(1);
  console.log('  Coverage: ' + pctFound + '% of all same-person pairs');

  console.log('\n  Evaluating thresholds 0.60 \u2013 0.90...\n');
  console.log('  Threshold  Precision  Recall     F1         TP    FP    FN');
  console.log('  ---------  ---------  ---------  ---------  ----  ----  ----');

  var results = [];
  for (var raw = 60; raw <= 90; raw++) {
    var t = raw / 100;
    var tp = 0, fp = 0, fn = 0;
    for (var si2 = 0; si2 < scored.length; si2++) {
      var s = scored[si2];
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
    console.log('  ' + t.toFixed(2).padStart(9) + '  ' +
      precision.toFixed(4).padStart(9) + '  ' +
      recall.toFixed(4).padStart(9) + '  ' +
      f1.toFixed(4).padStart(9) + '  ' +
      String(tp).padStart(4) + '  ' + String(fp).padStart(4) + '  ' + String(fn).padStart(4));
    results.push({ threshold: t, tp: tp, fp: fp, fn: fn, precision: precision, recall: recall, f1: f1 });
  }

  var bestF1 = results.reduce(function(a, b) { return a.f1 >= b.f1 ? a : b; });
  var best = results.filter(function(r) { return r.f1 === bestF1.f1; })
    .sort(function(a, b) { return b.precision - a.precision; })[0];

  console.log('');
  console.log('  Best F1 threshold: ' + best.threshold.toFixed(2) + '  (F1=' + best.f1.toFixed(4) +
    ', P=' + best.precision.toFixed(4) + ', R=' + best.recall.toFixed(4) + ')');
  console.log('  TP=' + best.tp + '  FP=' + best.fp + '  FN=' + best.fn);

  return {
    label: label,
    totalPairs: pairs.length,
    pairsByStrategy: pairsByStrategy,
    matchedCount: matchedCount,
    samePersonPairs: samePersonPairs,
    coveragePct: parseFloat(pctFound),
    results: results,
    best: best
  };
}

function main() {
  console.log('=== Multi-Strategy Blocking & Threshold Calibration ===\n');

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
  for (var pid in profileGroups) {
    var members = profileGroups[pid];
    if (members.length > 1) samePersonPairs += members.length * (members.length - 1) / 2;
  }
  console.log('  Unique profiles: ' + Object.keys(profileGroups).length);
  console.log('  Same-person pairs in ground truth: ' + samePersonPairs + '\n');

  console.log('Loading Accused records...');
  var accusedRows = loadCSV(join(dataDir, 'Accused.csv'));
  console.log('  Loaded ' + accusedRows.length + ' Accused records');

  var records = [];
  for (var ri = 0; ri < accusedRows.length; ri++) {
    var row = accusedRows[ri];
    records.push({
      source_id: 'A-' + row.AccusedMasterID,
      source_table: 'Accused',
      name: row.AccusedName || '',
      age: parseInt(row.AgeYear, 10) || null,
      g: String(row.GenderID).trim() === '1' ? 'M' : (String(row.GenderID).trim() === '2' ? 'F' : null)
    });
  }

  console.log('Normalising names...');
  for (var ni = 0; ni < records.length; ni++) {
    records[ni].normalised_name = normaliseName(records[ni].name);
  }

  var gtMap = { sourceToProfile: sourceToProfile, samePersonPairs: samePersonPairs };

  var firstOnly = [STRATEGIES[0]];
  var allStratsList = STRATEGIES;

  var singleStrat = runCalibration(records, gtMap, 'STRATEGY 1: First-token phonetic only', firstOnly);
  var singlePairs = singleStrat.totalPairs;

  var multiStrat = runCalibration(records, gtMap, 'ALL 4 STRATEGIES: first-token + last-token + initial-surname + surname-age', allStratsList);

  console.log('\n' + '='.repeat(60));
  console.log('  COMPARISON: Single vs Multi-Strategy Blocking');
  console.log('='.repeat(60));
  console.log('');
  console.log('  Metric                    Single       Multi       Improvement');
  console.log('  ' + '-'.repeat(56));
  console.log('  Candidate pairs          ' +
    String(singlePairs).padStart(10) + '  ' +
    String(multiStrat.totalPairs).padStart(10) + '  ' +
    'x' + (multiStrat.totalPairs / singlePairs).toFixed(1));
  console.log('  Ground-truth pairs found ' +
    String(singleStrat.matchedCount).padStart(10) + '  ' +
    String(multiStrat.matchedCount).padStart(10) + '  ' +
    '+' + (multiStrat.matchedCount - singleStrat.matchedCount));
  console.log('  Coverage                 ' +
    singleStrat.coveragePct.toFixed(1).padStart(9) + '%' +
    multiStrat.coveragePct.toFixed(1).padStart(10) + '%' +
    (multiStrat.coveragePct - singleStrat.coveragePct).toFixed(1).padStart(10) + 'pp');
  console.log('  Best F1                  ' +
    singleStrat.best.f1.toFixed(4).padStart(10) + '  ' +
    multiStrat.best.f1.toFixed(4).padStart(10) + '  ' +
    '+' + (multiStrat.best.f1 - singleStrat.best.f1).toFixed(4));
  console.log('  Best threshold           ' +
    singleStrat.best.threshold.toFixed(2).padStart(10) + '  ' +
    multiStrat.best.threshold.toFixed(2).padStart(10));
  console.log('');

  var outputDir = join(scriptDir, 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  var report = {
    calibration_timestamp: new Date().toISOString(),
    single_strategy: {
      name: 'first_token_phonetic',
      candidate_pairs: singlePairs,
      ground_truth_pairs_found: singleStrat.matchedCount,
      coverage_pct: singleStrat.coveragePct,
      best: singleStrat.best
    },
    multi_strategy: {
      strategies: STRATEGIES.map(function(s) { return s.name; }),
      candidate_pairs: multiStrat.totalPairs,
      pairs_by_strategy: multiStrat.pairsByStrategy,
      ground_truth_pairs_found: multiStrat.matchedCount,
      coverage_pct: multiStrat.coveragePct,
      best: multiStrat.best
    },
    improvement: {
      candidate_pairs_multiplier: (multiStrat.totalPairs / singlePairs).toFixed(1),
      additional_gt_pairs_found: multiStrat.matchedCount - singleStrat.matchedCount,
      coverage_pp_gain: (multiStrat.coveragePct - singleStrat.coveragePct).toFixed(1),
      f1_gain: (multiStrat.best.f1 - singleStrat.best.f1).toFixed(4)
    },
    current_threshold: threshold.THRESHOLD,
    recommendation: 'Multi-strategy blocking significantly increases ground-truth coverage. ' +
      'Re-evaluate threshold after selecting final blocking strategy.'
  };

  writeFileSync(join(outputDir, 'calibration_enhanced_report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('Wrote output/calibration_enhanced_report.json');
  console.log('\nDone.');
}

main();
