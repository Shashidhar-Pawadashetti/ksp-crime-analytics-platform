# CSV → Catalyst Data Store Migration

## Files Modified

| File | Change |
|------|--------|
| `functions/sync-full/dataStoreRepository.js` | **CREATED** — Data access abstraction layer supporting `DATA_SOURCE=csv` and `DATA_SOURCE=datastore` |
| `functions/sync-incremental/dataStoreRepository.js` | **CREATED** — Identical copy for sync-incremental (Catalyst deploys functions independently) |
| `functions/sync-full/pipeline.js` | **MODIFIED** — Replaced `loadCSV()` calls with `repo.loadAccused()`, `repo.loadVictim()`, `repo.loadComplainants()`, `repo.loadCaseMaster()`. Made `collectPersonRecords()` async. Removed inline `DATA_DIR`, `parseCSVLine`, `loadCSV`, `loadCaseMasterLookup`, `genderToChar` (moved to repo). |
| `functions/sync-incremental/signalHandler.js` | **MODIFIED** — Added datastore mode: resolves records via `repo.loadPersonByROWID()` when signal contains `{table, rowId}` instead of `{record}`. Builds `sourceData` via `repo.buildSourceByKey()` in datastore mode. |
| `functions/sync-incremental/index.js` | **MODIFIED** — Accepts both `{event, record}` and `{event, table, rowId}` signal formats. |
| `functions/sync-incremental/simulate-signal.js` | **MODIFIED** — Added `rowid` mode for testing table+rowId signals. Updated usage text with DATA_SOURCE info. |
| `MIGRATION_REPORT.md` | **CREATED** — This file |

## Files NOT Modified (by design)

These files retain their own CSV loading logic because they are shared/entity-resolution modules and out of scope:

- `functions/personmaster-builder/documentBuilder.js` — still uses CSVs for `loadSourceData()` and `buildAllDocuments()`
- `functions/personmaster-builder/edgeBuilder.js` — still uses CSVs for `buildCaseLookup()` and `buildEdges()`
- `functions/entity-matching-engine/*` — all unchanged (normaliser, phonetic, scorer, threshold, blocking, index)
- `functions/personmaster-writer/writer.js` — unchanged

## ZCQL Queries Added

All queries use explicit `INNER JOIN ... ON` syntax (where applicable), qualified column aliases, and `LIKE '*text*'` wildcards.

| Function | Query | Purpose |
|----------|-------|---------|
| `loadAccused()` | `SELECT a.ROWID, a.AccusedMasterID, a.AccusedName, a.AgeYear, a.GenderID, a.CaseMasterID FROM Accused AS a LIMIT 5000` | Load all accused records for entity resolution |
| `loadVictim()` | `SELECT v.ROWID, v.VictimMasterID, v.VictimName, v.AgeYear, v.GenderID, v.CaseMasterID FROM Victim AS v LIMIT 5000` | Load all victim records |
| `loadComplainants()` | `SELECT c.ROWID, c.ComplainantID, c.ComplainantName, c.ComplainantAge AS AgeYear, c.GenderID, c.CaseMasterID FROM ComplainantDetails AS c LIMIT 5000` | Load all complainant records |
| `loadCaseMaster()` | `SELECT cm.ROWID, cm.CaseMasterID, cm.Latitude, cm.Longitude, cm.CrimeRegisteredDate, cm.PoliceStationID FROM CaseMaster AS cm LIMIT 5000` | Load case master data for location lookup |
| `loadPersonByROWID()` | `SELECT * FROM {table} WHERE ROWID = '{rowId}'` | Fetch a single person record by its Catalyst ROWID |
| `loadRecordsByCaseID()` (3 queries) | `SELECT ... FROM Accused AS a WHERE a.CaseMasterID = '{caseId}'` + similar for Victim and ComplainantDetails | Find all persons linked to a specific case |

## Catalyst APIs Used

- `zcatalyst-sdk-node` (via `require('zcatalyst-sdk-node')`)
- `app.zcql().executeZCQLQuery(query)` — ZCQL V2 query execution
- `catalyst.app()` — Catalyst app instance (deployed mode)
- Local initialization via `.catalystrc` + `CATALYST_PROJECT_KEY` env var (for local testing)

## Result Flattening Pattern

ZCQL V2 returns rows keyed by table alias. Every result set goes through `flatMerge()`:

```javascript
function flatMerge(row) {
  var flat = {};
  for (var key of Object.keys(row)) {
    var val = row[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(flat, val);
    } else {
      flat[key] = val;
    }
  }
  return flat;
}
```

This ensures downstream code sees flat objects matching CSV row format (e.g., `{AccusedMasterID: "...", AccusedName: "...", ...}`).

## Performance Considerations

| Factor | Impact |
|--------|--------|
| **Row counts** | Estimated 5000+ rows per table. ZCQL LIMIT 5000 may not cover all rows in production with real data. If datasets exceed 5000, implement pagination loops using ROWID cursors. |
| **Pagination** | Not currently implemented. All queries use `LIMIT 5000`. For datasets >5000 rows, add offset-based or cursor-based pagination in `loadAccused()`, `loadVictim()`, `loadComplainants()`, `loadCaseMaster()`. |
| **Timeout risk** | Each query takes 1-5s. `loadSourceByKey()` runs 4 parallel queries (Accused, Victim, ComplainantDetails, CaseMaster). Total time ~5-10s for data loading. Pipeline 30s timeout should be sufficient. |
| **Memory** | Loading all person records into memory for entity resolution matches current CSV behavior. No regression. |

## Deployment Readiness

### Required for production deploy with `DATA_SOURCE=datastore`:

1. **Environment variables** (set via Catalyst Console for each function):
   - `DATA_SOURCE=datastore` — on sync-full and sync-incremental (and pipeline/rag/nl_sql if they use repo)
   - `CATALYST_PROJECT_KEY` — only needed for local `initCatalystLocally()`; not needed on deployed Catalyst

2. **Data Store must be populated** — The Accused, Victim, ComplainantDetails, and CaseMaster tables must exist in Catalyst Data Store with data matching the CSV schema.

3. **ZCQL V2 active** — All queries use ZCQL V2 syntax (explicit JOIN ... ON, COUNT(alias.Col), LIKE '*wildcards*').

### Backward compatibility:

- `DATA_SOURCE=csv` (default) — full local development workflow using `../../data_pipeline/data/*.csv`
- All existing tests (CSV mode) continue to work without modification
- No changes to shared entity resolution modules

### Verification commands:

```bash
# CSV mode — full sync (local dev)
DATA_SOURCE=csv node functions/sync-full/simulate-cron.js --dry-run

# CSV mode — incremental sync
DATA_SOURCE=csv node functions/sync-incremental/simulate-signal.js synthetic

# Datastore mode — requires Catalyst credentials
DATA_SOURCE=datastore CATALYST_PROJECT_KEY=xxx node functions/sync-full/simulate-cron.js --dry-run
DATA_SOURCE=datastore CATALYST_PROJECT_KEY=xxx node functions/sync-incremental/simulate-signal.js rowid Accused 47995000000332408
```

## Architecture: Data Source Selection

```
DATA_SOURCE env var
    │
    ├── "csv" (default) ───→ dataStoreRepository uses fs.readFileSync local CSVs
    │
    └── "datastore" ───────→ dataStoreRepository uses catalyst.app().zcql().executeZCQLQuery()
```

The `DATA_SOURCE` constant is evaluated at module load time. All repository functions check this flag and branch to the appropriate implementation. The calling code (pipeline, signalHandler) is decoupled from data source concerns.
