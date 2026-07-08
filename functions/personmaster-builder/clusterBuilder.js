'use strict';

function UnionFind() {
  this.parent = {};
  this.rank = {};
}

UnionFind.prototype.makeSet = function(x) {
  if (!(x in this.parent)) {
    this.parent[x] = x;
    this.rank[x] = 0;
  }
};

UnionFind.prototype.find = function(x) {
  if (this.parent[x] !== x) {
    this.parent[x] = this.find(this.parent[x]);
  }
  return this.parent[x];
};

UnionFind.prototype.union = function(x, y) {
  this.makeSet(x);
  this.makeSet(y);
  var rx = this.find(x);
  var ry = this.find(y);
  if (rx === ry) return;
  if (this.rank[rx] < this.rank[ry]) {
    this.parent[rx] = ry;
  } else if (this.rank[rx] > this.rank[ry]) {
    this.parent[ry] = rx;
  } else {
    this.parent[ry] = rx;
    this.rank[rx]++;
  }
};

UnionFind.prototype.getClusters = function() {
  var groups = {};
  for (var key in this.parent) {
    var root = this.find(key);
    if (!groups[root]) groups[root] = [];
    groups[root].push(key);
  }
  var result = [];
  for (var r in groups) result.push(groups[r]);
  return result;
};

function createMemberKey(record) {
  return record.source_table + ':' + record.source_id;
}

function memberKeyToMember(key) {
  var colonIdx = key.indexOf(':');
  return {
    table: key.substring(0, colonIdx),
    source_id: key.substring(colonIdx + 1)
  };
}

function buildClusters(edges) {
  var uf = new UnionFind();

  for (var ei = 0; ei < edges.length; ei++) {
    var edge = edges[ei];
    var keyA = createMemberKey(edge.recordA);
    var keyB = createMemberKey(edge.recordB);
    uf.union(keyA, keyB);
  }

  var rawClusters = uf.getClusters();

  rawClusters.sort(function(a, b) {
    var sortedA = a.slice().sort();
    var sortedB = b.slice().sort();
    if (sortedA[0] < sortedB[0]) return -1;
    if (sortedA[0] > sortedB[0]) return 1;
    return 0;
  });

  var clusters = [];
  for (var ci = 0; ci < rawClusters.length; ci++) {
    var members = rawClusters[ci].map(memberKeyToMember);
    members.sort(function(x, y) {
      if (x.table < y.table) return -1;
      if (x.table > y.table) return 1;
      if (x.source_id < y.source_id) return -1;
      if (x.source_id > y.source_id) return 1;
      return 0;
    });
    clusters.push(members);
  }

  return clusters;
}

module.exports = { UnionFind, buildClusters, createMemberKey, memberKeyToMember };
