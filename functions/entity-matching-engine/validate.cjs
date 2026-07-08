'use strict';

const { readFileSync, existsSync, mkdirSync, createWriteStream } = require('fs');
const { join, resolve, dirname } = require('path');

const normaliser = require('./normaliser');
const phonetic = require('./phonetic');
const scorer = require('./scorer');
const threshold = require('./threshold');

const normaliseName = normaliser.normaliseName;
const generatePhoneticKey = phonetic.generatePhoneticKey;
const computeScore = scorer.computeScore;
const classify = threshold.classify;
const THRESHOLD = threshold.THRESHOLD;
const CANDIDATE_MIN = threshold.CANDIDATE_MIN;

var scriptDir = dirname(require.resolve('./validate.cjs'));
var projectRoot = resolve(scriptDir, '..', '..');
var dataDir = join(projectRoot, 'data_pipeline', 'data');

var TABLE_CSV = {
  CaseMaster: 'CaseMaster.csv',
  Accused: 'Accused.csv',
  Victim: 'Victim.csv',
  ComplainantDetails: 'ComplainantDetails.csv'
};

function parseCSVLine(line) {
  var result = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
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
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }
    rows.push(row);
  }
  return rows;
}

function loadCaseMasterLookup(rows) {
  var lookup = {};
  for (var ri = 0; ri < rows.length; ri++) {
    var row = rows[ri];
    var rowid = String(row.CaseMasterID || row.ROWID || '').trim();
    if (!rowid) continue;
    lookup[rowid] = {
      latitude: parseFloat(row.Latitude || row.latitude || '0') || null,
      longitude: parseFloat(row.Longitude || row.longitude || '0') || null
    };
  }
  return lookup;
}

function genderToChar(genderID) {
  var g = String(genderID || '').trim();
  if (g === '1' || g.toUpperCase() === 'M' || g.toUpperCase() === 'MALE') return 'M';
  if (g === '2' || g.toUpperCase() === 'F' || g.toUpperCase() === 'FEMALE') return 'F';
  return null;
}

function collectPersonRecords(caseMasterLookup) {
  var records = [];

  var accused = loadCSV(join(dataDir, TABLE_CSV.Accused));
  for (var ai = 0; ai < accused.length; ai++) {
    var row = accused[ai];
    var cm = caseMasterLookup[String(row.CaseMasterID).trim()] || {};
    records.push({
      source_table: 'Accused',
      source_id: 'A-' + row.AccusedMasterID,
      name: row.AccusedName || '',
      age: parseInt(row.AgeYear, 10) || null,
      gender: genderToChar(row.GenderID),
      lat: cm.latitude,
      lon: cm.longitude,
      unit_id: null,
      district_id: null,
      caseMasterID: row.CaseMasterID
    });
  }

  var victims = loadCSV(join(dataDir, TABLE_CSV.Victim));
  for (var vi = 0; vi < victims.length; vi++) {
    var row2 = victims[vi];
    var cm2 = caseMasterLookup[String(row2.CaseMasterID).trim()] || {};
    records.push({
      source_table: 'Victim',
      source_id: 'V-' + row2.VictimMasterID,
      name: row2.VictimName || '',
      age: parseInt(row2.AgeYear, 10) || null,
      gender: genderToChar(row2.GenderID),
      lat: cm2.latitude,
      lon: cm2.longitude,
      unit_id: null,
      district_id: null,
      caseMasterID: row2.CaseMasterID
    });
  }

  var complainants = loadCSV(join(dataDir, TABLE_CSV.ComplainantDetails));
  for (var ci = 0; ci < complainants.length; ci++) {
    var row3 = complainants[ci];
    var cm3 = caseMasterLookup[String(row3.CaseMasterID).trim()] || {};
    records.push({
      source_table: 'ComplainantDetails',
      source_id: 'C-' + row3.ComplainantID,
      name: row3.ComplainantName || '',
      age: parseInt(row3.AgeYear, 10) || null,
      gender: genderToChar(row3.GenderID),
      lat: cm3.latitude,
      lon: cm3.longitude,
      unit_id: null,
      district_id: null,
      caseMasterID: row3.CaseMasterID
    });
  }

  return records;
}

function buildPhoneticBuckets(records) {
  for (var ri = 0; ri < records.length; ri++) {
    var rec = records[ri];
    rec.normalised_name = normaliseName(rec.name);
    rec.phonetic_key = generatePhoneticKey(rec.normalised_name);
  }

  var buckets = {};
  for (var rj = 0; rj < records.length; rj++) {
    var rec2 = records[rj];
    if (!rec2.phonetic_key) continue;
    if (!buckets[rec2.phonetic_key]) buckets[rec2.phonetic_key] = [];
    buckets[rec2.phonetic_key].push(rec2);
  }

  return buckets;
}

function writeMatchEntry(stream, match, isFirst) {
  if (!isFirst) stream.write(',\n');
  stream.write(JSON.stringify(match));
}

function runMatching(buckets, outputPath) {
  var stream = createWriteStream(outputPath, { encoding: 'utf8' });
  stream.write('[\n');

  var stats = { totalComparisons: 0, confirmed: 0, unconfirmed: 0, discarded: 0 };
  var writtenCount = 0;

  for (var bk in buckets) {
    var group = buckets[bk];
    if (group.length < 2) continue;

    for (var i = 0; i < group.length; i++) {
      for (var j = i + 1; j < group.length; j++) {
        stats.totalComparisons++;

        var recA = group[i];
        var recB = group[j];

        if (recA.source_id === recB.source_id && recA.source_table === recB.source_table) {
          stats.totalComparisons--;
          continue;
        }

        var tables = [recA.source_table, recB.source_table];
        if (tables[0] === tables[1]) tables = [tables[0]];
        else tables.sort();

        var result = computeScore(recA, recB);
        var { label: classification } = classify(result.confidence);

        if (classification === 'DISCARD') {
          stats.discarded++;
          continue;
        }

        var match = {
          recordA: {
            source_id: recA.source_id,
            source_table: recA.source_table,
            caseMasterID: recA.caseMasterID,
            name: recA.name,
            normalised_name: recA.normalised_name,
            phonetic_key: recA.phonetic_key,
            age: recA.age,
            gender: recA.gender
          },
          recordB: {
            source_id: recB.source_id,
            source_table: recB.source_table,
            caseMasterID: recB.caseMasterID,
            name: recB.name,
            normalised_name: recB.normalised_name,
            phonetic_key: recB.phonetic_key,
            age: recB.age,
            gender: recB.gender
          },
          tables: tables,
          confidence: result.confidence,
          classification: classification,
          score_breakdown: result.score_breakdown
        };

        writeMatchEntry(stream, match, writtenCount === 0);
        writtenCount++;

        if (classification === 'CONFIRMED') stats.confirmed++;
        else if (classification === 'UNCONFIRMED') stats.unconfirmed++;
      }
    }
  }

  return new Promise(function(resolve) {
    stream.write('\n]\n');
    stream.end(function() {
      resolve(stats);
    });
  });
}

function printSummary(records, buckets, stats, writtenCount) {
  var bucketSizes = [];
  for (var bk in buckets) bucketSizes.push(buckets[bk].length);

  var singleCount = 0;
  var multiCount = 0;
  for (var bsi = 0; bsi < bucketSizes.length; bsi++) {
    if (bucketSizes[bsi] < 2) singleCount++;
    else multiCount++;
  }

  var sum = 0;
  for (var bsi2 = 0; bsi2 < bucketSizes.length; bsi2++) sum += bucketSizes[bsi2];
  var avgSize = bucketSizes.length > 0 ? (sum / bucketSizes.length).toFixed(1) : '0.0';
  var maxSize = bucketSizes.length > 0 ? Math.max.apply(null, bucketSizes) : 0;

  var accusedCount = 0, victimCount = 0, compCount = 0;
  for (var ri = 0; ri < records.length; ri++) {
    if (records[ri].source_table === 'Accused') accusedCount++;
    else if (records[ri].source_table === 'Victim') victimCount++;
    else if (records[ri].source_table === 'ComplainantDetails') compCount++;
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('  ENTITY MATCHING ENGINE \u2014 VALIDATION SUMMARY');
  console.log('='.repeat(60));
  console.log('');
  console.log('  Total records loaded:          ' + records.length);
  console.log('    Accused:                     ' + accusedCount);
  console.log('    Victim:                      ' + victimCount);
  console.log('    ComplainantDetails:          ' + compCount);
  console.log('');
  console.log('  Phonetic buckets created:      ' + bucketSizes.length);
  console.log('    Single-record buckets:       ' + singleCount);
  console.log('    Multi-record buckets:        ' + multiCount);
  console.log('    Largest bucket size:         ' + maxSize);
  console.log('    Avg bucket size (non-empty): ' + avgSize);
  console.log('');
  console.log('  Pairwise comparisons:          ' + stats.totalComparisons);
  console.log('');
  console.log('  +' + '-'.repeat(14) + '+' + '-'.repeat(9) + '+');
  console.log('  | CONFIRMED    | ' + String(stats.confirmed).padStart(7) + ' |');
  console.log('  | UNCONFIRMED  | ' + String(stats.unconfirmed).padStart(7) + ' |');
  console.log('  | DISCARDED    | ' + String(stats.discarded).padStart(7) + ' |');
  console.log('  +' + '-'.repeat(14) + '+' + '-'.repeat(9) + '+');
  console.log('  | Total kept   | ' + String(writtenCount).padStart(7) + ' |');
  console.log('  +' + '-'.repeat(14) + '+' + '-'.repeat(9) + '+');
  console.log('');
  console.log('  Current thresholds: THRESHOLD=' + THRESHOLD + ', CANDIDATE_MIN=' + CANDIDATE_MIN);
  console.log('');
  console.log('='.repeat(60));
}

function main() {
  console.log('Loading CaseMaster data...');
  var cmRows = loadCSV(join(dataDir, TABLE_CSV.CaseMaster));
  console.log('  Loaded ' + cmRows.length + ' CaseMaster records');

  var caseMasterLookup = loadCaseMasterLookup(cmRows);
  console.log('  Built lookup for ' + Object.keys(caseMasterLookup).length + ' CaseMaster ROWIDs');

  console.log('Loading person records...');
  var records = collectPersonRecords(caseMasterLookup);
  console.log('  Loaded ' + records.length + ' person records');

  console.log('Normalising names and building phonetic buckets...');
  var buckets = buildPhoneticBuckets(records);
  console.log('  Created ' + Object.keys(buckets).length + ' phonetic buckets');

  var outputDir = join(scriptDir, 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  var outputPath = join(outputDir, 'candidate_matches.json');

  console.log('Running pairwise matching within buckets (streaming to JSON)...');
  console.log('  Output: ' + outputPath);
  console.log('');

  runMatching(buckets, outputPath).then(function(stats) {
    var writtenCount = stats.confirmed + stats.unconfirmed;
    console.log('  Completed ' + stats.totalComparisons + ' comparisons');
    console.log('  Wrote ' + writtenCount + ' matches to output file');

    printSummary(records, buckets, stats, writtenCount);
  }).catch(function(err) {
    console.error('Error during matching:', err);
    process.exit(1);
  });
}

main();
