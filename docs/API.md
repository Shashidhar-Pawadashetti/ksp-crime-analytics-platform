<!-- generated-by: gsd-doc-writer -->
# API Reference

**KSP Crime Analytics Platform** — REST API for conversational crime database queries.

The platform exposes 7 HTTP-triggered Catalyst AdvancedIO functions behind a unified base URL. Each function is deployed independently and handles its own routing via raw Node.js `http` module (`IncomingMessage` / `ServerResponse`). No Express, Koa, or Fastify is used.

**Base URL (development):**
```
https://datathon2026-60073929329.development.catalystserverless.in/server
```

All production deployments will use a different base URL provided by Zoho Catalyst.

**Content-Type:** `application/json`

---

## Authentication

The API endpoints themselves do not require client-side authentication headers. However, endpoints that call the Zoho GLM LLM (QuickML) for SQL generation, intent classification, or narrative answering use **Self Client OAuth** credentials configured as environment variables on each deployed function:

| Variable | Required By | Purpose |
|----------|-------------|---------|
| `QUICKML_TOKEN` | `classifier`, `nl_sql`, `rag`, `pipeline` | Bearer token for GLM API calls (`Authorization: Zoho-oauthtoken {token}`) |
| `CATALYST_ORG` | All GLM-calling functions | Organization header (`CATALYST-ORG: 60073929329`) |

These are **server-side secrets**, not client credentials. The deployed functions read them from `process.env`. After every `catalyst deploy`, they must be re-added via the Catalyst Console because deployment overwrites environment variables.

<!-- VERIFY: QUICKML_TOKEN must be re-added via Catalyst Console after every deploy. -->

---

## Common Response Envelope

### Success
```json
{
  "status": "ok",
  "data": { ... }
}
```

### Error
```json
{
  "status": "error",
  "error_code": "ERROR_CODE",
  "message": "Human-readable description",
  "fallback_answer": "User-facing fallback message"
}
```

---

## Common Error Codes

| Code | HTTP Status | Meaning | Triggered By |
|------|-------------|---------|-------------|
| `INIT_FAILED` | 500 | Catalyst SDK initialization failure | All functions that use `zcatalyst-sdk-node` |
| `NOT_FOUND` | 404 | Unknown route | All HTTP functions |
| `MISSING_QUERY` | 400 | Required `query` field missing or invalid | `classifier`, `nl_sql`, `rag`, `pipeline` |
| `MISSING_EMPLOYEE_ID` | 400 | Required `employee_id` field missing | `pipeline`, `session` |
| `MISSING_SQL` | 400 | Required `sql` field missing | `query_exec` |
| `UNSAFE_SQL` | 400 | DDL/DML detected in SQL input | `nl_sql`, `query_exec`, `pipeline` |
| `TRANSLATION_FAILED` | 400 | GLM failed to generate valid SQL | `nl_sql` |
| `PIPELINE_ERROR` | 500 | Generic pipeline execution failure | `pipeline` |
| `RAG_FAILED` | 500 | RAG query or GLM narrative generation failed | `rag` |
| `QUERY_FAILED` | 500 | ZCQL execution error | `query_exec` |
| `SCOPE_ERROR` | 400 | RBAC scope injection failure | `query_exec` |
| `METHOD_NOT_ALLOWED` | 405 | Non-POST request to a POST-only endpoint | `query_exec` |
| `MISSING_FIELDS` | 400 | Required fields missing | `session` |
| `SESSION_NOT_FOUND` | 404 | Session expired or not found | `session` |
| `INTERNAL_ERROR` | 500 | Unhandled server error | `session` |

---

## Endpoints

### 1. Health Check — `test`

#### `GET /test/`

Returns a simple health-check response.

**Request:** No body required.

**Response (200):**
```html
<h1>Hello from index.js<h1>
```

Note: This is the only endpoint that returns `text/html` rather than JSON.

**404 Response:**
```
You might find the page you are looking for at "/" path
```

---

### 2. Intent Classification — `classifier`

#### `GET /classifier/`

Returns service metadata.

**Response (200):**
```json
{
  "status": "ok",
  "service": "classifier",
  "version": "1.0.0"
}
```

#### `POST /classifier/classify`

Classifies a natural-language query into one of five intents.

**Request Body:**
```json
{
  "query": "how many theft cases in Bengaluru last month?"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Natural-language question about crime data |

**Response (200):**

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always `"ok"` |
| `data.intent` | string | One of: `structured`, `narrative`, `network`, `risk`, `analytical` |
| `data.confidence` | number | Confidence score between 0.0 and 1.0 |
| `data.fallback` | boolean | (Optional) `true` if GLM fallback was used and confidence was low |

**Example Response (keyword match):**
```json
{
  "status": "ok",
  "data": {
    "intent": "structured",
    "confidence": 0.85
  }
}
```

**Example Response (GLM fallback, low confidence):**
```json
{
  "status": "ok",
  "data": {
    "intent": "structured",
    "confidence": 0.5,
    "fallback": true
  }
}
```

**Intent Detection Logic:**

| Intent | Keyword Patterns | GLM Fallback |
|--------|-----------------|--------------|
| `structured` | `how many`, `count`, `total`, `list`, `show`, `find`, `cases in`, `FIR details`, `accused details`, `IPC`, `CrPC`, `charge sheet` | Yes |
| `narrative` | `describe`, `what happened`, `tell me about`, `modus operandi`, `summary`, `brief facts`, `incident details` | Yes |
| `network` | `associates`, `linked to`, `connected`, `co-accused`, `network`, `relationships` | Yes |
| `risk` | `risk score`, `high-risk`, `repeat offender`, `risk level`, `dangerous`, `threat level` | Yes |
| `analytical` | `predict`, `forecast`, `next month`, `hotspot`, `trend`, `pattern`, `seasonal`, `analysis`, `analytics`, `statistics`, `breakdown`, `compare`, `most common` | Yes |

**Error Codes:** `INIT_FAILED`, `NOT_FOUND`, `MISSING_QUERY`

---

### 3. NL-to-ZCQL Translation — `nl_sql`

#### `GET /nl_sql/`

Returns service metadata.

**Response (200):**
```json
{
  "status": "ok",
  "service": "nl_sql",
  "version": "1.0.0"
}
```

#### `POST /nl_sql/translate`

Translates a natural-language query into a ZCQL V2 SELECT statement, executes it, and returns the results.

**Request Body:**
```json
{
  "query": "count of cases in Bengaluru Urban"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Natural-language question about crime data |

**Response (200):**

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always `"ok"` |
| `data.sql` | string | The generated ZCQL V2 SELECT statement |
| `data.explanation` | string | Human-readable description of what the query does |
| `data.rows` | array | ZCQL result rows (nested objects keyed by table alias, e.g. `{"cm": {...}, "d": {...}}`) |
| `data.column_meta` | array of strings | Column names extracted from the SELECT clause |
| `data.source_refs` | array of strings | CaseMasterID references extracted from results |

**Example Response:**
```json
{
  "status": "ok",
  "data": {
    "sql": "SELECT COUNT(cm.CaseMasterID) FROM CaseMaster cm INNER JOIN Unit u ON cm.PoliceStationID = u.ROWID INNER JOIN District d ON u.DistrictID = d.ROWID WHERE d.DistrictName = 'Bengaluru Urban'",
    "explanation": "Counts all cases registered in Bengaluru Urban district",
    "rows": [
      {
        "cm": { "CaseMasterID": "123" }
      }
    ],
    "column_meta": ["COUNT(cm.CaseMasterID)"],
    "source_refs": ["CaseMasterID:123"]
  }
}
```

**Notes:**
- The function internally uses `callQuickML` to send a schema-rich prompt to the GLM model (`crm-di-glm47b_30b_it` with `enable_thinking: false`).
- Generated SQL is validated against forbidden keywords (`DROP`, `DELETE`, `INSERT`, `UPDATE`, `TRUNCATE`, `ALTER`, `CREATE`, `EXEC`, `EXECUTE`).
- If ZCQL execution fails on the first attempt, an auto-retry sends the error back to GLM for a fix. One retry only (due to the 30-second function timeout).
- Result rows are not flat-mapped — they retain ZCQL's nested structure keyed by table alias.

**Error Codes:** `INIT_FAILED`, `NOT_FOUND`, `MISSING_QUERY`, `UNSAFE_SQL`, `TRANSLATION_FAILED`

---

### 4. RAG Narrative Search — `rag`

#### `GET /rag/`

Returns service metadata.

**Response (200):**
```json
{
  "status": "ok",
  "service": "rag",
  "version": "2.0.0"
}
```

#### `POST /rag/query`

Searches case narratives (`CaseMaster.BriefFacts`) for relevant records and generates a natural-language answer using a GLM LLM.

**Request Body:**
```json
{
  "query": "tell me about theft in Bengaluru"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Natural-language question about case narratives |

**Response (200):**

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always `"ok"` |
| `data.answer` | string | Natural-language answer generated from matching case excerpts |
| `data.source_refs` | array of strings | CaseMasterID references cited in the answer (e.g., `"CaseMasterID:123"`) |

**Example Response:**
```json
{
  "status": "ok",
  "data": {
    "answer": "Based on available records, there are theft-related cases in Bengaluru Urban district. Case [CaseMasterID:456] involves a reported theft incident...",
    "source_refs": ["CaseMasterID:456", "CaseMasterID:789"]
  }
}
```

**Processing Flow:**
1. **Keyword extraction:** Removes stop words, keeps up to 5 content words from the query.
2. **GLM keyword expansion:** (Optional) Asks GLM to suggest additional search terms.
3. **BriefFacts search:** ZCQL `LIKE '*keyword*'` query on `CaseMaster.BriefFacts` (up to 5 keywords, 15 rows), joined with `Unit`, `District`, and `CrimeHead`.
4. **Person search:** Searches `Accused`, `Victim`, and `ComplainantDetails` tables for matching names.
5. **Enrichment:** Fetches `CaseStatusName`, `CourtName`, and `ActSectionAssociation` data for matched cases.
6. **Answer generation:** Sends top 3 excerpts to GLM with prompt to answer based only on provided records.
7. **Catalyst RAG fallback:** If no BriefFacts matches found, or match quality is low (score ≤ 1), calls the Catalyst native `rag/answer` API as fallback.
8. Returns `source_refs` array with `CaseMasterID` citations.

**Error Codes:** `INIT_FAILED`, `NOT_FOUND`, `MISSING_QUERY`, `RAG_FAILED`

---

### 5. Full Orchestrator — `pipeline`

#### `GET /pipeline/`

Returns service metadata.

**Response (200):**
```json
{
  "status": "ok",
  "service": "pipeline",
  "version": "1.0.0"
}
```

#### `POST /pipeline/query`

The primary user-facing endpoint. Accepts a natural-language query, classifies the intent, routes to the appropriate handler, and returns a structured response with session tracking.

**Request Body:**
```json
{
  "query": "show me theft cases in Bengaluru",
  "employee_id": 1,
  "session_id": "optional-uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Natural-language crime database question |
| `employee_id` | number | Yes | Employee ID for RBAC scope and session tracking |
| `session_id` | string | No | Existing session UUID. If omitted, a new session is created |

**Response (200):**

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always `"ok"` |
| `data.intent` | string | Detected intent: `structured`, `narrative`, `network`, `risk`, or `analytical` |
| `data.answer` | string | Human-readable answer |
| `data.data` | array | (Optional) Result rows for structured/analytical intents |
| `data.nodes` | array | (Optional) Graph nodes for network intent |
| `data.edges` | array | (Optional) Graph edges for network intent |
| `data.risk_score` | number | (Optional) Risk score (0-10) for risk intent |
| `data.severity` | string | (Optional) `"High"`, `"Medium"`, or `"Low"` for risk intent |
| `data.factors` | array | (Optional) Risk factor descriptions for risk intent |
| `data.source_refs` | array | CaseMasterID or person references |
| `data.confidence` | number | Intent classification confidence |
| `data.fallback` | boolean | Whether GLM fallback was used for classification |
| `data.session_id` | string | The session UUID (created or provided) |
| `data.explanation` | string | (Structured intent only) Explanation of the SQL query |

**Example Response (structured):**
```json
{
  "status": "ok",
  "data": {
    "intent": "structured",
    "answer": "Found 15 record(s).",
    "data": [
      {
        "cm": { "CaseMasterID": "47995000000448330", "CrimeNo": "2024-001" },
        "d": { "DistrictName": "Bengaluru Urban" }
      }
    ],
    "source_refs": ["CaseMasterID:47995000000448330"],
    "confidence": 0.85,
    "fallback": false,
    "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "explanation": "Lists FIRs for theft in Bengaluru Urban district"
  }
}
```

**Example Response (network):**
```json
{
  "status": "ok",
  "data": {
    "intent": "network",
    "answer": "Found a network with 3 person(s) connected across 2 case(s).",
    "nodes": [
      { "id": "accused:47995000000448331", "name": "Ravi", "type": "person", "role": "accused" },
      { "id": "case:47995000000448330", "name": "2024-001", "type": "case" }
    ],
    "edges": [
      { "from": "accused:47995000000448331", "to": "case:47995000000448330", "label": "accused_in" }
    ],
    "source_refs": ["Accused:Ravi"],
    "confidence": 0.95,
    "fallback": false,
    "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

**Example Response (risk):**
```json
{
  "status": "ok",
  "data": {
    "intent": "risk",
    "answer": "Ravi has a risk score of 7.5/10 (High). 3 case(s) as accused. Repeat offender. 2 distinct crime type(s): Crimes Against Body, Crimes Against Property.",
    "risk_score": 7.5,
    "severity": "High",
    "factors": ["3 case(s) as accused", "Repeat offender", "2 distinct crime type(s): Crimes Against Body, Crimes Against Property"],
    "source_refs": [],
    "confidence": 0.95,
    "fallback": false,
    "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

**Intent Handlers:**

| Intent | Handler | Description |
|--------|---------|-------------|
| `structured` | `translateToSQL` → `executeSQL` | Generates ZCQL via GLM, executes, returns rows with auto-retry on failure |
| `narrative` | `searchBriefFacts` + `searchPersons` + `generateRAGAnswer` | Keyword search over BriefFacts + person tables, then GLM narrative generation |
| `network` | `handleNetwork` | Searches Accused/Victim/Complainant for person name, builds graph nodes + edges |
| `risk` | `handleRisk` | Counts accused cases for a person, computes 0-10 risk score with severity |
| `analytical` | `handleAnalytical` → `handleAnalyticalFallback` | GLM aggregation SQL with fallback to 3 pre-built aggregation queries (crime type, monthly trend, location breakdown) |

**Session Tracking:** Every request creates or updates a Catalyst Cache entry (`segment: 'session'`, 1-hour TTL) containing employee RBAC data (rank hierarchy, unit, district) and conversation turn history.

**Error Codes:** `INIT_FAILED`, `NOT_FOUND`, `MISSING_QUERY`, `MISSING_EMPLOYEE_ID`, `UNSAFE_SQL`, `PIPELINE_ERROR`

---

### 6. Session Management — `session`

#### `POST /session/create`

Creates a new session for an employee, loading their RBAC hierarchy (rank, unit, district) from the database.

**Request Body:**
```json
{
  "employee_id": 1
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `employee_id` | number | Yes | Employee ID to look up in the Employee table |

**Response (200):**
```json
{
  "status": "ok",
  "data": {
    "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "employee_id": 1,
    "rank_hierarchy": 5,
    "unit_hierarchy": 3,
    "unit_id": 101,
    "district_id": 27,
    "turns": []
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | string | Auto-generated UUID for the session |
| `employee_id` | number | The employee ID from the request |
| `rank_hierarchy` | number or null | Employee's rank hierarchy level (from `Rank.Hierarchy`) |
| `unit_hierarchy` | number or null | Employee's unit type hierarchy level (from `UnitType`) |
| `unit_id` | number or null | Employee's unit ID |
| `district_id` | number or null | Employee's district ID |
| `turns` | array | Conversation turn history (starts empty) |

#### `GET /session/?employee_id={id}&session_id={uuid}`

Retrieves an existing session, or creates a new one if the session_id doesn't exist.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `employee_id` | number | No | If omitted, returns service metadata |
| `session_id` | string | No | Existing session UUID. If omitted, a new one is generated |

**Response (200) with employee_id:**
```json
{
  "status": "ok",
  "data": {
    "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "employee_id": 1,
    "rank_hierarchy": 5,
    "unit_hierarchy": 3,
    "unit_id": 101,
    "district_id": 27,
    "turns": [
      {
        "turn_id": 1,
        "role": "user",
        "content": "show me theft cases",
        "intent": "structured",
        "timestamp": "2026-07-14T10:00:00.000Z"
      }
    ]
  }
}
```

#### `POST /session/append`

Appends a turn to an existing session.

**Request Body:**
```json
{
  "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "employee_id": 1,
  "turn": {
    "role": "user",
    "content": "show me theft cases",
    "intent": "structured"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | Yes | Existing session UUID |
| `employee_id` | number | Yes | Employee ID associated with the session |
| `turn.role` | string | Yes | `"user"` or `"assistant"` |
| `turn.content` | string | Yes | The message content |
| `turn.intent` | string | No | Detected intent for the turn |

**Response (200):**
```json
{
  "status": "ok",
  "data": {
    "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "turn_id": 1
  }
}
```

#### `DELETE /session/{session_id}?employee_id={id}`

Deletes a session from the cache.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | string | The session UUID to delete |

**Query/Body Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `employee_id` | number | Yes | Employee ID associated with the session |

**Response (200):**
```json
{
  "status": "ok",
  "data": {
    "deleted": true
  }
}
```

**Error Codes:** `INIT_FAILED`, `NOT_FOUND`, `MISSING_EMPLOYEE_ID`, `MISSING_FIELDS`, `SESSION_NOT_FOUND`, `INTERNAL_ERROR`

---

### 7. Raw ZCQL Executor — `query_exec`

This is the only function that does **not** call the GLM LLM. It executes raw ZCQL SELECT statements after safety validation and optional RBAC scope injection.

#### `POST /query_exec/execute`

Executes a ZCQL SELECT statement with safety and scope validation.

**Request Body:**
```json
{
  "sql": "SELECT cm.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate FROM CaseMaster cm LIMIT 5",
  "scope": {
    "district_filter": 27,
    "unit_filter": 101
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sql` | string | Yes | A ZCQL V2 SELECT statement |
| `scope.district_filter` | number | No | District ID to restrict results via `u.DistrictID` |
| `scope.unit_filter` | number | No | Unit ID to restrict results via `cm.PoliceStationID` |

**Response (200):**

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always `"ok"` |
| `data.rows` | array | ZCQL result rows (nested objects keyed by table alias) |
| `data.column_meta` | array of strings | Column names extracted from the SELECT clause |
| `data.source_refs` | array of strings | CaseMasterID references extracted from results |

**Example Response:**
```json
{
  "status": "ok",
  "data": {
    "rows": [
      {
        "cm": { "CaseMasterID": "47995000000448330", "CrimeNo": "2024-001", "CrimeRegisteredDate": "2024-01-15" }
      }
    ],
    "column_meta": ["cm.CaseMasterID", "cm.CrimeNo", "cm.CrimeRegisteredDate"],
    "source_refs": ["CaseMasterID:47995000000448330"]
  }
}
```

**Safety Validation:**
- Blocks DDL/DML keywords: `DROP`, `DELETE`, `INSERT`, `UPDATE`, `TRUNCATE`, `ALTER`, `CREATE`, `EXEC`, `EXECUTE`
- Only `SELECT` statements are permitted

**Scope Injection:**
- `scope.district_filter` injects `WHERE u.DistrictID = {value}` — requires SQL to use alias `u` for `Unit` table
- `scope.unit_filter` injects `WHERE cm.PoliceStationID = {value}` — requires SQL to use alias `cm` for `CaseMaster`
- Works with SQL that already has a `WHERE` clause by inserting conditions before it

**Error Codes:** `INIT_FAILED`, `METHOD_NOT_ALLOWED`, `MISSING_SQL`, `UNSAFE_SQL`, `SCOPE_ERROR`, `QUERY_FAILED`

---

## Rate Limits

The API is deployed on Zoho Catalyst AdvancedIO, which enforces platform-level rate limits and a hard 30-second function timeout. No application-level rate limiting is configured.

<!-- VERIFY: Exact rate limits depend on Zoho Catalyst plan and are not documented in the repository. -->

---

## ZCQL V2 Reference

The underlying ZCQL V2 dialect has several critical syntax differences from standard SQL:

| Feature | Standard SQL | ZCQL V2 |
|---------|-------------|---------|
| LIKE wildcard | `%` | `*` |
| COUNT | `COUNT(*)` | `COUNT(alias.ColumnName)` |
| JOIN syntax | Comma-separated implicit joins | Explicit `INNER JOIN ... ON` only (max 4 JOINs) |
| Max SELECT columns | Unlimited | 20 |
| Max WHERE conditions | Unlimited | 5 |
| Max rows without LIMIT | Unlimited | 300 |
| Column aliases | `SELECT col AS alias` | Not supported (silently ignored) |
| String quotes | Single or double | Single quotes only |
| IS operator | `=` | `IS` (and `IS NULL` / `IS NOT NULL`) |
| Date format | Various | `'YYYY-MM-DD'` (single quotes) |

See the schema description in `functions/nl_sql/index.js` (lines 12–84) for the full table listing with all FK JOIN paths via `ROWID`.
