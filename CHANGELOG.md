# Changelog — KSP Crime Analytics Platform

All notable changes to this project will be documented in this file.

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
