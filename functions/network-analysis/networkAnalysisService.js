'use strict';

var https = require('https');

var BASE_HOST = 'datathon2026-60073929329.development.catalystserverless.in';
var HTTP_TIMEOUT = 20000;

function httpGet(path) {
  return new Promise(function(resolve, reject) {
    var options = {
      hostname: BASE_HOST,
      path: '/server' + path,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: HTTP_TIMEOUT
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON response from ' + path)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('Timeout for ' + path)); });
    req.end();
  });
}

function httpPost(path, body) {
  return new Promise(function(resolve, reject) {
    var bodyStr = JSON.stringify(body);
    var options = {
      hostname: BASE_HOST,
      path: '/server' + path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      },
      timeout: HTTP_TIMEOUT
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON response from ' + path)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('Timeout for ' + path)); });
    req.write(bodyStr);
    req.end();
  });
}

function withTimeout(promise, ms) {
  ms = ms || 25000;
  return Promise.race([
    promise,
    new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('TIMEOUT')); }, ms);
    })
  ]);
}

function NetworkAnalysisService() {}

NetworkAnalysisService.prototype.personExists = async function(personId) {
  try {
    var result = await withTimeout(
      httpGet('/graph-service/person/' + encodeURIComponent(personId) + '/exists'),
      15000
    );
    if (result.status === 'ok' && result.data) {
      return result.data.exists === true;
    }
    return false;
  } catch (e) {
    return false;
  }
};

NetworkAnalysisService.prototype.getPerson = async function(personId) {
  var exists = await this.personExists(personId);
  if (!exists) return null;

  try {
    var result = await withTimeout(
      httpGet('/graph-service/person/' + encodeURIComponent(personId)),
      15000
    );
    if (result.status !== 'ok' || !result.data) return null;

    var person = result.data;
    person.degree = 0;

    try {
      var degResult = await withTimeout(
        httpGet('/graph-service/person/' + encodeURIComponent(personId) + '/degree'),
        10000
      );
      if (degResult.status === 'ok' && degResult.data) {
        person.degree = degResult.data.degree || 0;
      }
    } catch (e) {
      person.degree = 0;
    }

    return person;
  } catch (e) {
    return null;
  }
};

NetworkAnalysisService.prototype._traverse = async function(personId, maxHops, includeUnconfirmed, edgeTypeFilter) {
  var result = await withTimeout(
    httpPost('/graph-traversal/traverse', {
      person_id: personId,
      hops: maxHops || 2,
      max_nodes: 50
    }),
    25000
  );

  if (result.status !== 'ok' || !result.data) {
    return { error: ['Traversal failed or timed out'] };
  }

  var data = result.data;

  var allEdges = data.edges || [];
  if (includeUnconfirmed && data.unconfirmed_edges) {
    allEdges = allEdges.concat(data.unconfirmed_edges);
  }

  if (edgeTypeFilter && edgeTypeFilter.length > 0) {
    allEdges = allEdges.filter(function(e) {
      return edgeTypeFilter.indexOf(e.type) !== -1;
    });
  }

  var nodes = (data.nodes || []).slice(0, 100);
  var edges = allEdges.slice(0, 200);

  return {
    root: personId,
    nodes: nodes,
    edges: edges,
    statistics: {
      nodes_visited: nodes.length,
      edges_traversed: edges.length,
      elapsed_ms: 0
    }
  };
};

NetworkAnalysisService.prototype.getKnownAssociates = async function(personId, options) {
  var exists = await this.personExists(personId);
  if (!exists) return null;

  var maxHops = (options && options.max_hops !== undefined) ? options.max_hops : 2;
  var includeUnconfirmed = options && options.include_unconfirmed === true;
  var edgeTypeFilter = options && options.edge_type_filter;

  try {
    var result = await this._traverse(personId, maxHops, includeUnconfirmed, edgeTypeFilter);
    if (result.error) return result;

    var relatedIds = {};
    for (var ei = 0; ei < result.edges.length; ei++) {
      var e = result.edges[ei];
      if (e.from && e.from !== personId) relatedIds[e.from] = true;
      if (e.to && e.to !== personId) relatedIds[e.to] = true;
    }

    var associates = result.nodes.filter(function(n) {
      return n.person_id !== personId;
    });

    var mappedEdges = result.edges.map(function(e) {
      return {
        edge_id: e.edge_id || (e.from + '-' + e.to + '-' + (e.type || 'unknown')),
        source: e.from,
        target: e.to,
        edge_type: e.type || 'UNKNOWN',
        weight: e.confirmed !== false ? 1 : 0.5,
        occurrence_count: (e.case_ids || []).length || 1
      };
    });

    return {
      root: personId,
      max_hops: maxHops,
      associates: associates,
      edges: mappedEdges,
      statistics: result.statistics
    };
  } catch (e) {
    return { error: [e.message] };
  }
};

NetworkAnalysisService.prototype.getCoAccusedNetwork = async function(personId) {
  try {
    var result = await this.getKnownAssociates(personId, {
      max_hops: 3,
      edge_type_filter: ['CO_ACCUSED']
    });
    return result;
  } catch (e) {
    return { error: [e.message] };
  }
};

NetworkAnalysisService.prototype.getVictimRelationships = async function(personId) {
  try {
    var result = await this.getKnownAssociates(personId, {
      max_hops: 3,
      edge_type_filter: ['ACCUSED_TO_VICTIM']
    });
    return result;
  } catch (e) {
    return { error: [e.message] };
  }
};

NetworkAnalysisService.prototype.getNetworkSummary = async function(personId) {
  var person = await this.getPerson(personId);
  if (!person) return null;

  try {
    var fullTraversal = await this._traverse(personId, 3, false, null);
    var coAccusedResult = await this.getCoAccusedNetwork(personId);
    var victimResult = await this.getVictimRelationships(personId);

    var knownAssociates = [];
    if (!fullTraversal.error) {
      for (var ni = 0; ni < fullTraversal.nodes.length; ni++) {
        if (fullTraversal.nodes[ni].person_id !== personId) {
          knownAssociates.push(fullTraversal.nodes[ni].person_id);
        }
      }
    }

    var coAccused = [];
    if (coAccusedResult && !coAccusedResult.error) {
      for (var ci = 0; ci < coAccusedResult.associates.length; ci++) {
        coAccused.push(coAccusedResult.associates[ci].person_id);
      }
    }

    var victimLinks = [];
    if (victimResult && !victimResult.error) {
      for (var vi = 0; vi < victimResult.associates.length; vi++) {
        victimLinks.push(victimResult.associates[vi].person_id);
      }
    }

    var edgeBreakdown = {};
    if (!fullTraversal.error) {
      for (var ei = 0; ei < fullTraversal.edges.length; ei++) {
        var et = fullTraversal.edges[ei].type || 'UNKNOWN';
        if (!edgeBreakdown[et]) edgeBreakdown[et] = 0;
        edgeBreakdown[et]++;
      }
    }

    return {
      person: person,
      degree: person.degree || 0,
      known_associates: knownAssociates.length,
      victim_links: victimLinks.length,
      co_accused: coAccused.length,
      edge_breakdown: edgeBreakdown
    };
  } catch (e) {
    return {
      person: person,
      degree: person.degree || 0,
      known_associates: 0,
      victim_links: 0,
      co_accused: 0,
      edge_breakdown: {}
    };
  }
};

module.exports = { NetworkAnalysisService: NetworkAnalysisService };
