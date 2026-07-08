'use strict';

var VALID_EDGE_TYPES = {
  CO_ACCUSED: true,
  ACCUSED_TO_VICTIM: true,
  SHARED_LOCATION: true,
  UNCONFIRMED_MATCH: true
};

function validateEdges(edges, validPmIds) {
  var idSet = {};
  for (var vi = 0; vi < validPmIds.length; vi++) {
    idSet[validPmIds[vi]] = true;
  }

  var seenEdgeIds = {};

  for (var ei = 0; ei < edges.length; ei++) {
    var e = edges[ei];

    if (!e.edge_id) {
      throw new Error('Validation failed: edge at index ' + ei + ' missing edge_id');
    }

    if (seenEdgeIds[e.edge_id]) {
      throw new Error('Validation failed: duplicate edge_id ' + e.edge_id);
    }
    seenEdgeIds[e.edge_id] = true;

    if (e.source === e.target) {
      throw new Error(
        'Validation failed: self-loop detected ' + e.source + ' on edge ' + e.edge_id
      );
    }

    if (!idSet[e.source]) {
      throw new Error(
        'Validation failed: source ' + e.source +
        ' not found in PersonMaster documents (edge ' + e.edge_id + ')'
      );
    }

    if (!idSet[e.target]) {
      throw new Error(
        'Validation failed: target ' + e.target +
        ' not found in PersonMaster documents (edge ' + e.edge_id + ')'
      );
    }

    if (!VALID_EDGE_TYPES[e.edge_type]) {
      throw new Error(
        'Validation failed: invalid edge_type ' + e.edge_type + ' on edge ' + e.edge_id
      );
    }
  }

  return true;
}

module.exports = { validateEdges, VALID_EDGE_TYPES };
