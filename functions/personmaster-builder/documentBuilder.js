'use strict';

var fs = require('fs');
var path = require('path');

var DATA_DIR = path.resolve(__dirname, '..', '..', 'data_pipeline', 'data');

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
  var raw = fs.readFileSync(filePath, 'utf8');
  var lines = raw.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
  if (lines.length < 2) return { headers: [], rows: [] };

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
  return { headers: headers, rows: rows };
}

function loadSourceData() {
  var accused = loadCSV(path.join(DATA_DIR, 'Accused.csv'));
  var victims = loadCSV(path.join(DATA_DIR, 'Victim.csv'));
  var complainants = loadCSV(path.join(DATA_DIR, 'ComplainantDetails.csv'));
  var caseMaster = loadCSV(path.join(DATA_DIR, 'CaseMaster.csv'));

  var cmLookup = {};
  for (var ci = 0; ci < caseMaster.rows.length; ci++) {
    var cm = caseMaster.rows[ci];
    cmLookup[cm.CaseMasterID] = cm;
  }

  var sourceByKey = {};

  for (var ai = 0; ai < accused.rows.length; ai++) {
    var a = accused.rows[ai];
    var key = 'Accused:A-' + a.AccusedMasterID;
    sourceByKey[key] = {
      table: 'Accused',
      source_id: 'A-' + a.AccusedMasterID,
      name: a.AccusedName || '',
      age: parseInt(a.AgeYear, 10) || null,
      gender: genderToChar(a.GenderID),
      case_id: String(a.CaseMasterID || '').trim(),
      role: 'Accused'
    };
  }

  for (var vi = 0; vi < victims.rows.length; vi++) {
    var v = victims.rows[vi];
    var key2 = 'Victim:V-' + v.VictimMasterID;
    sourceByKey[key2] = {
      table: 'Victim',
      source_id: 'V-' + v.VictimMasterID,
      name: v.VictimName || '',
      age: parseInt(v.AgeYear, 10) || null,
      gender: genderToChar(v.GenderID),
      case_id: String(v.CaseMasterID || '').trim(),
      role: 'Victim'
    };
  }

  for (var cii = 0; cii < complainants.rows.length; cii++) {
    var co = complainants.rows[cii];
    var key3 = 'ComplainantDetails:C-' + co.ComplainantID;
    sourceByKey[key3] = {
      table: 'ComplainantDetails',
      source_id: 'C-' + co.ComplainantID,
      name: co.ComplainantName || '',
      age: parseInt(co.AgeYear, 10) || null,
      gender: genderToChar(co.GenderID),
      case_id: String(co.CaseMasterID || '').trim(),
      role: 'ComplainantDetails'
    };
  }

  return { sourceByKey: sourceByKey, cmLookup: cmLookup };
}

function genderToChar(genderID) {
  var g = String(genderID || '').trim();
  if (g === '1' || g.toUpperCase() === 'M' || g.toUpperCase() === 'MALE') return 'M';
  if (g === '2' || g.toUpperCase() === 'F' || g.toUpperCase() === 'FEMALE') return 'F';
  return null;
}

function resolveMember(member, sourceData) {
  var key = member.table + ':' + member.source_id;
  var record = sourceData.sourceByKey[key];
  if (!record) {
    return {
      table: member.table,
      source_id: member.source_id,
      name: null,
      age: null,
      gender: null,
      case_id: null,
      role: member.table
    };
  }
  return record;
}

function chooseCanonicalName(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];

  var freq = {};
  var normalized = {};
  for (var ni = 0; ni < names.length; ni++) {
    var n = names[ni];
    var key = n.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
    if (!normalized[key]) normalized[key] = [];
    normalized[key].push(n);
  }

  var mostFreqNorm = '';
  var maxCount = 0;
  for (var nk in normalized) {
    if (normalized[nk].length > maxCount) {
      maxCount = normalized[nk].length;
      mostFreqNorm = nk;
    }
  }

  var candidates = normalized[mostFreqNorm];
  candidates.sort(function(a, b) {
    if (a.length !== b.length) return b.length - a.length;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });

  return candidates[0];
}

function buildAliases(sourceRecords) {
  var seen = {};
  var aliases = [];
  for (var si = 0; si < sourceRecords.length; si++) {
    var name = sourceRecords[si].name;
    if (!name) continue;
    var normalised = name.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
    if (!normalised) continue;
    if (!seen[normalised]) {
      seen[normalised] = true;
      aliases.push(name);
    }
  }
  aliases.sort();
  return aliases;
}

function computeRolesSummary(sourceRecords) {
  var accused = 0;
  var victim = 0;
  var complainant = 0;
  for (var si = 0; si < sourceRecords.length; si++) {
    var table = sourceRecords[si].table;
    if (table === 'Accused') accused++;
    else if (table === 'Victim') victim++;
    else if (table === 'ComplainantDetails') complainant++;
  }
  return {
    accused_count: accused,
    victim_count: victim,
    complainant_count: complainant
  };
}

function computeDemographics(sourceRecords) {
  var genderCounts = {};
  var ages = [];

  for (var si = 0; si < sourceRecords.length; si++) {
    var rec = sourceRecords[si];
    if (rec.gender) {
      genderCounts[rec.gender] = (genderCounts[rec.gender] || 0) + 1;
    }
    if (rec.age !== null && rec.age !== undefined && !isNaN(rec.age)) {
      ages.push(rec.age);
    }
  }

  var gender = '';
  var maxG = 0;
  for (var g in genderCounts) {
    if (genderCounts[g] > maxG) {
      maxG = genderCounts[g];
      gender = g;
    }
  }

  var estimatedAge = null;
  if (ages.length > 0) {
    ages.sort(function(a, b) { return a - b; });
    var mid = Math.floor(ages.length / 2);
    estimatedAge = ages.length % 2 === 0
      ? Math.round((ages[mid - 1] + ages[mid]) / 2)
      : ages[mid];
  }

  return {
    gender: gender || null,
    estimated_age: estimatedAge,
    district: null,
    unit: null
  };
}

function buildConfidenceIndex(confirmedEdges, memberToCluster) {
  var clusterScores = {};
  for (var ei = 0; ei < confirmedEdges.length; ei++) {
    var edge = confirmedEdges[ei];
    var keyA = edge.recordA.source_table + ':' + edge.recordA.source_id;
    var keyB = edge.recordB.source_table + ':' + edge.recordB.source_id;
    var clusterA = memberToCluster[keyA];
    var clusterB = memberToCluster[keyB];
    if (clusterA === undefined || clusterB === undefined) continue;
    if (clusterA !== clusterB) continue;

    var score = edge.confidence;
    if (typeof score !== 'number' || isNaN(score)) continue;

    if (!clusterScores[clusterA]) clusterScores[clusterA] = [];
    clusterScores[clusterA].push(score);
  }
  return clusterScores;
}

function computeConfidenceForCluster(scores) {
  if (!scores || scores.length === 0) {
    return {
      cluster_size: 0,
      average_match_score: null,
      minimum_match_score: null,
      maximum_match_score: null
    };
  }
  var sum = 0;
  var min = scores[0];
  var max = scores[0];
  for (var si = 0; si < scores.length; si++) {
    sum += scores[si];
    if (scores[si] < min) min = scores[si];
    if (scores[si] > max) max = scores[si];
  }
  return {
    cluster_size: scores.length,
    average_match_score: parseFloat((sum / scores.length).toFixed(4)),
    minimum_match_score: min,
    maximum_match_score: max
  };
}

function buildDocument(cluster, clusterIdx, sourceData, clusterScores) {
  var records = cluster.members.map(function(m) {
    return resolveMember(m, sourceData);
  });

  var aliases = buildAliases(records);
  var rolesSummary = computeRolesSummary(records);
  var demographics = computeDemographics(records);
  var scores = clusterScores && clusterScores[clusterIdx] ? clusterScores[clusterIdx] : [];

  var sourceRecords = records.map(function(r) {
    return {
      table: r.table,
      source_id: r.source_id,
      case_id: r.case_id,
      role: r.role
    };
  });

  var names = records.map(function(r) { return r.name; }).filter(function(n) { return n; });
  var canonicalName = chooseCanonicalName(names);

  var now = new Date().toISOString();

  return {
    person_id: cluster.person_id,
    canonical_name: canonicalName,
    aliases: aliases,
    source_records: sourceRecords,
    roles_summary: rolesSummary,
    demographics: demographics,
    confidence: {
      cluster_size: cluster.members.length,
      average_match_score: computeConfidenceForCluster(scores).average_match_score,
      minimum_match_score: computeConfidenceForCluster(scores).minimum_match_score,
      maximum_match_score: computeConfidenceForCluster(scores).maximum_match_score
    },
    meta: {
      created_at: now,
      algorithm_version: 'v1',
      entity_resolution_version: '4.2B'
    }
  };
}

function validateDocument(doc) {
  if (!doc.person_id) {
    throw new Error('Validation failed: document missing person_id');
  }

  var seenAliases = {};
  for (var ai = 0; ai < doc.aliases.length; ai++) {
    var aKey = doc.aliases[ai].toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
    if (seenAliases[aKey]) {
      throw new Error('Validation failed: duplicate alias "' + doc.aliases[ai] + '" in ' + doc.person_id);
    }
    seenAliases[aKey] = true;
  }

  var seenSR = {};
  for (var si = 0; si < doc.source_records.length; si++) {
    var sr = doc.source_records[si];
    var srKey = sr.table + ':' + sr.source_id;
    if (seenSR[srKey]) {
      throw new Error('Validation failed: duplicate source_record ' + srKey + ' in ' + doc.person_id);
    }
    seenSR[srKey] = true;
  }

  if (!doc.canonical_name) {
    throw new Error('Validation failed: canonical_name is empty in ' + doc.person_id);
  }

  var totalFromSummary = doc.roles_summary.accused_count +
    doc.roles_summary.victim_count +
    doc.roles_summary.complainant_count;
  if (totalFromSummary !== doc.source_records.length) {
    throw new Error(
      'Validation failed: role counts (' + totalFromSummary + ') do not match ' +
      'source_records length (' + doc.source_records.length + ') in ' + doc.person_id
    );
  }

  return true;
}

function validateAllDocuments(docs) {
  for (var di = 0; di < docs.length; di++) {
    validateDocument(docs[di]);
  }
  return true;
}

function buildAllDocuments(clusters, sourceData, confirmedEdges) {
  var memberToCluster = {};
  for (var ci = 0; ci < clusters.length; ci++) {
    for (var mi = 0; mi < clusters[ci].members.length; mi++) {
      var key = clusters[ci].members[mi].table + ':' + clusters[ci].members[mi].source_id;
      memberToCluster[key] = ci;
    }
  }

  var clusterScores = buildConfidenceIndex(confirmedEdges, memberToCluster);

  var documents = [];
  for (var ci2 = 0; ci2 < clusters.length; ci2++) {
    var doc = buildDocument(clusters[ci2], ci2, sourceData, clusterScores);
    documents.push(doc);
  }

  return documents;
}

module.exports = {
  loadSourceData,
  buildDocument,
  buildAllDocuments,
  validateDocument,
  validateAllDocuments,
  chooseCanonicalName,
  buildAliases,
  computeRolesSummary,
  computeDemographics,
  computeConfidenceForCluster,
  resolveMember
};
