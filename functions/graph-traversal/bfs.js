'use strict';

var { callerCanAccess } = require('./rbacFilter');


var CANONICAL_EDGE_TYPES = {
  CO_ACCUSED: true,
  ACCUSED_TO_VICTIM: true,
  SHARED_LOCATION: true,
  CANDIDATE_MATCH: true
};

var UNDIRECTED_EDGE_TYPES = {
  CO_ACCUSED: true,
  SHARED_LOCATION: true,
  CANDIDATE_MATCH: true
};

var DIRECTED_EDGE_TYPES = {
  ACCUSED_TO_VICTIM: true
};

function getEdgeType(edgeObj) {
  return (edgeObj.edge_type || edgeObj.type || '').toUpperCase();
}

var MAX_ALLOWED_HOPS = 3;
var DEFAULT_MAX_NODES = 50;
var ABSOLUTE_MAX_NODES = 100;

function isUndirected(edgeType) {
  if (!edgeType) return false;
  return !!UNDIRECTED_EDGE_TYPES[edgeType.toUpperCase()];
}

function isDirected(edgeType) {
  if (!edgeType) return false;
  return !!DIRECTED_EDGE_TYPES[edgeType.toUpperCase()];
}

function isValidEdgeType(edgeType) {
  if (!edgeType) return false;
  return !!CANONICAL_EDGE_TYPES[edgeType.toUpperCase()];
}

function buildNodeEntry(doc) {
  return {
    person_id: doc.person_id,
    canonical_name: doc.canonical_name || '',
    name_normalised: doc.name_normalised || '',
    roles_summary: doc.roles_summary || {},
    source_records: (doc.source_records || []).map(function (sr) {
      return { table: sr.table, case_id: sr.case_id };
    })
  };
}

function buildEdgeEntry(edgeObj, fromPersonId) {
  var toPersonId = edgeObj.target_person_id || edgeObj.with_person_id;
  return {
    edge_id: edgeObj.edge_id,
    edge_type: edgeObj.edge_type || edgeObj.type,
    from: fromPersonId,
    to: toPersonId,
    confidence: edgeObj.confidence || null,
    evidence: edgeObj.evidence || [],
    case_ids: edgeObj.case_ids || [],
    confirmed: !!(edgeObj.confirmed !== false)
  };
}

async function bfs(rootPersonId, options, context) {
  var maxHops = options.max_hops;
  if (maxHops === undefined || maxHops === null) maxHops = 2;
  maxHops = Math.min(maxHops, MAX_ALLOWED_HOPS);

  var maxNodes = options.max_nodes;
  if (maxNodes === undefined || maxNodes === null) maxNodes = DEFAULT_MAX_NODES;
  maxNodes = Math.min(maxNodes, ABSOLUTE_MAX_NODES);

  var includeUnconfirmed = options.include_unconfirmed === true;
  var edgeTypeFilter = options.edge_type_filter || null;
  var minConfidence = options.min_confidence || 0;

  var loadNode = context.loadNode;
  var canAccess = context.canAccess;
  var callerScope = context.callerScope;

  var visitedNodes = {};
  var visitedEdges = {};
  var nodeCache = {};
  var queue = [{ personId: rootPersonId, hop: 0 }];
  var head = 0;

  var resultNodes = [];
  var resultEdges = [];
  var resultUnconfirmedEdges = [];
  var truncated = false;

  function isEdgeTypeWanted(edgeType) {
    if (!edgeType) return false;
    edgeType = edgeType.toUpperCase();
    if (!isValidEdgeType(edgeType)) return false;
    if (edgeTypeFilter && edgeTypeFilter.indexOf(edgeType) === -1) return false;
    return true;
  }

  function meetsConfidence(edgeObj) {
    var conf = edgeObj.confidence || 0;
    return conf >= minConfidence;
  }

  function canTraverseFrom(currentPersonId, edgeObj) {
    var edgeType = getEdgeType(edgeObj);
    if (isUndirected(edgeType)) return true;
    if (isDirected(edgeType)) {
      var sourceId = edgeObj.source_person_id || currentPersonId;
      return sourceId === currentPersonId;
    }
    return false;
  }

  async function getDoc(personId) {
    if (nodeCache[personId] !== undefined) return nodeCache[personId];
    var doc = await loadNode(personId);
    nodeCache[personId] = doc || null;
    return nodeCache[personId];
  }

  while (head < queue.length) {
    var item = queue[head++];
    var personId = item.personId;
    var hop = item.hop;

    if (visitedNodes[personId]) continue;

    if (resultNodes.length >= maxNodes) {
      truncated = true;
      break;
    }

    var doc = await getDoc(personId);
    if (!doc) continue;

    if (!canAccess(doc, callerScope)) continue;

    visitedNodes[personId] = true;
    resultNodes.push(buildNodeEntry(doc));

    if (hop >= maxHops) continue;

    var confirmedEdges = doc.confirmed_edges || [];
    for (var cei = 0; cei < confirmedEdges.length; cei++) {
      var ce = confirmedEdges[cei];
      if (!ce.edge_id) continue;
      if (!ce.target_person_id && !ce.with_person_id) continue;
      if (!isEdgeTypeWanted(getEdgeType(ce))) continue;
      if (!meetsConfidence(ce)) continue;
      if (!canTraverseFrom(personId, ce)) continue;

      if (visitedEdges[ce.edge_id]) continue;

      var neighborId = ce.target_person_id || ce.with_person_id;
      if (neighborId === personId) continue;

      var neighborDoc = await getDoc(neighborId);
      if (!neighborDoc) continue;
      if (!canAccess(neighborDoc, callerScope)) continue;

      visitedEdges[ce.edge_id] = true;
      resultEdges.push(buildEdgeEntry(ce, personId));

      if (!visitedNodes[neighborId]) {
        queue.push({ personId: neighborId, hop: hop + 1 });
      }
    }

    if (includeUnconfirmed) {
      var unconfirmedEdges = doc.unconfirmed_edges || [];
      for (var uei = 0; uei < unconfirmedEdges.length; uei++) {
        var ue = unconfirmedEdges[uei];
        if (!ue.edge_id) continue;
        if (!ue.target_person_id && !ue.with_person_id) continue;
        if (!isEdgeTypeWanted(getEdgeType(ue))) continue;
        if (!meetsConfidence(ue)) continue;
        if (!canTraverseFrom(personId, ue)) continue;

        if (visitedEdges[ue.edge_id]) continue;

        var uNeighborId = ue.target_person_id || ue.with_person_id;
        if (uNeighborId === personId) continue;

        var uNeighborDoc = await getDoc(uNeighborId);
        if (!uNeighborDoc) continue;
        if (!canAccess(uNeighborDoc, callerScope)) continue;

        visitedEdges[ue.edge_id] = true;
        var uEdgeEntry = buildEdgeEntry(ue, personId);
        uEdgeEntry.confirmed = false;
        resultEdges.push(uEdgeEntry);

        if (!visitedNodes[uNeighborId]) {
          queue.push({ personId: uNeighborId, hop: hop + 1 });
        }
      }
    }
  }

  for (var ei = 0; ei < resultEdges.length; ei++) {
    var e = resultEdges[ei];
    if (e.confirmed === false) {
      resultUnconfirmedEdges.push(e);
    }
  }

  return {
    root_person_id: rootPersonId,
    nodes: resultNodes,
    edges: resultEdges,
    unconfirmed_edges: resultUnconfirmedEdges,
    truncated: truncated,
    hops_requested: maxHops,
    scope_applied: 'unknown',
    nodes_visited: Object.keys(visitedNodes).length
  };
}

module.exports = {
  bfs: bfs,
  getEdgeType: getEdgeType,
  CANONICAL_EDGE_TYPES: CANONICAL_EDGE_TYPES,
  UNDIRECTED_EDGE_TYPES: UNDIRECTED_EDGE_TYPES,
  DIRECTED_EDGE_TYPES: DIRECTED_EDGE_TYPES,
  MAX_ALLOWED_HOPS: MAX_ALLOWED_HOPS,
  DEFAULT_MAX_NODES: DEFAULT_MAX_NODES,
  ABSOLUTE_MAX_NODES: ABSOLUTE_MAX_NODES,
  buildNodeEntry: buildNodeEntry,
  buildEdgeEntry: buildEdgeEntry,
  isValidEdgeType: isValidEdgeType,
  isUndirected: isUndirected,
  isDirected: isDirected
};
