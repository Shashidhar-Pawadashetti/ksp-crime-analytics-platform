'use strict';

function createMemberKey(member) {
  return member.table + ':' + member.source_id;
}

function validateClusters(clusters, edges) {
  var seen = {};
  for (var ci = 0; ci < clusters.length; ci++) {
    for (var mi = 0; mi < clusters[ci].members.length; mi++) {
      var key = createMemberKey(clusters[ci].members[mi]);
      if (seen[key]) {
        throw new Error(
          'Validation failed: record ' + key + ' appears in multiple clusters ' +
          seen[key] + ' and ' + clusters[ci].person_id
        );
      }
      seen[key] = clusters[ci].person_id;
    }
  }

  for (var ci2 = 0; ci2 < clusters.length; ci2++) {
    var memberSet = {};
    for (var mi2 = 0; mi2 < clusters[ci2].members.length; mi2++) {
      var key2 = createMemberKey(clusters[ci2].members[mi2]);
      if (memberSet[key2]) {
        throw new Error(
          'Validation failed: duplicate member ' + key2 +
          ' in cluster ' + clusters[ci2].person_id
        );
      }
      memberSet[key2] = true;
    }
  }

  for (var ci3 = 0; ci3 < clusters.length; ci3++) {
    if (clusters[ci3].members.length === 0) {
      throw new Error(
        'Validation failed: cluster ' + clusters[ci3].person_id + ' has no members'
      );
    }
  }

  var memberToCluster = {};
  for (var ci4 = 0; ci4 < clusters.length; ci4++) {
    for (var mi4 = 0; mi4 < clusters[ci4].members.length; mi4++) {
      var key4 = createMemberKey(clusters[ci4].members[mi4]);
      memberToCluster[key4] = ci4;
    }
  }

  for (var ei = 0; ei < edges.length; ei++) {
    var edge = edges[ei];
    var keyA = edge.recordA.source_table + ':' + edge.recordA.source_id;
    var keyB = edge.recordB.source_table + ':' + edge.recordB.source_id;
    var clusterA = memberToCluster[keyA];
    var clusterB = memberToCluster[keyB];
    if (clusterA !== undefined && clusterB !== undefined && clusterA !== clusterB) {
      throw new Error(
        'Validation failed: confirmed edge between ' + keyA +
        ' and ' + keyB + ' crosses clusters ' +
        clusters[clusterA].person_id + ' and ' + clusters[clusterB].person_id
      );
    }
  }

  return true;
}

module.exports = { validateClusters };
