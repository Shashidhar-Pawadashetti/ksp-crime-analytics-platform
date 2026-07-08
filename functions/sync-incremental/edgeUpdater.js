'use strict';

var path = require('path');
var edgeBuilder = require('../personmaster-builder/edgeBuilder');

function findAffectedCaseIds(pmDocument) {
  var caseIds = {};
  for (var si = 0; si < pmDocument.source_records.length; si++) {
    var cid = pmDocument.source_records[si].case_id;
    if (cid) caseIds[cid] = true;
  }
  return Object.keys(caseIds);
}

function findCaseToPmIndex(pmDocuments, caseIds) {
  var index = {};
  for (var di = 0; di < pmDocuments.length; di++) {
    var doc = pmDocuments[di];
    for (var si = 0; si < doc.source_records.length; si++) {
      var sr = doc.source_records[si];
      var cid = sr.case_id;
      if (!cid || caseIds.indexOf(cid) === -1) continue;
      if (!index[cid]) index[cid] = [];
      var role = sr.role === 'ComplainantDetails' ? 'Complainant' : sr.role;
      index[cid].push({ person_id: doc.person_id, role: role });
    }
  }
  return index;
}

function recomputeEdgesForPM(affectedPM, allPMs, cmLookup, existingEdges) {
  var affectedCaseIds = findAffectedCaseIds(affectedPM);

  var filteredCaseToPm = findCaseToPmIndex(allPMs, affectedCaseIds);

  var newCoAccused = edgeBuilder.buildCoAccusedEdges(filteredCaseToPm);
  var newAtv = edgeBuilder.buildAccusedToVictimEdges(filteredCaseToPm, cmLookup);
  var newSl = edgeBuilder.buildSharedLocationEdges(filteredCaseToPm, cmLookup);

  var relevantEdgeIds = {};
  var affectedPmId = affectedPM.person_id;

  for (var ei = 0; ei < existingEdges.length; ei++) {
    var e = existingEdges[ei];
    if (e.source === affectedPmId || e.target === affectedPmId) {
      relevantEdgeIds[e.edge_id] = true;
    }
  }

  var updatedEdges = existingEdges.filter(function(e) {
    if (e.source === affectedPmId || e.target === affectedPmId) {
      if (e.edge_type === 'UNCONFIRMED_MATCH') return true;
      return false;
    }
    return true;
  });

  var edgeKeySet = {};
  for (var ei2 = 0; ei2 < updatedEdges.length; ei2++) {
    var e2 = updatedEdges[ei2];
    var key;
    if (e2.source < e2.target) {
      key = e2.source + '|' + e2.target + '|' + e2.edge_type;
    } else {
      key = e2.target + '|' + e2.source + '|' + e2.edge_type;
    }
    edgeKeySet[key] = true;
  }

  function addEdgesWithDedup(newEdges, edgeType) {
    for (var ni = 0; ni < newEdges.length; ni++) {
      var ne = newEdges[ni];
      if (ne.source !== affectedPmId && ne.target !== affectedPmId) continue;
      var key;
      if (ne.source < ne.target) {
        key = ne.source + '|' + ne.target + '|' + edgeType;
      } else {
        key = ne.target + '|' + ne.source + '|' + edgeType;
      }
      if (!edgeKeySet[key]) {
        edgeKeySet[key] = true;
        updatedEdges.push(ne);
      }
    }
  }

  addEdgesWithDedup(newCoAccused, 'CO_ACCUSED');
  addEdgesWithDedup(newAtv, 'ACCUSED_TO_VICTIM');
  addEdgesWithDedup(newSl, 'SHARED_LOCATION');

  var edgeIdCounter = 0;
  for (var ei3 = 0; ei3 < updatedEdges.length; ei3++) {
    var e3 = updatedEdges[ei3];
    if (!e3.edge_id) {
      edgeIdCounter = Math.max(edgeIdCounter, parseInt(e3.edge_id ? e3.edge_id.replace('E', '') : '0', 10));
    }
  }

  var nextEdgeNum = edgeIdCounter + 1;
  for (var ei4 = 0; ei4 < updatedEdges.length; ei4++) {
    var e4 = updatedEdges[ei4];
    if (!e4.edge_id) {
      e4.edge_id = 'E' + String(nextEdgeNum).padStart(6, '0');
      nextEdgeNum++;
    }
  }

  return updatedEdges;
}

function extractAdjacencyForPM(pmId, edges) {
  var adjacency = {
    co_accused: [],
    accused_to_victim: [],
    shared_location: [],
    unconfirmed_matches: []
  };

  for (var ei = 0; ei < edges.length; ei++) {
    var e = edges[ei];
    if (e.source !== pmId && e.target !== pmId) continue;

    var otherId = e.source === pmId ? e.target : e.source;
    var occ = 1;
    if (e.metadata && e.metadata.occurrence_count) occ = e.metadata.occurrence_count;

    var entry = {
      person_id: otherId,
      edge_id: e.edge_id,
      weight: e.weight,
      occurrence_count: occ
    };

    if (e.edge_type === 'CO_ACCUSED') adjacency.co_accused.push(entry);
    else if (e.edge_type === 'ACCUSED_TO_VICTIM') adjacency.accused_to_victim.push(entry);
    else if (e.edge_type === 'SHARED_LOCATION') adjacency.shared_location.push(entry);
    else if (e.edge_type === 'UNCONFIRMED_MATCH') adjacency.unconfirmed_matches.push(entry);
  }

  return adjacency;
}

module.exports = { recomputeEdgesForPM, extractAdjacencyForPM, findAffectedCaseIds };
