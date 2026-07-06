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
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
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
    for (var j = 0; j < headers.length; j++) row[headers[j]] = values[j] || '';
    rows.push(row);
  }
  return { headers: headers, rows: rows };
}

function buildCaseLookup() {
  var cm = loadCSV(path.join(DATA_DIR, 'CaseMaster.csv'));
  var lookup = {};
  for (var ci = 0; ci < cm.rows.length; ci++) {
    var row = cm.rows[ci];
    lookup[row.CaseMasterID] = row;
  }
  return lookup;
}

function classifyMatch(match) {
  var c = match.classification;
  if (typeof c === 'object' && c !== null) return c.label;
  return c;
}

function makeEdgeKey(source, target, edgeType) {
  if (source < target) return source + '|' + target + '|' + edgeType;
  return target + '|' + source + '|' + edgeType;
}

function buildCoAccusedEdges(caseToPms) {
  var edgeMap = {};

  for (var caseId in caseToPms) {
    var entries = caseToPms[caseId];
    var accusedPms = [];
    for (var ei = 0; ei < entries.length; ei++) {
      if (entries[ei].role === 'Accused') {
        accusedPms.push(entries[ei].person_id);
      }
    }

    var uniquePms = [];
    var seen = {};
    for (var ui = 0; ui < accusedPms.length; ui++) {
      if (!seen[accusedPms[ui]]) {
        seen[accusedPms[ui]] = true;
        uniquePms.push(accusedPms[ui]);
      }
    }

    for (var i = 0; i < uniquePms.length; i++) {
      for (var j = i + 1; j < uniquePms.length; j++) {
        var source = uniquePms[i];
        var target = uniquePms[j];
        if (source === target) continue;
        var eKey = makeEdgeKey(source, target, 'CO_ACCUSED');
        if (!edgeMap[eKey]) {
          edgeMap[eKey] = {
            source: source,
            target: target,
            edge_type: 'CO_ACCUSED',
            weight: 0,
            case_ids: [],
            occurrence_count: 0
          };
        }
        edgeMap[eKey].case_ids.push(caseId);
        edgeMap[eKey].occurrence_count++;
      }
    }
  }

  var edges = [];
  for (var ek in edgeMap) {
    var em = edgeMap[ek];
    em.weight = em.occurrence_count;
    edges.push(em);
  }
  return edges;
}

function buildAccusedToVictimEdges(caseToPms, cmLookup) {
  var edgeMap = {};

  for (var caseId in caseToPms) {
    var entries = caseToPms[caseId];
    var accusedPms = [];
    var victimPms = [];
    var seenA = {};
    var seenV = {};

    for (var ei = 0; ei < entries.length; ei++) {
      var e = entries[ei];
      if (e.role === 'Accused' && !seenA[e.person_id]) {
        seenA[e.person_id] = true;
        accusedPms.push(e.person_id);
      } else if (e.role === 'Victim' && !seenV[e.person_id]) {
        seenV[e.person_id] = true;
        victimPms.push(e.person_id);
      }
    }

    var cm = cmLookup[caseId] || {};
    var crimeHead = (cm.CrimeMajorHeadID || '').trim() || null;

    for (var ai = 0; ai < accusedPms.length; ai++) {
      for (var vi = 0; vi < victimPms.length; vi++) {
        var source = accusedPms[ai];
        var target = victimPms[vi];
        if (source === target) continue;
        var eKey = makeEdgeKey(source, target, 'ACCUSED_TO_VICTIM');
        if (!edgeMap[eKey]) {
          edgeMap[eKey] = {
            source: source,
            target: target,
            edge_type: 'ACCUSED_TO_VICTIM',
            weight: 0,
            case_ids: [],
            crime_head: crimeHead,
            occurrence_count: 0
          };
        }
        edgeMap[eKey].case_ids.push(caseId);
        edgeMap[eKey].occurrence_count++;
      }
    }
  }

  var edges = [];
  for (var ek in edgeMap) {
    var em = edgeMap[ek];
    em.weight = em.occurrence_count;
    edges.push(em);
  }
  return edges;
}

function buildSharedLocationEdges(caseToPms, cmLookup) {
  var psToPms = {};

  for (var caseId in caseToPms) {
    var cm = cmLookup[caseId];
    if (!cm) continue;
    var ps = (cm.PoliceStationID || '').trim();
    if (!ps) continue;

    var entries = caseToPms[caseId];
    var uniquePms = [];
    var seen = {};
    for (var ei = 0; ei < entries.length; ei++) {
      if (!seen[entries[ei].person_id]) {
        seen[entries[ei].person_id] = true;
        uniquePms.push(entries[ei].person_id);
      }
    }

    if (!psToPms[ps]) psToPms[ps] = {};
    for (var ui = 0; ui < uniquePms.length; ui++) {
      var pid = uniquePms[ui];
      if (!psToPms[ps][pid]) psToPms[ps][pid] = 0;
      psToPms[ps][pid]++;
    }
  }

  var edgeMap = {};

  for (var ps in psToPms) {
    var pms = Object.keys(psToPms[ps]);
    for (var i = 0; i < pms.length; i++) {
      for (var j = i + 1; j < pms.length; j++) {
        var source = pms[i];
        var target = pms[j];
        var eKey = makeEdgeKey(source, target, 'SHARED_LOCATION');
        if (!edgeMap[eKey]) {
          edgeMap[eKey] = {
            source: source,
            target: target,
            edge_type: 'SHARED_LOCATION',
            weight: 0,
            metadata: {
              unit: ps,
              district: null,
              occurrence_count: 0
            }
          };
        }
        edgeMap[eKey].metadata.occurrence_count++;
      }
    }
  }

  var edges = [];
  for (var ek in edgeMap) {
    var em = edgeMap[ek];
    em.weight = em.metadata.occurrence_count;
    edges.push(em);
  }
  return edges;
}

function buildUnconfirmedMatchEdges(unconfirmedMatches, srToPm) {
  var edgeMap = {};

  for (var mi = 0; mi < unconfirmedMatches.length; mi++) {
    var m = unconfirmedMatches[mi];
    var keyA = m.recordA.source_table + ':' + m.recordA.source_id;
    var keyB = m.recordB.source_table + ':' + m.recordB.source_id;
    var pmA = srToPm[keyA];
    var pmB = srToPm[keyB];
    if (!pmA || !pmB) continue;
    if (pmA === pmB) continue;

    var eKey = makeEdgeKey(pmA, pmB, 'UNCONFIRMED_MATCH');
    if (!edgeMap[eKey]) {
      edgeMap[eKey] = {
        source: pmA,
        target: pmB,
        edge_type: 'UNCONFIRMED_MATCH',
        weight: m.confidence || 0,
        metadata: {
          confidence: m.confidence || 0,
          score_breakdown: m.score_breakdown || {}
        }
      };
    } else {
      if (m.confidence > edgeMap[eKey].weight) {
        edgeMap[eKey].weight = m.confidence;
        edgeMap[eKey].metadata.confidence = m.confidence;
        edgeMap[eKey].metadata.score_breakdown = m.score_breakdown || {};
      }
    }
  }

  var edges = [];
  for (var ek in edgeMap) edges.push(edgeMap[ek]);
  return edges;
}

function buildEdges(documents, allMatches, srToPm) {
  console.log('\nBuilding case-to-PM index...');
  var caseToPms = {};
  var pmCount = 0;

  for (var di = 0; di < documents.length; di++) {
    var doc = documents[di];
    pmCount++;
    for (var si = 0; si < doc.source_records.length; si++) {
      var sr = doc.source_records[si];
      var role = sr.role === 'ComplainantDetails' ? 'Complainant' : sr.role;
      if (!caseToPms[sr.case_id]) caseToPms[sr.case_id] = [];
      caseToPms[sr.case_id].push({
        person_id: doc.person_id,
        role: role
      });
    }
  }
  console.log('  Cases indexed: ' + Object.keys(caseToPms).length);

  var cmLookup = buildCaseLookup();
  console.log('  CaseMaster records: ' + Object.keys(cmLookup).length);

  var unconfirmedMatches = allMatches.filter(function(m) {
    return classifyMatch(m) === 'UNCONFIRMED';
  });
  console.log('  UNCONFIRMED matches: ' + unconfirmedMatches.length);

  console.log('\nBuilding CO_ACCUSED edges...');
  var coAccused = buildCoAccusedEdges(caseToPms);
  console.log('  Edges: ' + coAccused.length);

  console.log('Building ACCUSED_TO_VICTIM edges...');
  var accusedToVictim = buildAccusedToVictimEdges(caseToPms, cmLookup);
  console.log('  Edges: ' + accusedToVictim.length);

  console.log('Building SHARED_LOCATION edges...');
  var sharedLocation = buildSharedLocationEdges(caseToPms, cmLookup);
  console.log('  Edges: ' + sharedLocation.length);

  console.log('Building UNCONFIRMED_MATCH edges...');
  var unconfirmedEdges = buildUnconfirmedMatchEdges(unconfirmedMatches, srToPm);
  console.log('  Edges: ' + unconfirmedEdges.length);

  var allEdgesRaw = coAccused.concat(accusedToVictim).concat(sharedLocation).concat(unconfirmedEdges);

  var edgeIdCounter = 0;
  var allEdges = allEdgesRaw.map(function(e) {
    edgeIdCounter++;
    var metadataObj = {};
    if (e.edge_type === 'CO_ACCUSED') {
      metadataObj = {
        case_ids: e.case_ids || [],
        occurrence_count: e.occurrence_count || 0
      };
    } else if (e.edge_type === 'ACCUSED_TO_VICTIM') {
      metadataObj = {
        case_ids: e.case_ids || [],
        crime_head: e.crime_head || null,
        occurrence_count: e.occurrence_count || 0
      };
    } else if (e.edge_type === 'SHARED_LOCATION') {
      metadataObj = e.metadata || { unit: null, district: null, occurrence_count: 0 };
    } else if (e.edge_type === 'UNCONFIRMED_MATCH') {
      metadataObj = e.metadata || { confidence: 0, score_breakdown: {} };
    }

    return {
      edge_id: 'E' + String(edgeIdCounter).padStart(6, '0'),
      source: e.source,
      target: e.target,
      edge_type: e.edge_type,
      weight: e.weight || 0,
      metadata: metadataObj
    };
  });

  return allEdges;
}

module.exports = {
  buildEdges,
  buildCoAccusedEdges,
  buildAccusedToVictimEdges,
  buildSharedLocationEdges,
  buildUnconfirmedMatchEdges,
  buildCaseLookup,
  classifyMatch,
  makeEdgeKey
};
