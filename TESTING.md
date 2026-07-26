# Testing — KSP Crime Analytics Platform

## Test Philosophy

Each module is tested independently using simple Node.js assertion-based
test harnesses (no external test framework). Tests are run via `node test.js`
and follow a consistent pattern of **name, function, assertion**:

```javascript
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS: ' + name); }
  catch (e) { failed++; console.log('  FAIL: ' + name); }
}
```

## Test Suites

| Suite | File | Tests | Coverage |
|-------|------|-------|----------|
| Entity Matching Engine | `test.js` | 73+ | Normaliser, phonetic, scorer, threshold, integration |
| Entity Matching Threshold | `test-threshold.js` | 15 pairs | Threshold calibration metrics |
| Graph Service | `test-graph-service.js` | 57+ | Repository, cache, service, statistics, validation |
| BFS Traversal | `test_traversal.js` | 73+ | Validation, traversal (depth 1/2/3), edge filter, cycles |
| Network Analysis | `test-network-analysis.js` | 93+ | Validator, formatter, service, routes, handler |
| Graph Visualization | `test-graph-export.js` | 52+ | Style hints, formatter, export service, routes |
| Sync-Incremental Change Detection | `test_change_detection.js` | 84+ | Source parsing, identity indexing, orphan detection, diagnostics |
| Sync-Incremental Integrity | `test.js` | 53+ | Exports, API shape, health check |
| Pipeline Integration | `test/test.js` | 69+ | Intent routing, SQL generation, handler flows |
| Sync-Full Reconciler | `test_full_reconciler.js` | Flow | Full reconciliation pipeline |
| Sync-Full-Job Lifecycle | `test_job_lifecycle.js` | 3+ | Job state machine |
| Frontend | `client/src/__tests__/` (28 files) | 178+ | All UI views, contexts, hooks |

**Total:** ~700+ unit tests + 2,600+ frontend tests = **3,300+ tests** across 20+ test files.

## Running Tests

### Entity Matching Engine

```bash
node functions/entity-matching-engine/test.js
```

Tests must be run from the `entity-matching-engine` directory because test
data is loaded relative to the current working directory.

```bash
cd functions/entity-matching-engine
node test.js
```

### Graph Service

```bash
node functions/graph-service/test-graph-service.js
```

Requires `personmaster-builder/output/personmaster_documents.json` and
`personmaster_edges.json` to exist. If not found, the test exits with
`SKIP: graph data not found`.

### BFS Traversal

```bash
node functions/graph-traversal/test-bfs.js
```

Requires graph data (depends on graph-service having loaded data).

### Network Analysis

```bash
node functions/network-analysis/test-network-analysis.js
```

### Graph Visualization

```bash
node functions/graph-visualization/test-graph-export.js
```

---

## Entity Matching Engine Tests (73+ tests)

**File:** `functions/entity-matching-engine/test.js` (462 lines)

### Normaliser Tests

| Test | Description |
|------|-------------|
| `normaliseName handles empty string` | Returns empty string |
| `normaliseName handles null/undefined` | Returns empty string |
| `normaliseName strips salutations` | "Shri Ramesh" → "ramesh" |
| `normaliseName strips suffixes` | "Ramesh Kumar" → "ramesh kumar" |
| `normaliseName preserves non-suffix last token` | "Ramesh Gowda" → "ramesh gowda" |
| `normaliseName handles Kannada text` | Transliterates to Latin |
| `normaliseName handles Devanagari text` | Transliterates to Latin |
| `normaliseName lowercases` | "RAMESH" → "ramesh" |
| `normaliseName strips punctuation` | "Ram,esh" → "ramesh" |
| `normaliseName normalizes whitespace` | "Ramesh  Kumar" → "ramesh kumar" |

### Phonetic Tests

| Test | Description |
|------|-------------|
| `soundexToken basic` | "Ramesh" → "R520" |
| `soundexToken single letter` | "A" → "A000" |
| `soundexToken with vowels` | Vowels ignored after first char |
| `soundex handles empty` | Returns "" |
| `indianMetaphoneToken basic` | "Ramesh" → "RMX" |
| `indianMetaphoneToken handles digraphs` | SH→X, TH→T, PH→F |
| `indianMetaphoneToken handles compound` | Multiple consonants |
| `generatePhoneticKey combined` | Returns "S530 XK" format |

### Scorer Tests

| Test | Description |
|------|-------------|
| `jaroWinkler identical strings` | Returns 1.0 |
| `jaroWinkler completely different` | Returns ~0.0 |
| `jaroWinkler prefix boost` | Matches "Ram" vs "Ramesh" gets boost |
| `jaroWinkler transpositions` | "AB" vs "BA" penalized |
| `tokenSortRatio same tokens different order` | Handles reordering |
| `computeAgeScore exact match` | Returns 1.0 |
| `computeAgeScore within tolerance` | Returns 0.9/0.7 |
| `computeAgeScore beyond hard tolerance` | Returns 0.0 |
| `computeAgeScore null values` | Returns 0.5 |
| `computeGenderScore match` | Returns 1.0 |
| `computeGenderScore mismatch` | Returns 0.0 |
| `computeGenderScore unknown` | Returns 0.5 |
| `computeLocationScore same unit` | Returns 1.0 |
| `computeLocationScore same district` | Returns 0.6 |
| `computeLocationScore close proximity` | Returns 0.8 |
| `computeLocationScore no data` | Returns 0.0 |

### Threshold Tests

| Test | Description |
|------|-------------|
| `classify above THRESHOLD` | Returns CONFIRMED |
| `classify above CANDIDATE_MIN` | Returns UNCONFIRMED |
| `classify below CANDIDATE_MIN` | Returns DISCARD |
| `classify NaN/undefined` | Returns DISCARD |

### Integration Tests

| Test | Description |
|------|-------------|
| `match identical persons` | Returns high confidence, CONFIRMED |
| `match different persons` | Returns low confidence, DISCARD |
| `match handles missing fields` | Graceful degradation |
| `matchCandidates returns sorted by score` | Descending confidence |
| `matchCandidates handles empty array` | Returns empty array |

---

## Graph Service Tests (40+ tests)

**File:** `functions/graph-service/test-graph-service.js` (415 lines)

### Categories

- **Repository tests** — Loading documents, edges into cache
- **Cache tests** — Node index, edge index, degree index
- **Service tests** — `getPerson`, `getNeighbours`, `getEdges`, `getDegree`
- **Statistics tests** — `computeStats`, node/edge counts, density
- **Validation tests** — Data integrity checks
- **Singleton tests** — `getInstance`, `resetInstance`

---

## BFS Traversal Tests (43+ tests)

**File:** `functions/graph-traversal/test-bfs.js` (424 lines)

### Categories

- **Validation tests** — `validateInput`: graph service, person ID, max_hops
  range; `validateOutput`: result structure
- **Traversal depth 1** — Direct neighbours
- **Traversal depth 2** — Neighbours of neighbours
- **Traversal depth 3** — Max depth
- **Edge filter tests** — CO_ACCUSED only, ACCUSED_TO_VICTIM only,
  SHARED_LOCATION only, multi-type filters
- **Unconfirmed exclusion tests** — UNCONFIRMED_MATCH excluded by default,
  included when `include_unconfirmed=true`
- **Cycle safety tests** — Graph with cycles does not cause infinite loop
- **Path finding tests** — `buildParentMap`, `reconstructPath`,
  `findAllPathsBetween` using DFS

---

## Network Analysis Tests (64+ tests)

**File:** `functions/network-analysis/test-network-analysis.js` (478 lines)

### Categories

- **Validator tests** — `validatePersonId`, `validateMaxHops`,
  `validateIncludeUnconfirmed`, `validateEdgeTypeFilter`, `parseMaxHops`,
  `parseIncludeUnconfirmed`, `parseEdgeTypeFilter`
- **Response formatter tests** — `success`, `validationError`, `notFound`,
  error codes
- **Service tests** — `getPerson`, `getKnownAssociates`,
  `getCoAccusedNetwork`, `getVictimRelationships`, `getNetworkSummary`
- **Route tests** — `parsePath`, `matchRoute`, route matching for all
  5 endpoints, query parameter extraction
- **Handler tests** — Person found, person not found, invalid person ID,
  route not found, exception handling

---

## Graph Visualization Tests (45+ tests)

**File:** `functions/graph-visualization/test-graph-export.js` (463 lines)

### Categories

- **Style hint tests** — `getNodeStyle` for accused/victim/complainant/mixed/
  default, `getPrimaryRole`, `getEdgeStyle` for all 4 types
- **Formatter tests** — `formatNodes`, `formatEdges`, `toCytoscape`
  element structure, data fields, style assignment
- **Export service tests** — `GraphExportService.toCytoscape`,
  `.toCompact`, `.toDebug`, person not found, BFS traversal integration
- **Route tests** — `parsePath`, `matchRoute`, all valid routes, invalid
  routes, format parameter validation, query parameter extraction
- **Handler tests** — Success, person not found, invalid format, exception
  handling

---

## Missing Test Coverage

The following modules do not have dedicated test files:

| Module | Files | Notes |
|--------|-------|-------|
| `personmaster-builder/` | clusterBuilder, documentBuilder, edgeBuilder | Has simulation scripts |
| `personmaster-writer/` | writer, batch, validator | Has simulation scripts |
| `sync-full/` | pipeline, cronHandler | Has `simulate-cron.js` |
| `sync-incremental/` | signalHandler, candidateLoader, etc. | Has `simulate-signal.js` |
| `pipeline/` | index.js (34,817 chars) | Integration-level only |
| `classifier/` | index.js | Manual Postman tests |
| `nl_sql/` | index.js | Manual Postman tests |
| `rag/` | index.js | Manual Postman tests |
| `session/` | index.js | Manual Postman tests |
| `query_exec/` | index.js | Manual Postman tests |

## Integration Testing

See [API.md](API.md) for full endpoint documentation and example requests.

### Smoke Tests (PowerShell)

```powershell
# Pipeline — aggregation
Invoke-RestMethod -Method POST `
  -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" `
  -ContentType "application/json" `
  -Body '{"query":"count of cases in Bengaluru Urban","employee_id":1}'

# Pipeline — list with JOINs
Invoke-RestMethod -Method POST `
  -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" `
  -ContentType "application/json" `
  -Body '{"query":"list FIRs for theft in Bengaluru Urban","employee_id":1}'

# RAG — narrative
Invoke-RestMethod -Method POST `
  -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/rag/query" `
  -ContentType "application/json" `
  -Body '{"query":"tell me about theft in Bengaluru"}'

# Health check
Invoke-RestMethod -Method GET `
  -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/test/"

# Sync-Incremental — change detection with identity diagnostics
Invoke-RestMethod -Method POST `
  -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/sync-incremental/detect" `
  -ContentType "application/json" `
  -Body '{}'
# Response includes: identity_diagnostics.duplicate_ownership (unique_keys, cross_person_keys,
# ownership_distribution), identity_diagnostics.current_side (total_references, unique_keys),
# identity_diagnostics.set_arithmetic (intersection, historical_minus_current, current_minus_historical)

# PersonMaster API — person search by name
Invoke-RestMethod -Method GET `
  -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/personmaster-api/personmaster/search?name=chandrika"

# PersonMaster API — repeat offenders
Invoke-RestMethod -Method GET `
  -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/personmaster-api/personmaster/repeat-offenders"

# PersonMaster API — network graph for a person
Invoke-RestMethod -Method GET `
  -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/personmaster-api/personmaster/PM_000001/network"
```

### Pipeline Test Scenarios

| Scenario | Query | Expected Intent |
|----------|-------|----------------|
| Aggregation | `count of cases in Bengaluru Urban` | structured |
| List with JOINs | `list FIRs for theft in Bengaluru Urban` | structured |
| Date filter | `show cases registered in Mysuru last month` | structured |
| Narrative | `describe what happened in HSR Layout theft cases` | narrative |
| Network | `show associates of Ravi` | network |
| Risk | `risk score of Ravi` | risk |
| Trends | `show crime trends in Bengaluru` | analytical |
| Missing employee_id | `count of cases` | error |
| Empty query | `""` | error |

## Validation Strategy

Entity matching is validated using ground truth data:

1. **`ground_truth_identities.csv`** produced during Phase 5 data generation
2. Contains `base_profile_id` mapping each source record to its true person
3. The matching pipeline is run against all records sharing a `base_profile_id`
4. Precision/Recall/F1 is computed against the threshold
5. Calibration scripts (`calibrate-threshold.cjs`, `calibrate-enhanced.cjs`)
   sweep thresholds to find optimal values
