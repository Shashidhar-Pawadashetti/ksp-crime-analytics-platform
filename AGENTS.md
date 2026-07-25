# AGENTS.md — KSP Crime Analytics Platform

> Single-source context file for AI agents onboarding to this codebase.
> Read this file in full before making any changes.

---

## 1. Project Overview

**KSP Crime Analytics Platform** — Built for **Datathon 2026** (Hack2skill × Karnataka State Police), Challenge 1.

A conversational AI platform that lets investigators, analysts, and policymakers query the KSP crime database using natural language. Supports 5 query intents: structured data retrieval, narrative descriptions, network analysis, risk scoring, and crime trend analytics.

**Platform constraint:** All components deploy on **Catalyst by Zoho** (Node.js 24, AdvancedIO functions).

---

## 2. Repository Structure

```
ksp-crime-analytics-platform/
|-- catalyst.json              # Deployment targets (7 functions)
|-- AGENTS.md                  # THIS FILE -- agent onboarding context
|-- CHANGELOG.md               # Version history
|-- ONBOARDING.md              # Human team onboarding guide
|-- TESTING.md                 # Postman test commands
|-- TODO.md                    # Task tracker (gitignored)
|-- README.md                  # Project overview
|-- .env                       # Local secrets (gitignored)
|-- .env.example               # Template for .env
|
|-- functions/                 # 7 Catalyst Functions
|   |-- classifier/            # Intent classifier (deployed, working)
|   |   |-- index.js
|   |   |-- catalyst-config.json
|   |   |-- package.json
|   |-- nl_sql/                # NL-to-ZCQL (deployed, working)
|   |   |-- index.js
|   |   |-- catalyst-config.json
|   |   |-- package.json
|   |-- rag/                   # RAG dispatcher (deployed, working)
|   |   |-- index.js
|   |   |-- catalyst-config.json
|   |   |-- package.json
|   |-- pipeline/              # Orchestrator (deployed, working)
|   |   |-- index.js
|   |   |-- catalyst-config.json
|   |   |-- package.json
|   |-- session/               # Session manager (deployed)
|   |   |-- index.js
|   |   |-- catalyst-config.json
|   |   |-- package.json
|   |-- query_exec/            # ZCQL executor (deployed)
|   |   |-- index.js
|   |   |-- catalyst-config.json
|   |   |-- package.json
|   |-- test/                  # Health check (deployed)
|   |   |-- index.js
|   |   |-- catalyst-config.json
|   |   |-- package.json
|
|-- data_pipeline/             # Synthetic data generation & import
|   |-- ...
|-- docs/                      # Documentation
|   |-- production-auth.md
|-- knowlede.md                # Knowledge base
```

---

## 3. Architecture — 7 Catalyst Functions

All functions are **Node.js 24, AdvancedIO** deployed on Catalyst. They communicate via the Catalyst Data Store (ZCQL), Cache, and QuickML (GLM LLM).

```
User query
  |
  v
pipeline/query ---> classifier (inline)
                         |  keyword match -> instant
                         |  ambiguous     -> GLM LLM
                         v
              +-- structured -> GLM SQL gen -> ZCQL execute -> rows
              +-- narrative  -> BriefFacts LIKE search -> GLM answer
              +-- network    -> Accused/Victim/Complainant search -> graph
              +-- risk       -> Accused count -> recidivism score
              +-- analytical -> 3 aggregation queries -> trends
                         |
                         v
              Format JSON response -> append turn to session (Cache, 1hr TTL)
```

| # | Function | Role | Calls GLM? | Calls ZCQL? |
|---|----------|------|-----------|-------------|
| 1 | **test** | Health check | No | No |
| 2 | **classifier** | Intent classification (keyword + GLM) | Yes (fallback only) | No |
| 3 | **nl_sql** | NL → SQL generation + execution | Yes | Yes |
| 4 | **rag** | BriefFacts search + narrative answer | Yes | Yes |
| 5 | **pipeline** | Full orchestrator (inline handlers) | Yes (SQL gen, classifier fallback, narrative) | Yes |
| 6 | **session** | Conversation memory (Cache CRUD) | No | Yes (Employee hierarchy) |
| 7 | **query_exec** | Raw ZCQL executor with safety validation | No | Yes |

---

## 4. Data Store Schema (ZCQL)

The database has 24+ tables. Key tables and FK chains:

**Core Tables:**
- `CaseMaster` (CaseMasterID, CrimeNo, CrimeRegisteredDate, PoliceStationID, CrimeMajorHeadID, CrimeMinorHeadID, CaseStatusID, CourtID, IncidentFromDate, BriefFacts, ...)
- `Accused` (AccusedMasterID, CaseMasterID, AccusedName, AgeYear, GenderID)
- `Victim` (VictimMasterID, CaseMasterID, VictimName, AgeYear, GenderID)
- `ComplainantDetails` (ComplainantID, CaseMasterID, ComplainantName, ...)

**Lookup Tables:**
- `CrimeHead` (CrimeHeadID, CrimeGroupName)
- `CrimeSubHead` (CrimeSubHeadID, CrimeHeadID, CrimeHeadName)
- `Unit` (UnitID, UnitName, TypeID, DistrictID)
- `District` (DistrictID, DistrictName, StateID)
- `State` (StateID, StateName)
- `Employee` (EmployeeID, FirstName, KGID, RankID, DesignationID, UnitID, DistrictID, ...)
- `CaseStatusMaster`, `CaseCategory`, `GravityOffence`, `Court`, `Rank`, `Designation`, `UnitType`, `ReligionMaster`, `CasteMaster`, `OccupationMaster`, `Act`, `Section`, `ActSectionAssociation`, `CrimeHeadActSection`, `ChargesheetDetails`, `ArrestSurrender`

**FK Convention:** All FK columns store the target table's Catalyst **ROWID** (a long alphanumeric string, or auto-number integer depending on import method).

**Key JOIN chains via ROWID:**
- `CaseMaster.PoliceStationID = Unit.ROWID`
- `Unit.DistrictID = District.ROWID`
- `District.StateID = State.ROWID`
- `CaseMaster.CrimeMajorHeadID = CrimeHead.ROWID`
- `CaseMaster.CrimeMinorHeadID = CrimeSubHead.ROWID`
- `CaseMaster.CaseStatusID = CaseStatusMaster.ROWID`
- `CaseMaster.PolicePersonID = Employee.ROWID`
- `CaseMaster.CourtID = Court.ROWID`
- `Accused.CaseMasterID = CaseMaster.ROWID`
- `Victim.CaseMasterID = CaseMaster.ROWID`
- `ComplainantDetails.CaseMasterID = CaseMaster.ROWID`
- `CrimeSubHead.CrimeHeadID = CrimeHead.ROWID`
- `Court.DistrictID = District.ROWID`
- `Employee.RankID = Rank.ROWID`
- `Employee.UnitID = Unit.ROWID`
- `Employee.DesignationID = Designation.ROWID`
- `Unit.TypeID = UnitType.ROWID`

---

## 5. ZCQL V2 — Critical Rules

ZCQL V2 is **active** for this project. It differs from standard SQL in important ways:

### JOIN Syntax (MANDATORY)
```sql
-- ✅ CORRECT: Explicit JOIN ... ON
SELECT cm.* FROM CaseMaster cm
INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID
INNER JOIN District d ON u.DistrictID = d.ROWID

-- ❌ WRONG: Implicit joins (comma-separated FROM)
SELECT cm.* FROM CaseMaster cm, Unit u, District d
WHERE cm.PoliceStationID = u.ROWID AND u.DistrictID = d.ROWID
```

### LIKE Wildcards
```sql
-- ✅ CORRECT: Use * and ? (NOT %)
WHERE ch.CrimeGroupName LIKE '*theft*'

-- ❌ WRONG: Standard SQL %
WHERE ch.CrimeGroupName LIKE '%theft%'
```

### COUNT
```sql
-- ✅ CORRECT: COUNT(alias.ColumnName)
SELECT COUNT(cm.CaseMasterID) FROM CaseMaster cm

-- ❌ WRONG: COUNT(*) — ZCQL V2 rejects this
SELECT COUNT(*) FROM CaseMaster
```

### LIMIT
```sql
-- Simple: first 50 rows
LIMIT 50

-- With offset: 3 rows starting at index 2 (1-indexed offset?)
LIMIT 1,3
```

### Supported Functions
`COUNT()`, `SUM()`, `AVG()`, `MIN()`, `MAX()`, `DISTINCT`, `GROUP BY`, `ORDER BY ASC/DESC`, `HAVING`, `BINARYOF()` (for case-insensitive grouping), subqueries in WHERE.

### ZCQL Limits
- Max **20 columns** per SELECT
- Max **300 rows** without explicit LIMIT
- Max **5 WHERE** conditions
- Max **4 JOINs**, one condition per JOIN
- `SELECT *` is supported (max 300 rows)

### Other Syntax
- String values in **single quotes**
- `IS` operator works like `=`, use `IS NULL` / `IS NOT NULL`
- Table aliases with `AS` (e.g., `FROM CaseMaster AS cm`)
- GenderID: 1=Male, 2=Female, 3=Other

### ZCQL Result Format
Each row is keyed by table alias:
```json
[
  {
    "cm": { "CaseMasterID": "123", "CrimeNo": "2024-001", "BriefFacts": "..." },
    "d": { "DistrictName": "Bengaluru Urban" }
  }
]
```

To flatten: iterate `Object.keys(r)`, merge nested objects.

---

## 6. GLM LLM API

**Model:** `crm-di-glm47b_30b_it`
**Endpoint:** `POST https://api.catalyst.zoho.in/quickml/v1/project/{project_id}/glm/chat`
**Auth:** `Authorization: Zoho-oauthtoken {token}` + `CATALYST-ORG: 60073929329` headers
**Format:** OpenAI-compatible (`messages` array, `choices[0].message.content`)

### Critical: `enable_thinking: false`

Every GLM call **MUST** include this parameter:
```json
{
  "model": "crm-di-glm47b_30b_it",
  "messages": [{ "role": "user", "content": "..." }],
  "temperature": 0.1,
  "max_tokens": 500,
  "chat_template_kwargs": { "enable_thinking": false }
}
```

Without `enable_thinking: false`, the model does chain-of-thought reasoning before outputting JSON, which breaks `JSON.parse()`.

### GLM Response Parsing
```javascript
function extractGLMContent(response) {
  if (response.choices && response.choices[0] && response.choices[0].message) {
    return response.choices[0].message.content;  // OpenAI format
  }
  if (response.response) {
    return response.response;  // Raw response fallback
  }
  return null;
}
```

### Token
- Self Client OAuth token (starts with `1000.`)
- **Expires every hour** — no auto-refresh
- Current token: `1000.b0af700fbc3b95a7b3f019c27d38e01c.24ac88b165c38e4a7bb60132add23101`

---

## 7. Deployment & Environment Variables

### Deploy
```bash
# All functions
catalyst deploy

# Specific functions
catalyst deploy --only "functions:classifier,functions:nl_sql"

# Single function
catalyst deploy --only "functions:pipeline"
```

### CRITICAL: Env vars wiped on deploy
`catalyst deploy` **overwrites** Console environment variables. After every deploy, `QUICKML_TOKEN` must be re-added via Catalyst Console → Functions → {name} → Environment Variables for these 4 functions:

| Function | Requires QUICKML_TOKEN |
|----------|----------------------|
| classifier | Yes |
| nl_sql | Yes |
| rag | Yes |
| pipeline | Yes |

`CATALYST_ORG` is a **reserved keyword** — cannot be set in `catalyst-config.json`. Must be set via Console or use default in code: `process.env.CATALYST_ORG || '60073929329'`.

### Function timeouts
- Catalyst function timeout: **30 seconds**
- GLM HTTP timeout: **15-20 seconds** (set per function)
- GLM may take 10-25 seconds to respond

---

## 8. Function Details

### 8.1 test — `GET /test/`

Simple health check. Returns `{"status":"ok"}`.

---

### 8.2 classifier — `POST /classifier/classify`

**Input:** `{"query": "..."}`
**Output:** `{"intent": "structured|narrative|network|risk|analytical", "confidence": 0.0-1.0}`

**Logic:**
1. **Stage 1 — Keyword match:** Checks query against 5 regex patterns:
   - `STRUCTURED_PATTERNS`: `how many|count|total|list|show|find|get|cases? in|FIR details?|accused details?|IPC|CrPC|charge sheet`
   - `NARRATIVE_PATTERNS`: `describe|what happened|tell me about|modus operandi|summary|brief facts|incident details|sequence of events`
   - `NETWORK_PATTERNS`: `associates?|linked to|connected|co-accused|network|relationships?`
   - `RISK_PATTERNS`: `risk score|high-risk|repeat offender|risk level|dangerous|threat level`
   - `FORECAST_PATTERNS`: `predict|forecast|next month|hotspot|trend|pattern|seasonal|analysis|analytics|statistics|breakdown|compare|most common`
2. **Stage 2 — GLM fallback:** If no keyword match, sends to GLM with classification prompt. Returns `{"intent": "structured", "confidence": 0.5, "fallback": true}` if GLM fails or confidence < 0.6.

---

### 8.3 nl_sql — `POST /nl_sql/query`

**Input:** `{"query": "..."}`
**Output:** `{"status": "ok", "data": {"sql": "...", "explanation": "...", "rows": [...], "column_meta": [], "source_refs": []}}`

**Logic:**
1. Sends query + schema description + ZCQL V2 rules to GLM
2. GLM returns JSON with `sql` and `explanation`
3. Validates SQL (SELECT only, no DDL/DML)
4. Executes via `app.zcql().executeZCQLQuery(sql)`
5. Returns SQL, explanation, rows, and column metadata

---

### 8.4 rag — `POST /rag/query`

**Input:** `{"query": "..."}`
**Output:** `{"status": "ok", "data": {"answer": "...", "source_refs": ["CaseMasterID:123"]}}`

**Logic:**
1. Extract keywords: lower-case, remove non-alphanumeric, filter stop words and short words (< 3 chars), take first 5
2. Search `CaseMaster.BriefFacts` via ZCQL: `LIKE '*keyword1*' OR LIKE '*keyword2*'`
3. Use explicit `INNER JOIN ... ON` syntax (NOT comma joins)
4. Flat-merge ZCQL result rows (iterate `Object.keys(r)`, merge nested objects — NOT `Object.values(r)[0]`)
5. Send top 3 matching excerpts to GLM with prompt: "Answer based ONLY on these excerpts. Cite CaseMasterIDs."
6. Return answer with source references

**Known:** BriefFacts data has ~170 entries with descriptions of crimes (theft, kidnapping, fraud, murder, etc.). Queries like "tell me about theft in Bengaluru" work. Queries like "describe case 2024-00412" don't work because keywords are case numbers, not content words.

---

### 8.5 pipeline — `POST /pipeline/query`

**Input:** `{"query": "...", "employee_id": 1, "session_id": "..."}`
**Output:** `{"status": "ok", "data": {"intent": "...", "answer": "...", "data": [...], "source_refs": [...], "confidence": 0.85, "session_id": "..."}}`

The main entry point. All logic is **inline** (no HTTP calls to other functions).

**Flow:**
1. Parse URL, validate inputs (query + employee_id required)
2. Get or create session (loads Employee hierarchy for RBAC)
3. Classify intent (keyword → GLM fallback)
4. Route to handler:

#### Structured Handler
- Call `translateToSQL(query)` → GLM generates ZCQL
- **Auto-retry:** If `executeSQL()` fails (e.g., unknown column, missing JOIN), send the error back to GLM with a fix-prompt. One retry attempt.
- Format result: if SQL contains aggregation (COUNT/SUM/AVG), show `"Result: {value}"` instead of `"Found 1 record(s)."`

#### Narrative Handler
- Same as RAG: extract keywords → search BriefFacts → GLM answer

#### Network Handler
- Extract person name from query using regex patterns + heuristic
- Search Accused, Victim, Complainant tables for that name (LIKE)
- Build graph: nodes (person/case) + edges (accused_in/victim_in/filed)
- Return answer with node/edge structure

#### Risk Handler
- Extract person name
- Count accused cases for that person
- Compute score: `min(10, uniqueCaseCount * 2.5 + recidivism * 2 + crimeTypes)` → 0-10
- Severity: >= 7 High, >= 4 Medium, else Low
- Factors: case count, repeat/first-time offender, crime type list

#### Analytical Handler
- Extract location (known districts list) and time period (this/last month/year, specific year)
- Run 3 parallel aggregation queries:
  1. Crime type breakdown (GROUP BY CrimeGroupName)
  2. Monthly trend (GROUP BY CrimeRegisteredDate)
  3. Location breakdown (GROUP BY DistrictName)
- Return analysis summary with trends object

5. Append user + assistant turns to session Cache

---

### 8.6 session — `POST /session/create`, `GET /session/`

**Create:** `{"employee_id": 1}` → session with employee hierarchy (rank, unit, district)
**Get:** `?employee_id=1&session_id={uuid}` → session data

Uses Catalyst Cache with 1-hour TTL. Not currently used for context awareness — only audit trail.

---

### 8.7 query_exec — `POST /query_exec/execute`

**Input:** `{"sql": "SELECT ..."}`
**Output:** ZCQL result rows

Safety validation: blocks DDL/DML (DROP, DELETE, INSERT, UPDATE, etc.). Only SELECT allowed.

---

## 9. Key Implementation Decisions

1. **`enable_thinking: false` is MANDATORY** on every GLM call. Without it, the model does chain-of-thought and won't output JSON.

2. **Self-contained nl_sql** — generates SQL AND executes it. Doesn't call query_exec.

3. **Inline pipeline** — all handlers are inline (not HTTP calls to individual functions). This avoids inter-function latency but means pipeline has duplicate code (e.g., its own copy of `searchBriefFacts`, `translateToSQL`, `callQuickML`).

4. **Row flattening pattern:**
   ```javascript
   // ✅ CORRECT — flat merge
   const flat = {};
   for (const key of Object.keys(r)) {
     const val = r[key];
     if (val && typeof val === 'object' && !Array.isArray(val)) {
       Object.assign(flat, val);
     } else {
       flat[key] = val;
     }
   }

   // ❌ WRONG — misses CaseMasterID
   Object.values(r)[0]
   ```

5. **Aggregation display fix:** If SQL contains `COUNT|SUM|AVG|MIN|MAX(...)`, flat-merge the single result row and show `"Result: {value}"` instead of `"Found 1 record(s)."`

6. **SQL auto-retry:** If ZCQL execution throws an error, send the error back to GLM with a fix prompt. One retry only (due to 30s timeout).

7. **Duplicate GLM helper** — each function has its own copy of `callQuickML` and `extractGLMContent`. Not shared because Catalyst deploys functions independently.

---

## 10. Known Bugs & Pain Points

| Issue | Detail | Workaround |
|-------|--------|------------|
| **Env var wipe** | `catalyst deploy` overwrites Console env vars | Re-add `QUICKML_TOKEN` after every deploy via Console |
| **30s timeout** | Catalyst limit + slow GLM (10-25s) | GLM timeout 15-20s, max_tokens 200-300, trimmed prompts |
| **GLM hallucination** | Invents column names (e.g., `LastName`) | Strict prompt rule: "Use ONLY columns listed in schema" + retry mechanism |
| **GLM token expiry** | Self Client OAuth expires hourly | Plan: migrate to Server-based App OAuth with refresh token |
| **RAG = keyword search** | No semantic similarity | Quality depends on BriefFacts keyword coverage |
| **No parameterized queries** | ZCQL doesn't support them | Inline values with safety validation |
| **"returnErrorResponse" 500** | Corrupted Console function registration | Delete function from Console → recreate → redeploy → re-add env vars |
| **Cross-function code duplication** | Each function has own GLM helper | Accepted trade-off for independent deployment |

---

## 11. Testing

See `TESTING.md` for 25+ Postman-ready test commands.

**Key smoke tests (PowerShell):**
```powershell
# Pipeline — aggregation
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" -ContentType "application/json" -Body '{"query":"count of cases in Bengaluru Urban","employee_id":1}'

# Pipeline — list with JOINs
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/pipeline/query" -ContentType "application/json" -Body '{"query":"list FIRs for theft in Bengaluru Urban","employee_id":1}'

# RAG — narrative
Invoke-RestMethod -Method POST -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/rag/query" -ContentType "application/json" -Body '{"query":"tell me about theft in Bengaluru"}'

# Health check
Invoke-RestMethod -Method GET -Uri "https://datathon2026-60073929329.development.catalystserverless.in/server/test/"
```

---

## 12. Git

- **Branch:** `feature/core_conversational_platform`
- **Remote:** `origin https://github.com/Shashidhar-Pawadashetti/ksp-crime-analytics-platform.git`
- **Git Credential Manager** is active on this machine — any `git push` will use cached credentials automatically

---

## 13. Quick Reference — Common Tasks

### Add a new env var to a function
1. Edit `functions/{name}/catalyst-config.json` (only if it's NOT a secret)
2. Deploy: `catalyst deploy --only "functions:{name}"`
3. Re-add `QUICKML_TOKEN` in Console

### Fix "returnErrorResponse" 500
1. Delete function from Catalyst Console
2. Run `catalyst deploy --only "functions:{name}"`
3. Re-add env vars in Console

### Debug a failing function
1. Check Catalyst Console → Functions → {name} → Logs
2. Check for "Execution started" messages (function started but didn't finish = timeout)
3. Check for error messages
4. If no logs, increase verbosity by adding try/catch with error logging

### Update a ZCQL query in code
1. Always use explicit `INNER JOIN ... ON` syntax
2. Always use `*` wildcards for LIKE
3. Always qualify columns with table aliases
4. Never use `COUNT(*)`

### Deploy after code changes
```bash
git add .
git commit -m "feat: description"
catalyst deploy --only "functions:{name}"
```
Then **immediately** re-add `QUICKML_TOKEN` in Console before testing.
