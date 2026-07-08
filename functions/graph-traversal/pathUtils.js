'use strict';

function buildParentMap(visitedNodes, visitedEdges) {
  var parentMap = {};
  for (var ei = 0; ei < visitedEdges.length; ei++) {
    var e = visitedEdges[ei];

    if (!parentMap[e.target]) {
      parentMap[e.target] = { parent: e.source, edge: e };
    }

    if (!parentMap[e.source]) {
      parentMap[e.source] = { parent: null, edge: null };
    }
  }

  for (var ni = 0; ni < visitedNodes.length; ni++) {
    if (!parentMap[visitedNodes[ni].person_id]) {
      parentMap[visitedNodes[ni].person_id] = { parent: null, edge: null };
    }
  }

  return parentMap;
}

function reconstructPath(targetId, parentMap) {
  var path = [];
  var current = targetId;

  while (current) {
    var nodeInfo = parentMap[current];
    if (!nodeInfo) break;

    path.unshift({
      person_id: current,
      via_edge: nodeInfo.edge ? {
        edge_id: nodeInfo.edge.edge_id,
        edge_type: nodeInfo.edge.edge_type,
        source: nodeInfo.edge.source,
        target: nodeInfo.edge.target
      } : null
    });

    if (!nodeInfo.parent) break;
    current = nodeInfo.parent;

    if (path.length > 0 && path[0].person_id === current) break;
  }

  return path;
}

function findAllPathsBetween(visitedEdges, sourceId, targetId) {
  var adjacency = {};
  for (var ei = 0; ei < visitedEdges.length; ei++) {
    var e = visitedEdges[ei];
    if (!adjacency[e.source]) adjacency[e.source] = [];
    adjacency[e.source].push({ target: e.target, edge: e });
    if (!adjacency[e.target]) adjacency[e.target] = [];
    adjacency[e.target].push({ target: e.source, edge: e });
  }

  var allPaths = [];

  function dfs(current, target, visited, path) {
    if (current === target) {
      allPaths.push(path.slice());
      return;
    }

    var neighbours = adjacency[current] || [];
    for (var ni = 0; ni < neighbours.length; ni++) {
      var nb = neighbours[ni];
      if (visited[nb.target]) continue;
      visited[nb.target] = true;
      path.push(nb.edge);
      dfs(nb.target, target, visited, path);
      path.pop();
      visited[nb.target] = false;
    }
  }

  var visited = {};
  visited[sourceId] = true;
  dfs(sourceId, targetId, visited, []);

  return allPaths;
}

module.exports = {
  buildParentMap: buildParentMap,
  reconstructPath: reconstructPath,
  findAllPathsBetween: findAllPathsBetween
};
