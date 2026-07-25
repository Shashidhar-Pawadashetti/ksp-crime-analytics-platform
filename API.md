# REST API Reference — KSP Crime Analytics Platform

## Base URL

```
https://datathon2026-60073929329.development.catalystserverless.in/server
```

All requests require `Content-Type: application/json`. Catalyst handles
authentication at the gateway level (no bearer token needed for deployed
functions).

---

## Endpoints Summary

### Conversational AI (original 7 functions)

| Method | URL | Function | Description |
|--------|-----|----------|-------------|
| GET | `/test/` | test | Health check |
| POST | `/classifier/classify` | classifier | Classify query intent |
| POST | `/nl_sql/translate` | nl_sql | NL → ZCQL generation + execution |
| POST | `/rag/query` | rag | Narrative query via BriefFacts search |
| POST | `/pipeline/query` | pipeline | Full orchestrator (main entry point) |
| POST | `/session/create` | session | Create conversation session |
| POST | `/session/append` | session | Append a turn to a session |
| GET | `/session/` | session | Get session info |
| DELETE | `/session/{session_id}` | session | Delete a session |
| POST | `/query_exec/execute` | query_exec | Raw ZCQL execution with safety |

### PersonMaster API

| Method | URL | Function | Description |
|--------|-----|----------|-------------|
| GET | `/personmaster/` | personmaster-api | API info |
| GET | `/personmaster/search` | personmaster-api | Search PersonMaster by name, gender, age |
| GET | `/personmaster/repeat-offenders` | personmaster-api | List repeat offenders (accused_count >= 2) |
| GET | `/personmaster/:person_id` | personmaster-api | Get single PersonMaster document |
| GET | `/personmaster/:person_id/network` | personmaster-api | BFS graph traversal from a person |

### Network Analysis

| Method | URL | Function | Description |
|--------|-----|----------|-------------|
| GET | `/person/:personId` | network-analysis | Person profile |
| GET | `/person/:personId/associates` | network-analysis | Known associates (BFS) |
| GET | `/person/:personId/co-accused` | network-analysis | Co-accused network |
| GET | `/person/:personId/victims` | network-analysis | Victim relationships |
| GET | `/person/:personId/network-summary` | network-analysis | Aggregated network summary |
| POST | `/analyze` | network-analysis | Full network analysis (person + associates + co-accused + victims + summary) |
| GET | `/` | network-analysis | API home/info |

### Graph Visualization

| Method | URL | Function | Description |
|--------|-----|----------|-------------|
| GET | `/person/:personId/graph` | graph-visualization | Graph visualization export (Cytoscape.js) |
| POST | `/visualize` | graph-visualization | Accept graph structure, return Cytoscape-formatted JSON |
| GET | `/` | graph-visualization | API home/info |

### Graph Service (internal data layer)

| Method | URL | Function | Description |
|--------|-----|----------|-------------|
| GET | `/` | graph-service | Health check |
| GET | `/person/:personId` | graph-service | Get person details |
| GET | `/person/:personId/neighbours` | graph-service | Get neighbours of a person |
| GET | `/person/:personId/edges` | graph-service | Get edges for a person |
| GET | `/person/:personId/degree` | graph-service | Get degree (connection count) |
| GET | `/person/:personId/exists` | graph-service | Check if person exists in graph |
| GET | `/persons/by-role/:role` | graph-service | Get persons by role (accused/victim/complainant) |
| GET | `/edge/:edgeId` | graph-service | Get a specific edge by ID |
| GET | `/statistics` | graph-service | Get graph-wide statistics |
| GET | `/cache/info` | graph-service | Cache hit/miss/size info |
| POST | `/cache/reload` | graph-service | Reload entire cache from source |
| POST | `/cache/clear` | graph-service | Clear entire cache |

### Graph Traversal

| Method | URL | Function | Description |
|--------|-----|----------|-------------|
| POST | `/traverse` | graph-traversal | BFS traversal of crime graph from a root person |
| GET | `/` | graph-traversal | Health check |

### Full Reconciliation (sync-full)

| Method | URL | Function | Description |
|--------|-----|----------|-------------|
| POST | `/run` | sync-full | Trigger full reconciliation pipeline |
| GET | `/` | sync-full | Health check |

### Incremental Sync

| Method | URL | Function | Description |
|--------|-----|----------|-------------|
| POST | `/detect` | sync-incremental | Run change detection (checksum comparison) |
| POST | `/reconcile` | sync-incremental | Detect changes + run incremental resolution |
| GET | `/` | sync-incremental | Health check |

### PersonMaster Writer

| Method | URL | Function | Description |
|--------|-----|----------|-------------|
| POST | `/resolve` | personmaster-writer | Run full resolution pipeline (legacy) |
| POST | `/groups` | personmaster-writer | Accept pre-matched groups, persist as PersonMaster docs |
| GET | `/` | personmaster-writer | Health check |
| GET | `/diagnose` | personmaster-writer | Run ZCQL connectivity diagnostics (12 tests) |

### Entity Matching Engine (standalone)

| Method | URL | Function | Description |
|--------|-----|----------|-------------|
| POST | `/match` | entity-matching-engine | Compute match score between two person records |
| GET | `/` | entity-matching-engine | Health check |

### PersonMaster Migration

| Method | URL | Function | Description |
|--------|-----|----------|-------------|
| POST | `/migrate` | pm-migration | Migrate PersonMaster docs between schema versions |
| GET | `/` | pm-migration | Health check |

### Validation / Ground Truth

| Method | URL | Function | Description |
|--------|-----|----------|-------------|
| POST | `/validate` | validation | Validate ground truth data against PersonMaster resolution output |
| GET | `/` | validation | Health check |

### Job Function (not HTTP — Catalyst Job Pool)

| Trigger | Function | Description |
|---------|----------|-------------|
| Catalyst Job Pool | sync-full-job | Async full reconciliation via Job Pool (15-min timeout, Advanced I/O) |

---

## 1. Test — Health Check

```
GET /test/
```

Response:
```json
{ "status": "ok" }
```

---

## 2. Classifier — Intent Classification

```
POST /classifier/classify
Content-Type: application/json

{ "query": "show associates of Ravi" }
```

Response:
```json
{ "intent": "network", "confidence": 0.95 }
```

**Intents:** `structured`, `narrative`, `network`, `risk`, `analytical`

On GLM failure or low confidence (< 0.6):
```json
{ "intent": "structured", "confidence": 0.5, "fallback": true }
```

---

## 3. NL-to-SQL — Natural Language to ZCQL

```
POST /nl_sql/translate
Content-Type: application/json

{ "query": "count of cases in Bengaluru Urban" }
```

Response:
```json
{
  "status": "ok",
  "data": {
    "sql": "SELECT COUNT(cm.CaseMasterID) AS case_count FROM CaseMaster cm INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID INNER JOIN District d ON u.DistrictID = d.ROWID WHERE d.DistrictName = 'Bengaluru Urban'",
    "explanation": "Counts total cases in Bengaluru Urban district",
    "rows": [{ "cm": { "COUNT(CaseMasterID)": "929" } }],
    "column_meta": [],
    "source_refs": []
  }
}
```

---

## 4. RAG — Narrative Query via BriefFacts

```
POST /rag/query
Content-Type: application/json

{ "query": "tell me about theft in Bengaluru" }
```

Response:
```json
{
  "status": "ok",
  "data": {
    "answer": "Based on the provided excerpts...",
    "source_refs": ["CaseMasterID:1533", "CaseMasterID:1234"]
  }
}
```

On no match:
```json
{
  "status": "ok",
  "data": {
    "answer": "I could not find any case records matching your query in the BriefFacts database.",
    "source_refs": []
  }
}
```

---

## 5. Pipeline — Full Orchestrator (Main Entry Point)

```
POST /pipeline/query
Content-Type: application/json

{ "query": "count of cases in Bengaluru Urban", "employee_id": 1 }
```

Optional field: `"session_id": "uuid"` to continue an existing conversation.

### Response (Structured/Aggregation)
```json
{
  "status": "ok",
  "data": {
    "intent": "structured",
    "answer": "Result: 929",
    "data": [{ "case_count": "929" }],
    "source_refs": [],
    "confidence": 0.85,
    "session_id": "7f5ef990-5a44-4c36-a389-90161f1da96a"
  }
}
```

### Response (Narrative)
```json
{
  "status": "ok",
  "data": {
    "intent": "narrative",
    "answer": "Based on the records, there was a burglary...",
    "data": [],
    "source_refs": ["CaseMasterID:1533"],
    "confidence": 0.85,
    "session_id": "..."
  }
}
```

### Response (Network)
```json
{
  "status": "ok",
  "data": {
    "intent": "network",
    "answer": "Found a network with 2 person(s) connected across 1 case(s).",
    "data": [{ "nodes": [...], "edges": [...] }],
    "source_refs": [],
    "confidence": 0.95,
    "session_id": "..."
  }
}
```

### Response (Risk)
```json
{
  "status": "ok",
  "data": {
    "intent": "risk",
    "answer": "Risk assessment for \"Ravi\": High (score: 8.5/10)",
    "data": {
      "risk_score": 8.5,
      "severity": "High",
      "factors": ["3 prior cases", "Repeat offender", "Crime types: theft, assault"]
    },
    "source_refs": [],
    "confidence": 0.95,
    "session_id": "..."
  }
}
```

### Response (Analytical)
```json
{
  "status": "ok",
  "data": {
    "intent": "analytical",
    "answer": "Crime analysis in Bengaluru This year (2026): 0 total case(s). Top crime type: N/A. Highest crime district: N/A. Trend: stable.",
    "data": {
      "total_cases": 0,
      "top_crime_type": "N/A",
      "direction": "stable",
      "crime_type_breakdown": [],
      "monthly_trend": [],
      "location_breakdown": []
    },
    "source_refs": [],
    "confidence": 0.95,
    "session_id": "..."
  }
}
```

### Error Response
```json
{
  "status": "error",
  "error_code": "MISSING_EMPLOYEE_ID",
  "message": "employee_id is required",
  "fallback_answer": "I was unable to process your request at this time."
}
```

**Error codes:** `MISSING_EMPLOYEE_ID`, `MISSING_QUERY`, `CLASSIFICATION_FAILED`

---

## 6. Session — Conversation Memory

### Create Session
```
POST /session/create
Content-Type: application/json

{ "employee_id": 1 }
```

Response:
```json
{
  "status": "ok",
  "data": {
    "session_id": "7f5ef990-5a44-4c36-a389-90161f1da96a",
    "employee_id": 1,
    "rank_hierarchy": null,
    "unit_hierarchy": null,
    "unit_id": null,
    "district_id": null,
    "turns": []
  }
}
```

### Append Turn
```
POST /session/append
Content-Type: application/json

{
  "session_id": "7f5ef990-5a44-4c36-a389-90161f1da96a",
  "turn": { "role": "user", "content": "..." }
}
```

### Get Session
```
GET /session/?employee_id=1&session_id=7f5ef990-5a44-4c36-a389-90161f1da96a
```

### Delete Session
```
DELETE /session/{session_id}
```

---

## 7. Query Exec — ZCQL Executor

```
POST /query_exec/execute
Content-Type: application/json

{ "sql": "SELECT DistrictID, DistrictName FROM District WHERE StateID = '1' LIMIT 10" }
```

### Error (unsafe SQL)
```json
{
  "status": "error",
  "error_code": "VALIDATION_ERROR",
  "message": "UNSAFE_SQL: DROP not allowed"
}
```

**Blocked keywords:** `DROP`, `DELETE`, `INSERT`, `UPDATE`, `TRUNCATE`, `ALTER`,
`CREATE`, `EXEC`, `EXECUTE`. Only `SELECT` queries are allowed.

---

## 8. PersonMaster API

### 8.1 API Info
```
GET /personmaster/
```

### 8.2 Search PersonMaster
```
GET /personmaster/search?name=Ravi&gender=M&min_age=20&max_age=40&limit=10
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | no | — | Search by name (case-insensitive substring) |
| `gender` | string | no | — | Filter by gender (`M`, `F`) |
| `min_age` | integer | no | — | Minimum estimated age |
| `max_age` | integer | no | — | Maximum estimated age |
| `limit` | integer | no | 10 | Max results (capped at 50) |

Response:
```json
{
  "results": [
    {
      "person_id": "PM_000001",
      "name_normalised": "Ravi Kumar",
      "confidence": 0.95,
      "roles_summary": { "accused_count": 3, "victim_count": 0, "complainant_count": 1 },
      "match_reason": "name=0.80, gender=1.00, age=1.00"
    }
  ],
  "total": 1
}
```

### 8.3 Repeat Offenders
```
GET /personmaster/repeat-offenders?unit_id=UNIT-1&limit=20
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `unit_id` | string | no | — | Filter by police station |
| `district_id` | string | no | — | Filter by district |
| `limit` | integer | no | 20 | Max results (capped at 100) |

Response:
```json
{
  "repeat_offenders": [
    {
      "person_id": "PM_000001",
      "name_normalised": "Ravi Kumar",
      "accused_count": 3,
      "last_arrest_date": null,
      "source_records": [
        { "table": "Accused", "case_id": "CASE-001", "unit_id": "UNIT-1" }
      ]
    }
  ],
  "scope_applied": "unit:UNIT-1",
  "total": 1
}
```

### 8.4 Get PersonMaster Document
```
GET /personmaster/:person_id
```

Response: Full PersonMaster document with `person_id`, `name_normalised`, `aliases`,
`source_records`, `confirmed_edges`, `unconfirmed_edges`, `confidence`,
`roles_summary`, `demographics`, `meta`.

### 8.5 Network Traversal
```
GET /personmaster/:person_id/network?hops=2&max_nodes=50
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `hops` | integer | no | 2 | Max BFS depth (1-3) |
| `max_nodes` | integer | no | 50 | Max nodes to traverse (capped at 100) |

Response: Graph with nodes and edges, filtered by caller RBAC scope.

---

## 9. Network Analysis — Person Endpoints

### 9.1 Get Person Profile
```
GET /person/:personId
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `personId` | string | yes | PersonMaster ID (e.g., `PM_000001`) |

Response:
```json
{
  "status": "ok",
  "data": {
    "person_id": "PM_000001",
    "canonical_name": "Ramesh Kumar",
    "aliases": ["Ramesh K", "Ramesh Kumar"],
    "roles_summary": { "accused_count": 3, "victim_count": 0, "complainant_count": 1 },
    "demographics": {
      "gender": "M", "estimated_age": 34,
      "district_id": "D-07", "unit_id": "PS-042"
    },
    "degree": {
      "total": 5, "CO_ACCUSED": 3, "ACCUSED_TO_VICTIM": 1,
      "SHARED_LOCATION": 1, "UNCONFIRMED_MATCH": 0
    },
    "source_records_count": 4
  }
}
```

### 9.2 Get Known Associates
```
GET /person/:personId/associates?max_hops=2&edge_type_filter=CO_ACCUSED,SHARED_LOCATION
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `personId` | string | yes | — | PersonMaster ID |
| `max_hops` | integer | no | `2` | Max BFS depth (1-3) |
| `include_unconfirmed` | boolean | no | `false` | Include UNCONFIRMED_MATCH edges |
| `edge_type_filter` | string | no | — | Comma-separated edge types |

Response:
```json
{
  "status": "ok",
  "data": {
    "root": "PM_000001",
    "max_hops": 2,
    "associates": [
      {
        "person_id": "PM_000015",
        "canonical_name": "Suresh Babu",
        "roles_summary": { "accused_count": 1, "victim_count": 0, "complainant_count": 0 },
        "degree": { "total": 2, "CO_ACCUSED": 2, "ACCUSED_TO_VICTIM": 0, "SHARED_LOCATION": 0, "UNCONFIRMED_MATCH": 0 },
        "hop_distance": 1
      }
    ],
    "edges": [
      {
        "edge_id": "E-001", "source": "PM_000001", "target": "PM_000015",
        "edge_type": "CO_ACCUSED", "weight": 1, "occurrence_count": 2
      }
    ],
    "statistics": { "nodes_visited": 2, "edges_traversed": 1, "elapsed_ms": 1 }
  }
}
```

### 9.3 Get Co-Accused Network
```
GET /person/:personId/co-accused
```

Returns `CO_ACCUSED` edges only, traversed up to depth 3.

### 9.4 Get Victim Relationships
```
GET /person/:personId/victims
```

Returns `ACCUSED_TO_VICTIM` edges only, traversed up to depth 3.

### 9.5 Get Network Summary
```
GET /person/:personId/network-summary
```

Response:
```json
{
  "status": "ok",
  "data": {
    "person": { "person_id": "PM_000001", "canonical_name": "Ramesh Kumar", "roles_summary": { "accused_count": 3, "victim_count": 0, "complainant_count": 1 } },
    "degree": { "total": 5, "CO_ACCUSED": 3, "ACCUSED_TO_VICTIM": 1, "SHARED_LOCATION": 1, "UNCONFIRMED_MATCH": 0 },
    "known_associates": 4, "victim_links": 1, "co_accused": 3,
    "edge_breakdown": { "CO_ACCUSED": 3, "ACCUSED_TO_VICTIM": 1, "SHARED_LOCATION": 1 }
  }
}
```

### 9.6 Full Network Analysis
```
POST /analyze
Content-Type: application/json

{ "person_id": "PM_000001" }
```

Returns all person + associates + co-accused + victims + network summary in one call.

---

## 10. Graph Visualization — Cytoscape.js Export

### 10.1 Get Graph
```
GET /person/:personId/graph?format=cytoscape&max_hops=2
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `personId` | string | yes | — | PersonMaster ID |
| `format` | string | no | `cytoscape` | Output format: `cytoscape`, `compact`, `debug` |
| `max_hops` | integer | no | `2` | Max BFS depth (1-3) |
| `include_unconfirmed` | boolean | no | `false` | Include UNCONFIRMED_MATCH edges |
| `edge_type_filter` | string | no | — | Comma-separated edge types |

**Output formats:**
- `cytoscape` (default) — `{ elements: { nodes, edges }, style }`
- `compact` — Simplified nested structure with counts
- `debug` — Full metadata including internal indices

### 10.2 Visualize (graph → Cytoscape)
```
POST /visualize
Content-Type: application/json

{
  "nodes": [{ "id": "PM_000001", "label": "Ravi Kumar", ... }],
  "edges": [{ "source": "PM_000001", "target": "PM_000015", "edge_type": "CO_ACCUSED", ... }],
  "options": { ... }
}
```

### 10.3 API Home
```
GET /
```

---

## 11. Graph Traversal

### BFS Traversal
```
POST /traverse
Content-Type: application/json

{ "person_id": "PM_000001", "hops": 2, "max_nodes": 50, "caller_scope": { "scope": "state" } }
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `person_id` | string | yes | — | Root person ID |
| `hops` | integer | no | 2 | BFS depth (1-3) |
| `max_nodes` | integer | no | 50 | Max nodes to return |
| `caller_scope` | object | no | — | RBAC filter scope |

---

## 12. Graph Service (Internal Data Layer)

### 12.1 Person Details
```
GET /person/:personId
```

### 12.2 Neighbours
```
GET /person/:personId/neighbours
```

### 12.3 Edges
```
GET /person/:personId/edges
```

### 12.4 Degree
```
GET /person/:personId/degree
```

### 12.5 Exists
```
GET /person/:personId/exists
```

Response:
```json
{ "status": "ok", "data": { "person_id": "PM_000001", "exists": true } }
```

### 12.6 Persons by Role
```
GET /persons/by-role/:role
```

`role` values: `accused`, `victim`, `complainant`

### 12.7 Get Edge
```
GET /edge/:edgeId
```

### 12.8 Statistics
```
GET /statistics
```

Response:
```json
{
  "status": "ok",
  "data": {
    "total_nodes": 6896,
    "total_edges": 12900,
    "confirmed_edges": 12900,
    "unconfirmed_edges": 0,
    "max_degree": 47,
    "avg_degree": 3.74
  }
}
```

### 12.9 Cache Management
```
GET  /cache/info       → cache statistics (hits, misses, size)
POST /cache/reload     → reload cache from source
POST /cache/clear      → clear entire cache
```

---

## 13. Full Reconciliation

### 13.1 Run Full Reconciliation
```
POST /run
Content-Type: application/json

{ "run_id": "MANUAL-001", "max_records": 1000 }
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `run_id` | string | no | Auto-generated | Identifier for this reconciliation run |
| `max_records` | integer | no | All | Limit records per table (LIMITED mode) |

Response:
```json
{
  "status": "ok",
  "data": {
    "run_id": "MANUAL-001",
    "mode": "FULL",
    "authoritative": true,
    "stale_deletion_enabled": true,
    "documents_created": 6896,
    "documents_updated": 0,
    "documents_deleted": 0,
    "persons_processed": 11364,
    "clusters_formed": 6896,
    "singles": 1325,
    "confirmed_edges_written": 12900,
    "unconfirmed_edges_written": 218686,
    "source_errors": 0,
    "stale_deleted": 0,
    "elapsed_seconds": 482.15,
    "error_count": 0,
    "status": "SUCCESS"
  }
}
```

### 13.2 Job Function (Catalyst Job Pool)
The `sync-full-job` function runs the same pipeline via Catalyst's Job Pool (not HTTP).
It is triggered asynchronously with a 900,000ms (15-min) timeout and uses
`context.closeWithSuccess()`/`context.closeWithFailure()` for completion signaling.

---

## 14. Incremental Sync

### 14.1 Change Detection
```
POST /detect
Content-Type: application/json

{}
```

Response:
```json
{
  "status": "ok",
  "data": {
    "run_id": "INC-001",
    "timestamp": "2026-07-24T12:00:00.000Z",
    "stats": { "total_personmaster_docs": 6896, "changed": 12, "unchanged": 6884 },
    "changed_person_ids": ["PM_000001", "PM_000002"],
    "unchanged_person_ids": ["PM_000003", ...],
    "new_records": [],
    "orphaned_records": [],
    "load_errors": []
  }
}
```

### 14.2 Detect + Resolve
```
POST /reconcile
Content-Type: application/json

{}
```

Detects changes AND runs incremental resolution in one call.

---

## 15. PersonMaster Writer

### 15.1 Resolve
```
POST /resolve
Content-Type: application/json

{ "run_id": "RESOLVE-001" }
```

Runs full resolution pipeline: load source records → entity matching → cluster formation → PersonMaster persist.

### 15.2 Groups (Bypass Matching)
```
POST /groups
Content-Type: application/json

{
  "groups": [
    ["Accused:A-1", "Accused:A-2"],
    ["Victim:V-1"]
  ],
  "run_id": "GROUPS-001"
}
```

Bypasses entity matching. Each inner array is a pre-matched group consolidated into one PersonMaster document.

### 15.3 Diagnose
```
GET /diagnose
```

Runs 12 ZCQL connectivity diagnostic tests (SELECT, COUNT, JOIN, LIMIT, INSERT, pagination).

---

## 16. Entity Matching Engine

### 16.1 Match
```
POST /match
Content-Type: application/json

{
  "person_a": { "name": "Ravi Kumar", "age": 30, "gender": "M" },
  "person_b": { "name": "Ravi Kumar", "age": 30, "gender": "M" }
}
```

Response:
```json
{
  "status": "ok",
  "data": {
    "person_a": { ... },
    "person_b": { ... },
    "score_breakdown": {
      "name_score": 1.0,
      "phonetic_score": 1.0,
      "age_score": 1.0,
      "gender_score": 1.0,
      "overall": 1.0
    },
    "confidence": 1.0,
    "classification": "CONFIRMED",
    "matched": true
  }
}
```

---

## 17. PersonMaster Migration

### 17.1 Migrate
```
POST /migrate
Content-Type: application/json

{ "from_version": "1", "to_version": "2" }
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `from_version` | string | no | `"1"` | Source schema version |
| `to_version` | string | no | `"2"` | Target schema version |

Response:
```json
{
  "status": "ok",
  "data": {
    "total_documents": 6896,
    "migrated_count": 6896,
    "skipped_count": 0,
    "error_count": 0,
    "errors": []
  }
}
```

---

## 18. Validation — Ground Truth

### 18.1 Validate
```
POST /validate
Content-Type: application/json

{
  "data": { "type": "full" },
  "ground_truth_csv": "source_id,cluster_id\nA-1,PM_000001\nA-2,PM_000001\nA-3,PM_000002"
}
```

Runs the ground truth validator against PersonMaster resolution output.

---

## Error Response Format

All endpoints return errors in this format:

```json
{
  "status": "error",
  "error_code": "ERROR_CODE",
  "message": "Human-readable error description",
  "fallback_answer": "Optional fallback message for the user"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Validation error (invalid parameters) |
| 404 | Person or route not found |
| 500 | Internal server error |

---

## ZCQL V2 Rules

Catalyst Data Store uses ZCQL V2 (not standard SQL):

| Rule | Correct | Wrong |
|------|---------|-------|
| JOIN syntax | `SELECT ... FROM CaseMaster cm INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID` | Comma-separated FROM with WHERE joins |
| LIKE wildcards | `LIKE '*theft*'` | `LIKE '%theft%'` |
| COUNT syntax | `COUNT(cm.CaseMasterID)` | `COUNT(*)` |
| Max SELECT columns | 20 | >20 |
| Max WHERE conditions | 5 | >5 |
| Max JOINs | 4 | >4 |
| Max rows (no LIMIT) | 300 | Unlimited |
| Query result | Keyed by table alias: `{ "cm": {...}, "d": {...} }` | Flat rows |

---

## PersonMaster NoSQL Schema

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `type` | String | Partition key (HASH) | Always `"PM"` |
| `person_id` | String | Sort key (RANGE) | e.g., `"PM_000001"` |
| `name_normalised` | String | — | Canonical name |
| `aliases` | Array | — | Name variants |
| `demographics` | Map | — | Gender, age estimate, district, unit |
| `roles_summary` | Map | — | Accused/victim/complainant counts |
| `source_records` | Array | — | Linked source records |
| `confirmed_edges` | Array | — | Co-accused, victim edges |
| `unconfirmed_edges` | Array | — | Candidate match edges |
| `confidence` | Map | — | Match confidence scores |
| `meta` | Map | — | Resolution metadata |

---

## OpenAPI Specification

```yaml
openapi: 3.0.0
info:
  title: KSP Crime Analytics Platform API
  version: 1.0.0
  description: REST APIs for person network analysis and graph visualization
servers:
  - url: https://datathon2026-60073929329.development.catalystserverless.in/server
    description: Development server
paths:
  /test/:
    get:
      summary: Health check
      responses: { '200': { description: OK } }

  /classifier/classify:
    post:
      summary: Classify query intent
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties: { query: { type: string } }
      responses: { '200': { description: Intent classification result } }

  /nl_sql/translate:
    post:
      summary: NL-to-ZCQL generation and execution
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties: { query: { type: string } }
      responses: { '200': { description: SQL and result rows } }

  /rag/query:
    post:
      summary: Narrative query via BriefFacts search
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties: { query: { type: string } }
      responses: { '200': { description: Narrative answer with source refs } }

  /pipeline/query:
    post:
      summary: Full orchestrator
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [query, employee_id]
              properties:
                query: { type: string }
                employee_id: { type: integer }
                session_id: { type: string }
      responses:
        '200': { description: Processed query result }
        '400': { description: Validation error }

  /session/create:
    post:
      summary: Create conversation session
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties: { employee_id: { type: integer } }
      responses: { '200': { description: Session created } }

  /session/append:
    post:
      summary: Append turn to session
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                session_id: { type: string }
                turn: { type: object }
      responses: { '200': { description: Turn appended } }

  /session/:
    get:
      summary: Get session info
      parameters:
        - name: employee_id
          in: query
          required: true
          schema: { type: integer }
        - name: session_id
          in: query
          required: true
          schema: { type: string }
      responses: { '200': { description: Session data } }

  /session/{session_id}:
    delete:
      summary: Delete session
      parameters:
        - name: session_id
          in: path
          required: true
          schema: { type: string }
      responses: { '200': { description: Session deleted } }

  /query_exec/execute:
    post:
      summary: Execute raw ZCQL query with safety validation
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties: { sql: { type: string } }
      responses:
        '200': { description: ZCQL result rows }
        '400': { description: Validation error }

  /personmaster/search:
    get:
      summary: Search PersonMaster by name, gender, age
      parameters:
        - name: name
          in: query
          schema: { type: string }
        - name: gender
          in: query
          schema: { type: string, enum: [M, F] }
        - name: min_age
          in: query
          schema: { type: integer }
        - name: max_age
          in: query
          schema: { type: integer }
        - name: limit
          in: query
          schema: { type: integer, default: 10 }
      responses: { '200': { description: Search results } }

  /personmaster/repeat-offenders:
    get:
      summary: List repeat offenders
      parameters:
        - name: unit_id
          in: query
          schema: { type: string }
        - name: district_id
          in: query
          schema: { type: string }
        - name: limit
          in: query
          schema: { type: integer, default: 20 }
      responses: { '200': { description: Repeat offenders list } }

  /personmaster/{person_id}:
    get:
      summary: Get single PersonMaster document
      parameters:
        - name: person_id
          in: path
          required: true
          schema: { type: string }
      responses:
        '200': { description: PersonMaster document }
        '404': { description: Person not found }

  /personmaster/{person_id}/network:
    get:
      summary: BFS graph traversal from a person
      parameters:
        - name: person_id
          in: path
          required: true
          schema: { type: string }
        - name: hops
          in: query
          schema: { type: integer, default: 2, minimum: 1, maximum: 3 }
        - name: max_nodes
          in: query
          schema: { type: integer, default: 50 }
      responses: { '200': { description: Graph traversal result } }

  /person/{personId}:
    get:
      summary: Get person profile
      parameters:
        - name: personId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200': { description: Person profile with degree info }
        '404': { description: Person not found }

  /person/{personId}/associates:
    get:
      summary: Get known associates via BFS
      parameters:
        - name: personId
          in: path
          required: true
          schema: { type: string }
        - name: max_hops
          in: query
          schema: { type: integer, minimum: 1, maximum: 3, default: 2 }
        - name: include_unconfirmed
          in: query
          schema: { type: boolean, default: false }
        - name: edge_type_filter
          in: query
          schema: { type: string }
      responses: { '200': { description: Associates with edges and statistics } }

  /person/{personId}/co-accused:
    get:
      summary: Get co-accused network
      parameters:
        - name: personId
          in: path
          required: true
          schema: { type: string }
      responses: { '200': { description: Co-accused network } }

  /person/{personId}/victims:
    get:
      summary: Get victim relationships
      parameters:
        - name: personId
          in: path
          required: true
          schema: { type: string }
      responses: { '200': { description: Victim relationships } }

  /person/{personId}/network-summary:
    get:
      summary: Get aggregated network summary
      parameters:
        - name: personId
          in: path
          required: true
          schema: { type: string }
      responses: { '200': { description: Aggregated network statistics } }

  /analyze:
    post:
      summary: Full network analysis
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties: { person_id: { type: string } }
      responses: { '200': { description: Full network analysis result } }

  /person/{personId}/graph:
    get:
      summary: Export graph visualization
      parameters:
        - name: personId
          in: path
          required: true
          schema: { type: string }
        - name: format
          in: query
          schema: { type: string, enum: [cytoscape, compact, debug], default: cytoscape }
        - name: max_hops
          in: query
          schema: { type: integer, minimum: 1, maximum: 3, default: 2 }
        - name: include_unconfirmed
          in: query
          schema: { type: boolean, default: false }
        - name: edge_type_filter
          in: query
          schema: { type: string }
      responses: { '200': { description: Graph visualization data } }

  /visualize:
    post:
      summary: Render graph structure to Cytoscape format
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                nodes: { type: array }
                edges: { type: array }
                options: { type: object }
      responses: { '200': { description: Cytoscape-formatted JSON } }

  /traverse:
    post:
      summary: BFS graph traversal
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [person_id]
              properties:
                person_id: { type: string }
                hops: { type: integer, default: 2 }
                max_nodes: { type: integer, default: 50 }
                caller_scope: { type: object }
      responses: { '200': { description: Traversal result } }

  /run:
    post:
      summary: Trigger full reconciliation
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                run_id: { type: string }
                max_records: { type: integer }
      responses: { '200': { description: Reconciliation result } }

  /detect:
    post:
      summary: Incremental change detection
      responses: { '200': { description: Detection result } }

  /reconcile:
    post:
      summary: Incremental detect + resolve
      responses: { '200': { description: Incremental reconciliation result } }

  /resolve:
    post:
      summary: Run resolution pipeline (legacy)
      responses: { '200': { description: Resolution result } }

  /groups:
    post:
      summary: Accept pre-matched groups
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                groups: { type: array }
                run_id: { type: string }
      responses: { '200': { description: Group persist result } }

  /diagnose:
    get:
      summary: ZCQL connectivity diagnostics
      responses: { '200': { description: Diagnostic results } }

  /match:
    post:
      summary: Entity match between two records
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                person_a: { type: object }
                person_b: { type: object }
      responses: { '200': { description: Match result with score and classification } }

  /migrate:
    post:
      summary: Migrate PersonMaster schema version
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                from_version: { type: string }
                to_version: { type: string }
      responses: { '200': { description: Migration result } }

  /validate:
    post:
      summary: Validate ground truth against resolution output
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                data: { type: object }
                ground_truth_csv: { type: string }
      responses: { '200': { description: Validation result } }

  /:
    get:
      summary: API home/info (varies by function)
      responses: { '200': { description: Service info } }
```
