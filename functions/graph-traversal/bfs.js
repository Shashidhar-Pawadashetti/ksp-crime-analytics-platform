'use strict';

var { validateInput, validateOutput } = require('./validation');
var { buildParentMap } = require('./pathUtils');

var UNCONFIRMED_TYPE = 'UNCONFIRMED_MATCH';

function bfsTraverse(graphService, personId, options) {
  var startTime = Date.now();

  var errors = validateInput(graphService, personId, options);
  if (errors.length > 0) {
    return { error: errors };
  }

  var maxHops = (options && options.max_hops !== undefined) ? options.max_hops : 3;
  var includeUnconfirmed = options && options.include_unconfirmed === true;
  var edgeTypeFilter = options && options.edge_type_filter;

  var visitedNodeIds = {};
  var visitedEdgeIds = {};
  var resultNodes = [];
  var resultEdges = [];

  var queue = [{ personId: personId, hopDistance: 0 }];
  visitedNodeIds[personId] = true;

  var parentMapData = {};

  while (queue.length > 0) {
    var current = queue.shift();

    var person = graphService.getPerson(current.personId);
    var degree = graphService.getDegree(current.personId);

    resultNodes.push({
      person_id: current.personId,
      canonical_name: person ? person.canonical_name : 'Unknown',
      roles_summary: person ? person.roles_summary : {},
      degree: degree,
      hop_distance: current.hopDistance
    });

    if (current.hopDistance >= maxHops) continue;

    var edges = graphService.getEdges(current.personId);

    var validEdges = [];
    for (var ei = 0; ei < edges.length; ei++) {
      var edge = edges[ei];

      if (edgeTypeFilter && edgeTypeFilter.indexOf(edge.edge_type) === -1) continue;

      if (!includeUnconfirmed && edge.edge_type === UNCONFIRMED_TYPE) continue;

      if (visitedEdgeIds[edge.edge_id]) continue;

      validEdges.push(edge);
    }

    var reachableIds = {};
    for (var vi = 0; vi < validEdges.length; vi++) {
      var ve = validEdges[vi];
      var otherId = ve.source === current.personId ? ve.target : ve.source;
      reachableIds[otherId] = true;

      if (!parentMapData[otherId]) {
        parentMapData[otherId] = { parent: current.personId, via_edge: ve.edge_id };
      }
    }

    var neighbourPersons = graphService.getNeighbours(current.personId);
    for (var ni = 0; ni < neighbourPersons.length; ni++) {
      var nb = neighbourPersons[ni];
      if (!reachableIds[nb.person_id]) continue;
      if (visitedNodeIds[nb.person_id]) continue;

      visitedNodeIds[nb.person_id] = true;
      queue.push({ personId: nb.person_id, hopDistance: current.hopDistance + 1 });

      for (var vi2 = 0; vi2 < validEdges.length; vi2++) {
        var ve2 = validEdges[vi2];
        var otherId2 = ve2.source === current.personId ? ve2.target : ve2.source;
        if (otherId2 === nb.person_id && !visitedEdgeIds[ve2.edge_id]) {
          visitedEdgeIds[ve2.edge_id] = true;

          resultEdges.push({
            edge_id: ve2.edge_id,
            source: ve2.source,
            target: ve2.target,
            edge_type: ve2.edge_type,
            weight: ve2.weight,
            occurrence_count: ve2.metadata ? (ve2.metadata.occurrence_count || 0) : 0
          });
        }
      }
    }
  }

  var elapsed = Date.now() - startTime;

  var result = {
    root: personId,
    max_hops: maxHops,
    nodes: resultNodes,
    edges: resultEdges,
    statistics: {
      nodes_visited: resultNodes.length,
      edges_traversed: resultEdges.length,
      elapsed_ms: elapsed
    }
  };

  var outputErrors = validateOutput(result, graphService);
  if (outputErrors.length > 0) {
    result.validation_errors = outputErrors;
  }

  return result;
}

module.exports = { bfsTraverse: bfsTraverse };
