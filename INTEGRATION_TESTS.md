# KSP Crime Analytics Platform — Integration Tests

> Comprehensive integration test suite for the Entity Resolution Pipeline, Graph Service, Network Analysis, and Synchronization workflows. All tests run locally without Catalyst deployment.

---

## A. ENTITY RESOLUTION PIPELINE (Local)

Validates the full entity matching pipeline from CSV source data to PersonMaster documents and typed edges.

### Checklist

- [ ] A.1 Run `validate.cjs` to generate `candidate_matches.json`
- [ ] A.2 Cluster builder creates connected components from CONFIRMED matches
- [ ] A.3 Document builder creates PersonMaster documents from clusters
- [ ] A.4 Edge builder creates typed edges (CO_ACCUSED, ACCUSED_TO_VICTIM, SHARED_LOCATION, UNCONFIRMED_MATCH)
- [ ] A.5 Validate: cluster member sum equals total source records
- [ ] A.6 Validate: no duplicate person IDs across documents
- [ ] A.7 Validate: all edge source/target reference valid person IDs
- [ ] A.8 Validate: edge types are from expected set

### Commands

```bash
# A.1 — Generate candidate matches from CSV source data
node functions/entity-matching-engine/validate.cjs

# A.2 — Run cluster builder
node -e "
const fs = require('fs');
const clusterBuilder = require('./functions/personmaster-builder/clusterBuilder');
const allMatches = JSON.parse(fs.readFileSync('functions/entity-matching-engine/output/candidate_matches.json', 'utf8'));
const confirmed = allMatches.filter(function(m) {
  var c = m.classification;
  if (typeof c === 'object' && c !== null) return c.label === 'CONFIRMED';
  return c === 'CONFIRMED';
});
var clusters = clusterBuilder.buildClusters(confirmed);
var result = clusters.map(function(members, idx) {
  return { person_id: 'PM_' + String(idx + 1).padStart(6, '0'), members: members };
});
fs.writeFileSync('functions/personmaster-builder/output/person_clusters.json', JSON.stringify(result, null, 2));
console.log('Clusters: ' + result.length + ' written');
"

# A.3 — Build PersonMaster documents
node -e "
const docBuilder = require('./functions/personmaster-builder/documentBuilder');
const clusters = JSON.parse(require('fs').readFileSync('functions/personmaster-builder/output/person_clusters.json', 'utf8'));
const allMatches = JSON.parse(require('fs').readFileSync('functions/entity-matching-engine/output/candidate_matches.json', 'utf8'));
const confirmed = allMatches.filter(function(m) {
  var c = m.classification;
  if (typeof c === 'object' && c !== null) return c.label === 'CONFIRMED';
  return c === 'CONFIRMED';
});
var sourceData = docBuilder.loadSourceData();
var documents = docBuilder.buildAllDocuments(clusters, sourceData, confirmed);
docBuilder.validateAllDocuments(documents);
require('fs').writeFileSync('functions/personmaster-builder/output/personmaster_documents.json', JSON.stringify(documents, null, 2));
console.log('Documents: ' + documents.length + ' (validation: PASS)');
"

# A.4 — Build edges
node -e "
var edgeBuilder = require('./functions/personmaster-builder/edgeBuilder');
var docBuilder = require('./functions/personmaster-builder/documentBuilder');
var documents = JSON.parse(require('fs').readFileSync('functions/personmaster-builder/output/personmaster_documents.json', 'utf8'));
var allMatches = JSON.parse(require('fs').readFileSync('functions/entity-matching-engine/output/candidate_matches.json', 'utf8'));
var srToPm = {};
for (var di = 0; di < documents.length; di++) {
  for (var si = 0; si < documents[di].source_records.length; si++) {
    var sr = documents[di].source_records[si];
    srToPm[sr.table + ':' + sr.source_id] = documents[di].person_id;
  }
}
var edges = edgeBuilder.buildEdges(documents, allMatches, srToPm);
require('fs').writeFileSync('functions/personmaster-builder/output/personmaster_edges.json', JSON.stringify({ edges: edges }, null, 2));
console.log('Edges: ' + edges.length + ' written');

// Validation
var pmIds = {}; documents.forEach(function(d) { pmIds[d.person_id] = true; });
var orphans = edges.filter(function(e) { return !pmIds[e.source] || !pmIds[e.target]; });
console.log('Orphan edges: ' + orphans.length);
var validTypes = ['CO_ACCUSED', 'ACCUSED_TO_VICTIM', 'SHARED_LOCATION', 'UNCONFIRMED_MATCH'];
var invalidTypes = edges.filter(function(e) { return validTypes.indexOf(e.edge_type) === -1; });
console.log('Invalid edge types: ' + invalidTypes.length);
"

# A.5 — Verify cluster member counts
node -e "
var clusters = JSON.parse(require('fs').readFileSync('functions/personmaster-builder/output/person_clusters.json', 'utf8'));
var docs = JSON.parse(require('fs').readFileSync('functions/personmaster-builder/output/personmaster_documents.json', 'utf8'));
var clusterTotal = clusters.reduce(function(s, c) { return s + c.members.length; }, 0);
var docTotal = docs.reduce(function(s, d) { return s + d.source_records.length; }, 0);
console.log('Cluster members: ' + clusterTotal + ', Source records: ' + docTotal + ', Match: ' + (clusterTotal === docTotal));
"
```

### Expected Output

```
# A.1
  Total records loaded:          ~800
  Accused:                      ~300
  Victim:                       ~300
  ComplainantDetails:           ~200
  Pairwise comparisons:         ~5000
  +--------------+---------+
  | CONFIRMED    |     XXX |
  | UNCONFIRMED  |     XXX |
  | DISCARDED    |     XXX |
  +--------------+---------+
  | Total kept   |     XXX |
  +--------------+---------+

# A.4
  Clusters: ~200
  No duplicate person_ids
  No orphan edges
  All edge types valid
```

### Validation Criteria

- `candidate_matches.json` exists and is valid JSON array
- All CONFIRMED matches have `confidence >= 0.7` (default THRESHOLD)
- Sum of cluster member counts equals total source records across all PersonMaster documents
- No duplicate `person_id` values across documents
- No duplicate `edge_id` values across edges
- Every edge `source` and `target` references an existing `person_id`
- Edge types are from: `CO_ACCUSED`, `ACCUSED_TO_VICTIM`, `SHARED_LOCATION`, `UNCONFIRMED_MATCH`
- Document validation passes (no duplicate aliases, no duplicate source_records, role counts match)

---

## B. GRAPH SERVICE (Local)

Tests the in-memory graph service that loads PersonMaster documents and edges for traversal.

### Checklist

- [ ] B.1 Load graph from output files
- [ ] B.2 Verify all nodes loadable
- [ ] B.3 Verify person lookup by ID
- [ ] B.4 Verify neighbour traversal
- [ ] B.5 Verify degree count
- [ ] B.6 Verify statistics computation

### Commands

```bash
# B.1-B.6 — Run existing graph service test suite
node functions/graph-service/test-graph-service.js
```

### Expected Output

```
  PASS: graphService should be defined
  PASS: can get a person by ID
  PASS: neighbours returns array for valid person
  PASS: degree returns correct number
  PASS: statistics computed
  ... (40+ tests)
  40 passed, 0 failed
```

### Validation Criteria

- `getPerson(personId)` returns a non-null object with `person_id`, `canonical_name`, `source_records`
- `getNeighbours(personId)` returns an array (possibly empty) of person objects
- `getDegree(personId)` returns a non-negative integer
- `personExists(personId)` returns `true` for valid IDs, `false` for invalid
- `getGraphStatistics()` returns an object with `total_persons`, `total_edges`, `avg_degree`
- `getEdge(edgeId)` returns valid edge structure when found
- All operations are idempotent and safe to call repeatedly

---

## C. BFS TRAVERSAL (Local)

Tests breadth-first graph traversal from a root node with configurable depth and filters.

### Checklist

- [ ] C.1 Traverse from root node at depth 1
- [ ] C.2 Traverse from root node at depth 2
- [ ] C.3 Traverse from root node at depth 3
- [ ] C.4 Verify node count increases with depth
- [ ] C.5 Verify no duplicate nodes/edges
- [ ] C.6 Verify hop_distance increments correctly
- [ ] C.7 Verify edge_type_filter works
- [ ] C.8 Verify include_unconfirmed toggle
- [ ] C.9 Verify invalid root returns error

### Commands

```bash
# C.1-C.9 — Run existing BFS test suite
node functions/graph-traversal/test-bfs.js
```

### Alternative manual verification:

```bash
# Quick BFS test at depth 1
node -e "
var { getInstance } = require('./functions/graph-service/index');
var { bfsTraverse } = require('./functions/graph-traversal/bfs');
var gs = getInstance();
var node = gs._cache.getNodes()[0];
var r = bfsTraverse(gs, node.person_id, { max_hops: 1 });
console.log('Depth 1 — nodes: ' + r.nodes.length + ', edges: ' + r.edges.length);
console.log('Hop distribution: ' + JSON.stringify(r.nodes.reduce(function(m, n) { m[n.hop_distance] = (m[n.hop_distance] || 0) + 1; return m; }, {})));
var r2 = bfsTraverse(gs, node.person_id, { max_hops: 2 });
console.log('Depth 2 — nodes: ' + r2.nodes.length + ', edges: ' + r2.edges.length);
"

# Test edge_type_filter
node -e "
var { getInstance } = require('./functions/graph-service/index');
var { bfsTraverse } = require('./functions/graph-traversal/bfs');
var gs = getInstance();
var node = gs._cache.getNodes()[0];
var r = bfsTraverse(gs, node.person_id, { max_hops: 2, edge_type_filter: ['CO_ACCUSED'] });
console.log('CO_ACCUSED only — nodes: ' + r.nodes.length + ', edges: ' + r.edges.length);
"

# Test invalid root
node -e "
var { getInstance } = require('./functions/graph-service/index');
var { bfsTraverse } = require('./functions/graph-traversal/bfs');
var gs = getInstance();
var r = bfsTraverse(gs, 'PM_INVALID', { max_hops: 2 });
console.log('Invalid root error: ' + JSON.stringify(r.error));
"
```

### Expected Output

```
# C.1-C.3 (via test-bfs.js)
  PASS: bfsTraverse defined
  PASS: depth 1 returns correct nodes
  PASS: depth 2 returns more nodes than depth 1
  PASS: depth 3 returns more nodes than depth 2
  PASS: no duplicate nodes returned
  PASS: no duplicate edges returned
  PASS: edge_type_filter restricts results
  PASS: invalid root returns error array
  ... (30+ tests)
  30 passed, 0 failed

# Depth progression (manual)
  Depth 1 — nodes: ~5,  edges: ~10
  Depth 2 — nodes: ~20, edges: ~50
  Depth 3 — nodes: ~50, edges: ~150
```

### Validation Criteria

- Node count at depth N+1 >= node count at depth N
- All nodes have `hop_distance` <= `max_hops`
- Root node has `hop_distance === 0`
- No duplicate `person_id` values in `nodes` array
- No duplicate `edge_id` values in `edges` array
- `edge_type_filter` only returns edges of the specified type(s)
- `include_unconfirmed: false` excludes UNCONFIRMED_MATCH edges
- Invalid personId returns `{ error: [...] }` (not thrown exception)

---

## D. NETWORK ANALYSIS REST Routes (Local)

Tests route matching, validation, and service methods for the 5 network analysis endpoints.

### Checklist

- [ ] D.1 Test route matching for `/person/:id`
- [ ] D.2 Test route matching for `/person/:id/associates`
- [ ] D.3 Test route matching for `/person/:id/co-accused`
- [ ] D.4 Test route matching for `/person/:id/victims`
- [ ] D.5 Test route matching for `/person/:id/network-summary`
- [ ] D.6 Test valid person returns 200 with correct body
- [ ] D.7 Test missing person returns 404
- [ ] D.8 Test invalid personId format returns 400
- [ ] D.9 Test query parameter validation (max_hops, include_unconfirmed, edge_type_filter)

### Commands

```bash
# D.1-D.9 — Run existing network analysis test suite
node functions/network-analysis/test-network-analysis.js
```

### Manual route matching tests:

```bash
node -e "
var { matchRoute, parsePath } = require('./functions/network-analysis/routes');
var tests = [
  '/person/PM_000001',
  '/person/PM_000001/associates?max_hops=2',
  '/person/PM_000001/co-accused',
  '/person/PM_000001/victims',
  '/person/PM_000001/network-summary',
  '/invalid',
];
tests.forEach(function(u) {
  var p = parsePath(u);
  var m = matchRoute(p.pathname);
  console.log(u + ' => ' + (m ? m.route : 'NO MATCH') + ' ' + JSON.stringify(m ? m.params : {}));
});
"

# Test personId validation
node -e "
var v = require('./functions/network-analysis/validators');
console.log('Empty: ' + JSON.stringify(v.validatePersonId('')));
console.log('Null: ' + JSON.stringify(v.validatePersonId(null)));
console.log('Bad format: ' + JSON.stringify(v.validatePersonId('abc')));
console.log('Valid: ' + JSON.stringify(v.validatePersonId('PM_000001')));
console.log('Max hops > 3: ' + JSON.stringify(v.validateMaxHops('5')));
console.log('Max hops < 1: ' + JSON.stringify(v.validateMaxHops('0')));
console.log('Invalid edge type: ' + JSON.stringify(v.validateEdgeTypeFilter('INVALID_TYPE')));
"
```

### Expected Output

```
# D.1-D.5 Route matching
  /person/PM_000001 => person {"personId":"PM_000001"}
  /person/PM_000001/associates?max_hops=2 => associates {"personId":"PM_000001"}
  /person/PM_000001/co-accused => co-accused {"personId":"PM_000001"}
  /person/PM_000001/victims => victims {"personId":"PM_000001"}
  /person/PM_000001/network-summary => network-summary {"personId":"PM_000001"}
  /invalid => NO MATCH {}

# D.8-D.9 Validation
  Empty: ["person_id is required and must be a string"]
  Null: ["person_id is required and must be a string"]
  Bad format: ["invalid person_id format (expected PM_XXXXXX)"]
  Valid: []
  Max hops > 3: ["max_hops cannot exceed 3"]
  Max hops < 1: ["max_hops must be at least 1"]
  Invalid edge type: ["invalid edge_type \"INVALID_TYPE\" in filter"]
```

### Validation Criteria

- Route `/person/PM_000001` matches route `person` with correct params
- Route `/person/PM_000001/associates` matches route `associates`
- Route `/person/INVALID` still matches but returns 404 from handler
- Route `/unknown` returns null from `matchRoute`
- `validatePersonId('PM_000001')` returns empty array (valid)
- `validatePersonId('')` returns error array (invalid)
- `validatePersonId('abc')` returns format error
- `validateMaxHops('5')` returns error (> 3)
- `validateEdgeTypeFilter('INVALID_TYPE')` returns error
- `responseFormatter.success(data)` returns `{ statusCode: 200, body: '{"success":true,...}' }`
- `responseFormatter.notFound(msg)` returns `{ statusCode: 404 }`

---

## E. GRAPH VISUALIZATION EXPORT (Local)

Tests the three export formats (Cytoscape, Compact, Debug) and error handling.

### Checklist

- [ ] E.1 Test `toCytoscape()` produces valid elements structure
- [ ] E.2 Test `toCompact()` produces short-field format
- [ ] E.3 Test `toDebug()` produces validation metadata
- [ ] E.4 Test missing person returns error
- [ ] E.5 Test invalid format parameter

### Commands

```bash
# E.1-E.5 — Run existing graph export test suite
node functions/graph-visualization/test-graph-export.js
```

### Manual export format verification:

```bash
node -e "
var { getInstance } = require('./functions/graph-service/index');
var { GraphExportService } = require('./functions/graph-visualization/graphExportService');
var gs = getInstance();
var svc = new GraphExportService();
var node = gs._cache.getNodes()[0];

var cy = svc.toCytoscape(node.person_id, { max_hops: 1 });
console.log('Cytoscape format:');
console.log('  elements: ' + (cy.elements ? cy.elements.length : 'MISSING'));
console.log('  nodes: ' + (cy.elements ? cy.elements.filter(function(e) { return e.group === 'nodes'; }).length : 0));
console.log('  edges: ' + (cy.elements ? cy.elements.filter(function(e) { return e.group === 'edges'; }).length : 0));

var cp = svc.toCompact(node.person_id, { max_hops: 1 });
console.log('Compact format:');
console.log('  nodes: ' + (cp.nodes ? cp.nodes.length : 0));
console.log('  first node: ' + JSON.stringify(cp.nodes ? cp.nodes[0] : null));
console.log('  first edge: ' + JSON.stringify(cp.edges ? cp.edges[0] : null));

var db = svc.toDebug(node.person_id, { max_hops: 1 });
console.log('Debug format:');
console.log('  graph.nodeCount: ' + db.graph.nodeCount);
console.log('  validation.allEdgesReferenceValidNodes: ' + db.validation.allEdgesReferenceValidNodes);
console.log('  degreeDistribution: ' + JSON.stringify(db.degreeDistribution));
"
```

### Expected Output

```
# Cytoscape format
  elements: ~30
  nodes: ~15
  edges: ~15

# Compact format
  nodes: ~15
  first node: {"id":"PM_000001","label":"...","hop":0}
  first edge: {"id":"E000001","s":"PM_000001","t":"PM_000002","type":"CO_ACCUSED","w":3}

# Debug format
  graph.nodeCount: ~15
  validation.allEdgesReferenceValidNodes: true
  degreeDistribution: {"1":5,"2":3,...}
```

### Validation Criteria

- `toCytoscape()` returns object with `root`, `elements` array
- Each element has `group: 'nodes'|'edges'` and `data` with correct fields
- `toCompact()` returns object with `root`, `nodes[]`, `edges[]`, `stats`
- Compact nodes have `id`, `label`, `hop` fields only
- Compact edges have `id`, `s`, `t`, `type`, `w` fields only
- `toDebug()` returns object with `validation` metadata including `allEdgesReferenceValidNodes`
- Missing person returns `{ error: ['Person ... not found'] }`
- Invalid format returns validation error with list of valid formats

---

## F. FULL REBUILD PIPELINE (Local)

Tests the complete end-to-end pipeline from CSV data through entity resolution, clustering, document building, edge building, and validation.

### Checklist

- [ ] F.1 Run `simulate-cron.js --dry-run`
- [ ] F.2 Verify pipeline completes all 8 stages
- [ ] F.3 Verify output counts match batch builder
- [ ] F.4 Verify no validation errors

### Commands

```bash
# F.1-F.4 — Run full pipeline in dry-run mode
node functions/sync-full/simulate-cron.js --dry-run
```

### Expected Output

```
================================================================================
  FULL GRAPH REBUILD — LOCAL SIMULATION (DRY RUN)
================================================================================

=== Full Graph Rebuild Pipeline ===

[Load CaseMaster]
  CaseMaster records: ~200
  Time: ~50ms

[Load Person Records]
  Person records: ~800
  Time: ~10ms

[Candidate Matching]
  Total comparisons: ~5000
  CONFIRMED: ~300
  UNCONFIRMED: ~100
  DISCARD: ~4600
  Time: ~100ms

[Cluster Builder]
  Clusters: ~200
  Time: ~5ms

[Document Builder]
  Documents: ~200
  Validation: PASS
  Time: ~50ms

[Edge Builder]
  Edges: ~1500
  Time: ~100ms

[Pipeline Validation]
  No duplicate person_ids: PASS
  No duplicate edge_ids:   PASS
  No orphan edges:         PASS
  Time: ~10ms

=== DRY RUN - Skipping Catalyst write ===
```

### Validation Criteria

- Pipeline exits with code 0 (not 1)
- All 7 stages (Load CaseMaster through Pipeline Validation) complete successfully
- Pipeline Validation stage shows all checks PASS
- Document count matches cluster count
- No duplicate person_ids detected
- No duplicate edge_ids detected
- No orphan edges detected
- Stage timings are all positive numbers

---

## G. INCREMENTAL SYNC (Local)

Tests the signal handler which processes new/updated person records against existing PersonMasters.

### Checklist

- [ ] G.1 Run `simulate-signal.js synthetic` mode
- [ ] G.2 Verify new PersonMaster created for unmatched synthetic record
- [ ] G.3 Run `simulate-signal.js existing 0` mode
- [ ] G.4 Verify existing PersonMaster matched and updated
- [ ] G.5 Verify edges recomputed after update

### Commands

```bash
# G.1-G.2 — Synthetic mode (creates new PersonMaster)
node functions/sync-incremental/simulate-signal.js synthetic

# G.3-G.4 — Existing record mode (matches to existing PersonMaster)
node functions/sync-incremental/simulate-signal.js existing 0
```

### Expected Output

```
# Synthetic mode
=== Incremental Sync Signal ===
  Event: SIMULATED_SYNTHETIC
  Table: Accused
  ID:    A-SIM-XXXX

[1] Loading existing PersonMaster documents...
  Existing PMs: ~200

[2] Preparing incoming record...
  Name: TestPerson_XXXX
  Normalised: testperson xxxx

[3] Finding candidate PersonMasters...
  Candidates found: 0

[4] Running Entity Matching...
  Matched: false
  Best score: 0.0000

[5] Updating PersonMaster...
  Created: PM_000XXX

[6] Recomputing edges...
  Edges before: ~1500
  Edges after:  ~1500

  Signal received:      SIMULATED_SYNTHETIC
  Person created:
    PM ID:   PM_000XXX
    Records: 1

# Existing mode
=== Incremental Sync Signal ===
  Event: SIMULATED_EXISTING
  Table: Accused
  ID:    A-XXXXX

[2] Preparing incoming record...
  Name: [original name]

[3] Finding candidate PersonMasters...
  Candidates found: 1+

[4] Running Entity Matching...
  Matched: true
  Matched to: PM_000001 (...)

[5] Updating PersonMaster...
  Updated: PM_000001
  Source records: N+1 (was N)

  Person matched:
    PM ID:   PM_000001
    Records: N+1
```

### Validation Criteria

- Synthetic mode creates a new PersonMaster (not matched)
- PersonMaster ID is auto-generated as `PM_000XXX` (incremented from existing max)
- New PersonMaster has at least 1 source record
- Existing mode matches an existing PersonMaster (matched: true)
- The matched PersonMaster's `source_records` count increases by 1
- Edge count changes accordingly (may increase, decrease, or stay same)
- Process completes without throwing exceptions

---

## H. DATA CONSISTENCY (Cross-Validation)

Validates that source data, PersonMaster clusters, and edges are consistent with each other.

### Checklist

- [ ] H.1 Count total source records in Accused + Victim + Complainant CSVs
- [ ] H.2 Verify all source records appear in exactly one PersonMaster cluster
- [ ] H.3 Verify every edge source and target references a valid PersonMaster
- [ ] H.4 Verify edge type values are from expected set
- [ ] H.5 Verify ground truth identities (if available)

### Commands

```bash
# H.1 — Count source records
node -e "
function parse(l) { var r = [], c = '', q = false; for (var i = 0; i < l.length; i++) { var ch = l[i]; if (ch === '\"') { if (q && i+1 < l.length && l[i+1] === '\"') { c += '\"'; i++; } else { q = !q; } } else if (ch === ',' && !q) { r.push(c.trim()); c = ''; } else { c += ch; } } r.push(c.trim()); return r; }
function countCSV(p) { var lines = require('fs').readFileSync(p, 'utf8').split(/\r?\n/).filter(function(l) { return l.trim().length > 0; }); return lines.length - 1; }
var a = countCSV('data_pipeline/data/Accused.csv');
var v = countCSV('data_pipeline/data/Victim.csv');
var c = countCSV('data_pipeline/data/ComplainantDetails.csv');
console.log('Accused: ' + a + ', Victim: ' + v + ', Complainant: ' + c + ', Total: ' + (a+v+c));
"

# H.2 — Verify all records in clusters
node -e "
var clusters = JSON.parse(require('fs').readFileSync('functions/personmaster-builder/output/person_clusters.json', 'utf8'));
var allKeys = {};
clusters.forEach(function(c) { c.members.forEach(function(m) { allKeys[m.table + ':' + m.source_id] = true; }); });
console.log('Unique source records in clusters: ' + Object.keys(allKeys).length);
var docs = JSON.parse(require('fs').readFileSync('functions/personmaster-builder/output/personmaster_documents.json', 'utf8'));
var docKeys = {};
docs.forEach(function(d) { d.source_records.forEach(function(sr) { docKeys[sr.table + ':' + sr.source_id] = true; }); });
console.log('Unique source records in documents: ' + Object.keys(docKeys).length);
var diff = Object.keys(docKeys).filter(function(k) { return !allKeys[k]; });
console.log('Records in docs but not in clusters: ' + diff.length);
var diff2 = Object.keys(allKeys).filter(function(k) { return !docKeys[k]; });
console.log('Records in clusters but not in docs: ' + diff2.length);
"

# H.3-H.4 — Edge validation
node -e "
var edges = JSON.parse(require('fs').readFileSync('functions/personmaster-builder/output/personmaster_edges.json', 'utf8')).edges;
var docs = JSON.parse(require('fs').readFileSync('functions/personmaster-builder/output/personmaster_documents.json', 'utf8'));
var pmIds = {}; docs.forEach(function(d) { pmIds[d.person_id] = true; });
var orphans = edges.filter(function(e) { return !pmIds[e.source] || !pmIds[e.target]; });
console.log('Orphan edges: ' + orphans.length);
var validTypes = ['CO_ACCUSED', 'ACCUSED_TO_VICTIM', 'SHARED_LOCATION', 'UNCONFIRMED_MATCH'];
var invalid = edges.filter(function(e) { return validTypes.indexOf(e.edge_type) === -1; });
console.log('Invalid edge types: ' + invalid.length);
var edgeTypes = {}; edges.forEach(function(e) { edgeTypes[e.edge_type] = (edgeTypes[e.edge_type] || 0) + 1; });
console.log('Edge type distribution: ' + JSON.stringify(edgeTypes));
"

# H.5 — Ground truth validation (if available)
node -e "
var fs = require('fs');
var gtPath = 'data_pipeline/data/ground_truth_identities.csv';
if (fs.existsSync(gtPath)) {
  var lines = fs.readFileSync(gtPath, 'utf8').split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
  console.log('Ground truth records: ' + (lines.length - 1));
} else {
  console.log('Ground truth file not found: ' + gtPath);
}
"
```

### Validation Criteria

- Number of unique source records in clusters == total CSV records
- Number of unique source records in documents == total CSV records
- Every source record key in documents exists in clusters (and vice versa)
- Zero orphan edges (edges referencing non-existent person IDs)
- Zero invalid edge types
- Edge type counts are non-negative integers

---

## I. END-TO-END WORKFLOW (Local)

Full chain: CSV data → entity resolution → PersonMaster → Graph Service → BFS traversal → Cytoscape export.

### Checklist

- [ ] I.1 Run entity resolution pipeline (steps A.1-A.4)
- [ ] I.2 Load graph service with output data
- [ ] I.3 Verify graph statistics are consistent
- [ ] I.4 Run BFS traversal from several root nodes
- [ ] I.5 Export graph in all 3 formats
- [ ] I.6 Measure and report end-to-end timing

### Commands

```bash
# I.1-I.6 — Full end-to-end workflow
node -e "
var t0 = Date.now();

// 1. Entity resolution (in-memory, no file writes)
var normaliser = require('./functions/entity-matching-engine/normaliser');
var phonetic = require('./functions/entity-matching-engine/phonetic');
var scorer = require('./functions/entity-matching-engine/scorer');
var threshold = require('./functions/entity-matching-engine/threshold');
var clusterBuilder = require('./functions/personmaster-builder/clusterBuilder');
var documentBuilder = require('./functions/personmaster-builder/documentBuilder');
var edgeBuilder = require('./functions/personmaster-builder/edgeBuilder');

function parse(l) { var r=[],c='',q=false; for(var i=0;i<l.length;i++){var ch=l[i];if(ch==='\"'){if(q&&i+1<l.length&&l[i+1]==='\"'){c+='\"';i++;}else{q=!q;}}else if(ch===','&&!q){r.push(c.trim());c='';}else{c+=ch;}}r.push(c.trim());return r;}
function loadCSV(p){var raw=require('fs').readFileSync(p,'utf8');var lines=raw.split(/\r?\n/).filter(function(l){return l.trim().length>0;});if(lines.length<2)return[];var h=parse(lines[0]);var rows=[];for(var i=1;i<lines.length;i++){var v=parse(lines[i]);var r={};for(var j=0;j<h.length;j++)r[h[j]]=v[j]||'';rows.push(r);}return rows;}

function genderToChar(g){var s=String(g||'').trim();if(s==='1'||s==='M'||s==='MALE')return'M';if(s==='2'||s==='F'||s==='FEMALE')return'F';return null;}

var cmRows = loadCSV('data_pipeline/data/CaseMaster.csv');
var cmLookup = {}; cmRows.forEach(function(r){var id=String(r.CaseMasterID||'').trim();if(id)cmLookup[id]=r;});

var records = [];
loadCSV('data_pipeline/data/Accused.csv').forEach(function(r){var cm=cmLookup[String(r.CaseMasterID).trim()]||{};records.push({source_table:'Accused',source_id:'A-'+r.AccusedMasterID,name:r.AccusedName||'',age:parseInt(r.AgeYear,10)||null,gender:genderToChar(r.GenderID),lat:null,lon:null,unit_id:null,district_id:null,caseMasterID:r.CaseMasterID});});
loadCSV('data_pipeline/data/Victim.csv').forEach(function(r){var cm=cmLookup[String(r.CaseMasterID).trim()]||{};records.push({source_table:'Victim',source_id:'V-'+r.VictimMasterID,name:r.VictimName||'',age:parseInt(r.AgeYear,10)||null,gender:genderToChar(r.GenderID),lat:null,lon:null,unit_id:null,district_id:null,caseMasterID:r.CaseMasterID});});
loadCSV('data_pipeline/data/ComplainantDetails.csv').forEach(function(r){var cm=cmLookup[String(r.CaseMasterID).trim()]||{};records.push({source_table:'ComplainantDetails',source_id:'C-'+r.ComplainantID,name:r.ComplainantName||'',age:parseInt(r.AgeYear,10)||null,gender:genderToChar(r.GenderID),lat:null,lon:null,unit_id:null,district_id:null,caseMasterID:r.CaseMasterID});});
var t1 = Date.now();
console.log('1. CSV loaded: ' + records.length + ' records (' + (t1-t0) + 'ms)');

// Normalise + bucket
records.forEach(function(r){r.normalised_name=normaliser.normaliseName(r.name);r.phonetic_key=phonetic.generatePhoneticKey(r.normalised_name);});
var buckets = {}; records.forEach(function(r){if(r.phonetic_key){if(!buckets[r.phonetic_key])buckets[r.phonetic_key]=[];buckets[r.phonetic_key].push(r);}});

// Match
var allMatches = [];
for(var bk in buckets){var g=buckets[bk];if(g.length<2)continue;for(var i=0;i<g.length;i++){for(var j=i+1;j<g.length;j++){var a=g[i],b=g[j];if(a.source_id===b.source_id&&a.source_table===b.source_table)continue;var result=scorer.computeScore(a,b);var cls=threshold.classify(result.confidence);if(cls.label==='DISCARD')continue;allMatches.push({recordA:{source_id:a.source_id,source_table:a.source_table,caseMasterID:a.caseMasterID,name:a.name,normalised_name:a.normalised_name,phonetic_key:a.phonetic_key,age:a.age,gender:a.gender},recordB:{source_id:b.source_id,source_table:b.source_table,caseMasterID:b.caseMasterID,name:b.name,normalised_name:b.normalised_name,phonetic_key:b.phonetic_key,age:b.age,gender:b.gender},tables:[a.source_table,b.source_table],confidence:result.confidence,classification:cls.label,score_breakdown:result.score_breakdown});}}}
var t2 = Date.now();
var confirmed = allMatches.filter(function(m){var c=m.classification;if(typeof c==='object'&&c!==null)return c.label==='CONFIRMED';return c==='CONFIRMED';});
console.log('2. Matching: ' + allMatches.length + ' matches (' + confirmed.length + ' confirmed) (' + (t2-t1) + 'ms)');

// Cluster
var rawClusters = clusterBuilder.buildClusters(confirmed);
var clusters = rawClusters.map(function(m,i){return{person_id:'PM_'+String(i+1).padStart(6,'0'),members:m};});
var t3 = Date.now();
console.log('3. Clusters: ' + clusters.length + ' (' + (t3-t2) + 'ms)');

// Documents
var sourceData = documentBuilder.loadSourceData();
var documents = documentBuilder.buildAllDocuments(clusters, sourceData, confirmed);
documentBuilder.validateAllDocuments(documents);
var t4 = Date.now();
console.log('4. Documents: ' + documents.length + ' (validation PASS) (' + (t4-t3) + 'ms)');

// Edges
var srToPm = {};
documents.forEach(function(d){d.source_records.forEach(function(sr){srToPm[sr.table+':'+sr.source_id]=d.person_id;});});
var edges = edgeBuilder.buildEdges(documents, allMatches, srToPm);
var t5 = Date.now();
console.log('5. Edges: ' + edges.length + ' (' + (t5-t4) + 'ms)');

// Validate edges
var pmIds = {}; documents.forEach(function(d){pmIds[d.person_id]=true;});
var orphans = edges.filter(function(e){return !pmIds[e.source]||!pmIds[e.target];});
console.log('   Orphan edges: ' + orphans.length);
var validTypes = ['CO_ACCUSED','ACCUSED_TO_VICTIM','SHARED_LOCATION','UNCONFIRMED_MATCH'];
var bad = edges.filter(function(e){return validTypes.indexOf(e.edge_type)===-1;});
console.log('   Invalid types: ' + bad.length);

console.log('\\n=== End-to-End Summary ===');
console.log('  Total time: ' + ((t5-t0)/1000).toFixed(2) + 's');
console.log('  Records: ' + records.length + ' -> Clusters: ' + clusters.length + ' -> PMs: ' + documents.length + ' -> Edges: ' + edges.length);
"
```

### Expected Output

```
1. CSV loaded: ~800 records (50ms)
2. Matching: ~500 matches (~300 confirmed) (100ms)
3. Clusters: ~200 (5ms)
4. Documents: ~200 (validation PASS) (50ms)
5. Edges: ~1500 (100ms)
   Orphan edges: 0
   Invalid types: 0

=== End-to-End Summary ===
  Total time: 0.35s
  Records: ~800 -> Clusters: ~200 -> PMs: ~200 -> Edges: ~1500
```

### Validation Criteria

- Pipeline completes without errors
- All source records are assigned to exactly one PersonMaster cluster
- All edges reference valid PersonMaster IDs
- Zero orphan edges
- Zero invalid edge types
- Number of PersonMaster documents <= number of source records
- Number of edges > number of PersonMaster documents (each PM has at least some connections)

---

## J. ERROR HANDLING

Tests that all components return proper error responses for invalid inputs.

### Checklist

- [ ] J.1 Empty/null personId returns validation error
- [ ] J.2 personId with wrong format returns validation error
- [ ] J.3 max_hops exceeding 3 returns error
- [ ] J.4 Invalid edge types in filter return error
- [ ] J.5 Missing data files return appropriate error
- [ ] J.6 BFS with non-existent personId returns error
- [ ] J.7 Graph service returns null for non-existent person

### Commands

```bash
# J.1 — Empty personId validation
node -e "
var v = require('./functions/network-analysis/validators');
console.log('Empty: ' + JSON.stringify(v.validatePersonId('')));
console.log('Null: ' + JSON.stringify(v.validatePersonId(null)));
console.log('Undefined: ' + JSON.stringify(v.validatePersonId()));
"

# J.2 — Wrong format
node -e "
var v = require('./functions/network-analysis/validators');
console.log('Lowercase: ' + JSON.stringify(v.validatePersonId('pm_000001')));
console.log('No prefix: ' + JSON.stringify(v.validatePersonId('000001')));
console.log('Wrong prefix: ' + JSON.stringify(v.validatePersonId('XX_000001')));
console.log('Short ID: ' + JSON.stringify(v.validatePersonId('PM_001')));
"

# J.3 — Max hops > 3
node -e "
var v = require('./functions/network-analysis/validators');
console.log('Hops=5: ' + JSON.stringify(v.validateMaxHops('5')));
console.log('Hops=0: ' + JSON.stringify(v.validateMaxHops('0')));
console.log('Hops=3: ' + JSON.stringify(v.validateMaxHops('3')));
console.log('Hops=1: ' + JSON.stringify(v.validateMaxHops('1')));
console.log('Hops=null: ' + JSON.stringify(v.validateMaxHops(null)));
"

# J.4 — Invalid edge types
node -e "
var v = require('./functions/network-analysis/validators');
console.log('Invalid: ' + JSON.stringify(v.validateEdgeTypeFilter('INVALID')));
console.log('Mixed: ' + JSON.stringify(v.validateEdgeTypeFilter('CO_ACCUSED,INVALID')));
console.log('Valid: ' + JSON.stringify(v.validateEdgeTypeFilter('CO_ACCUSED')));
console.log('All valid: ' + JSON.stringify(v.validateEdgeTypeFilter('CO_ACCUSED,ACCUSED_TO_VICTIM')));
"

# J.5 — Missing data files
node -e "
var fs = require('fs');
var path = require('path');
var file = path.join(__dirname, 'functions/personmaster-builder/output/personmaster_documents.json');
console.log('Documents file exists: ' + fs.existsSync(file));
var edgesFile = path.join(__dirname, 'functions/personmaster-builder/output/personmaster_edges.json');
console.log('Edges file exists: ' + fs.existsSync(edgesFile));
console.log('If either is missing, graph service tests will skip.');
"

# J.6 — BFS non-existent person
node -e "
var { getInstance } = require('./functions/graph-service/index');
var { bfsTraverse } = require('./functions/graph-traversal/bfs');
var gs = getInstance();

// Non-existent
var r = bfsTraverse(gs, 'PM_999999', { max_hops: 2 });
console.log('Non-existent: ' + (r.error ? 'ERROR: ' + JSON.stringify(r.error) : 'UNEXPECTED SUCCESS'));

// Empty string
var r2 = bfsTraverse(gs, '', { max_hops: 2 });
console.log('Empty ID: ' + (r2.error ? 'ERROR: ' + JSON.stringify(r2.error) : 'UNEXPECTED SUCCESS'));

// Graph service
console.log('personExists(PM_999999): ' + gs.personExists('PM_999999'));
console.log('personExists(PM_000001): ' + gs.personExists('PM_000001'));
console.log('getPerson(PM_999999): ' + gs.getPerson('PM_999999'));
"
```

### Expected Output

```
# J.1
  Empty: ["person_id is required and must be a string"]
  Null: ["person_id is required and must be a string"]

# J.2
  Lowercase: ["invalid person_id format (expected PM_XXXXXX)"]
  No prefix: ["invalid person_id format (expected PM_XXXXXX)"]

# J.3
  Hops=5: ["max_hops cannot exceed 3"]
  Hops=0: ["max_hops must be at least 1"]
  Hops=3: []
  Hops=null: []

# J.4
  Invalid: ["invalid edge_type \"INVALID\" in filter"]
  Mixed: ["invalid edge_type \"INVALID\" in filter"]
  Valid: []

# J.6
  Non-existent: ERROR: ["Person PM_999999 not found in the graph"]
  Empty ID: ERROR: ["person_id is required and must be a string"]
  personExists(PM_999999): false
  personExists(PM_000001): true
  getPerson(PM_999999): null
```

### Validation Criteria

- All validation functions return arrays (empty = valid, non-empty = errors)
- Invalid personId formats return descriptive error messages
- Non-existent persons return `null` from `getPerson()` and `false` from `personExists()`
- Edge type filter rejects types outside the valid set
- BFS traversal returns `{ error: [...] }` (not thrown exception) for invalid inputs
- Missing data files cause graceful test skipping (not unhandled crashes)
- All error responses are JSON-serializable objects

---

## K. [LIVE ONLY] Catalyst REST Endpoints

> These tests require active Catalyst deployment and are **not** run locally.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/test/` | Health check |
| POST | `/pipeline/query` | Main query pipeline |
| POST | `/classifier/classify` | Intent classification |
| POST | `/nl_sql/query` | NL to SQL |
| POST | `/rag/query` | Narrative RAG |
| POST | `/session/create` | Create session |
| GET | `/session/` | Get session |
| POST | `/query_exec/execute` | Execute ZCQL |

---

## Test Execution Summary

| Section | Test | Type | Depends On |
|---------|------|------|------------|
| A | Entity Resolution Pipeline | Local | CSV data |
| B | Graph Service | Local | A output |
| C | BFS Traversal | Local | B |
| D | Network Analysis | Local | B |
| E | Graph Visualization Export | Local | B |
| F | Full Rebuild Pipeline | Local | CSV data |
| G | Incremental Sync | Local | A output |
| H | Data Consistency | Local | CSV data + A output |
| I | End-to-End Workflow | Local | CSV data |
| J | Error Handling | Local | None |
| K | Catalyst REST Endpoints | Live Only | Catalyst deployment |

### Running Order

1. **A** → Entity Resolution (must pass before B)
2. **B** → Graph Service (must pass before C, D, E)
3. **C** → BFS Traversal (depends on B)
4. **D** → Network Analysis (depends on B)
5. **E** → Graph Visualization (depends on B)
6. **F** → Full Rebuild (independent, validates A)
7. **G** → Incremental Sync (depends on A output)
8. **H** → Data Consistency (depends on A output)
9. **I** → End-to-End (runs entire chain)
10. **J** → Error Handling (no dependencies)
11. **K** → [LIVE ONLY] Catalyst endpoints
