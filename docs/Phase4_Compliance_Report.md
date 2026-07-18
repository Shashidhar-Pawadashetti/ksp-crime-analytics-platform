# Phase 4 Compliance Report — Entity Resolution & Network Analysis

> Generated: 2026-07-09

---

## Summary

| Task | Status | Files Modified | Notes |
|------|--------|----------------|-------|
| 1. PersonMaster API | ✅ Complete | `functions/personmaster-api/index.js` | GET /personmaster/{person_id}, /search, /{person_id}/network, /repeat-offenders |
| 2. Pipeline Integration | ✅ Complete | `functions/pipeline/index.js` | handleNetwork uses PersonMaster cache + BFS traversal; ensurePersonMasterCache, bfsTraversePM, computeDegreeFromEdges |
| 3. Graph Traversal Deployable | ✅ Complete | `functions/graph-traversal/index.js` | Exports Catalyst handler AND library functions; config entry changed to index.js |
| 4. RBAC Filtering | ✅ Skipped | — | LLD/API.md has no RBAC requirements; existing pipeline has no documented RBAC |
| 5. ResolutionAuditLog | ✅ Complete | `functions/resolution-audit-log.js`, `functions/sync-full/pipeline.js`, `functions/sync-incremental/signalHandler.js` | Audit records on success/failure for full & incremental sync |
| 6. API Contract Verification | ✅ Complete | `functions/pipeline/index.js`, `functions/graph-visualization/cytoscapeFormatter.js`, `functions/network-analysis/responseFormatter.js` | Fixed format mismatches found during verification |
| 7. Graph Visualization Format | ✅ Complete | `functions/graph-visualization/cytoscapeFormatter.js` | Matches API.md §9.1 exactly |

---

## Task 1: PersonMaster API

**4 REST endpoints implemented** in `functions/personmaster-api/index.js`:

| Endpoint | Method | Description | Query Params |
|----------|--------|-------------|-------------|
| `/personmaster/{person_id}` | GET | Get single person by ID | — |
| `/personmaster/search` | GET | Search by name/alias | `q` (required), `include_unconfirmed` |
| `/personmaster/{person_id}/network` | GET | BFS network traversal | `max_hops` (1-3), `include_unconfirmed`, `edge_type_filter` |
| `/personmaster/repeat-offenders` | GET | High-risk persons with degree > threshold | `min_degree`, `max_results` |

**Storage:** Reads from Catalyst NoSQL (`person_id` partition key) via `queryTable` with `BEGINS_WITH` scan on `PM_` prefix. In-memory LRU cache with 5-minute TTL.

**Network traversal:** BFS using adjacency map in PersonMaster documents (`co_accused`, `accused_to_victim`, `shared_location`, `unconfirmed_matches`). Falls back to edge scan for `UNCONFIRMED_MATCH` edges if `include_unconfirmed=true`.

---

## Task 2: Pipeline Integration

**Modified:** `functions/pipeline/index.js`

**Changes:**
- Added `ensurePersonMasterCache(app)` — loads all PersonMaster documents from NoSQL into in-memory map
- Added `computeDegreeFromEdges(personId, edges)` — computes degree breakdown from edge list
- Added `bfsTraversePM(persons, edges, startId, maxHops)` — BFS traversal using adjacency maps
- Replaced `handleNetwork()` — now searches PersonMaster by canonical name + aliases (instead of raw ZCQL `LIKE` on transactional tables), then BFS-traverses

**Before:** Raw ZCQL `LIKE` queries on Accused/Victim/Complainant tables
**After:** PersonMaster-based search with BFS traversal via adjacency maps

---

## Task 3: Graph Traversal Deployable

**Modified:** `functions/graph-traversal/index.js`

- Now exports both a Catalyst AdvancedIO handler (`module.exports = async (req, res) => {...}`) AND named library exports (`.bfsTraverse`, `.TraversalService`, etc.)
- `catalyst-config.json` entry point changed from `dist/index.js` to `index.js`
- Can be called both as standalone function and as a library

---

## Task 4: RBAC Filtering

**Not implemented.** The LLD documents (`API.md`, `ARCHITECTURE.md`, `ENTITY_RESOLUTION.md`) do not specify RBAC filtering on PersonMaster/network queries. The existing pipeline's `session/` function loads employee hierarchy but it is not used for access control in any handler. See Task 4 analysis in session notes for details.

---

## Task 5: ResolutionAuditLog

**New module:** `functions/resolution-audit-log.js`
- Shared module imported by both sync functions
- `createAuditRecord(app, record)` — inserts into `ResolutionAuditLog` Data Store table
- Auto-generates RunID (`AUD-{timestamp}-{random}`)
- Handles errors gracefully (logs, doesn't throw)

**Integrated into:**
- `functions/sync-full/pipeline.js` — audit on SUCCESS (with `documentsCreated`/`documentsUpdated` from writeStats) and FAILED (with `errorMessage`)
- `functions/sync-incremental/signalHandler.js` — audit on matched/created and on error
- Both functions wrapped in try/catch so audit failures don't affect pipeline

**Table columns:**
| Column | Type | Description |
|--------|------|-------------|
| RunID | Text | Auto-generated unique ID |
| RunType | Text | `full` or `incremental` |
| Trigger | Text | `cron`, `manual`, `signal`, `dry_run` |
| StartedAt | DateTime | Run start timestamp |
| CompletedAt | DateTime | Run end timestamp |
| Status | Text | `SUCCESS` or `FAILED` |
| ThresholdUsed | Text | Matching threshold (e.g. `0.78`) |
| DocumentsCreated | Integer | PersonMaster documents inserted |
| DocumentsUpdated | Integer | PersonMaster documents updated |
| ErrorMessage | Text | Error description on failure |

> **Prerequisite:** `ResolutionAuditLog` table must be created in Catalyst Console Data Store before deployment.

---

## Task 6: API Contract Verification

Compared each endpoint's output against `API.md`. Found and fixed **5 mismatches**:

### 6.1 Pipeline network response format
- **LLD:** `"data": [{ "nodes": [...], "edges": [...] }]`
- **Was:** `"nodes": [...], "edges": [...]` at root of data object
- **Fix:** Wrapped nodes/edges in `data` array per LLD

### 6.2 Pipeline network answer string
- **LLD:** `"person(s) connected across X case(s)"`
- **Was:** `"person(s) connected across X connection(s)"`
- **Fix:** Changed to `case(s)`

### 6.3 Graph visualization — node format
- **LLD:** `data.node_style` with `size`, `color`, `borderColor`, `icon`
- **Was:** `style` at element level (outside `data`)
- **Fix:** Moved style into `data.node_style`, added `roles_summary` to `data`

### 6.4 Graph visualization — edge format
- **LLD:** `data.label` (display name), `data.edge_style` with `color`, `width`, `style`, `label`
- **Was:** `data.type` (enum), `style` at element level with `lineStyle` key
- **Fix:** Changed to `data.label`, `data.edge_style` with `style` key name

### 6.5 Graph visualization — missing root `style` array
- **LLD:** Root-level `style` array with Cytoscape.js stylesheet entries
- **Was:** Not present
- **Fix:** Added `buildStylesheet()` that generates per-node and per-edge CSS rules

### 6.6 Network Analysis response — format
- **LLD:** `{ "status": "ok", "data": {...} }`
- **Was:** `{ "success": true, "data": {...} }`
- **Fix:** Changed to `status: "ok"`

### 6.7 Network Analysis error — format
- **LLD:** `{ "status": "error", "error_code": "...", "message": "..." }`
- **Was:** `{ "success": false, "error": "..." }`
- **Fix:** Changed to match LLD format

### Verified as correct (no changes needed):
- PersonMaster API response format ✅
- Pipeline structured/narrative/risk/analytical responses ✅
- Session create/get responses ✅
- Query exec responses ✅
- Pipeline HTTP error responses ✅
- OpenAPI spec paths ✅

---

## Task 7: Graph Visualization Format Verification

**Standard:** API.md §9.1 "Graph Visualization — Cytoscape.js Export"

**Before fix:**
```json
{
  "data": { "id": "PM_000001", "label": "Ramesh Kumar", "role": "Accused", "degree": {...} },
  "style": { "size": 50, "color": "#E53935", "borderColor": "#B71C1C", "icon": "user-tie" }
}
```

**After fix (matches LLD):**
```json
{
  "data": {
    "id": "PM_000001",
    "label": "Ramesh Kumar",
    "roles_summary": { "accused_count": 3, "victim_count": 0, "complainant_count": 1 },
    "node_style": { "size": 50, "color": "#E53935", "borderColor": "#B71C1C", "icon": "user-tie" }
  }
}
```

**Root level now includes:**
```json
{
  "elements": { "nodes": [...], "edges": [...] },
  "style": [
    { "selector": "node#PM_000001", "css": { "background-color": "#E53935", ... } }
  ],
  "statistics": { ... }
}
```

**Note:** `graph-visualization` and `network-analysis` are **not** in `catalyst.json` deployment targets. They are library modules used by other functions. To deploy them as standalone endpoints, add them to `catalyst.json` and create `index.js` handlers.

---

## Issues & Recommendations

| # | Issue | Severity | Recommendation |
|---|-------|----------|---------------|
| 1 | `graph-visualization` and `network-analysis` not deployable | Medium | Add to `catalyst.json` with `index.js` handlers if standalone endpoints are needed |
| 2 | `ResolutionAuditLog` table must be created manually | Low | Create in Catalyst Console Data Store before deploying sync functions |
| 3 | Dist bundles need rebuilding for sync-full/sync-incremental | Medium | Run `npm run build` (or equivalent) to rebundle `dist/index.js` after audit log changes |
| 4 | `QUICKML_TOKEN` expires hourly | High | Already documented in AGENTS.md — migrate to Server-based App OAuth with refresh token |
