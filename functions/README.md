# KSP Crime Analytics \u2014 Catalyst Functions

16 Catalyst AdvancedIO (Node.js 24) functions powering the KSP Crime Analytics Platform.

## Function Categories

### Core Conversational AI (7 functions)

| Function | Entry | Role | Calls GLM? | Calls ZCQL? |
|----------|-------|------|-----------|-------------|
| `pipeline` | `POST /pipeline/query` | Full orchestrator \u2014 classifies intent, routes to inline handler, returns formatted response | Yes | Yes |
| `classifier` | `POST /classifier/classify` | Intent classification (keyword regex fast path, GLM fallback) | Yes (fallback) | No |
| `nl_sql` | `POST /nl_sql/query` | NL-to-ZCQL translation + execution with auto-retry | Yes | Yes |
| `rag` | `POST /rag/query` | BriefFacts keyword search + GLM narrative answer | Yes | Yes |
| `session` | `POST /session/create`, `GET /session/` | Conversation memory (Catalyst Cache CRUD, 1hr TTL) | No | Yes |
| `query_exec` | `POST /query_exec/execute` | Raw ZCQL executor with DDL/DML safety validation | No | Yes |
| `dashboard` | `POST /dashboard/...` | Analytics aggregation queries (trend, breakdown, location, seasonal, risk-ranked) | No | Yes |

### Entity Resolution & Graph Subsystem (9 functions)

| Function | Role | Catalyst Config |
|----------|------|-----------------|
| `entity-matching-engine` | Name normalisation, phonetic keys, blocking, scoring, threshold library | Library module |
| `graph-service` | Graph data source (nodes, edges, adjacency lists) | Library module |
| `graph-traversal` | BFS traversal with validation, path finding (max 3 hops) | Library module |
| `graph-visualization` | Cytoscape.js formatter, graph export, style hints | Library module |
| `graph-service-api` | Graph REST API returning Cytoscape.js format | Deployed HTTP |
| `network-analysis` | Network analysis routes, validators, response formatting | Library module |
| `personmaster-writer` | Batch-writes PersonMaster documents and edges to Catalyst NoSQL | CLI/batch |
| `personmaster-api` | PersonMaster HTTP endpoint (stub) | Deployed HTTP |
| `sync-incremental` | Incremental entity signal processing (candidate load \u2192 resolve \u2192 update) | Deployed HTTP + signal |

### Data Pipeline (2 functions)

| Function | Role |
|----------|------|
| `sync-full` | Full graph rebuild: CSV \u2192 match \u2192 cluster \u2192 write |
| `test` | Health check endpoint (`GET /test/`) |

## Request Flow

```
User query (from frontend)
  |
pipeline/query ---> classifier (keyword match -> instant, GLM -> fallback)
  |
  |-- structured -> GLM SQL gen -> ZCQL execute -> rows
  |-- narrative  -> BriefFacts LIKE search -> GLM answer
  |-- network    -> Accused/Victim/Complainant search -> graph
  |-- risk       -> Accused count -> recidivism score
  |-- analytical -> 3 aggregation queries -> trends
  |
Format JSON response -> append turn to session (Cache, 1hr TTL)
```

## Installation

Each function has its own `package.json`. Install individually:

```powershell
# Install all core functions
$funcs = @("pipeline","classifier","nl_sql","rag","session","query_exec","dashboard")
foreach ($f in $funcs) { Push-Location "functions/$f"; npm install; Pop-Location }
```

## Deployment

```bash
# All functions
catalyst deploy

# Specific functions
catalyst deploy --only "functions:pipeline,functions:dashboard"

# Single function
catalyst deploy --only "functions:graph-service-api"
```

## Post-Deploy: Critical

`catalyst deploy` overwrites Console environment variables. After every deploy,
**re-add `QUICKML_TOKEN`** via Catalyst Console for these 4 functions:

| Function | Requires QUICKML_TOKEN |
|----------|----------------------|
| classifier | Yes |
| nl_sql | Yes |
| rag | Yes |
| pipeline | Yes |

## ZCQL V2 Rules

All ZCQL queries must follow these rules:

| Rule | Correct | Wrong |
|------|---------|-------|
| JOIN syntax | `INNER JOIN ... ON` | Comma-separated FROM |
| LIKE wildcards | `LIKE '*theft*'` | `LIKE '%theft%'` |
| COUNT | `COUNT(cm.CaseMasterID)` | `COUNT(*)` |
| Max JOINs | 4 per query | 5+ |
| Max columns | 20 per SELECT | 21+ |

## Key Implementation Details

- **`enable_thinking: false`** is mandatory on every GLM call \u2014 without it the model does chain-of-thought and breaks JSON parsing
- **SQL auto-retry**: if ZCQL execution throws, the error is sent back to GLM with a fix prompt (one retry only due to 30s timeout)
- **Row flattening**: ZCQL returns nested `{alias: {cols}}` objects; flattened via `Object.assign` merge
- **Timeout**: Catalyst limits to 30s; GLM timeout set to 15-20s per call
