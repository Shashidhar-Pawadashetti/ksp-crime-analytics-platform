'use strict';

var { createEdge } = require('./edgeModel');
var { EDGE_TYPES } = require('./edgeTypes');

function buildCaseIndex(personDocuments) {
  var index = {};
  personDocuments.forEach(function (pm) {
    var pid = pm.person_id;
    if (!pid) return;
    (pm.source_records || []).forEach(function (sr) {
      var cid = sr.case_id;
      if (!cid) return;
      if (!index[cid]) index[cid] = [];
      index[cid].push({ person_id: pid, role: sr.table });
    });
  });
  return index;
}

function unique(arr) {
  var seen = {};
  arr.forEach(function (v) { seen[v] = true; });
  return Object.keys(seen);
}

function mergeEdge(existing, incoming) {
  var caseSet = {};
  (existing.case_ids || []).forEach(function (cid) { caseSet[cid] = true; });
  (incoming.case_ids || []).forEach(function (cid) { caseSet[cid] = true; });
  existing.case_ids = Object.keys(caseSet).sort();

  var srSet = {};
  (existing.source_records || []).forEach(function (sr) { srSet[JSON.stringify(sr)] = true; });
  (incoming.source_records || []).forEach(function (sr) { srSet[JSON.stringify(sr)] = true; });
  existing.source_records = Object.keys(srSet).map(function (k) { return JSON.parse(k); });
}

/**
 * Get normalised name from a person document by person_id.
 */
function getPersonName(personDocs, pid) {
  for (var i = 0; i < personDocs.length; i++) {
    if (personDocs[i].person_id === pid) {
      return personDocs[i].name_normalised || '';
    }
  }
  return '';
}

function addEdgeForPerson(edgesByPerson, src, tgt, type, caseId, personDocs) {
  if (!edgesByPerson[src]) edgesByPerson[src] = {};

  var tgtName = getPersonName(personDocs, tgt);

  var edge = createEdge({
    source_person_id: src,
    target_person_id: tgt,
    type: type,
    with_name_normalised: tgtName,
    confidence: 1.0,
    source_records: [{ table: 'CaseMaster', row_id: caseId }],
    case_ids: [caseId]
  });

  var existing = edgesByPerson[src][edge.edge_id];
  if (existing) {
    mergeEdge(existing, edge);
  } else {
    edgesByPerson[src][edge.edge_id] = edge;
  }
}

function generateConfirmedEdges(personDocuments) {
  if (!Array.isArray(personDocuments) || personDocuments.length === 0) {
    return { confirmed_edges_by_person: {}, all_confirmed_edges: [] };
  }

  var caseIndex = buildCaseIndex(personDocuments);
  var edgesByPerson = {};
  var allEdges = {};

  Object.keys(caseIndex).forEach(function (caseId) {
    var persons = caseIndex[caseId];

    var accused = [];
    var victims = [];
    persons.forEach(function (p) {
      if (p.role === 'Accused') accused.push(p.person_id);
      else if (p.role === 'Victim') victims.push(p.person_id);
    });

    var uniqueAccused = unique(accused);
    var uniqueVictims = unique(victims);

    for (var i = 0; i < uniqueAccused.length; i++) {
      for (var j = i + 1; j < uniqueAccused.length; j++) {
        addEdgeForPerson(edgesByPerson, uniqueAccused[i], uniqueAccused[j], EDGE_TYPES.CO_ACCUSED, caseId, personDocuments);
        addEdgeForPerson(edgesByPerson, uniqueAccused[j], uniqueAccused[i], EDGE_TYPES.CO_ACCUSED, caseId, personDocuments);
      }
    }

    for (var ai = 0; ai < uniqueAccused.length; ai++) {
      for (var vi = 0; vi < uniqueVictims.length; vi++) {
        var acc = uniqueAccused[ai];
        var vic = uniqueVictims[vi];
        if (acc === vic) continue;
        addEdgeForPerson(edgesByPerson, acc, vic, EDGE_TYPES.ACCUSED_TO_VICTIM, caseId, personDocuments);
      }
    }
  });

  var confirmedEdgesByPerson = {};
  Object.keys(edgesByPerson).forEach(function (pid) {
    confirmedEdgesByPerson[pid] = Object.keys(edgesByPerson[pid]).map(function (k) {
      return edgesByPerson[pid][k];
    });
  });

  Object.keys(edgesByPerson).forEach(function (pid) {
    var edgeMap = edgesByPerson[pid];
    Object.keys(edgeMap).forEach(function (eid) {
      if (!allEdges[eid]) {
        allEdges[eid] = JSON.parse(JSON.stringify(edgeMap[eid]));
      }
    });
  });

  return {
    confirmed_edges_by_person: confirmedEdgesByPerson,
    all_confirmed_edges: Object.keys(allEdges).map(function (k) { return allEdges[k]; })
  };
}

function generateCandidateMatchEdges(unconfirmedPairs, personIdLookup, personDocuments) {
  if (!Array.isArray(unconfirmedPairs) || unconfirmedPairs.length === 0) {
    return { unconfirmed_edges_by_person: {}, all_unconfirmed_edges: [] };
  }
  if (typeof personIdLookup !== 'function') {
    return { unconfirmed_edges_by_person: {}, all_unconfirmed_edges: [] };
  }

  var edgesByPerson = {};
  var allEdges = {};

  unconfirmedPairs.forEach(function (pair) {
    if (!pair || !pair.a || !pair.b) return;

    var personA = personIdLookup(pair.a.source_table, pair.a.source_id);
    var personB = personIdLookup(pair.b.source_table, pair.b.source_id);

    if (!personA || !personB) return;
    if (personA === personB) return;

    var bName = getPersonName(personDocuments, personB);
    var aName = getPersonName(personDocuments, personA);

    var scoreBreakdown = pair.score_breakdown || {};

    var reason = '';
    if (scoreBreakdown.age_score != null && scoreBreakdown.age_score < 0.5) {
      var ageDelta = pair.a && pair.b && pair.a.age != null && pair.b.age != null
        ? Math.abs(pair.a.age - pair.b.age) : null;
      if (ageDelta != null) {
        reason = 'age mismatch (Δ=' + ageDelta + ' years)';
      }
    }
    if (scoreBreakdown.location_score != null && scoreBreakdown.location_score < 0.3) {
      if (reason) reason += ', ';
      reason += 'no shared location';
    }

    [
      { src: personA, tgt: personB, tgtName: bName },
      { src: personB, tgt: personA, tgtName: aName }
    ].forEach(function (dir) {
      var edge = createEdge({
        source_person_id: dir.src,
        target_person_id: dir.tgt,
        type: EDGE_TYPES.CANDIDATE_MATCH,
        with_name_normalised: dir.tgtName,
        confidence: pair.confidence,
        score_breakdown: scoreBreakdown,
        reason_below_threshold: reason,
        source_records: [],
        case_ids: []
      });

      if (!edgesByPerson[dir.src]) edgesByPerson[dir.src] = {};
      var existing = edgesByPerson[dir.src][edge.edge_id];
      if (existing) {
        mergeEdge(existing, edge);
      } else {
        edgesByPerson[dir.src][edge.edge_id] = edge;
      }
    });
  });

  var unconfirmedEdgesByPerson = {};
  Object.keys(edgesByPerson).forEach(function (pid) {
    unconfirmedEdgesByPerson[pid] = Object.keys(edgesByPerson[pid]).map(function (k) {
      return edgesByPerson[pid][k];
    });
  });

  Object.keys(edgesByPerson).forEach(function (pid) {
    var edgeMap = edgesByPerson[pid];
    Object.keys(edgeMap).forEach(function (eid) {
      if (!allEdges[eid]) {
        allEdges[eid] = JSON.parse(JSON.stringify(edgeMap[eid]));
      }
    });
  });

  return {
    unconfirmed_edges_by_person: unconfirmedEdgesByPerson,
    all_unconfirmed_edges: Object.keys(allEdges).map(function (k) { return allEdges[k]; })
  };
}

module.exports = {
  generateConfirmedEdges: generateConfirmedEdges,
  generateCandidateMatchEdges: generateCandidateMatchEdges
};
