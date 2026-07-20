'use strict';

var { callerCanAccess } = require('./rbacFilter');

/**
 * LLD §6.1 — BFS traversal from a root person through the crime graph.
 *
 * @param {Object} appInstance   — initialized Catalyst SDK instance
 * @param {string} rootPersonId  — starting PersonMaster person_id
 * @param {number} maxHops       — max traversal depth (hard cap at 3)
 * @param {number} maxNodes      — max nodes to return (default 50, max 100)
 * @param {Object} callerScope   — RBAC scope from extractCallerScope()
 * @returns {Object}
 *   @property {string}  root_person_id
 *   @property {Array}   nodes         — [{ person_id, label, roles_summary, source_records }]
 *   @property {Array}   edges         — [{ from, to, type, case_ids, confirmed }]
 *   @property {Array}   unconfirmed_edges — same structure, confirmed: false
 *   @property {boolean} truncated
 *   @property {number}  hops_requested
 *   @property {string}  scope_applied
 */
async function traverseGraph(appInstance, rootPersonId, maxHops, maxNodes, callerScope) {
  var CATALYST_ORG = process.env.CATALYST_ORG || '60073929329';
  var visited = {};
  var queue = [{ personId: rootPersonId, hop: 0 }];
  var nodes = [];
  var edges = [];
  var unconfirmedEdges = [];
  var truncated = false;

  var actualHops = Math.min(maxHops || 2, 3);
  var actualMaxNodes = Math.min(maxNodes || 50, 100);

  var noSql = appInstance.nosql();
  var table = await noSql.getTable('PersonMaster');

  /**
   * Load a PersonMaster document from NoSQL by person_id.
   */
  async function loadDoc(personId) {
    try {
      var { NoSQLItem } = require('zcatalyst-sdk-node/lib/no-sql');
      var result = await table.fetchItem({
        keys: NoSQLItem.from({ type: 'PM', person_id: personId })
      });

      if (!result) return null;
      var data = result.getData ? result.getData() : (result.data || []);
      if (!data || data.length === 0) return null;
      var first = data[0];
      if (typeof first === 'object' && first.person_id) return first;
      if (first.data && typeof first.data === 'object') return first.data;
      return null;
    } catch (err) {
      console.error('[bfs] Error loading ' + personId + ': ' + err.message);
      return null;
    }
  }

  /**
   * Build a node entry from a PersonMaster document.
   */
  function buildNode(doc) {
    return {
      person_id: doc.person_id,
      label: (doc.name_variants || [])[0] || doc.name_normalised || doc.person_id,
      roles_summary: doc.roles_summary || {},
      source_records: (doc.source_records || []).map(function (sr) {
        return { table: sr.table, case_id: sr.case_id };
      })
    };
  }

  /**
   * Build an edge entry.
   */
  function buildEdge(edgeObj, fromPersonId, confirmed) {
    return {
      from: fromPersonId,
      to: edgeObj.with_person_id || edgeObj.target_person_id,
      type: edgeObj.type || edgeObj.edge_type,
      case_ids: edgeObj.case_ids || [],
      confirmed: confirmed,
      confidence: confirmed ? undefined : (edgeObj.confidence || undefined)
    };
  }

  while (queue.length > 0) {
    var item = queue.shift();
    var personId = item.personId;
    var hop = item.hop;

    if (visited[personId]) continue;
    if (nodes.length >= actualMaxNodes) {
      truncated = true;
      break;
    }

    visited[personId] = true;

    var doc = await loadDoc(personId);
    if (!doc) continue;

    if (!callerCanAccess(doc, callerScope)) continue;

    nodes.push(buildNode(doc));

    if (hop >= actualHops) continue;

    /* -- Traverse confirmed edges -- */
    var confirmedEdgeList = doc.confirmed_edges || [];
    for (var cei = 0; cei < confirmedEdgeList.length; cei++) {
      var ce = confirmedEdgeList[cei];
      edges.push(buildEdge(ce, personId, true));

      var neighborId = ce.with_person_id || ce.target_person_id;
      if (neighborId && !visited[neighborId]) {
        queue.push({ personId: neighborId, hop: hop + 1 });
      }
    }

    /* -- Unconfirmed edges are terminal (LLD §6.1 invariant) -- */
    var unconfirmedEdgeList = doc.unconfirmed_edges || [];
    for (var uei = 0; uei < unconfirmedEdgeList.length; uei++) {
      var ue = unconfirmedEdgeList[uei];
      unconfirmedEdges.push(buildEdge(ue, personId, false));
    }
  }

  var scopeApplied = 'state';
  if (callerScope.unit_id) scopeApplied = 'unit:' + callerScope.unit_id;
  else if (callerScope.district_id) scopeApplied = 'district:' + callerScope.district_id;

  return {
    root_person_id: rootPersonId,
    nodes: nodes,
    edges: edges,
    unconfirmed_edges: unconfirmedEdges,
    truncated: truncated,
    hops_requested: actualHops,
    scope_applied: scopeApplied
  };
}

module.exports = { traverseGraph: traverseGraph };
