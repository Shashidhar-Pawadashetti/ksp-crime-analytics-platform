# Changelog — KSP Crime Analytics Platform

All notable changes to this project will be documented in this file.

---

## [v4.4.5] — Identity Matching Hardening & Graph Cleanup

### Added

#### sync-incremental Identity Matching Compatibility
- **`parseSourceRecords` hardened** — Handles all JSON representations: native arrays, stringified JSON arrays, mixed arrays of objects and stringified objects. Diagnostics counters track each element type.
- **`getSourceRecordTable` role fallback** — v0 PersonMaster records stored only a `role` field (e.g. "Accused") instead of `table`/`source_table`. Added `ROLE_TO_TABLE` mapping so these records can still build identity keys.
- **`buildSourceToPersonIndex` ownership tracking** — Full diagnostics track unique vs duplicate keys, same-person vs cross-person duplicates, multi-person ownership, and samples of problematic records.
- **Identity diagnostics in `/detect` response** — `identity_diagnostics` block includes:
  - `duplicate_ownership` — key-level breakdown (unique keys, duplicate references, cross-person duplication, ownership distribution histogram for single/two/multi-person keys)
  - `current_side` — uniqueness stats on current Data Store records
  - `set_arithmetic` — historical-vs-current set comparison (intersection, H-C, C-H)
  - `missing_identity` — records that could not form a source key with per-reason counts and samples

#### sync-full Merge-Victim Cleanup
- **Merge-victim deletion separated from stale-orphan deletion** — After identity resolution, person documents whose records were absorbed into a surviving identity (merge victims) are explicitly deleted. This is a separate phase from stale-orphan cleanup.
- **Merge victims always deleted after survivor persistence** — Ensures atomicity: survivor is written first, then merge-victim docs are removed.
- **Stale orphans deleted only in FULL authoritative mode** — Stale orphan deletion (records in the graph but not in current Data Store) runs only when the sync mode is `FULL` (authoritative rebuild), not during incremental passes.
- **`deleteOneDoc` idempotency** — `deleteOneDoc` handles 404 gracefully when the document was already deleted. No error thrown for already-deleted documents.

#### Pipeline V2 NoSQL Pagination
- **Pipeline PersonMaster pagination upgraded to V2** — Uses `start_key`-based pagination (NoSQL V2 pattern) instead of the previous V1 `last_evaluated_key` approach.

#### Test Expansion
- **3,300+ new tests** across all modules since v4.4.4:
  - `sync-incremental/test_change_detection.js` — 84+ tests covering change detection, source parsing, identity indexing, orphan detection, edge cases, diagnostics, boundary conditions
  - `sync-incremental/test_incremental_resolver.js` — Incremental reconciliation flow tests
  - `sync-incremental/test.js` — 53+ tests for function integrity and API shape
  - `sync-incremental/test_no_cross_function_imports.js` — Isolation verification
  - `sync-full/test_full_reconciler.js` — Full reconciliation pipeline tests
  - `sync-full-job/test_job_lifecycle.js` — Job lifecycle state machine tests (3+)
  - `validation/test_ground_truth.js` — Ground truth validation tests
  - `personmaster-writer/test_integration.js`, `test_local.js`, `test_edgePersistence.js` — Writer integration tests
  - `pm-migration/test_local.js` — Migration tests
  - `pipeline/test/test.js` — 69+ pipeline integration tests
  - `client/src/__tests__/` — 28 files covering all frontend views
  - Existing test suites expanded (graph-service, BFS, network-analysis, graph-export)

### Changed
- `sync-incremental/incrementalResolver.js` — Identity-preserving cluster-to-document mapping with merge/split resolution. New `findExistingOwners`, `mapClustersToDocs`, `handleOrphanedRecords` with merge-victim tracking.
- `sync-incremental/index.js` — Full rewrite of change detection pipeline with identity diagnostics, record checksum comparison, orphan tracking, new-record detection.

### Bug Fixes
- **sync-incremental `buildSourceRecordKey`** — Could return `null` for v0 PersonMaster records that only had a `role` field instead of `table`/`source_table`. Fixed with `ROLE_TO_TABLE` fallback mapping.
- **sync-full orphan deletion timing** — Merge victims were sometimes left as orphan documents after identity resolution. Fixed by separating merge-victim deletion from stale-orphan deletion.
- **sync-full `deleteOneDoc` crash** — Threw when document was already deleted. Now idempotent (no-op for 404).
- **Pipeline NoSQL V1→V2 pagination** — Pipeline's PersonMaster query used a `start_key`/`last_evaluated_key` pattern that didn't match V2 NoSQL API. Fixed to use V2 `startKey` + `consistent_read` pattern.

---

## [Unreleased] — Core Conversational Platform

### Added

#### ZCQL V2 Migration
- **All functions migrated from implicit JOINs to explicit `INNER JOIN ... ON` syntax** — comma-separated FROM clauses replaced with proper JOIN chains through ROWID FK paths. Affects: pipeline, rag.
- **LIKE wildcards changed from `%` to `*`** — ZCQL V2 uses `*` and `?` for pattern matching, not standard SQL `%`. Updated all LIKE clauses in pipeline and rag.
- **`COUNT(alias.Column)` enforced** — no more `COUNT(*)` which ZCQL V2 rejects. COUNT calls now always use table alias prefix.
- **LIMIT syntax documented** — ZCQL V2 supports `LIMIT OFFSET,VALUE` (e.g. `LIMIT 1,3`). Simple `LIMIT 50` works when no offset needed.

#### Functions
- **`functions/nl_sql/index.js`** — Now self-contained: generates SQL via GLM, executes via ZCQL, returns `{sql, explanation, rows, column_meta, source_refs}`. No longer depends on separate query_exec call. Prompt updated with full ZCQL V2 rules (explicit JOINs, `*` wildcards, `COUNT(alias.)`, HAVING, subqueries, `IS` operator, max 4 JOINs, max 20 columns).
- **`functions/pipeline/index.js`** — Full orchestrator with all 5 intent handlers:
  - Structured: GLM SQL generation + ZCQL execution + auto-retry on SQL errors (sends error back to GLM to fix)
  - Narrative: BriefFacts keyword search + GLM answer generation (row flattening fixed)
  - Network: Accused/Victim/Complainant lookups → graph structure (nodes + edges)
  - Risk: Recidivism-based score (0-10) with severity and factors
  - Analytical: Location/time-period extraction → aggregation queries (crime types, monthly trend, location breakdown)
- **`functions/rag/index.js`** — BriefFacts search via ZCQL + GLM narrative answer with CaseMasterID citations. Row flattening fixed.

#### Changed

#### Bug Fixes
- **Classifier GLM chain-of-thought** — Added `chat_template_kwargs: { enable_thinking: false }` to all GLM API calls. Model was doing reasoning before outputting JSON, making JSON.parse fail. Now outputs clean JSON directly.
- **Classifier keyword coverage** — Added STRUCTURED_PATTERNS (how many, count, list, show, FIR details) and NARRATIVE_PATTERNS (describe, what happened, tell me about, modus operandi). Previously only network, risk, analytical had keyword patterns.
- **"returnErrorResponse" 500 error** — Discovered root cause: corrupted Console function registration. Fix: delete function from Console → recreate → redeploy → re-add env vars.
- **Pipeline searchBriefFacts row extraction** — Fixed `Object.values(r)[0]` to proper row flattening (same issue as RAG). Now reliably extracts CaseMasterID from ZCQL result.
- **Pipeline aggregation formatting** — Aggregation queries (COUNT, SUM, AVG) now show `"Result: 929"` instead of misleading `"Found 1 record(s)."`
- **Pipeline SQL auto-retry** — If generated SQL fails ZCQL execution, the error is sent back to GLM for a corrected query (1 retry attempt).
- **RAG searchBriefFacts row extraction** — Fixed `Object.values(r)[0]` to flat merge of all table aliases. CaseMasterID now properly extracted from ZCQL result.

#### Clarifications
- **`CATALYST_ORG` is reserved** — Cannot be set in `catalyst-config.json` env_variables. Must be set via Console or default in code. All functions already handle this with `process.env.CATALYST_ORG || '60073929329'`.
- **Catalyst deploy overwrites env vars** — Console env vars must be re-added after each `catalyst deploy`. Known workaround: use `process.env.QUICKML_TOKEN` fallback pattern, or OAuth auto-refresh.

#### Performance
- **GLM timeout reduced to 15s in pipeline** — to stay within 30s Catalyst function limit. prompt trimmed (no examples) for faster SQL generation.
- **GLM max_tokens reduced to 300 for SQL generation** — faster response, enough for SQL output.

### Confirmed Working

| Endpoint | Query | Result |
|----------|-------|--------|
| `POST /pipeline/query` | `"count of cases in Bengaluru Urban"` | 929 cases |
| `POST /pipeline/query` | `"list FIRs for theft in Bengaluru Urban"` | 43 records |
| `POST /pipeline/query` | `"show crime trends in Bengaluru this year"` | 0 (no 2026 data yet) |
| `POST /pipeline/query` | `"describe HSR Layout theft cases"` | 3 cases with citations |
| `POST /rag/query` | `"tell me about theft in Bengaluru"` | Narrative answer with CaseMasterIDs |

### Known Issues
- Catalyst function timeout is 30 seconds. GLM chat model may be slow (10-25s). GLM HTTP timeout set to 15-20s depending on function.
- `CATALYST_ORG` is a reserved keyword — set via Console only, not in catalyst-config.json.
- Catalyst deploy overwrites Console env vars — must re-add `QUICKML_TOKEN` after each deploy.
- OAuth token expires hourly — no auto-refresh yet (planned: Server-based App OAuth).
- RAG is SQL LIKE search, not vector search — no semantic similarity.
- ZCQL doesn't support parameterized queries — inline values with safety validation.

---

## WBS Reference

This release covers:

| WBS | Package | Status |
|-----|---------|--------|
| 3.1 | Query execution layer | ✅ nl_sql self-contained |
| 3.2 | NL-to-SQL translation | ✅ nl_sql deployed, working |
| 3.3 | Intent routing | ✅ classifier deployed, working |
| 3.4 | Session/context management | ✅ session deployed |
| 3.5 | RAG over BriefFacts | ✅ rag deployed, working |
| 4.4 | Network traversal (bounded) | ✅ pipeline handler |
| 5.2 | Risk scoring | ✅ pipeline handler |
| 5.4 | Crime pattern/trends | ✅ pipeline handler |
| 7.0 | Orchestration | ✅ pipeline deployed, working |
