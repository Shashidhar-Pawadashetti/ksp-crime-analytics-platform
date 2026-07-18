#!/usr/bin/env bash
# =============================================================================
#  KSP Crime Analytics Platform — Integration Test Runner
#  Usage: bash run-integration-tests.sh [--skip-live] [--verbose]
# =============================================================================

set -o pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
START_TIME=$(date +%s)
VERBOSE=false
SKIP_LIVE=false

# ── Color helpers ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_banner() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║   KSP Crime Analytics — Integration Test Suite             ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo "  Root:   $ROOT_DIR"
  echo "  Date:   $(date)"
  echo ""
}

print_header() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  [$1/$2] $3"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

pass() {
  echo -e "  ${GREEN}PASS${NC}  $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  echo -e "  ${RED}FAIL${NC}  $1"
  echo "        $2"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

skip() {
  echo -e "  ${YELLOW}SKIP${NC}  $1"
  SKIP_COUNT=$((SKIP_COUNT + 1))
}

check_output_exists() {
  if [ ! -f "$1" ]; then
    fail "$2" "File not found: $1"
    return 1
  fi
  return 0
}

check_exit_code() {
  local expected=$1
  local actual=$2
  local label=$3
  if [ "$actual" -eq "$expected" ]; then
    pass "$label"
  else
    fail "$label" "Expected exit code $expected, got $actual"
  fi
}

# ── Parse arguments ────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --verbose) VERBOSE=true ;;
    --skip-live) SKIP_LIVE=true ;;
  esac
done

cd "$ROOT_DIR" || exit 1

# ── 0. Pre-flight checks ──────────────────────────────────────────────────
print_banner

TOTAL_TESTS=0

# ── A. ENTITY RESOLUTION PIPELINE ─────────────────────────────────────────
print_header "A" "10" "Entity Resolution Pipeline"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [A.1] Running validate.cjs to generate candidate_matches.json..."
CANDIDATE_OUTPUT_DIR="functions/entity-matching-engine/output"
mkdir -p "$CANDIDATE_OUTPUT_DIR"
if node functions/entity-matching-engine/validate.cjs 2>&1; then
  pass "validate.cjs completed"
else
  fail "validate.cjs" "Script exited with error"
  echo "  WARN: Continuing with remaining tests..."
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [A.2] Checking candidate_matches.json exists..."
if check_output_exists "$CANDIDATE_OUTPUT_DIR/candidate_matches.json" "candidate_matches.json check"; then
  MATCH_COUNT=$(node -e "var m=require('$CANDIDATE_OUTPUT_DIR/candidate_matches.json');console.log(m.length)" 2>/dev/null)
  echo "        Matches file valid: $MATCH_COUNT entries"
  pass "candidate_matches.json is valid JSON with $MATCH_COUNT entries"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [A.3] Building clusters from CONFIRMED matches..."
PM_OUTPUT_DIR="functions/personmaster-builder/output"
mkdir -p "$PM_OUTPUT_DIR"
CLUSTER_RESULT=$(node -e "
var fs = require('fs');
var clusterBuilder = require('./functions/personmaster-builder/clusterBuilder');
var allMatches = JSON.parse(fs.readFileSync('$CANDIDATE_OUTPUT_DIR/candidate_matches.json', 'utf8'));
var confirmed = allMatches.filter(function(m) {
  var c = m.classification;
  if (typeof c === 'object' && c !== null) return c.label === 'CONFIRMED';
  return c === 'CONFIRMED';
});
var clusters = clusterBuilder.buildClusters(confirmed);
var result = clusters.map(function(members, idx) {
  return { person_id: 'PM_' + String(idx + 1).padStart(6, '0'), members: members };
});
fs.writeFileSync('$PM_OUTPUT_DIR/person_clusters.json', JSON.stringify(result, null, 2));
console.log(result.length);
" 2>&1)

if [ $? -eq 0 ] && [ -n "$CLUSTER_RESULT" ]; then
  echo "        Clusters: $CLUSTER_RESULT"
  pass "clusterBuilder produced $CLUSTER_RESULT clusters"
else
  fail "clusterBuilder" "$CLUSTER_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [A.4] Building PersonMaster documents..."
DOC_RESULT=$(node -e "
var docBuilder = require('./functions/personmaster-builder/documentBuilder');
var clusters = JSON.parse(require('fs').readFileSync('$PM_OUTPUT_DIR/person_clusters.json', 'utf8'));
var allMatches = JSON.parse(require('fs').readFileSync('$CANDIDATE_OUTPUT_DIR/candidate_matches.json', 'utf8'));
var confirmed = allMatches.filter(function(m) {
  var c = m.classification;
  if (typeof c === 'object' && c !== null) return c.label === 'CONFIRMED';
  return c === 'CONFIRMED';
});
var sourceData = docBuilder.loadSourceData();
var docs = docBuilder.buildAllDocuments(clusters, sourceData, confirmed);
docBuilder.validateAllDocuments(docs);
require('fs').writeFileSync('$PM_OUTPUT_DIR/personmaster_documents.json', JSON.stringify(docs, null, 2));
console.log('OK:' + docs.length);
" 2>&1)

if echo "$DOC_RESULT" | grep -q "^OK:"; then
  DOC_COUNT=$(echo "$DOC_RESULT" | sed 's/^OK://')
  pass "documentBuilder produced $DOC_COUNT documents (validation PASS)"
else
  fail "documentBuilder" "$DOC_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [A.5] Building edges..."
EDGE_RESULT=$(node -e "
var edgeBuilder = require('./functions/personmaster-builder/edgeBuilder');
var docBuilder = require('./functions/personmaster-builder/documentBuilder');
var documents = JSON.parse(require('fs').readFileSync('$PM_OUTPUT_DIR/personmaster_documents.json', 'utf8'));
var allMatches = JSON.parse(require('fs').readFileSync('$CANDIDATE_OUTPUT_DIR/candidate_matches.json', 'utf8'));
var srToPm = {};
for (var di = 0; di < documents.length; di++) {
  for (var si = 0; si < documents[di].source_records.length; si++) {
    var sr = documents[di].source_records[si];
    srToPm[sr.table + ':' + sr.source_id] = documents[di].person_id;
  }
}
var edges = edgeBuilder.buildEdges(documents, allMatches, srToPm);
require('fs').writeFileSync('$PM_OUTPUT_DIR/personmaster_edges.json', JSON.stringify({ edges: edges }, null, 2));
console.log('OK:' + edges.length);
" 2>&1)

if echo "$EDGE_RESULT" | grep -q "^OK:"; then
  EDGE_COUNT=$(echo "$EDGE_RESULT" | sed 's/^OK://')
  pass "edgeBuilder produced $EDGE_COUNT edges"
else
  fail "edgeBuilder" "$EDGE_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [A.6] Validating no duplicate person IDs..."
DUP_RESULT=$(node -e "
var docs = JSON.parse(require('fs').readFileSync('$PM_OUTPUT_DIR/personmaster_documents.json', 'utf8'));
var ids = {}; var dup = false;
for (var di = 0; di < docs.length; di++) {
  if (ids[docs[di].person_id]) { console.log('DUP:' + docs[di].person_id); dup = true; }
  ids[docs[di].person_id] = true;
}
console.log(dup ? 'FAIL' : 'OK');
" 2>&1)

if echo "$DUP_RESULT" | grep -q "^OK$"; then
  pass "No duplicate person IDs"
else
  fail "Duplicate person IDs" "$DUP_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [A.7] Validating cluster member sum vs document source records..."
SUM_RESULT=$(node -e "
var clusters = JSON.parse(require('fs').readFileSync('$PM_OUTPUT_DIR/person_clusters.json', 'utf8'));
var docs = JSON.parse(require('fs').readFileSync('$PM_OUTPUT_DIR/personmaster_documents.json', 'utf8'));
var cSum = clusters.reduce(function(s, c) { return s + c.members.length; }, 0);
var dSum = docs.reduce(function(s, d) { return s + d.source_records.length; }, 0);
console.log(cSum === dSum ? 'OK:' + cSum : 'MISMATCH:' + cSum + ' vs ' + dSum);
" 2>&1)

if echo "$SUM_RESULT" | grep -q "^OK:"; then
  SUM_VAL=$(echo "$SUM_RESULT" | sed 's/^OK://')
  pass "Cluster members ($SUM_VAL) == document source records"
else
  fail "Cluster/document mismatch" "$SUM_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [A.8] Validating edge types and orphan edges..."
EDGE_VAL_RESULT=$(node -e "
var edges = JSON.parse(require('fs').readFileSync('$PM_OUTPUT_DIR/personmaster_edges.json', 'utf8')).edges;
var docs = JSON.parse(require('fs').readFileSync('$PM_OUTPUT_DIR/personmaster_documents.json', 'utf8'));
var pmIds = {}; docs.forEach(function(d) { pmIds[d.person_id] = true; });
var orphans = edges.filter(function(e) { return !pmIds[e.source] || !pmIds[e.target]; });
var validTypes = ['CO_ACCUSED', 'ACCUSED_TO_VICTIM', 'SHARED_LOCATION', 'UNCONFIRMED_MATCH'];
var invalids = edges.filter(function(e) { return validTypes.indexOf(e.edge_type) === -1; });
if (orphans.length > 0 || invalids.length > 0) {
  console.log('FAIL:' + orphans.length + ' orphans, ' + invalids.length + ' invalid types');
} else {
  console.log('OK');
}
" 2>&1)

if echo "$EDGE_VAL_RESULT" | grep -q "^OK$"; then
  pass "All edge types valid, no orphan edges"
else
  fail "Edge validation" "$EDGE_VAL_RESULT"
fi

# ── B. GRAPH SERVICE ─────────────────────────────────────────────────────
print_header "B" "6" "Graph Service"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [B.1] Checking required output files exist..."
if [ -f "$PM_OUTPUT_DIR/personmaster_documents.json" ] && [ -f "$PM_OUTPUT_DIR/personmaster_edges.json" ]; then
  pass "PersonMaster output files exist"
else
  fail "Missing output files" "personmaster_documents.json or personmaster_edges.json not found"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [B.2] Running graph service test suite..."
GS_RESULT=$(node functions/graph-service/test-graph-service.js 2>&1)
GS_EXIT=$?

if echo "$GS_RESULT" | grep -q "SKIP:"; then
  skip "Graph service test skipped (missing data files)"
elif echo "$GS_RESULT" | grep -q "0 failed"; then
  GS_PASS=$(echo "$GS_RESULT" | grep -oP '\d+(?= passed)' || echo "0")
  pass "Graph service tests: $GS_PASS passed"
else
  echo "$GS_RESULT" | tail -5
  fail "Graph service tests" "Some tests failed (exit code $GS_EXIT)"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [B.3] Person lookup by ID..."
PERSON_LOOKUP=$(node -e "
var { getInstance } = require('./functions/graph-service/index');
var gs = getInstance();
var nodes = gs._cache.getNodes();
if (nodes.length === 0) { console.log('NO_NODES'); process.exit(0); }
var p = gs.getPerson(nodes[0].person_id);
console.log(p ? 'OK:' + p.person_id : 'NULL');
" 2>&1)

if echo "$PERSON_LOOKUP" | grep -q "^OK:"; then
  PID=$(echo "$PERSON_LOOKUP" | sed 's/^OK://')
  pass "Person lookup by ID works ($PID)"
else
  [ "$PERSON_LOOKUP" = "NO_NODES" ] && skip "Person lookup (no nodes in graph)" || fail "Person lookup" "$PERSON_LOOKUP"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [B.4] Neighbour traversal..."
NEIGHBOUR_RESULT=$(node -e "
var { getInstance } = require('./functions/graph-service/index');
var gs = getInstance();
var nodes = gs._cache.getNodes();
if (nodes.length === 0) { console.log('NO_NODES'); process.exit(0); }
var n = gs.getNeighbours(nodes[0].person_id);
console.log('OK:' + (Array.isArray(n) ? n.length : 'NOT_ARRAY'));
" 2>&1)

if echo "$NEIGHBOUR_RESULT" | grep -q "^OK:"; then
  NEIGH_COUNT=$(echo "$NEIGHBOUR_RESULT" | sed 's/^OK://')
  pass "Neighbours returns array of $NEIGH_COUNT entries"
else
  [ "$NEIGHBOUR_RESULT" = "NO_NODES" ] && skip "Neighbours (no nodes)" || fail "Neighbours" "$NEIGHBOUR_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [B.5] Degree count..."
DEGREE_RESULT=$(node -e "
var { getInstance } = require('./functions/graph-service/index');
var gs = getInstance();
var nodes = gs._cache.getNodes();
if (nodes.length === 0) { console.log('NO_NODES'); process.exit(0); }
var d = gs.getDegree(nodes[0].person_id);
console.log('OK:' + d);
" 2>&1)

if echo "$DEGREE_RESULT" | grep -q "^OK:"; then
  DEG_VAL=$(echo "$DEGREE_RESULT" | sed 's/^OK://')
  if [ "$DEG_VAL" -ge 0 ] 2>/dev/null; then
    pass "Degree returns $DEG_VAL (valid)"
  else
    fail "Degree" "Unexpected value: $DEG_VAL"
  fi
else
  [ "$DEGREE_RESULT" = "NO_NODES" ] && skip "Degree (no nodes)" || fail "Degree" "$DEGREE_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [B.6] Graph statistics..."
STATS_RESULT=$(node -e "
var { getInstance } = require('./functions/graph-service/index');
var gs = getInstance();
var stats = gs.getGraphStatistics();
if (stats && stats.totalNodes !== undefined) {
  console.log('OK:' + stats.totalNodes + ' persons, ' + stats.totalEdges + ' edges');
} else {
  console.log('FAIL: no statistics');
}
" 2>&1)

if echo "$STATS_RESULT" | grep -q "^OK:"; then
  pass "Statistics computed: $STATS_RESULT"
else
  fail "Statistics" "$STATS_RESULT"
fi

# ── C. BFS TRAVERSAL ─────────────────────────────────────────────────────
print_header "C" "8" "BFS Traversal"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [C.1] Running BFS test suite..."
BFS_RESULT=$(node functions/graph-traversal/test-bfs.js 2>&1)
BFS_EXIT=$?

if echo "$BFS_RESULT" | grep -q "0 failed"; then
  BFS_PASS=$(echo "$BFS_RESULT" | grep -oP '\d+(?= passed)' || echo "0")
  pass "BFS tests: $BFS_PASS passed"
else
  echo "$BFS_RESULT" | tail -5
  fail "BFS test suite" "Some tests failed (exit code $BFS_EXIT)"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [C.2] Depth progression (D1 < D2 < D3)..."
DEPTH_RESULT=$(node -e "
var { getInstance } = require('./functions/graph-service/index');
var { bfsTraverse } = require('./functions/graph-traversal/bfs');
var gs = getInstance();
var nodes = gs._cache.getNodes();
if (nodes.length === 0) { console.log('NO_NODES'); process.exit(0); }
var root = nodes[0].person_id;
var d1 = bfsTraverse(gs, root, { max_hops: 1 }).nodes.length;
var d2 = bfsTraverse(gs, root, { max_hops: 2 }).nodes.length;
var d3 = bfsTraverse(gs, root, { max_hops: 3 }).nodes.length;
console.log('OK:' + d1 + ',' + d2 + ',' + d3);
" 2>&1)

if echo "$DEPTH_RESULT" | grep -q "^OK:"; then
  DEPTHS=$(echo "$DEPTH_RESULT" | sed 's/^OK://')
  D1=$(echo "$DEPTHS" | cut -d, -f1)
  D2=$(echo "$DEPTHS" | cut -d, -f2)
  D3=$(echo "$DEPTHS" | cut -d, -f3)
  if [ "$D1" -le "$D2" ] 2>/dev/null && [ "$D2" -le "$D3" ] 2>/dev/null; then
    pass "Depth progression: D1=$D1 <= D2=$D2 <= D3=$D3"
  else
    fail "Depth progression" "Expected D1 <= D2 <= D3, got $D1, $D2, $D3"
  fi
else
  [ "$DEPTH_RESULT" = "NO_NODES" ] && skip "Depth progression (no nodes)" || fail "Depth progression" "$DEPTH_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [C.3] No duplicate nodes/edges..."
DEDUP_RESULT=$(node -e "
var { getInstance } = require('./functions/graph-service/index');
var { bfsTraverse } = require('./functions/graph-traversal/bfs');
var gs = getInstance();
var nodes = gs._cache.getNodes();
if (nodes.length === 0) { console.log('NO_NODES'); process.exit(0); }
var r = bfsTraverse(gs, nodes[0].person_id, { max_hops: 2 });
var nDup = r.nodes.length - new Set(r.nodes.map(function(n) { return n.person_id; })).size;
var eDup = r.edges.length - new Set(r.edges.map(function(e) { return e.edge_id; })).size;
console.log((nDup === 0 && eDup === 0) ? 'OK' : 'DUP:' + nDup + ' node dups, ' + eDup + ' edge dups');
" 2>&1)

if echo "$DEDUP_RESULT" | grep -q "^OK$"; then
  pass "No duplicate nodes or edges in traversal results"
else
  [ "$DEDUP_RESULT" = "NO_NODES" ] && skip "Dedup check (no nodes)" || fail "Dedup check" "$DEDUP_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [C.4] Hop distance distribution..."
HOP_RESULT=$(node -e "
var { getInstance } = require('./functions/graph-service/index');
var { bfsTraverse } = require('./functions/graph-traversal/bfs');
var gs = getInstance();
var nodes = gs._cache.getNodes();
if (nodes.length === 0) { console.log('NO_NODES'); process.exit(0); }
var r = bfsTraverse(gs, nodes[0].person_id, { max_hops: 2 });
var dist = {}; r.nodes.forEach(function(n) { dist[n.hop_distance] = (dist[n.hop_distance] || 0) + 1; });
var ok = r.nodes.every(function(n) { return n.hop_distance >= 0 && n.hop_distance <= 2; });
console.log(ok ? 'OK:' + JSON.stringify(dist) : 'FAIL');
" 2>&1)

if echo "$HOP_RESULT" | grep -q "^OK:"; then
  pass "Hop distances valid: $HOP_RESULT"
else
  [ "$HOP_RESULT" = "NO_NODES" ] && skip "Hop distance (no nodes)" || fail "Hop distance" "$HOP_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [C.5] Edge type filter..."
FILTER_RESULT=$(node -e "
var { getInstance } = require('./functions/graph-service/index');
var { bfsTraverse } = require('./functions/graph-traversal/bfs');
var gs = getInstance();
var nodes = gs._cache.getNodes();
if (nodes.length === 0) { console.log('NO_NODES'); process.exit(0); }
var r = bfsTraverse(gs, nodes[0].person_id, { max_hops: 2, edge_type_filter: ['CO_ACCUSED'] });
var allCoAccused = r.edges.every(function(e) { return e.edge_type === 'CO_ACCUSED'; });
console.log(allCoAccused ? 'OK' : 'FAIL: non-CO_ACCUSED edges found');
" 2>&1)

if echo "$FILTER_RESULT" | grep -q "^OK$"; then
  pass "Edge type filter works (CO_ACCUSED only)"
else
  [ "$FILTER_RESULT" = "NO_NODES" ] && skip "Edge filter (no nodes)" || fail "Edge type filter" "$FILTER_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [C.6] Invalid root returns error..."
INVALID_BFS=$(node -e "
var { getInstance } = require('./functions/graph-service/index');
var { bfsTraverse } = require('./functions/graph-traversal/bfs');
var gs = getInstance();
var r1 = bfsTraverse(gs, 'PM_999999', { max_hops: 2 });
var r2 = bfsTraverse(gs, '', { max_hops: 2 });
var r3 = bfsTraverse(gs, 'abc', { max_hops: 2 });
console.log((r1.error && r2.error && r3.error) ? 'OK' : 'FAIL');
" 2>&1)

if echo "$INVALID_BFS" | grep -q "^OK$"; then
  pass "Invalid root returns error"
else
  fail "Invalid root handling" "$INVALID_BFS"
fi

# ── D. NETWORK ANALYSIS ──────────────────────────────────────────────────
print_header "D" "9" "Network Analysis"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [D.1] Running network analysis test suite..."
NA_RESULT=$(node functions/network-analysis/test-network-analysis.js 2>&1)
NA_EXIT=$?

if echo "$NA_RESULT" | grep -q "0 failed"; then
  NA_PASS=$(echo "$NA_RESULT" | grep -oP '\d+(?= passed)' || echo "0")
  pass "Network analysis tests: $NA_PASS passed"
else
  echo "$NA_RESULT" | tail -5
  fail "Network analysis tests" "Some tests failed (exit code $NA_EXIT)"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [D.2] Route matching — 5 endpoints..."
ROUTE_RESULT=$(node -e "
var { matchRoute, parsePath } = require('./functions/network-analysis/routes');
var routes = ['/person/PM_000001', '/person/PM_000001/associates', '/person/PM_000001/co-accused', '/person/PM_000001/victims', '/person/PM_000001/network-summary'];
var allMatch = routes.every(function(u) { return matchRoute(parsePath(u).pathname) !== null; });
var noMatch = matchRoute(parsePath('/invalid').pathname) === null;
console.log(allMatch && noMatch ? 'OK' : 'FAIL');
" 2>&1)

if echo "$ROUTE_RESULT" | grep -q "^OK$"; then
  pass "All 5 routes match correctly"
else
  fail "Route matching" "$ROUTE_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [D.3] Valid person returns success..."
PERSON_ROUTE_RESULT=$(node -e "
var { route } = require('./functions/network-analysis/routes');
var { getInstance } = require('./functions/graph-service/index');
var gs = getInstance();
var nodes = gs._cache.getNodes();
var personId = (nodes && nodes.length > 0) ? nodes[0].person_id : 'PM_000001';
var result = route({ url: '/person/' + personId, method: 'GET' });
console.log(result.statusCode === 200 ? 'OK' : 'STATUS:' + result.statusCode);
" 2>&1)

if echo "$PERSON_ROUTE_RESULT" | grep -q "^OK$"; then
  pass "GET /person/:id returns 200"
else
  fail "Person route" "$PERSON_ROUTE_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [D.4] Non-existent person returns 404..."
NOTFOUND_RESULT=$(node -e "
var { route } = require('./functions/network-analysis/routes');
var result = route({ url: '/person/PM_999999', method: 'GET' });
console.log(result.statusCode === 404 ? 'OK' : 'STATUS:' + result.statusCode);
" 2>&1)

if echo "$NOTFOUND_RESULT" | grep -q "^OK$"; then
  pass "Non-existent person returns 404"
else
  fail "404 handling" "$NOTFOUND_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [D.5] Invalid format returns 400..."
BAD_FORMAT_RESULT=$(node -e "
var { route } = require('./functions/network-analysis/routes');
var result = route({ url: '/person/abc', method: 'GET' });
console.log(result.statusCode === 400 ? 'OK' : 'STATUS:' + result.statusCode);
" 2>&1)

if echo "$BAD_FORMAT_RESULT" | grep -q "^OK$"; then
  pass "Invalid personId format returns 400"
else
  fail "400 handling" "$BAD_FORMAT_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [D.6] Validation — max_hops limit..."
HOPS_VAL_RESULT=$(node -e "
var v = require('./functions/network-analysis/validators');
var e1 = v.validateMaxHops('5');
var e2 = v.validateMaxHops('3');
var e3 = v.validateMaxHops('1');
console.log(e1.length > 0 && e2.length === 0 && e3.length === 0 ? 'OK' : 'FAIL');
" 2>&1)

if echo "$HOPS_VAL_RESULT" | grep -q "^OK$"; then
  pass "max_hops validation (5=invalid, 3=valid, 1=valid)"
else
  fail "max_hops validation" "$HOPS_VAL_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [D.7] Validation — edge type filter..."
ET_VAL_RESULT=$(node -e "
var v = require('./functions/network-analysis/validators');
var e1 = v.validateEdgeTypeFilter('INVALID');
var e2 = v.validateEdgeTypeFilter('CO_ACCUSED');
var e3 = v.validateEdgeTypeFilter('CO_ACCUSED,ACCUSED_TO_VICTIM');
console.log(e1.length > 0 && e2.length === 0 && e3.length === 0 ? 'OK' : 'FAIL');
" 2>&1)

if echo "$ET_VAL_RESULT" | grep -q "^OK$"; then
  pass "Edge type filter validation (INVALID=error, valid=ok)"
else
  fail "Edge type filter validation" "$ET_VAL_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [D.8] Validation — include_unconfirmed..."
IU_VAL_RESULT=$(node -e "
var v = require('./functions/network-analysis/validators');
var e1 = v.validateIncludeUnconfirmed('true');
var e2 = v.validateIncludeUnconfirmed('notabool');
var e3 = v.validateIncludeUnconfirmed(null);
console.log(e1.length === 0 && e2.length > 0 && e3.length === 0 ? 'OK' : 'FAIL');
" 2>&1)

if echo "$IU_VAL_RESULT" | grep -q "^OK$"; then
  pass "include_unconfirmed validation"
else
  fail "include_unconfirmed validation" "$IU_VAL_RESULT"
fi

# ── E. GRAPH VISUALIZATION EXPORT ────────────────────────────────────────
print_header "E" "5" "Graph Visualization Export"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [E.1] Running graph visualization test suite..."
GV_RESULT=$(node functions/graph-visualization/test-graph-export.js 2>&1)
GV_EXIT=$?

if echo "$GV_RESULT" | grep -q "0 failed"; then
  GV_PASS=$(echo "$GV_RESULT" | grep -oP '\d+(?= passed)' || echo "0")
  pass "Graph export tests: $GV_PASS passed"
else
  echo "$GV_RESULT" | tail -5
  fail "Graph export tests" "Some tests failed (exit code $GV_EXIT)"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [E.2] Cytoscape format..."
CYTO_RESULT=$(node -e "
var { getInstance } = require('./functions/graph-service/index');
var { GraphExportService } = require('./functions/graph-visualization/graphExportService');
var gs = getInstance();
var svc = new GraphExportService();
var nodes = gs._cache.getNodes();
if (nodes.length === 0) { console.log('NO_NODES'); process.exit(0); }
var result = svc.toCytoscape(nodes[0].person_id, { max_hops: 1 });
var hasElements = result && result.elements && typeof result.elements === 'object';
var hasNodes = hasElements && Array.isArray(result.elements.nodes);
var hasEdges = hasElements && Array.isArray(result.elements.edges);
var hasNodesContent = hasNodes && (result.elements.nodes.length === 0 || result.elements.nodes[0].data.id);
console.log(hasNodes && hasEdges ? 'OK' : 'FAIL');
" 2>&1)

if echo "$CYTO_RESULT" | grep -q "^OK$"; then
  pass "Cytoscape export produces valid elements"
else
  [ "$CYTO_RESULT" = "NO_NODES" ] && skip "Cytoscape export (no nodes)" || fail "Cytoscape export" "$CYTO_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [E.3] Compact format..."
COMPACT_RESULT=$(node -e "
var { getInstance } = require('./functions/graph-service/index');
var { GraphExportService } = require('./functions/graph-visualization/graphExportService');
var gs = getInstance();
var svc = new GraphExportService();
var nodes = gs._cache.getNodes();
if (nodes.length === 0) { console.log('NO_NODES'); process.exit(0); }
var result = svc.toCompact(nodes[0].person_id, { max_hops: 1 });
var valid = result && Array.isArray(result.nodes) && Array.isArray(result.edges) && result.stats;
var hasShortFields = result.nodes.length === 0 || (result.nodes[0].id !== undefined && result.nodes[0].hop !== undefined);
console.log(valid && hasShortFields ? 'OK' : 'FAIL');
" 2>&1)

if echo "$COMPACT_RESULT" | grep -q "^OK$"; then
  pass "Compact export produces short-field format"
else
  [ "$COMPACT_RESULT" = "NO_NODES" ] && skip "Compact export (no nodes)" || fail "Compact export" "$COMPACT_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [E.4] Debug format..."
DEBUG_RESULT=$(node -e "
var { getInstance } = require('./functions/graph-service/index');
var { GraphExportService } = require('./functions/graph-visualization/graphExportService');
var gs = getInstance();
var svc = new GraphExportService();
var nodes = gs._cache.getNodes();
if (nodes.length === 0) { console.log('NO_NODES'); process.exit(0); }
var result = svc.toDebug(nodes[0].person_id, { max_hops: 1 });
var valid = result && result.validation && result.graph && result.degreeDistribution;
console.log(valid ? 'OK' : 'FAIL');
" 2>&1)

if echo "$DEBUG_RESULT" | grep -q "^OK$"; then
  pass "Debug export produces validation metadata"
else
  [ "$DEBUG_RESULT" = "NO_NODES" ] && skip "Debug export (no nodes)" || fail "Debug export" "$DEBUG_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [E.5] Missing person error..."
MISSING_EXPORT=$(node -e "
var { getInstance } = require('./functions/graph-service/index');
var { GraphExportService } = require('./functions/graph-visualization/graphExportService');
var gs = getInstance();
var svc = new GraphExportService();
var r1 = svc.toCytoscape('PM_999999', {});
var r2 = svc.toCompact('PM_999999', {});
var r3 = svc.toDebug('PM_999999', {});
console.log(r1.error && r2.error && r3.error ? 'OK' : 'FAIL');
" 2>&1)

if echo "$MISSING_EXPORT" | grep -q "^OK$"; then
  pass "Missing person returns error for all formats"
else
  fail "Missing person error handling" "$MISSING_EXPORT"
fi

# ── F. FULL REBUILD PIPELINE ─────────────────────────────────────────────
print_header "F" "4" "Full Rebuild Pipeline (Dry Run)"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [F.1] Running simulate-cron.js --dry-run..."
DRY_RUN_RESULT=$(node functions/sync-full/simulate-cron.js --dry-run 2>&1)
DRY_EXIT=$?

if [ "$DRY_EXIT" -eq 0 ]; then
  pass "Pipeline dry-run completed (exit 0)"
else
  fail "Pipeline dry-run" "Exit code $DRY_EXIT — see output below:"
  echo "$DRY_RUN_RESULT" | tail -10
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [F.2] Checking all stages completed..."
STAGES=("Load CaseMaster" "Load Person Records" "Candidate Matching" "Cluster Builder" "Document Builder" "Edge Builder" "Pipeline Validation")
ALL_PASS=true
for stage in "${STAGES[@]}"; do
  if ! echo "$DRY_RUN_RESULT" | grep -q "\[$stage\]"; then
    ALL_PASS=false
    echo "        Missing stage: [$stage]"
  fi
done
if $ALL_PASS; then
  pass "All 7 stages present in pipeline output"
else
  fail "Pipeline stages" "Some stages missing"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [F.3] Checking validation PASS..."
if echo "$DRY_RUN_RESULT" | grep -q "Validation: PASS" && echo "$DRY_RUN_RESULT" | grep -q "No duplicate person_ids: PASS" && echo "$DRY_RUN_RESULT" | grep -q "No orphan edges:.*PASS"; then
  pass "Pipeline validation shows PASS"
else
  fail "Pipeline validation" "One or more validation checks failed — see output:"
  echo "$DRY_RUN_RESULT" | grep -E "(Validation|No duplicate|No orphan)"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [F.4] Checking stage timings..."
if echo "$DRY_RUN_RESULT" | grep -q "Stage timings:"; then
  pass "Stage timings reported"
else
  fail "Stage timings" "Not found in pipeline output"
fi

# ── G. INCREMENTAL SYNC ──────────────────────────────────────────────────
print_header "G" "4" "Incremental Sync (Simulated)"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [G.1] Synthetic mode — new PersonMaster..."
SYNC_RESULT=$(node functions/sync-incremental/simulate-signal.js synthetic 2>&1)
SYNC_EXIT=$?

if [ "$SYNC_EXIT" -eq 0 ]; then
  if echo "$SYNC_RESULT" | grep -q "NEW PERSON CREATED"; then
    pass "Synthetic signal: NEW PERSON CREATED"
  elif echo "$SYNC_RESULT" | grep -q "MATCHED"; then
    pass "Synthetic signal: MATCHED (to existing PM)"
  else
    fail "Synthetic signal" "Unexpected result: $(echo "$SYNC_RESULT" | tail -3)"
  fi
else
  fail "Synthetic signal" "Exit code $SYNC_EXIT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [G.2] Existing record mode — match to existing PM..."
SYNC_EXISTING=$(node functions/sync-incremental/simulate-signal.js existing 0 2>&1)
SYNC_EXIT2=$?

if [ "$SYNC_EXIT2" -eq 0 ]; then
  if echo "$SYNC_EXISTING" | grep -q "MATCHED"; then
    pass "Existing signal: MATCHED to existing PersonMaster"
  elif echo "$SYNC_EXISTING" | grep -q "NEW PERSON CREATED"; then
    pass "Existing signal: NEW PERSON CREATED"
  else
    fail "Existing signal" "Unexpected: $(echo "$SYNC_EXISTING" | tail -3)"
  fi
else
  fail "Existing signal" "Exit code $SYNC_EXIT2 — $(echo "$SYNC_EXISTING" | tail -3)"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [G.3] Verifying edges recomputed..."
if echo "$SYNC_RESULT" | grep -q "Edges before:" && echo "$SYNC_RESULT" | grep -q "Edges after:"; then
  pass "Edge recomputation reported"
else
  fail "Edge recomputation" "Not found in synthetic output"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [G.4] Validating result structure..."
if echo "$SYNC_RESULT" | grep -q "PersonMaster ID:"; then
  pass "Result includes PersonMaster ID"
else
  fail "Result structure" "Missing PersonMaster ID in output"
fi

# ── H. DATA CONSISTENCY ──────────────────────────────────────────────────
print_header "H" "5" "Data Consistency (Cross-Validation)"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [H.1] Counting source records in CSV files..."
CSV_COUNTS=$(node -e "
function parse(l) { var r=[],c='',q=false; for(var i=0;i<l.length;i++){var ch=l[i];if(ch==='\"'){if(q&&i+1<l.length&&l[i+1]==='\"'){c+='\"';i++;}else{q=!q;}}else if(ch===','&&!q){r.push(c.trim());c='';}else{c+=ch;}}r.push(c.trim());return r;}
function countCSV(p) { var lines=require('fs').readFileSync(p,'utf8').split(/\r?\n/).filter(function(l){return l.trim().length>0;}); return lines.length-1; }
var a=countCSV('data_pipeline/data/Accused.csv');
var v=countCSV('data_pipeline/data/Victim.csv');
var c=countCSV('data_pipeline/data/ComplainantDetails.csv');
console.log(a + ',' + v + ',' + c);
" 2>&1)

if echo "$CSV_COUNTS" | grep -qE '^[0-9]+,[0-9]+,[0-9]+$'; then
  CSV_A=$(echo "$CSV_COUNTS" | cut -d, -f1)
  CSV_V=$(echo "$CSV_COUNTS" | cut -d, -f2)
  CSV_C=$(echo "$CSV_COUNTS" | cut -d, -f3)
  CSV_TOTAL=$((CSV_A + CSV_V + CSV_C))
  pass "CSV records: Accused=$CSV_A, Victim=$CSV_V, Complainant=$CSV_C, Total=$CSV_TOTAL"
else
  fail "CSV parsing" "Unexpected output: $CSV_COUNTS"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [H.2] Verifying source records in clusters vs documents..."
CONSISTENCY_RESULT=$(node -e "
var clusters = JSON.parse(require('fs').readFileSync('$PM_OUTPUT_DIR/person_clusters.json', 'utf8'));
var docs = JSON.parse(require('fs').readFileSync('$PM_OUTPUT_DIR/personmaster_documents.json', 'utf8'));
var cKeys = {}; clusters.forEach(function(c) { c.members.forEach(function(m) { cKeys[m.table + ':' + m.source_id] = true; }); });
var dKeys = {}; docs.forEach(function(d) { d.source_records.forEach(function(sr) { dKeys[sr.table + ':' + sr.source_id] = true; }); });
var onlyInClusters = Object.keys(cKeys).filter(function(k) { return !dKeys[k]; }).length;
var onlyInDocs = Object.keys(dKeys).filter(function(k) { return !cKeys[k]; }).length;
var totalC = Object.keys(cKeys).length;
var totalD = Object.keys(dKeys).length;
console.log(onlyInClusters === 0 && onlyInDocs === 0 ? 'OK:' + totalC + ',' + totalD : 'MISMATCH: clusters=' + totalC + ' docs=' + totalD + ' onlyInClusters=' + onlyInClusters + ' onlyInDocs=' + onlyInDocs);
" 2>&1)

if echo "$CONSISTENCY_RESULT" | grep -q "^OK:"; then
  pass "Source records consistent between clusters and documents"
else
  fail "Source record consistency" "$CONSISTENCY_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [H.3] Edge source/target all reference valid PMs..."
EDGE_PM_RESULT=$(node -e "
var edges = JSON.parse(require('fs').readFileSync('$PM_OUTPUT_DIR/personmaster_edges.json', 'utf8')).edges;
var docs = JSON.parse(require('fs').readFileSync('$PM_OUTPUT_DIR/personmaster_documents.json', 'utf8'));
var pmIds = {}; docs.forEach(function(d) { pmIds[d.person_id] = true; });
var orphans = edges.filter(function(e) { return !pmIds[e.source] || !pmIds[e.target]; });
console.log(orphans.length === 0 ? 'OK' : 'ORPHANS:' + orphans.length);
" 2>&1)

if echo "$EDGE_PM_RESULT" | grep -q "^OK$"; then
  pass "All edge references valid PersonMaster IDs"
else
  fail "Orphan edges" "$EDGE_PM_RESULT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [H.4] Edge type validation..."
ET_CONSISTENCY=$(node -e "
var edges = JSON.parse(require('fs').readFileSync('$PM_OUTPUT_DIR/personmaster_edges.json', 'utf8')).edges;
var validTypes = ['CO_ACCUSED', 'ACCUSED_TO_VICTIM', 'SHARED_LOCATION', 'UNCONFIRMED_MATCH'];
var invalid = edges.filter(function(e) { return validTypes.indexOf(e.edge_type) === -1; });
console.log(invalid.length === 0 ? 'OK' : 'INVALID:' + invalid.length);
" 2>&1)

if echo "$ET_CONSISTENCY" | grep -q "^OK$"; then
  pass "All edge types from expected set"
else
  fail "Edge type validation" "$ET_CONSISTENCY"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [H.5] Checking ground truth data..."
if [ -f "data_pipeline/data/ground_truth_identities.csv" ]; then
  GT_COUNT=$(node -e "
var lines=require('fs').readFileSync('data_pipeline/data/ground_truth_identities.csv','utf8').split(/\r?\n/).filter(function(l){return l.trim().length>0;});
console.log(lines.length-1);
" 2>&1)
  pass "Ground truth file exists ($GT_COUNT records)"
else
  skip "Ground truth file not available"
fi

# ── I. END-TO-END WORKFLOW ───────────────────────────────────────────────
print_header "I" "1" "End-to-End Workflow"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [I.1] Full chain: CSV → Resolution → Graph → BFS → Export..."
E2E_RESULT=$(node -e "
var t0 = Date.now();
var normaliser = require('./functions/entity-matching-engine/normaliser');
var phonetic = require('./functions/entity-matching-engine/phonetic');
var scorer = require('./functions/entity-matching-engine/scorer');
var threshold = require('./functions/entity-matching-engine/threshold');
var clusterBuilder = require('./functions/personmaster-builder/clusterBuilder');
var documentBuilder = require('./functions/personmaster-builder/documentBuilder');
var edgeBuilder = require('./functions/personmaster-builder/edgeBuilder');

function parse(l){var r=[],c='',q=false;for(var i=0;i<l.length;i++){var ch=l[i];if(ch==='\"'){if(q&&i+1<l.length&&l[i+1]==='\"'){c+='\"';i++;}else{q=!q;}}else if(ch===','&&!q){r.push(c.trim());c='';}else{c+=ch;}}r.push(c.trim());return r;}
function loadCSV(p){var raw=require('fs').readFileSync(p,'utf8');var lines=raw.split(/\r?\n/).filter(function(l){return l.trim().length>0;});if(lines.length<2)return[];var h=parse(lines[0]);var rows=[];for(var i=1;i<lines.length;i++){var v=parse(lines[i]);var r={};for(var j=0;j<h.length;j++)r[h[j]]=v[j]||'';rows.push(r);}return rows;}
function genderToChar(g){var s=String(g||'').trim();if(s==='1'||s==='M'||s==='MALE')return'M';if(s==='2'||s==='F'||s==='FEMALE')return'F';return null;}

var cmRows = loadCSV('data_pipeline/data/CaseMaster.csv');
var cmLookup = {}; cmRows.forEach(function(r){var id=String(r.CaseMasterID||'').trim();if(id)cmLookup[id]=r;});

var records = [];
loadCSV('data_pipeline/data/Accused.csv').forEach(function(r){records.push({source_table:'Accused',source_id:'A-'+r.AccusedMasterID,name:r.AccusedName||'',age:parseInt(r.AgeYear,10)||null,gender:genderToChar(r.GenderID),lat:null,lon:null,unit_id:null,district_id:null,caseMasterID:r.CaseMasterID});});
loadCSV('data_pipeline/data/Victim.csv').forEach(function(r){records.push({source_table:'Victim',source_id:'V-'+r.VictimMasterID,name:r.VictimName||'',age:parseInt(r.AgeYear,10)||null,gender:genderToChar(r.GenderID),lat:null,lon:null,unit_id:null,district_id:null,caseMasterID:r.CaseMasterID});});
loadCSV('data_pipeline/data/ComplainantDetails.csv').forEach(function(r){records.push({source_table:'ComplainantDetails',source_id:'C-'+r.ComplainantID,name:r.ComplainantName||'',age:parseInt(r.AgeYear,10)||null,gender:genderToChar(r.GenderID),lat:null,lon:null,unit_id:null,district_id:null,caseMasterID:r.CaseMasterID});});

records.forEach(function(r){r.normalised_name=normaliser.normaliseName(r.name);r.phonetic_key=phonetic.generatePhoneticKey(r.normalised_name);});
var buckets = {}; records.forEach(function(r){if(r.phonetic_key){if(!buckets[r.phonetic_key])buckets[r.phonetic_key]=[];buckets[r.phonetic_key].push(r);}});

var allMatches = [];
for(var bk in buckets){var g=buckets[bk];if(g.length<2)continue;for(var i=0;i<g.length;i++){for(var j=i+1;j<g.length;j++){var a=g[i],b=g[j];if(a.source_id===b.source_id&&a.source_table===b.source_table)continue;var s=scorer.computeScore(a,b);var c=threshold.classify(s.confidence);if(c.label==='DISCARD')continue;allMatches.push({recordA:{source_id:a.source_id,source_table:a.source_table,caseMasterID:a.caseMasterID,name:a.name,normalised_name:a.normalised_name,phonetic_key:a.phonetic_key,age:a.age,gender:a.gender},recordB:{source_id:b.source_id,source_table:b.source_table,caseMasterID:b.caseMasterID,name:b.name,normalised_name:b.normalised_name,phonetic_key:b.phonetic_key,age:b.age,gender:b.gender},confidence:s.confidence,classification:c.label,score_breakdown:s.score_breakdown});}}}

function getClassification(m){var c=m.classification;if(typeof c==='object'&&c!==null)return c.label;return c;}
var confirmed = allMatches.filter(function(m){return getClassification(m)==='CONFIRMED';});
var rawClusters = clusterBuilder.buildClusters(confirmed);
var clusters = rawClusters.map(function(m,i){return{person_id:'PM_'+String(i+1).padStart(6,'0'),members:m};});

var sourceData = documentBuilder.loadSourceData();
var documents = documentBuilder.buildAllDocuments(clusters, sourceData, confirmed);
documentBuilder.validateAllDocuments(documents);

var srToPm = {};
documents.forEach(function(d){d.source_records.forEach(function(sr){srToPm[sr.table+':'+sr.source_id]=d.person_id;});});
var edges = edgeBuilder.buildEdges(documents, allMatches, srToPm);

var pmIds = {}; documents.forEach(function(d){pmIds[d.person_id]=true;});
var orphans = edges.filter(function(e){return !pmIds[e.source]||!pmIds[e.target];});
var elapsed = ((Date.now()-t0)/1000).toFixed(2);

console.log('OK:' + elapsed + 's|records=' + records.length + '|clusters=' + clusters.length + '|pms=' + documents.length + '|edges=' + edges.length + '|orphans=' + orphans.length);
" 2>&1)

if echo "$E2E_RESULT" | grep -q "^OK:"; then
  E2E_DATA=$(echo "$E2E_RESULT" | sed 's/^OK://')
  pass "End-to-end workflow: $E2E_DATA"
else
  fail "End-to-end workflow" "$E2E_RESULT"
fi

# ── J. ERROR HANDLING ────────────────────────────────────────────────────
print_header "J" "7" "Error Handling"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [J.1] Empty/null personId validation..."
VALIDATE_EMPTY=$(node -e "
var v = require('./functions/network-analysis/validators');
var e1 = v.validatePersonId('');
var e2 = v.validatePersonId(null);
console.log(e1.length > 0 && e2.length > 0 ? 'OK' : 'FAIL');
" 2>&1)

if echo "$VALIDATE_EMPTY" | grep -q "^OK$"; then
  pass "Empty/null personId rejected"
else
  fail "Empty/null validation" "$VALIDATE_EMPTY"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [J.2] Invalid personId format..."
VALIDATE_FORMAT=$(node -e "
var v = require('./functions/network-analysis/validators');
var e1 = v.validatePersonId('pm_000001');
var e2 = v.validatePersonId('000001');
var e3 = v.validatePersonId('PM_001');
console.log(e1.length > 0 && e2.length > 0 && e3.length > 0 ? 'OK' : 'FAIL');
" 2>&1)

if echo "$VALIDATE_FORMAT" | grep -q "^OK$"; then
  pass "Invalid personId format rejected"
else
  fail "Format validation" "$VALIDATE_FORMAT"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [J.3] max_hops exceeding limit..."
HOPS_ERROR=$(node -e "
var v = require('./functions/network-analysis/validators');
var e1 = v.validateMaxHops(5);
var e2 = v.validateMaxHops(0);
var e3 = v.validateMaxHops(3);
console.log(e1.length > 0 && e2.length > 0 && e3.length === 0 ? 'OK' : 'FAIL');
" 2>&1)

if echo "$HOPS_ERROR" | grep -q "^OK$"; then
  pass "max_hops limits enforced (5=error, 0=error, 3=ok)"
else
  fail "max_hops limit" "$HOPS_ERROR"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [J.4] Invalid edge types..."
ET_ERROR=$(node -e "
var v = require('./functions/network-analysis/validators');
var e1 = v.validateEdgeTypeFilter('INVALID');
var e2 = v.validateEdgeTypeFilter('CO_ACCUSED,INVALID');
console.log(e1.length > 0 && e2.length > 0 ? 'OK' : 'FAIL');
" 2>&1)

if echo "$ET_ERROR" | grep -q "^OK$"; then
  pass "Invalid edge types in filter rejected"
else
  fail "Edge type error handling" "$ET_ERROR"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [J.5] Missing data file handling..."
MISSING_FILE=$(node -e "
var fs = require('fs');
var path = require('path');
var docsFile = path.join('$PM_OUTPUT_DIR', 'personmaster_documents.json');
var edgesFile = path.join('$PM_OUTPUT_DIR', 'personmaster_edges.json');
console.log(fs.existsSync(docsFile) && fs.existsSync(edgesFile) ? 'OK' : 'MISSING');
" 2>&1)

if echo "$MISSING_FILE" | grep -q "^OK$"; then
  pass "Required output files exist"
else
  fail "Missing data files" "$MISSING_FILE"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [J.6] BFS non-existent person..."
BFS_ERROR=$(node -e "
var { getInstance } = require('./functions/graph-service/index');
var { bfsTraverse } = require('./functions/graph-traversal/bfs');
var gs = getInstance();
var r1 = bfsTraverse(gs, 'PM_999999', { max_hops: 2 });
var r2 = bfsTraverse(gs, '', { max_hops: 2 });
console.log(r1.error && r2.error ? 'OK' : 'FAIL');
" 2>&1)

if echo "$BFS_ERROR" | grep -q "^OK$"; then
  pass "BFS returns error for non-existent/empty personId"
else
  fail "BFS error handling" "$BFS_ERROR"
fi

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo "  [J.7] Graph service returns null for missing person..."
GS_NULL=$(node -e "
var { getInstance } = require('./functions/graph-service/index');
var gs = getInstance();
console.log(gs.getPerson('PM_999999') === null && gs.personExists('PM_999999') === false ? 'OK' : 'FAIL');
" 2>&1)

if echo "$GS_NULL" | grep -q "^OK$"; then
  pass "Graph service returns null/false for missing person"
else
  fail "Graph service missing person" "$GS_NULL"
fi

# ── K. [LIVE] Catalyst Endpoints ─────────────────────────────────────────
print_header "K" "1" "[LIVE ONLY] Catalyst REST Endpoints"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
if [ "$SKIP_LIVE" = true ]; then
  skip "Live tests skipped (--skip-live flag)"
else
  echo "  These tests require an active Catalyst deployment."
  echo "  Run manually with your deployment URL:"
  echo ""
  echo "    curl https://<deployment>/server/test/"
  echo "    curl -X POST -H 'Content-Type: application/json' -d '{\"query\":\"test\",\"employee_id\":1}' https://<deployment>/server/pipeline/query"
  echo ""
  skip "Live tests (manual)"
fi

# ── SUMMARY ───────────────────────────────────────────────────────────────
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    TEST SUMMARY                             ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf "║  Total tests:  %-43d ║\n" $TOTAL_TESTS
printf "║  ${GREEN}PASSED${NC}       %-43s ║\n" "$PASS_COUNT"
printf "║  ${RED}FAILED${NC}       %-43s ║\n" "$FAIL_COUNT"
printf "║  ${YELLOW}SKIPPED${NC}      %-43s ║\n" "$SKIP_COUNT"
printf "║  Time elapsed: %-43s ║\n" "${ELAPSED}s"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo -e "  ${RED}Some tests FAILED.${NC}"
  exit 1
else
  echo -e "  ${GREEN}All $PASS_COUNT tests passed.${NC}"
  exit 0
fi
